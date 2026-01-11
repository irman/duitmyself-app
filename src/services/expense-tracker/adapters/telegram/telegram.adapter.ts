import ky, { type KyInstance } from 'ky';
import { logger } from '@/shared/utils/logger';
import type {
    TelegramAdapter,
    SendMessageOptions,
    EditMessageOptions,
    TelegramMessage,
} from './telegram.interface';
import { TelegramAPIError } from './telegram.interface';

/**
 * Telegram Bot Adapter
 * 
 * Integrates with Telegram Bot API for conversational transaction capture
 * API Docs: https://core.telegram.org/bots/api
 */
export class TelegramBotAdapter implements TelegramAdapter {
    private client: KyInstance;
    private readonly baseUrl: string;

    constructor(
        private readonly botToken: string,
        retryConfig: { limit: number; backoffMs: number }
    ) {
        this.baseUrl = `https://api.telegram.org/bot${botToken}`;

        this.client = ky.create({
            prefixUrl: this.baseUrl,
            timeout: 10000,
            retry: {
                limit: retryConfig.limit,
                methods: ['post', 'get'],
                statusCodes: [408, 429, 500, 502, 503, 504],
                backoffLimit: retryConfig.backoffMs,
            },
            hooks: {
                beforeRetry: [
                    ({ request, error, retryCount }) => {
                        logger.warn({
                            event: 'telegram.api.retry',
                            url: request.url,
                            retryCount,
                            error: error?.message,
                        }, 'Retrying Telegram API request');
                    },
                ],
            },
        });
    }

    /**
     * Send a text message to a chat
     */
    async sendMessage(chatId: number, text: string, options?: SendMessageOptions): Promise<TelegramMessage> {
        try {
            logger.debug({
                event: 'telegram.send_message.request',
                chatId,
                textLength: text.length,
                hasKeyboard: !!options?.reply_markup,
            }, 'Sending Telegram message');

            const response = await this.client.post('sendMessage', {
                json: {
                    chat_id: chatId,
                    text,
                    ...options,
                },
            }).json<{ ok: boolean; result: TelegramMessage }>();

            if (!response.ok) {
                throw new TelegramAPIError('Telegram API returned ok: false');
            }

            logger.debug({
                event: 'telegram.send_message.success',
                chatId,
                messageId: response.result.message_id,
            }, 'Telegram message sent successfully');

            return response.result;
        } catch (error) {
            logger.error({
                event: 'telegram.send_message.failed',
                chatId,
                error: error instanceof Error ? error.message : 'Unknown error',
            }, 'Failed to send Telegram message');

            throw new TelegramAPIError(
                'Failed to send message',
                undefined,
                error
            );
        }
    }

    /**
     * Send a photo with caption
     */
    async sendPhoto(chatId: number, photo: string, caption?: string): Promise<TelegramMessage> {
        try {
            logger.debug({
                event: 'telegram.send_photo.request',
                chatId,
                hasCaption: !!caption,
            }, 'Sending Telegram photo');

            const response = await this.client.post('sendPhoto', {
                json: {
                    chat_id: chatId,
                    photo,
                    caption,
                },
            }).json<{ ok: boolean; result: TelegramMessage }>();

            if (!response.ok) {
                throw new TelegramAPIError('Telegram API returned ok: false');
            }

            return response.result;
        } catch (error) {
            logger.error({
                event: 'telegram.send_photo.failed',
                chatId,
                error: error instanceof Error ? error.message : 'Unknown error',
            }, 'Failed to send Telegram photo');

            throw new TelegramAPIError(
                'Failed to send photo',
                undefined,
                error
            );
        }
    }

    /**
     * Edit an existing message
     */
    async editMessage(
        chatId: number,
        messageId: number,
        text: string,
        options?: EditMessageOptions
    ): Promise<TelegramMessage> {
        try {
            logger.debug({
                event: 'telegram.edit_message.request',
                chatId,
                messageId,
                textLength: text.length,
            }, 'Editing Telegram message');

            const response = await this.client.post('editMessageText', {
                json: {
                    chat_id: chatId,
                    message_id: messageId,
                    text,
                    ...options,
                },
            }).json<{ ok: boolean; result: TelegramMessage }>();

            if (!response.ok) {
                throw new TelegramAPIError('Telegram API returned ok: false');
            }

            return response.result;
        } catch (error) {
            logger.error({
                event: 'telegram.edit_message.failed',
                chatId,
                messageId,
                error: error instanceof Error ? error.message : 'Unknown error',
            }, 'Failed to edit Telegram message');

            throw new TelegramAPIError(
                'Failed to edit message',
                undefined,
                error
            );
        }
    }

    /**
     * Answer a callback query (from inline button)
     */
    async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
        try {
            logger.debug({
                event: 'telegram.answer_callback.request',
                callbackQueryId,
                hasText: !!text,
            }, 'Answering callback query');

            const response = await this.client.post('answerCallbackQuery', {
                json: {
                    callback_query_id: callbackQueryId,
                    text,
                },
            }).json<{ ok: boolean }>();

            if (!response.ok) {
                throw new TelegramAPIError('Telegram API returned ok: false');
            }
        } catch (error) {
            logger.error({
                event: 'telegram.answer_callback.failed',
                callbackQueryId,
                error: error instanceof Error ? error.message : 'Unknown error',
            }, 'Failed to answer callback query');

            throw new TelegramAPIError(
                'Failed to answer callback query',
                undefined,
                error
            );
        }
    }

    /**
     * Delete a message
     */
    async deleteMessage(chatId: number, messageId: number): Promise<void> {
        try {
            logger.debug({
                event: 'telegram.delete_message.request',
                chatId,
                messageId,
            }, 'Deleting Telegram message');

            const response = await this.client.post('deleteMessage', {
                json: {
                    chat_id: chatId,
                    message_id: messageId,
                },
            }).json<{ ok: boolean }>();

            if (!response.ok) {
                throw new TelegramAPIError('Telegram API returned ok: false');
            }
        } catch (error) {
            logger.error({
                event: 'telegram.delete_message.failed',
                chatId,
                messageId,
                error: error instanceof Error ? error.message : 'Unknown error',
            }, 'Failed to delete Telegram message');

            throw new TelegramAPIError(
                'Failed to delete message',
                undefined,
                error
            );
        }
    }
}
