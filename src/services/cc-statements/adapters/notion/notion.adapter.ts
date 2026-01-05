import { Client } from '@notionhq/client';
import type { NotionAdapter } from './notion.interface';
import type { CreditCard, ExistingStatement } from '../../types';
import { logger } from '@/shared/utils/logger';

/**
 * Notion API Adapter
 * 
 * Implements NotionAdapter interface using @notionhq/client SDK
 */
export class NotionAdapterImpl implements NotionAdapter {
    private client: Client;

    constructor(
        apiKey: string,
        private creditCardsDbId: string,
        private statementsDbId: string
    ) {
        this.client = new Client({ auth: apiKey });
    }

    /**
     * Fetch all credit cards from Notion database
     */
    async getCreditCards(): Promise<CreditCard[]> {
        try {
            logger.debug({
                event: 'notion.get_credit_cards.start',
                databaseId: this.creditCardsDbId,
            }, 'Fetching credit cards from Notion');

            const response: any = await this.client.dataSources.query({
                data_source_id: this.creditCardsDbId,
            });

            const cards: CreditCard[] = response.results.map((page: any) => {
                const props = page.properties;

                // Extract name from title property
                const nameProperty = props['Name'] || props['name'];
                const name = nameProperty?.title?.[0]?.plain_text || 'Unnamed Card';

                // Extract statement day
                const statementDayProperty = props['Statement Day'] || props['statement_day'];
                const statement_day = statementDayProperty?.number || 0;

                // Extract due in days - property name is case-sensitive!
                const dueInDaysProperty = props['Due In (Days)'] || props['Due in (Days)'] || props['Due in Days'] || props['due_in_days'];
                const due_in_days = dueInDaysProperty?.number || 0;

                return {
                    id: page.id,
                    name,
                    statement_day,
                    due_in_days,
                };
            });

            logger.info({
                event: 'notion.get_credit_cards.success',
                count: cards.length,
            }, `Fetched ${cards.length} credit cards from Notion`);

            return cards;
        } catch (error) {
            logger.error({
                event: 'notion.get_credit_cards.error',
                error: error instanceof Error ? error.message : 'Unknown error',
            }, 'Failed to fetch credit cards from Notion');
            throw error;
        }
    }

    /**
     * Fetch existing statements from a specific date onwards
     */
    async getExistingStatements(fromDate: string): Promise<ExistingStatement[]> {
        try {
            logger.debug({
                event: 'notion.get_existing_statements.start',
                databaseId: this.statementsDbId,
                fromDate,
            }, 'Fetching existing statements from Notion');

            const response: any = await this.client.dataSources.query({
                data_source_id: this.statementsDbId,
                filter: {
                    property: 'Statement Date',
                    date: {
                        on_or_after: fromDate,
                    },
                },
            });

            const statements: ExistingStatement[] = response.results.map((page: any) => {
                const props = page.properties;

                // Extract card relation
                const cardProperty = props['Card'] || props['card'];
                const cardId = cardProperty?.relation?.[0]?.id || '';

                // Extract statement date
                const statementDateProperty = props['Statement Date'] || props['statement_date'];
                const statementDate = statementDateProperty?.date?.start || '';

                return {
                    cardId,
                    statementDate,
                };
            });

            logger.info({
                event: 'notion.get_existing_statements.success',
                count: statements.length,
            }, `Fetched ${statements.length} existing statements from Notion`);

            return statements;
        } catch (error) {
            logger.error({
                event: 'notion.get_existing_statements.error',
                error: error instanceof Error ? error.message : 'Unknown error',
            }, 'Failed to fetch existing statements from Notion');
            throw error;
        }
    }

    /**
     * Create a new statement in Notion
     */
    async createStatement(statement: {
        cardId: string;
        cardName: string;
        statementDate: string;
        dueDate: string;
        monthYear: string;
    }): Promise<string> {
        try {
            logger.debug({
                event: 'notion.create_statement.start',
                statement,
            }, 'Creating statement in Notion');

            const response = await this.client.pages.create({
                parent: {
                    data_source_id: this.statementsDbId,
                },
                properties: {
                    'Name': {
                        title: [
                            {
                                text: {
                                    content: `${statement.cardName}: ${statement.monthYear}`,
                                },
                            },
                        ],
                    },
                    'Card': {
                        relation: [
                            {
                                id: statement.cardId,
                            },
                        ],
                    },
                    'Statement Date': {
                        date: {
                            start: statement.statementDate,
                        },
                    },
                    'Statement Due': {
                        date: {
                            start: statement.dueDate,
                        },
                    },
                },
            });

            logger.info({
                event: 'notion.create_statement.success',
                statementId: response.id,
                cardName: statement.cardName,
                monthYear: statement.monthYear,
            }, `Created statement: ${statement.cardName}: ${statement.monthYear}`);

            return response.id;
        } catch (error) {
            logger.error({
                event: 'notion.create_statement.error',
                error: error instanceof Error ? error.message : 'Unknown error',
                statement,
            }, 'Failed to create statement in Notion');
            throw error;
        }
    }

    /**
     * Validate API credentials
     */
    async validateCredentials(): Promise<boolean> {
        try {
            // Try to fetch the user info to validate credentials
            await this.client.users.me({});

            logger.info({
                event: 'notion.validate_credentials.success',
            }, 'Notion credentials validated successfully');

            return true;
        } catch (error) {
            logger.warn({
                event: 'notion.validate_credentials.failed',
                error: error instanceof Error ? error.message : 'Unknown error',
            }, 'Notion credentials validation failed');
            return false;
        }
    }
}
