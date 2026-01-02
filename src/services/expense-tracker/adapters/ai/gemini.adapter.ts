import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIAdapter } from './ai.interface';
import { AIExtractionError } from './ai.interface';
import type { ExtractedTransaction } from '@/shared/types/common.types';
import { validateExtractedTransaction } from '@/shared/utils/validators';
import { logger, logAIExtractionRequest, logAIExtractionResponse } from '@/shared/utils/logger';

/**
 * Gemini AI Adapter
 * 
 * Uses Google's Gemini AI to extract transaction data from banking notifications
 */
export class GeminiAdapter implements AIAdapter {
    private genAI: GoogleGenerativeAI;
    private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
        });
    }

    /**
     * Extract transaction data from notification text
     */
    async extractTransactionData(text: string): Promise<ExtractedTransaction> {
        const requestId = crypto.randomUUID();

        logAIExtractionRequest({
            notificationText: text,
            requestId,
        });

        try {
            const prompt = this.buildPrompt(text);
            const result = await this.model.generateContent(prompt);
            const response = result.response;
            const responseText = response.text();

            // Parse JSON response
            const extracted = this.parseResponse(responseText);

            // Validate extracted data
            const validated = validateExtractedTransaction(extracted);

            logAIExtractionResponse({
                amount: validated.amount,
                merchant: validated.merchant,
                type: validated.type,
                category: validated.category ?? undefined,
                requestId,
            });

            return validated;
        } catch (error) {
            logger.error({
                event: 'ai.extraction.error',
                notificationText: text,
                error,
                requestId,
            }, 'AI extraction failed');

            throw new AIExtractionError(
                'Failed to extract transaction data from notification',
                text,
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Validate API key by making a test request
     */
    async validateApiKey(): Promise<boolean> {
        try {
            await this.extractTransactionData('Test notification: You spent RM 10.00 at Test Store');
            return true;
        } catch (error) {
            logger.warn('Gemini API key validation failed', { error });
            return false;
        }
    }

    /**
     * Build the AI prompt for transaction extraction
     */
    private buildPrompt(text: string): string {
        return `
You are a financial transaction parser for Malaysian banking apps. Extract transaction details from the following notification text and return ONLY a JSON object with no additional text or markdown formatting.

Notification text:
"${text}"

Return a JSON object with these exact fields:
- amount: number (positive for debit/spending, negative for credit/receiving money)
- merchant: string (the merchant, store, or person involved)
- type: "debit" or "credit"
- category: string (optional, e.g., "Food & Dining", "Transportation", "Shopping", "Transfer")

Examples:

Input: "You spent RM 45.50 at Starbucks"
Output: {"amount": 45.50, "merchant": "Starbucks", "type": "debit", "category": "Food & Dining"}

Input: "Received RM 100.00 from John Doe"
Output: {"amount": -100.00, "merchant": "John Doe", "type": "credit", "category": "Transfer"}

Input: "Payment of RM 25.00 to Grab"
Output: {"amount": 25.00, "merchant": "Grab", "type": "debit", "category": "Transportation"}

Input: "Reload successful. RM 50.00 added to your TNG eWallet"
Output: {"amount": -50.00, "merchant": "TNG eWallet", "type": "credit", "category": "Transfer"}

Important:
- Return ONLY the JSON object, no markdown code blocks or additional text
- Amount should be positive for spending (debit) and negative for receiving (credit)
- If category is unclear, omit it
- Extract the exact merchant name from the notification
- Handle Malaysian Ringgit (RM) currency

Now extract the transaction from the notification above:
`.trim();
    }

    /**
     * Parse AI response and extract JSON
     */
    private parseResponse(responseText: string): unknown {
        // Remove markdown code blocks if present
        let cleaned = responseText.trim();
        cleaned = cleaned.replace(/```json\n?/g, '');
        cleaned = cleaned.replace(/```\n?/g, '');
        cleaned = cleaned.trim();

        try {
            return JSON.parse(cleaned);
        } catch (error) {
            logger.error({
                event: 'ai.response.parse.error',
                responseText,
                error,
            }, 'Failed to parse AI response as JSON');

            throw new Error(`Failed to parse AI response: ${cleaned}`);
        }
    }
}
