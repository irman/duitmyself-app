/**
 * Telegram Adapter Interface
 * 
 * Handles sending notifications via Telegram Bot API
 */
export interface TelegramAdapter {
    /**
     * Send a message to the configured chat
     * 
     * @param message - Message text (supports Markdown)
     * @throws {Error} If API call fails
     */
    sendMessage(message: string): Promise<void>;

    /**
     * Validate API credentials
     * 
     * @returns True if credentials are valid
     */
    validateCredentials(): Promise<boolean>;
}
