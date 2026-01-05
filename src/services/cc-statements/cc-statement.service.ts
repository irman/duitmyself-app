import type { NotionAdapter } from './adapters/notion/notion.interface';
import type { TelegramAdapter } from './adapters/telegram/telegram.interface';
import type { Statement, StatementJobResult, CreditCard, ExistingStatement } from './types';
import { TelegramAdapterImpl } from './adapters/telegram/telegram.adapter';
import { logger } from '@/shared/utils/logger';
import { tracer } from '@/shared/utils/tracing';
import { addSpanAttributes, setSpanStatus } from '@/shared/utils/tracing-utils';

/**
 * Credit Card Statement Service
 * 
 * Orchestrates the creation of monthly credit card statements in Notion
 * Ported from n8n workflow: "Create CC Statements"
 */
export class CCStatementService {
    private readonly TIMEZONE = 'Asia/Kuala_Lumpur';
    private readonly MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    constructor(
        private notionAdapter: NotionAdapter,
        private telegramAdapter: TelegramAdapter
    ) { }

    /**
     * Execute the statement creation job
     * 
     * Main workflow:
     * 1. Fetch all credit cards from Notion
     * 2. Process each card to determine if statement should be created
     * 3. Fetch existing statements to avoid duplicates
     * 4. Create new statements
     * 5. Send Telegram notification
     * 
     * @returns Job result with statistics
     */
    async executeJob(): Promise<StatementJobResult> {
        const span = tracer.startSpan('cc_statement.job.execute');

        try {
            logger.info({
                event: 'cc_statement.job.start',
            }, 'Starting CC statement creation job');

            addSpanAttributes(span, {
                'job.type': 'cc_statement_creation',
                'job.timezone': this.TIMEZONE,
            });

            // Step 1: Fetch all credit cards
            const cards = await this.notionAdapter.getCreditCards();

            if (cards.length === 0) {
                logger.warn({
                    event: 'cc_statement.job.no_cards',
                }, 'No credit cards found in Notion');

                setSpanStatus(span, true);
                span.end();

                return {
                    success: true,
                    statementsCreated: 0,
                    duplicatesSkipped: 0,
                    errors: [],
                    details: {
                        created: [],
                        skipped: [],
                    },
                };
            }

            logger.info({
                event: 'cc_statement.job.cards_fetched',
                count: cards.length,
            }, `Fetched ${cards.length} credit cards`);

            // Step 2: Process eligible cards
            const eligibleStatements = this.processEligibleCards(cards);

            logger.info({
                event: 'cc_statement.job.eligible_statements',
                count: eligibleStatements.length,
            }, `Processed ${eligibleStatements.length} eligible statements`);

            // Step 3: Fetch existing statements for duplicate detection
            const fromDate = this.getFromDateForDuplicateCheck();
            const existingStatements = await this.notionAdapter.getExistingStatements(fromDate);

            logger.info({
                event: 'cc_statement.job.existing_statements',
                count: existingStatements.length,
            }, `Fetched ${existingStatements.length} existing statements`);

            // Step 4: Remove duplicates
            const { toCreate, skipped } = this.removeDuplicates(eligibleStatements, existingStatements);

            logger.info({
                event: 'cc_statement.job.after_dedup',
                toCreate: toCreate.length,
                skipped: skipped.length,
            }, `After deduplication: ${toCreate.length} to create, ${skipped.length} skipped`);

            // Step 5: Create statements
            const created: Statement[] = [];
            const errors: string[] = [];

            for (const statement of toCreate) {
                try {
                    const statementId = await this.notionAdapter.createStatement(statement);
                    created.push(statement);

                    logger.info({
                        event: 'cc_statement.created',
                        statementId,
                        cardName: statement.cardName,
                        monthYear: statement.monthYear,
                    }, `Created statement: ${statement.cardName}: ${statement.monthYear}`);
                } catch (error) {
                    const errorMsg = `Failed to create statement for ${statement.cardName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                    errors.push(errorMsg);

                    logger.error({
                        event: 'cc_statement.create_failed',
                        error: error instanceof Error ? error.message : 'Unknown error',
                        statement,
                    }, errorMsg);
                }
            }

            // Step 6: Send Telegram notification (if any statements were created)
            if (created.length > 0) {
                try {
                    await this.sendNotification(created);
                } catch (error) {
                    // Don't fail the job if notification fails
                    logger.warn({
                        event: 'cc_statement.notification_failed',
                        error: error instanceof Error ? error.message : 'Unknown error',
                    }, 'Failed to send Telegram notification, but job succeeded');
                }
            }

            const result: StatementJobResult = {
                success: errors.length === 0,
                statementsCreated: created.length,
                duplicatesSkipped: skipped.length,
                errors,
                details: {
                    created,
                    skipped,
                },
            };

            logger.info({
                event: 'cc_statement.job.complete',
                result,
            }, `Job complete: ${created.length} created, ${skipped.length} skipped, ${errors.length} errors`);

            addSpanAttributes(span, {
                'job.statements_created': created.length,
                'job.duplicates_skipped': skipped.length,
                'job.errors': errors.length,
            });

            setSpanStatus(span, errors.length === 0);
            span.end();

            return result;
        } catch (error) {
            logger.error({
                event: 'cc_statement.job.error',
                error: error instanceof Error ? error.message : 'Unknown error',
            }, 'CC statement job failed');

            setSpanStatus(span, false, error instanceof Error ? error.message : 'Unknown error');
            if (error instanceof Error) {
                span.recordException(error);
            }
            span.end();

            throw error;
        }
    }

    /**
     * Process eligible cards and calculate statement dates
     * 
     * Logic ported from n8n workflow:
     * - If current day < statement day → use previous month
     * - If current day >= statement day → use current month
     * 
     * @param cards - Credit cards to process
     * @returns Array of statements to potentially create
     */
    private processEligibleCards(cards: CreditCard[]): Statement[] {
        const now = this.getCurrentTime();
        const currentMonth = now.getMonth() + 1; // 1-12
        const currentYear = now.getFullYear();
        const currentDay = now.getDate();

        const statements: Statement[] = [];

        for (const card of cards) {
            if (!card.statement_day || card.statement_day === 0) {
                logger.debug({
                    event: 'cc_statement.skip_card',
                    cardName: card.name,
                    reason: 'No statement day',
                }, `Skipping ${card.name}: no statement day`);
                continue;
            }

            // Determine which month's statement to process
            let statementMonth = currentMonth;
            let statementYear = currentYear;

            // Only create statements for days that have already passed (not including today)
            // If today is the statement day or before, use previous month
            if (currentDay <= card.statement_day) {
                statementMonth = currentMonth - 1;
                if (statementMonth === 0) {
                    statementMonth = 12;
                    statementYear = currentYear - 1;
                }
            }

            // Create statement date
            const statementDate = new Date(statementYear, statementMonth - 1, card.statement_day);
            const statementDateStr = this.formatDate(statementDate);

            // Calculate due date
            const dueDate = new Date(statementDate);
            dueDate.setDate(dueDate.getDate() + card.due_in_days);
            const dueDateStr = this.formatDate(dueDate);

            // Format month year
            const monthYear = `${this.MONTH_NAMES[statementMonth - 1]} ${statementYear}`;

            statements.push({
                cardId: card.id,
                cardName: card.name,
                statementDate: statementDateStr,
                dueDate: dueDateStr,
                monthYear,
            });
        }

        return statements;
    }

    /**
     * Remove duplicate statements
     * 
     * @param statements - Statements to create
     * @param existing - Existing statements from Notion
     * @returns Object with statements to create and skipped statements
     */
    private removeDuplicates(
        statements: Statement[],
        existing: ExistingStatement[]
    ): { toCreate: Statement[]; skipped: Statement[] } {
        const existingSet = new Set(
            existing.map((s) => `${s.cardId}|${s.statementDate}`)
        );

        const toCreate: Statement[] = [];
        const skipped: Statement[] = [];

        for (const statement of statements) {
            const key = `${statement.cardId}|${statement.statementDate}`;

            if (existingSet.has(key)) {
                skipped.push(statement);
                logger.debug({
                    event: 'cc_statement.duplicate_detected',
                    cardName: statement.cardName,
                    statementDate: statement.statementDate,
                }, `Duplicate detected: ${statement.cardName} - ${statement.statementDate}`);
            } else {
                toCreate.push(statement);
            }
        }

        return { toCreate, skipped };
    }

    /**
     * Send Telegram notification for created statements
     * 
     * @param statements - Created statements
     */
    private async sendNotification(statements: Statement[]): Promise<void> {
        if (statements.length === 0) return;

        // Format message similar to n8n workflow
        const messages = statements.map((s) => {
            const escapedName = TelegramAdapterImpl.escapeMarkdown(s.cardName);
            const escapedMonthYear = TelegramAdapterImpl.escapeMarkdown(s.monthYear);
            const escapedDueDate = TelegramAdapterImpl.escapeMarkdown(s.dueDate);

            return `Created ${escapedName}: ${escapedMonthYear} CC Statement\n\nDue: **${escapedDueDate}**`;
        });

        const fullMessage = messages.join('\n\n---\n\n');

        await this.telegramAdapter.sendMessage(fullMessage);
    }

    /**
     * Get current time in configured timezone
     */
    private getCurrentTime(): Date {
        const nowInKL = new Date().toLocaleString('en-US', { timeZone: this.TIMEZONE });
        return new Date(nowInKL);
    }

    /**
     * Format date as ISO string (YYYY-MM-DD)
     * Uses local date parts to avoid UTC conversion issues
     */
    private formatDate(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Get from date for duplicate check (1 month ago)
     */
    private getFromDateForDuplicateCheck(): string {
        const now = this.getCurrentTime();
        const oneMonthAgo = new Date(now);
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        return this.formatDate(oneMonthAgo);
    }

    /**
     * Validate all adapters
     */
    async validateAdapters(): Promise<{ notion: boolean; telegram: boolean }> {
        const [notion, telegram] = await Promise.all([
            this.notionAdapter.validateCredentials(),
            this.telegramAdapter.validateCredentials(),
        ]);

        return { notion, telegram };
    }
}
