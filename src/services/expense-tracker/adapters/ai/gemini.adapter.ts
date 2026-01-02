import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
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
            model: 'gemini-2.5-flash',
            safetySettings: [
                {
                    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
            ],
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
                error: error instanceof Error ? {
                    message: error.message,
                    stack: error.stack,
                    name: error.name,
                } : error,
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
            // Just test if we can call Gemini API - don't validate the response schema
            const prompt = 'Say "OK" if you can read this.';
            const result = await this.model.generateContent(prompt);
            const response = result.response;
            const responseText = response.text();

            // If we got any response, the API key is valid
            return responseText.length > 0;
        } catch (error) {
            logger.warn('Gemini API key validation failed', {
                error: error instanceof Error ? {
                    message: error.message,
                    name: error.name,
                } : error
            });
            return false;
        }
    }

    /**
     * Build the AI prompt for transaction extraction
     */
    private buildPrompt(text: string): string {
        return `
Your job is to help automate transactions from Android banking notifications to a budgeting app.

Analyze this notification and determine if it's a financial transaction:

\`\`\`
${text}
\`\`\`

If this is a transaction notification, extract:
- Amount (number only, no currency symbol)
- Currency (MYR, USD, etc.)
- Transaction type (debit, credit, transfer)
- Payee/Merchant name
- Category (food, transport, shopping, bills, transfer, entertainment, other)
- Any reference number
- Your confidence level (0.0 to 1.0)

Return ONLY valid JSON in this exact format:
{
  "is_transaction": true,
  "amount": 45.50,
  "currency": "MYR",
  "type": "debit",
  "merchant": "Starbucks",
  "category": "food",
  "reference": "REF123456",
  "notes": "original notification text here",
  "confidence": 0.95
}

If this is NOT a transaction (e.g., promotional message, account update, etc.), return:
{
  "is_transaction": false,
  "confidence": 0.0
}

Important rules:
- Amount should be positive for spending (debit) and negative for receiving money (credit)
- Only set is_transaction to true if you're confident this is an actual financial transaction
- Confidence should be 0.0-1.0 (0.8+ for clear transactions, 0.4-0.7 for uncertain, <0.4 for unlikely)
- Extract the exact merchant/payee name from the notification
- Handle Malaysian Ringgit (RM/MYR) currency
- Return ONLY the JSON object, no markdown code blocks or additional text

Now analyze the notification above:
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
