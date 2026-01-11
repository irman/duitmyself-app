/**
 * Telegram Adapter Interface
 * 
 * Handles all Telegram Bot API interactions
 */
export interface TelegramAdapter {
    /**
     * Send a text message to a chat
     */
    sendMessage(chatId: number, text: string, options?: SendMessageOptions): Promise<TelegramMessage>;

    /**
     * Send a photo with caption
     */
    sendPhoto(chatId: number, photo: string, caption?: string): Promise<TelegramMessage>;

    /**
     * Edit an existing message
     */
    editMessage(chatId: number, messageId: number, text: string, options?: EditMessageOptions): Promise<TelegramMessage>;

    /**
     * Answer a callback query (from inline button)
     */
    answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;

    /**
     * Delete a message
     */
    deleteMessage(chatId: number, messageId: number): Promise<void>;
}

/**
 * Options for sending messages
 */
export interface SendMessageOptions {
    /** Inline keyboard markup */
    reply_markup?: InlineKeyboardMarkup;
    /** Parse mode (Markdown, HTML) */
    parse_mode?: 'Markdown' | 'HTML';
}

/**
 * Options for editing messages
 */
export interface EditMessageOptions {
    /** Inline keyboard markup */
    reply_markup?: InlineKeyboardMarkup;
    /** Parse mode (Markdown, HTML) */
    parse_mode?: 'Markdown' | 'HTML';
}

/**
 * Inline keyboard markup
 */
export interface InlineKeyboardMarkup {
    inline_keyboard: InlineKeyboardButton[][];
}

/**
 * Inline keyboard button
 */
export interface InlineKeyboardButton {
    text: string;
    callback_data?: string;
    url?: string;
}

/**
 * Telegram message
 */
export interface TelegramMessage {
    message_id: number;
    chat: { id: number };
    text?: string;
    photo?: Array<{ file_id: string }>;
}

/**
 * Telegram webhook update
 */
export interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
    callback_query?: TelegramCallbackQuery;
}

/**
 * Telegram callback query (from inline button)
 */
export interface TelegramCallbackQuery {
    id: string;
    from: { id: number };
    message?: TelegramMessage;
    data?: string;
}

/**
 * Telegram API Error
 */
export class TelegramAPIError extends Error {
    constructor(
        message: string,
        public readonly statusCode?: number,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = 'TelegramAPIError';
    }
}
