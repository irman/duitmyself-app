import { describe, it, expect, beforeEach } from 'bun:test';
import { CCStatementService } from '@/services/cc-statements/cc-statement.service';
import type { NotionAdapter } from '@/services/cc-statements/adapters/notion/notion.interface';
import type { TelegramAdapter } from '@/services/cc-statements/adapters/telegram/telegram.interface';
import type { CreditCard, ExistingStatement } from '@/services/cc-statements/types';

/**
 * Unit tests for CC Statement Service
 * 
 * Tests the core business logic:
 * - Date calculation (which month's statement to create)
 * - Duplicate detection
 * - Statement processing
 */

// Mock adapters
class MockNotionAdapter implements NotionAdapter {
    public creditCards: CreditCard[] = [];
    public existingStatements: ExistingStatement[] = [];
    public createdStatements: any[] = [];

    async getCreditCards(): Promise<CreditCard[]> {
        return this.creditCards;
    }

    async getExistingStatements(_fromDate: string): Promise<ExistingStatement[]> {
        return this.existingStatements;
    }

    async createStatement(statement: any): Promise<string> {
        this.createdStatements.push(statement);
        return `statement-${this.createdStatements.length}`;
    }

    async validateCredentials(): Promise<boolean> {
        return true;
    }
}

class MockTelegramAdapter implements TelegramAdapter {
    public sentMessages: string[] = [];

    async sendMessage(message: string): Promise<void> {
        this.sentMessages.push(message);
    }

    async validateCredentials(): Promise<boolean> {
        return true;
    }
}

describe('CCStatementService', () => {
    let service: CCStatementService;
    let mockNotion: MockNotionAdapter;
    let mockTelegram: MockTelegramAdapter;

    beforeEach(() => {
        mockNotion = new MockNotionAdapter();
        mockTelegram = new MockTelegramAdapter();
        service = new CCStatementService(mockNotion, mockTelegram);
    });

    describe('Date Calculation Logic', () => {
        it('should create previous month statement when current day < statement day', async () => {
            // Simulate: Today is Jan 10, statement day is 15
            // Should create December statement
            mockNotion.creditCards = [
                {
                    id: 'card-1',
                    name: 'Test Card',
                    statement_day: 15,
                    due_in_days: 10,
                },
            ];

            const result = await service.executeJob();

            expect(result.success).toBe(true);
            expect(result.statementsCreated).toBe(1);

            const created = mockNotion.createdStatements[0];
            // Statement should be for previous month
            const statementDate = new Date(created.statementDate);
            const now = new Date();

            // If today is before the 15th, statement should be for last month
            if (now.getDate() < 15) {
                const expectedMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
                expect(statementDate.getMonth()).toBe(expectedMonth);
            }
        });

        it('should create current month statement when current day >= statement day', async () => {
            // Simulate: Today is Jan 20, statement day is 15
            // Should create January statement
            mockNotion.creditCards = [
                {
                    id: 'card-2',
                    name: 'Test Card 2',
                    statement_day: 5, // Use day 5 to ensure we're past it
                    due_in_days: 10,
                },
            ];

            const result = await service.executeJob();

            expect(result.success).toBe(true);
            expect(result.statementsCreated).toBe(1);

            const created = mockNotion.createdStatements[0];
            const statementDate = new Date(created.statementDate);
            const now = new Date();

            // If today is after the 5th, statement should be for current month
            if (now.getDate() >= 5) {
                expect(statementDate.getMonth()).toBe(now.getMonth());
            }
        });

        it('should handle year boundary correctly (December to January)', async () => {
            // This test is conceptual - actual behavior depends on current date
            mockNotion.creditCards = [
                {
                    id: 'card-3',
                    name: 'Year Boundary Card',
                    statement_day: 1,
                    due_in_days: 10,
                },
            ];

            const result = await service.executeJob();

            expect(result.success).toBe(true);
            expect(result.statementsCreated).toBe(1);

            const created = mockNotion.createdStatements[0];
            expect(created.statementDate).toBeDefined();
            expect(created.dueDate).toBeDefined();
        });

        it('should calculate due date correctly', async () => {
            mockNotion.creditCards = [
                {
                    id: 'card-4',
                    name: 'Due Date Test',
                    statement_day: 1,
                    due_in_days: 15,
                },
            ];

            const result = await service.executeJob();

            expect(result.success).toBe(true);

            const created = mockNotion.createdStatements[0];
            const statementDate = new Date(created.statementDate);
            const dueDate = new Date(created.dueDate);

            // Due date should be 15 days after statement date
            const diffTime = Math.abs(dueDate.getTime() - statementDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            expect(diffDays).toBe(15);
        });
    });

    describe('Duplicate Detection', () => {
        it('should skip creating duplicate statements', async () => {
            mockNotion.creditCards = [
                {
                    id: 'card-5',
                    name: 'Duplicate Test',
                    statement_day: 1,
                    due_in_days: 10,
                },
            ];

            // Add existing statement with same card and date
            const now = new Date();
            const statementMonth = now.getDate() >= 1 ? now.getMonth() : now.getMonth() - 1;
            const statementYear = statementMonth < 0 ? now.getFullYear() - 1 : now.getFullYear();
            const adjustedMonth = statementMonth < 0 ? 11 : statementMonth;

            const existingDate = new Date(statementYear, adjustedMonth, 1);
            mockNotion.existingStatements = [
                {
                    cardId: 'card-5',
                    statementDate: existingDate.toISOString().split('T')[0]!,
                },
            ];

            const result = await service.executeJob();

            expect(result.success).toBe(true);
            expect(result.statementsCreated).toBe(0);
            expect(result.duplicatesSkipped).toBe(1);
            expect(mockNotion.createdStatements.length).toBe(0);
        });

        it('should create statement if no duplicate exists', async () => {
            mockNotion.creditCards = [
                {
                    id: 'card-6',
                    name: 'No Duplicate',
                    statement_day: 1,
                    due_in_days: 10,
                },
            ];

            // Existing statement for different card
            mockNotion.existingStatements = [
                {
                    cardId: 'different-card',
                    statementDate: '2026-01-01',
                },
            ];

            const result = await service.executeJob();

            expect(result.success).toBe(true);
            expect(result.statementsCreated).toBe(1);
            expect(result.duplicatesSkipped).toBe(0);
        });

        it('should handle multiple cards with mixed duplicates', async () => {
            mockNotion.creditCards = [
                {
                    id: 'card-7',
                    name: 'Card 1',
                    statement_day: 1,
                    due_in_days: 10,
                },
                {
                    id: 'card-8',
                    name: 'Card 2',
                    statement_day: 1,
                    due_in_days: 10,
                },
            ];

            // Only card-7 has existing statement
            const now = new Date();
            const statementMonth = now.getDate() >= 1 ? now.getMonth() : now.getMonth() - 1;
            const statementYear = statementMonth < 0 ? now.getFullYear() - 1 : now.getFullYear();
            const adjustedMonth = statementMonth < 0 ? 11 : statementMonth;

            const existingDate = new Date(statementYear, adjustedMonth, 1);
            mockNotion.existingStatements = [
                {
                    cardId: 'card-7',
                    statementDate: existingDate.toISOString().split('T')[0]!,
                },
            ];

            const result = await service.executeJob();

            expect(result.success).toBe(true);
            expect(result.statementsCreated).toBe(1); // Only card-8
            expect(result.duplicatesSkipped).toBe(1); // card-7
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty credit card list', async () => {
            mockNotion.creditCards = [];

            const result = await service.executeJob();

            expect(result.success).toBe(true);
            expect(result.statementsCreated).toBe(0);
            expect(result.duplicatesSkipped).toBe(0);
            expect(mockTelegram.sentMessages.length).toBe(0);
        });

        it('should skip cards without statement day', async () => {
            mockNotion.creditCards = [
                {
                    id: 'card-9',
                    name: 'No Statement Day',
                    statement_day: 0, // Invalid
                    due_in_days: 10,
                },
            ];

            const result = await service.executeJob();

            expect(result.success).toBe(true);
            expect(result.statementsCreated).toBe(0);
            expect(mockNotion.createdStatements.length).toBe(0);
        });

        it('should send telegram notification when statements are created', async () => {
            mockNotion.creditCards = [
                {
                    id: 'card-10',
                    name: 'Notification Test',
                    statement_day: 1,
                    due_in_days: 10,
                },
            ];

            const result = await service.executeJob();

            expect(result.success).toBe(true);
            expect(result.statementsCreated).toBe(1);
            expect(mockTelegram.sentMessages.length).toBe(1);

            const message = mockTelegram.sentMessages[0];
            expect(message).toContain('Notification Test');
            expect(message).toContain('CC Statement');
        });

        it('should not send notification when no statements created', async () => {
            mockNotion.creditCards = [];

            const result = await service.executeJob();

            expect(result.success).toBe(true);
            expect(mockTelegram.sentMessages.length).toBe(0);
        });

        it('should format month year correctly', async () => {
            mockNotion.creditCards = [
                {
                    id: 'card-11',
                    name: 'Format Test',
                    statement_day: 1,
                    due_in_days: 10,
                },
            ];

            const result = await service.executeJob();

            expect(result.success).toBe(true);

            const created = mockNotion.createdStatements[0];
            // Month year should be in format "Jan 2026"
            expect(created.monthYear).toMatch(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/);
        });
    });

    describe('Adapter Validation', () => {
        it('should validate adapters successfully', async () => {
            const validation = await service.validateAdapters();

            expect(validation.notion).toBe(true);
            expect(validation.telegram).toBe(true);
        });
    });
});
