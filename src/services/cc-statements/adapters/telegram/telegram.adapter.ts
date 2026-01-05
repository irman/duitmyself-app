import TelegramBot from 'node-telegram-bot-api';
import type { TelegramAdapter } from './telegram.interface';
import { logger } from '@/shared/utils/logger';

/**
 * Telegram Bot API Adapter
 * 
 * Implements TelegramAdapter interface using node-telegram-bot-api
 */
export class TelegramAdapterImpl implements TelegramAdapter {
    private bot: TelegramBot;

    constructor(
        botToken: string,
        private chatId: string
    ) {
        // Initialize bot without polling (we only send messages)
        this.bot = new TelegramBot(botToken, { polling: false });
    }

    /**
     * Send a message to the configured chat
     */
    async sendMessage(message: string): Promise<void> {
        try {
            logger.debug({
                event: 'telegram.send_message.start',
                chatId: this.chatId,
                messageLength: message.length,
            }, 'Sending Telegram message');

            await this.bot.sendMessage(this.chatId, message, {
                parse_mode: 'MarkdownV2',
                disable_web_page_preview: false,
            });

            logger.info({
                event: 'telegram.send_message.success',
                chatId: this.chatId,
            }, 'Telegram message sent successfully');
        } catch (error) {
            logger.error({
                event: 'telegram.send_message.error',
                error: error instanceof Error ? error.message : 'Unknown error',
                chatId: this.chatId,
            }, 'Failed to send Telegram message');
            throw error;
        }
    }

    /**
     * Validate API credentials
     */
    async validateCredentials(): Promise<boolean> {
        try {
            // Try to get bot info to validate token
            const botInfo = await this.bot.getMe();

            logger.info({
                event: 'telegram.validate_credentials.success',
                botUsername: botInfo.username,
            }, 'Telegram credentials validated successfully');

            return true;
        } catch (error) {
            logger.warn({
                event: 'telegram.validate_credentials.failed',
                error: error instanceof Error ? error.message : 'Unknown error',
            }, 'Telegram credentials validation failed');
            return false;
        }
    }

    /**
     * Escape special characters for MarkdownV2
     * 
     * @param text - Text to escape
     * @returns Escaped text
     */
    static escapeMarkdown(text: string): string {
        // MarkdownV2 special characters that need escaping
        return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
    }
}
