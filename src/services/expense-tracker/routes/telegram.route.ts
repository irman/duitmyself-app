import { Hono } from 'hono';
import type { TelegramConversationService } from '../services/telegram-conversation.service';
import type { TelegramUpdate } from '../adapters/telegram/telegram.interface';
import { logger } from '@/shared/utils/logger';
import { getWideEvent } from '@/shared/middleware/wide-event.middleware';
import { config } from '@/shared/config/config';

/**
 * Create Telegram webhook routes
 * 
 * @param conversationService - Telegram conversation service instance
 * @returns Hono app with Telegram routes
 */
export function createTelegramRoutes(conversationService: TelegramConversationService) {
    const app = new Hono();

    /**
     * POST /webhook/telegram
     * 
     * Telegram webhook for receiving updates (messages, callbacks, etc.)
     * This is the standard Telegram webhook endpoint
     */
    app.post('/webhook/telegram', async (c) => {
        try {
            const wideEvent = getWideEvent(c);

            if (wideEvent) {
                wideEvent.webhook = {
                    payload_type: 'telegram_update',
                    has_gps: false,
                };
            }

            const update: TelegramUpdate = await c.req.json();

            // Log ALL incoming updates with full details
            logger.info({
                event: 'telegram.webhook.received',
                updateId: update.update_id,
                hasMessage: !!update.message,
                hasCallback: !!update.callback_query,
                messageText: update.message?.text,
                callbackData: update.callback_query?.data,
                callbackId: update.callback_query?.id,
                chatId: update.message?.chat.id || update.callback_query?.message?.chat.id,
                updateKeys: Object.keys(update),
                rawUpdate: JSON.stringify(update).substring(0, 300),
            }, 'Received Telegram webhook update');

            // Handle callback query (button press) - MUST BE FIRST
            if (update.callback_query) {
                const { id, message, data } = update.callback_query;

                logger.info({
                    event: 'telegram.callback.detected',
                    callbackId: id,
                    data,
                    hasMessage: !!message,
                    chatId: message?.chat.id,
                }, 'Callback query detected - button was pressed');

                if (message && data) {
                    try {
                        logger.info({ event: 'telegram.callback.handling', callbackId: id, data }, 'Handling callback');

                        await conversationService.handleCallback(
                            message.chat.id,
                            id,
                            data
                        );

                        logger.info({ event: 'telegram.callback.success', callbackId: id }, 'Callback handled');
                    } catch (error) {
                        logger.error({
                            event: 'telegram.callback.error',
                            callbackId: id,
                            data,
                            error: error instanceof Error ? {
                                message: error.message,
                                stack: error.stack,
                            } : String(error),
                        }, 'Failed to handle callback');

                        // Answer callback to remove loading state
                        try {
                            await conversationService.telegram.answerCallbackQuery(
                                id,
                                '❌ Error processing request. Please try again.'
                            );
                        } catch (answerError) {
                            logger.error({ error: String(answerError) }, 'Failed to answer callback');
                        }
                    }
                } else {
                    logger.warn({
                        event: 'telegram.callback.invalid',
                        hasMessage: !!message,
                        hasData: !!data,
                    }, 'Invalid callback - missing message or data');
                }

                return c.json({ ok: true });
            }

            // Handle message
            if (update.message) {
                const { chat, photo, text } = update.message;

                // Handle photo (screenshot)
                if (photo && photo.length > 0) {
                    // Note: For native Telegram photo uploads, we would need to:
                    // 1. Get file_id from photo array
                    // 2. Call getFile API to get file_path
                    // 3. Download file from Telegram servers
                    // 4. Convert to base64
                    // 
                    // For now, we'll rely on the custom /webhook/telegram/screenshot endpoint
                    // where MacroDroid sends base64 directly

                    await conversationService.telegram.sendMessage(
                        chat.id,
                        '⚠️ Please use MacroDroid to send screenshots.\n\nDirect photo uploads are not yet supported.'
                    );

                    return c.json({ ok: true });
                }

                // Handle text message
                if (text) {
                    // Handle commands or text-based input
                    if (text === '/start') {
                        await conversationService.telegram.sendMessage(
                            chat.id,
                            '👋 *Welcome to DuitMyself Expense Tracker!*\n\n' +
                            'Send me a screenshot of your transaction and I\'ll help you track it.\n\n' +
                            '*How to use:*\n' +
                            '1. Take a screenshot of your transaction notification\n' +
                            '2. Send it to me via MacroDroid\n' +
                            '3. I\'ll extract the details and ask you to confirm\n' +
                            '4. Done! Transaction saved to Lunch Money\n\n' +
                            '💡 *Tip:* Make sure MacroDroid is configured to send screenshots to this bot.',
                            { parse_mode: 'Markdown' }
                        );
                    } else {
                        // Handle text input for editing
                        await conversationService.handleTextMessage(chat.id, text);
                    }

                    return c.json({ ok: true });
                }
            }

            return c.json({ ok: true });

        } catch (error) {
            logger.error({
                event: 'telegram.webhook.failed',
                error: error instanceof Error ? error.message : 'Unknown error',
            }, 'Failed to process Telegram webhook');

            return c.json({ ok: false, error: 'Internal error' }, 500);
        }
    });

    /**
     * POST /webhook/telegram/screenshot
     * 
     * Custom endpoint for MacroDroid to send screenshots directly
     * This bypasses Telegram's file API and sends base64 directly
     */
    app.post('/webhook/telegram/screenshot', async (c) => {
        try {
            const body = await c.req.json();

            const {
                chat_id,
                image_base64,
                app_package_name,
                latitude,
                longitude,
                timestamp,
                metadata,
            } = body;

            // Use chat_id from request or fall back to environment variable
            const chatId = chat_id || parseInt(config.telegram.expenseChatId);

            if (!chatId) {
                return c.json({
                    success: false,
                    error: 'Chat ID not provided and TELEGRAM_EXPENSE_CHAT_ID not configured',
                }, 400);
            }

            const wideEvent = getWideEvent(c);

            if (wideEvent) {
                wideEvent.webhook = {
                    payload_type: 'telegram_screenshot',
                    has_gps: !!(latitude && longitude),
                    app_package_name,
                };
            }

            // Validate required fields
            if (!image_base64) {
                return c.json({
                    success: false,
                    error: 'Missing required field: image_base64',
                }, 400);
            }

            logger.info({
                event: 'telegram.screenshot.webhook.received',
                chatId,
                hasAppPackage: !!app_package_name,
                hasLocation: !!(latitude && longitude),
                hasMetadata: !!metadata,
                hasUserInput: !!(metadata?.user_input),
            }, 'Received screenshot from MacroDroid');

            // Extract user input from metadata
            const userPayee = metadata?.user_input?.payee;
            const userRemarks = metadata?.user_input?.remarks;

            // Process screenshot
            await conversationService.handleScreenshot(
                chatId,
                image_base64,
                {
                    appPackageName: app_package_name,
                    latitude,
                    longitude,
                    timestamp,
                    userPayee,
                    userRemarks,
                }
            );

            return c.json({ success: true });

        } catch (error) {
            logger.error({
                event: 'telegram.screenshot.webhook.failed',
                error: error instanceof Error ? error.message : 'Unknown error',
            }, 'Failed to process screenshot webhook');

            return c.json({
                success: false,
                error: 'Internal error',
            }, 500);
        }
    });

    /**
     * GET /webhook/telegram/health
     * 
     * Health check for Telegram webhook
     */
    app.get('/webhook/telegram/health', async (c) => {
        return c.json({
            status: 'healthy',
            service: 'telegram-webhook',
            timestamp: new Date().toISOString(),
        });
    });

    return app;
}
