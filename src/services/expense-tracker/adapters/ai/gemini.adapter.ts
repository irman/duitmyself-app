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

            // Log extraction response only if it's a transaction
            if (validated.is_transaction && validated.amount && validated.merchant && validated.type) {
                logAIExtractionResponse({
                    amount: validated.amount,
                    merchant: validated.merchant,
                    type: validated.type,
                    category: validated.category ?? undefined,
                    requestId,
                });
            }

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
You are a transaction data extraction system for a budgeting app. Analyze banking notifications and extract structured data.

NOTIFICATION TO ANALYZE:
\`\`\`
${text}
\`\`\`

STRICT JSON SCHEMA - You MUST follow this exact structure:
{
  "is_transaction": boolean,    // true only if this is an actual financial transaction
  "amount": number,              // REQUIRED if is_transaction=true, always positive
  "currency": string,            // REQUIRED if is_transaction=true (e.g., "MYR", "USD")
  "type": "debit" | "credit",    // REQUIRED if is_transaction=true (ONLY these two values allowed)
  "merchant": string,            // REQUIRED if is_transaction=true
  "category": string,            // OPTIONAL, see allowed categories below
  "reference": string,           // OPTIONAL, transaction reference number
  "notes": string,               // OPTIONAL, copy original notification text
  "confidence": number           // REQUIRED, 0.0 to 1.0
}

CRITICAL RULES FOR "type" FIELD:
- ONLY use "debit" or "credit" - NO OTHER VALUES ALLOWED
- "debit" = Money going OUT (purchases, payments, transfers to others, withdrawals)
- "credit" = Money coming IN (salary, refunds, transfers from others, deposits)
- For person-to-person transfers: use type="debit" with category="transfer"

ALLOWED CATEGORIES (choose the most appropriate):
- "food" - Restaurants, cafes, food delivery
- "transport" - Fuel, parking, ride-sharing, public transport
- "shopping" - Retail purchases, online shopping
- "bills" - Utilities, subscriptions, recurring payments
- "transfer" - Person-to-person transfers, bank transfers
- "entertainment" - Movies, games, hobbies
- "utilities" - Electricity, water, internet, phone bills
- "healthcare" - Medical, pharmacy, insurance
- "other" - Anything that doesn't fit above categories

AMOUNT RULES:
- ALWAYS use positive numbers for amount
- The "type" field determines direction (debit=out, credit=in)
- Extract exact amount from notification (e.g., "RM 45.50" → 45.50)

CONFIDENCE SCORING:
- 0.9-1.0: Clear transaction with all details present
- 0.7-0.8: Likely transaction, some details unclear
- 0.4-0.6: Uncertain, missing key information
- 0.0-0.3: Probably not a transaction

NON-TRANSACTION EXAMPLES (return is_transaction=false):
- Promotional messages
- Account balance updates without transactions
- Security alerts
- Service announcements
- OTP/verification codes

VALID RESPONSE EXAMPLES:

Example 1 - Debit card purchase:
{
  "is_transaction": true,
  "amount": 45.50,
  "currency": "MYR",
  "type": "debit",
  "merchant": "Starbucks KLCC",
  "category": "food",
  "reference": "REF123456",
  "notes": "Debit card purchase at Starbucks KLCC for RM45.50",
  "confidence": 0.95
}

Example 2 - Transfer to person:
{
  "is_transaction": true,
  "amount": 100.00,
  "currency": "MYR",
  "type": "debit",
  "merchant": "Ahmad bin Ali",
  "category": "transfer",
  "reference": "TRF789012",
  "notes": "Transfer RM100.00 to Ahmad bin Ali",
  "confidence": 0.90
}

Example 3 - Salary credit:
{
  "is_transaction": true,
  "amount": 5000.00,
  "currency": "MYR",
  "type": "credit",
  "merchant": "Company XYZ Sdn Bhd",
  "category": "other",
  "reference": "SAL202401",
  "notes": "Salary credit from Company XYZ",
  "confidence": 0.98
}

Example 4 - Not a transaction:
{
  "is_transaction": false,
  "confidence": 0.0
}

CRITICAL REMINDERS:
- Return ONLY the JSON object
- NO markdown code blocks (no \`\`\`json)
- NO additional text or explanations
- "type" field MUST be exactly "debit" or "credit" - nothing else
- Amount MUST be positive number

Now analyze the notification above and return the JSON:
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
