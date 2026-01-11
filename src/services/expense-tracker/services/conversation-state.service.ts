import type { ExtractedTransaction } from '@/shared/types/common.types';

/**
 * Conversation state types
 */
export type ConversationState =
    | 'awaiting_account_selection'
    | 'awaiting_confirmation'
    | 'awaiting_amount_correction'
    | 'awaiting_merchant_correction'
    | 'awaiting_category_selection'
    | 'awaiting_notes'
    | 'completed';

/**
 * Pending transaction awaiting user interaction
 */
export interface PendingTransaction {
    /** Chat ID */
    chatId: number;
    /** Message ID of the bot's last message */
    messageId: number;
    /** Current conversation state */
    state: ConversationState;
    /** Extracted transaction data */
    transactionData: ExtractedTransaction;
    /** Selected account ID (once user chooses) */
    accountId?: string;
    /** Original screenshot base64 (for reference) */
    screenshotBase64?: string;
    /** GPS coordinates */
    location?: { latitude: number; longitude: number };
    /** Timestamp */
    timestamp: string;
    /** App package name (if known) */
    appPackageName?: string;
    /** Created at */
    createdAt: Date;
}

/**
 * In-memory conversation state manager
 * 
 * Manages ongoing conversations and pending transactions.
 * For production with multiple instances, replace with Redis.
 */
export class ConversationStateService {
    private conversations = new Map<number, PendingTransaction>();

    /**
     * Create or update a pending transaction
     */
    set(chatId: number, transaction: PendingTransaction): void {
        this.conversations.set(chatId, transaction);
    }

    /**
     * Get pending transaction for a chat
     */
    get(chatId: number): PendingTransaction | undefined {
        return this.conversations.get(chatId);
    }

    /**
     * Delete pending transaction
     */
    delete(chatId: number): void {
        this.conversations.delete(chatId);
    }

    /**
     * Check if chat has pending transaction
     */
    has(chatId: number): boolean {
        return this.conversations.has(chatId);
    }

    /**
     * Get all active conversations
     */
    getAll(): PendingTransaction[] {
        return Array.from(this.conversations.values());
    }

    /**
     * Clean up old conversations (>1 hour)
     * Should be called periodically
     */
    cleanup(): void {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        let cleanedCount = 0;

        for (const [chatId, transaction] of this.conversations.entries()) {
            if (transaction.createdAt < oneHourAgo) {
                this.conversations.delete(chatId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            console.log(`Cleaned up ${cleanedCount} old conversation(s)`);
        }
    }

    /**
     * Get conversation count (for monitoring)
     */
    getCount(): number {
        return this.conversations.size;
    }
}
