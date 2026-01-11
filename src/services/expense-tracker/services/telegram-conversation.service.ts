import type { TelegramAdapter } from '../adapters/telegram/telegram.interface';
import type { TransactionProcessor } from '../transaction-processor.service';
import type { ExtractedTransaction } from '@/shared/types/common.types';
import { ConversationStateService, type PendingTransaction } from './conversation-state.service';
import { AccountSelectionService, type AccountConfig } from './account-selection.service';
import { logger } from '@/shared/utils/logger';

/**
 * Telegram Conversation Service
 * 
 * Orchestrates conversational transaction capture flow:
 * 1. Receive screenshot
 * 2. Extract transaction with AI
 * 3. Detect/select account
 * 4. Show confirmation with edit options
 * 5. Handle user responses (confirm, edit, cancel)
 * 6. Create transaction in Lunch Money
 */
export class TelegramConversationService {
    constructor(
        public telegram: TelegramAdapter,
        private processor: TransactionProcessor,
        private conversationState: ConversationStateService,
        private accountSelection: AccountSelectionService
    ) { }

    /**
     * Handle incoming screenshot from user
     */
    async handleScreenshot(
        chatId: number,
        imageBase64: string,
        metadata?: {
            appPackageName?: string;
            latitude?: string;
            longitude?: string;
            timestamp?: string;
            userPayee?: string;
            userRemarks?: string;
        }
    ): Promise<void> {
        try {
            // Send "processing" message
            const processingMsg = await this.telegram.sendMessage(
                chatId,
                '🔄 Analyzing screenshot...'
            );

            logger.info({
                event: 'telegram.screenshot.received',
                chatId,
                hasMetadata: !!metadata,
                appPackageName: metadata?.appPackageName,
            }, 'Processing screenshot from Telegram');

            // Extract transaction using AI
            const locationData = (metadata?.latitude && metadata?.longitude) ? {
                latitude: parseFloat(metadata.latitude),
                longitude: parseFloat(metadata.longitude),
            } : undefined;

            // Prepare available accounts for AI
            const availableAccounts = this.accountSelection.getAllAccounts().map(acc => ({
                packageName: acc.matchers.package_names[0] || '',
                accountId: acc.id,
            }));

            const extracted = await this.processor.aiAdapter.extractTransactionDataFromImage(
                imageBase64,
                {
                    appPackageName: metadata?.appPackageName,
                    location: locationData,
                    timestamp: metadata?.timestamp || new Date().toISOString(),
                    userPayee: metadata?.userPayee,
                    userRemarks: metadata?.userRemarks,
                    availableAccounts,
                }
            );

            // Check if it's a transaction
            if (!extracted.is_transaction) {
                await this.telegram.editMessage(
                    chatId,
                    processingMsg.message_id,
                    '❌ This doesn\'t look like a financial transaction.\\n\\nPlease send a screenshot of a transaction notification or receipt.'
                );
                return;
            }

            // Check confidence
            const MIN_CONFIDENCE = 0.4;
            if (extracted.confidence && extracted.confidence < MIN_CONFIDENCE) {
                await this.telegram.editMessage(
                    chatId,
                    processingMsg.message_id,
                    `⚠️ Low confidence (${(extracted.confidence * 100).toFixed(0)}%).\n\nPlease send a clearer screenshot or try again.`
                );
                return;
            }

            // Try to detect account
            const detection = this.accountSelection.detectAccount(
                metadata?.appPackageName,
                extracted,
                undefined // AI-detected app (could be added to extraction response)
            );

            if (detection.accountId) {
                // Auto-detected account with high confidence
                logger.info({
                    event: 'telegram.account.auto_detected',
                    chatId,
                    accountId: detection.accountId,
                    confidence: detection.confidence,
                }, 'Account auto-detected');

                await this.showConfirmation(
                    chatId,
                    processingMsg.message_id,
                    extracted,
                    detection.accountId,
                    imageBase64,
                    metadata
                );
            } else {
                // Need user to select account
                logger.info({
                    event: 'telegram.account.needs_selection',
                    chatId,
                    matchCount: detection.matches.length,
                }, 'Prompting user for account selection');

                await this.promptAccountSelection(
                    chatId,
                    processingMsg.message_id,
                    extracted,
                    imageBase64,
                    metadata,
                    detection.matches
                );
            }

        } catch (error) {
            logger.error({
                event: 'telegram.screenshot.failed',
                chatId,
                error: error instanceof Error ? error.message : 'Unknown error',
            }, 'Failed to process screenshot');

            await this.telegram.sendMessage(
                chatId,
                '❌ Failed to process screenshot. Please try again.\n\nIf the problem persists, check the logs.'
            );
        }
    }

    /**
     * Prompt user to select account
     */
    private async promptAccountSelection(
        chatId: number,
        messageId: number,
        extracted: ExtractedTransaction,
        imageBase64: string,
        metadata?: any,
        suggestedMatches?: AccountConfig[]
    ): Promise<void> {
        const text = this.formatTransactionSummary(extracted) + '\n\n📂 *Which account is this from?*';

        const keyboard = this.accountSelection.createAccountSelectionKeyboard(suggestedMatches);

        await this.telegram.editMessage(chatId, messageId, text, {
            reply_markup: keyboard,
            parse_mode: 'Markdown',
        });

        // Save pending transaction
        this.conversationState.set(chatId, {
            chatId,
            messageId,
            state: 'awaiting_account_selection',
            transactionData: extracted,
            screenshotBase64: imageBase64,
            location: metadata?.latitude && metadata?.longitude ? {
                latitude: parseFloat(metadata.latitude),
                longitude: parseFloat(metadata.longitude),
            } : undefined,
            timestamp: metadata?.timestamp || new Date().toISOString(),
            appPackageName: metadata?.appPackageName,
            createdAt: new Date(),
        });
    }

    /**
     * Show transaction confirmation with edit options
     */
    private async showConfirmation(
        chatId: number,
        messageId: number,
        extracted: ExtractedTransaction,
        accountId: string,
        imageBase64?: string,
        metadata?: any
    ): Promise<void> {
        const account = this.accountSelection.getAccount(accountId);
        const accountLabel = account ? `${account.icon} ${account.label}` : accountId;

        const text = this.formatTransactionSummary(extracted) + `\n📂 *Account:* ${accountLabel}`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✅ Confirm', callback_data: 'confirm' },
                    { text: '✏️ Edit', callback_data: 'edit' },
                ],
                [
                    { text: '❌ Cancel', callback_data: 'cancel' },
                ],
            ],
        };

        await this.telegram.editMessage(chatId, messageId, text, {
            reply_markup: keyboard,
            parse_mode: 'Markdown',
        });

        // Save pending transaction
        this.conversationState.set(chatId, {
            chatId,
            messageId,
            state: 'awaiting_confirmation',
            transactionData: extracted,
            accountId,
            screenshotBase64: imageBase64,
            location: metadata?.latitude && metadata?.longitude ? {
                latitude: parseFloat(metadata.latitude),
                longitude: parseFloat(metadata.longitude),
            } : undefined,
            timestamp: metadata?.timestamp || new Date().toISOString(),
            appPackageName: metadata?.appPackageName,
            createdAt: new Date(),
        });
    }

    /**
     * Handle callback query (button press)
     */
    async handleCallback(chatId: number, callbackQueryId: string, data: string): Promise<void> {
        const pending = this.conversationState.get(chatId);

        if (!pending) {
            await this.telegram.answerCallbackQuery(
                callbackQueryId,
                'Session expired. Please send screenshot again.'
            );
            return;
        }

        logger.info({
            event: 'telegram.callback.received',
            chatId,
            data,
            state: pending.state,
        }, 'Processing callback query');

        // Handle different callback types
        if (data.startsWith('account:')) {
            await this.handleAccountSelection(chatId, callbackQueryId, data, pending);
        } else if (data === 'confirm') {
            await this.handleConfirm(chatId, callbackQueryId, pending);
        } else if (data === 'edit') {
            await this.handleEdit(chatId, callbackQueryId, pending);
        } else if (data === 'cancel') {
            await this.handleCancel(chatId, callbackQueryId, pending);
        } else if (data === 'back_to_confirm') {
            await this.handleBackToConfirm(chatId, callbackQueryId, pending);
        } else if (data.startsWith('edit_')) {
            await this.handleEditField(chatId, callbackQueryId, data, pending);
        } else if (data.startsWith('amount_')) {
            await this.handleAmountAdjustment(chatId, callbackQueryId, data, pending);
        }
    }

    /**
     * Handle account selection callback
     */
    private async handleAccountSelection(
        chatId: number,
        callbackQueryId: string,
        data: string,
        pending: PendingTransaction
    ): Promise<void> {
        const accountId = data.replace('account:', '');

        await this.telegram.answerCallbackQuery(callbackQueryId, 'Account selected!');

        // Record account usage
        this.accountSelection.recordAccountUsage(accountId);

        // Update pending transaction with account
        pending.accountId = accountId;
        pending.state = 'awaiting_confirmation';
        this.conversationState.set(chatId, pending);

        // Show confirmation
        await this.showConfirmation(
            chatId,
            pending.messageId,
            pending.transactionData,
            accountId,
            pending.screenshotBase64,
            {
                latitude: pending.location?.latitude,
                longitude: pending.location?.longitude,
                timestamp: pending.timestamp,
                appPackageName: pending.appPackageName,
            }
        );
    }

    /**
     * Handle confirm callback
     */
    private async handleConfirm(
        chatId: number,
        callbackQueryId: string,
        pending: PendingTransaction
    ): Promise<void> {
        if (!pending.accountId) {
            await this.telegram.answerCallbackQuery(callbackQueryId, 'Please select an account first.');
            return;
        }

        await this.telegram.answerCallbackQuery(callbackQueryId, 'Creating transaction...');

        try {
            logger.info({
                event: 'telegram.transaction.creating',
                chatId,
                accountId: pending.accountId,
                amount: pending.transactionData.amount,
            }, 'Creating transaction from Telegram');

            // Create transaction using budget adapter
            const result = await this.processor.budgetAdapter.createTransaction({
                date: pending.timestamp,
                amount: pending.transactionData.amount!,
                payee: pending.transactionData.merchant!,
                account_id: pending.accountId,
                category: pending.transactionData.category,
                notes: pending.transactionData.notes,
                status: 'uncleared',
                currency: pending.transactionData.currency?.toLowerCase() || 'myr',
                tags: pending.appPackageName ? [pending.appPackageName] : undefined,
            });

            if (result.success) {
                const account = this.accountSelection.getAccount(pending.accountId);
                const accountLabel = account ? `${account.icon} ${account.label}` : pending.accountId;

                await this.telegram.editMessage(
                    chatId,
                    pending.messageId,
                    `✅ *Transaction Created!*\n\n${this.formatTransactionSummary(pending.transactionData)}\n📂 *Account:* ${accountLabel}\n\n🆔 *ID:* ${result.transactionId}`,
                    { parse_mode: 'Markdown' }
                );

                logger.info({
                    event: 'telegram.transaction.created',
                    chatId,
                    transactionId: result.transactionId,
                }, 'Transaction created successfully from Telegram');
            } else {
                await this.telegram.editMessage(
                    chatId,
                    pending.messageId,
                    `❌ *Failed to create transaction*\n\n${result.error || 'Unknown error'}`,
                    { parse_mode: 'Markdown' }
                );

                logger.error({
                    event: 'telegram.transaction.failed',
                    chatId,
                    error: result.error,
                }, 'Failed to create transaction from Telegram');
            }

            // Clean up conversation state
            this.conversationState.delete(chatId);

        } catch (error) {
            logger.error({
                event: 'telegram.confirm.exception',
                chatId,
                error: error instanceof Error ? error.message : 'Unknown error',
            }, 'Exception while creating transaction');

            await this.telegram.editMessage(
                chatId,
                pending.messageId,
                '❌ *Failed to create transaction*\n\nPlease try again or check the logs.',
                { parse_mode: 'Markdown' }
            );
        }
    }

    /**
     * Handle edit callback
     */
    private async handleEdit(
        chatId: number,
        callbackQueryId: string,
        pending: PendingTransaction
    ): Promise<void> {
        await this.telegram.answerCallbackQuery(callbackQueryId);

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '💰 Amount', callback_data: 'edit_amount' },
                    { text: '🏪 Merchant', callback_data: 'edit_merchant' },
                ],
                [
                    { text: '📁 Category', callback_data: 'edit_category' },
                    { text: '📝 Notes', callback_data: 'edit_notes' },
                ],
                [
                    { text: '🔙 Back', callback_data: 'back_to_confirm' },
                ],
            ],
        };

        await this.telegram.editMessage(
            chatId,
            pending.messageId,
            `*What would you like to edit?*\n\n${this.formatTransactionSummary(pending.transactionData)}`,
            { reply_markup: keyboard, parse_mode: 'Markdown' }
        );
    }

    /**
     * Handle cancel callback
     */
    private async handleCancel(
        chatId: number,
        callbackQueryId: string,
        pending: PendingTransaction
    ): Promise<void> {
        await this.telegram.answerCallbackQuery(callbackQueryId, 'Cancelled');
        await this.telegram.editMessage(
            chatId,
            pending.messageId,
            '❌ Transaction cancelled.\n\nSend another screenshot to start over.'
        );
        this.conversationState.delete(chatId);

        logger.info({
            event: 'telegram.transaction.cancelled',
            chatId,
        }, 'Transaction cancelled by user');
    }

    /**
     * Handle back to confirm callback
     */
    private async handleBackToConfirm(
        chatId: number,
        callbackQueryId: string,
        pending: PendingTransaction
    ): Promise<void> {
        await this.telegram.answerCallbackQuery(callbackQueryId);

        if (!pending.accountId) {
            await this.telegram.answerCallbackQuery(callbackQueryId, 'Please select an account first.');
            return;
        }

        await this.showConfirmation(
            chatId,
            pending.messageId,
            pending.transactionData,
            pending.accountId,
            pending.screenshotBase64,
            {
                latitude: pending.location?.latitude,
                longitude: pending.location?.longitude,
                timestamp: pending.timestamp,
                appPackageName: pending.appPackageName,
            }
        );
    }

    /**
     * Handle edit field callback
     */
    private async handleEditField(
        chatId: number,
        callbackQueryId: string,
        data: string,
        pending: PendingTransaction
    ): Promise<void> {
        await this.telegram.answerCallbackQuery(callbackQueryId);

        const field = data.replace('edit_', '');

        // Update conversation state to track what's being edited
        pending.state = `editing_${field}` as any;
        this.conversationState.set(chatId, pending);

        let promptText = '';
        let keyboard: any;

        switch (field) {
            case 'amount':
                promptText = `💰 *Edit Amount*\n\nCurrent: RM ${pending.transactionData.amount?.toFixed(2)}\n\nChoose a quick option or send the new amount as a message:`;
                keyboard = {
                    inline_keyboard: [
                        [
                            { text: '+10', callback_data: 'amount_add_10' },
                            { text: '+50', callback_data: 'amount_add_50' },
                            { text: '+100', callback_data: 'amount_add_100' },
                        ],
                        [
                            { text: '-10', callback_data: 'amount_sub_10' },
                            { text: '-50', callback_data: 'amount_sub_50' },
                        ],
                        [
                            { text: '🔙 Back', callback_data: 'edit' },
                        ],
                    ],
                };
                break;

            case 'merchant':
                promptText = `🏪 *Edit Merchant*\n\nCurrent: ${pending.transactionData.merchant}\n\nSend the new merchant name as a message:`;
                keyboard = {
                    inline_keyboard: [
                        [{ text: '🔙 Back', callback_data: 'edit' }],
                    ],
                };
                break;

            case 'category':
                promptText = `📁 *Edit Category*\n\nCurrent: ${pending.transactionData.category || 'None'}\n\nSend the new category as a message:`;
                keyboard = {
                    inline_keyboard: [
                        [{ text: '🔙 Back', callback_data: 'edit' }],
                    ],
                };
                break;

            case 'notes':
                promptText = `📝 *Edit Notes*\n\nCurrent: ${pending.transactionData.notes || 'None'}\n\nSend the new notes as a message:`;
                keyboard = {
                    inline_keyboard: [
                        [{ text: '🔙 Back', callback_data: 'edit' }],
                    ],
                };
                break;

            default:
                promptText = '⚠️ Unknown field';
                keyboard = {
                    inline_keyboard: [
                        [{ text: '🔙 Back', callback_data: 'edit' }],
                    ],
                };
        }

        await this.telegram.editMessage(
            chatId,
            pending.messageId,
            promptText,
            {
                reply_markup: keyboard,
                parse_mode: 'Markdown',
            }
        );
    }

    /**
     * Handle amount adjustment callbacks (+10, -50, etc.)
     */
    private async handleAmountAdjustment(
        chatId: number,
        callbackQueryId: string,
        data: string,
        pending: PendingTransaction
    ): Promise<void> {
        const action = data.replace('amount_', '');
        const [operation, amountStr] = action.split('_');
        const adjustment = parseFloat(amountStr);

        if (!pending.transactionData.amount) {
            await this.telegram.answerCallbackQuery(callbackQueryId, 'No amount to adjust');
            return;
        }

        const currentAmount = pending.transactionData.amount;
        const newAmount = operation === 'add' ? currentAmount + adjustment : currentAmount - adjustment;

        // Update transaction data
        pending.transactionData.amount = Math.max(0, newAmount); // Don't allow negative
        this.conversationState.set(chatId, pending);

        await this.telegram.answerCallbackQuery(
            callbackQueryId,
            `Amount ${operation === 'add' ? 'increased' : 'decreased'} by RM${adjustment}`
        );

        // Show updated edit amount screen
        await this.handleEditField(chatId, callbackQueryId, 'edit_amount', pending);
    }

    /**
     * Handle text message (for editing fields)
     */
    async handleTextMessage(chatId: number, text: string): Promise<void> {
        const pending = this.conversationState.get(chatId);

        if (!pending) {
            // No active conversation
            return;
        }

        // Check if we're in an editing state
        const state = pending.state as string;
        if (!state.startsWith('editing_')) {
            // Not editing, ignore
            return;
        }

        const field = state.replace('editing_', '');

        logger.info({
            event: 'telegram.edit.text_received',
            chatId,
            field,
            text: text.substring(0, 50),
        }, 'Received text input for editing');

        // Update the field
        switch (field) {
            case 'amount':
                const amount = parseFloat(text.replace(/[^0-9.]/g, ''));
                if (isNaN(amount) || amount <= 0) {
                    await this.telegram.sendMessage(
                        chatId,
                        '⚠️ Invalid amount. Please send a valid number.'
                    );
                    return;
                }
                pending.transactionData.amount = amount;
                break;

            case 'merchant':
                pending.transactionData.merchant = text.trim();
                break;

            case 'category':
                pending.transactionData.category = text.trim();
                break;

            case 'notes':
                pending.transactionData.notes = text.trim();
                break;
        }

        // Update state back to awaiting confirmation
        pending.state = 'awaiting_confirmation';
        this.conversationState.set(chatId, pending);

        // Show confirmation with updated data
        if (pending.accountId) {
            await this.showConfirmation(
                chatId,
                pending.messageId,
                pending.transactionData,
                pending.accountId,
                pending.screenshotBase64,
                {
                    latitude: pending.location?.latitude,
                    longitude: pending.location?.longitude,
                    timestamp: pending.timestamp,
                    appPackageName: pending.appPackageName,
                }
            );
        }

        // Send confirmation message
        await this.telegram.sendMessage(
            chatId,
            `✅ ${field.charAt(0).toUpperCase() + field.slice(1)} updated!`
        );
    }

    /**
     * Format transaction summary for display
     */
    private formatTransactionSummary(transaction: ExtractedTransaction): string {
        const parts = [
            `💰 *Amount:* RM ${transaction.amount?.toFixed(2) || 'Unknown'}`,
            `🏪 *Merchant:* ${transaction.merchant || 'Unknown'}`,
        ];

        if (transaction.category) {
            parts.push(`📁 *Category:* ${transaction.category}`);
        }

        if (transaction.confidence) {
            const confidenceEmoji = transaction.confidence >= 0.8 ? '🎯' : transaction.confidence >= 0.6 ? '✅' : '⚠️';
            parts.push(`${confidenceEmoji} *Confidence:* ${(transaction.confidence * 100).toFixed(0)}%`);
        }

        return parts.join('\n');
    }
}
