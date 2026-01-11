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
            model: 'gemini-2.5-flash-lite',
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
     * Extract transaction data from screenshot image
     */
    async extractTransactionDataFromImage(
        imageBase64: string,
        metadata?: {
            appPackageName?: string | undefined;
            location?: { latitude: number; longitude: number } | undefined;
            timestamp?: string | undefined;
            userPayee?: string | undefined;
            userRemarks?: string | undefined;
            availableAccounts?: Array<{ packageName: string; accountId: string }> | undefined;
        }
    ): Promise<ExtractedTransaction> {
        const requestId = crypto.randomUUID();

        logger.info({
            event: 'ai.extraction.image.request',
            appPackageName: metadata?.appPackageName,
            hasLocation: !!(metadata?.location),
            requestId,
        }, 'Extracting transaction from screenshot');

        try {
            const prompt = this.buildVisionPrompt(metadata);

            // Prepare image part for Gemini
            const imagePart = {
                inlineData: {
                    data: imageBase64,
                    mimeType: 'image/png', // Assume PNG, but JPEG also works
                },
            };

            const result = await this.model.generateContent([prompt, imagePart]);
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
                event: 'ai.extraction.image.error',
                appPackageName: metadata?.appPackageName,
                error: error instanceof Error ? {
                    message: error.message,
                    stack: error.stack,
                    name: error.name,
                } : error,
                requestId,
            }, 'AI image extraction failed');

            throw new AIExtractionError(
                'Failed to extract transaction data from screenshot',
                `Screenshot from ${metadata?.appPackageName || 'unknown app'}`,
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
     * Build the AI prompt for screenshot transaction extraction
     */
    private buildVisionPrompt(metadata?: {
        appPackageName?: string | undefined;
        location?: { latitude: number; longitude: number } | undefined;
        timestamp?: string | undefined;
        userPayee?: string | undefined;
        userRemarks?: string | undefined;
        availableAccounts?: Array<{ packageName: string; accountId: string }> | undefined;
    }): string {
        // Build context info with app identification guidance
        let contextInfo = '';
        if (metadata?.appPackageName && metadata.appPackageName !== 'unknown') {
            contextInfo = `\nCONTEXT: This screenshot is from the app: ${metadata.appPackageName}\n`;
        } else if (metadata?.availableAccounts && metadata.availableAccounts.length > 0) {
            // App is unknown - ask AI to help identify it
            const appList = metadata.availableAccounts.map(acc => acc.packageName).join(', ');
            contextInfo = `\nCONTEXT: The app that generated this screenshot is UNKNOWN. Based on the visual elements, branding, and transaction details in the screenshot, try to identify which financial institution this belongs to. Known apps: ${appList}\n`;
        }

        // Build user context section
        const userContext = [];
        if (metadata?.userPayee) {
            userContext.push(`🔴 USER PROVIDED PAYEE (USE THIS AS MERCHANT): "${metadata.userPayee}" - This is authoritative, just normalize the formatting/spelling`);
        }
        if (metadata?.userRemarks) {
            userContext.push(`📝 USER REMARKS (add to notes): ${metadata.userRemarks}`);
        }
        const contextSection = userContext.length > 0
            ? `\n**USER INPUT (PRIORITY OVERRIDE)**:\n${userContext.join('\n')}\n`
            : '';

        return `
You are a transaction data extraction system for a budgeting app. Analyze banking app screenshots and extract structured transaction data.

${contextInfo}${contextSection}
IMPORTANT: Screenshots may vary significantly in layout, design, and format across different apps and versions. Be adaptive and look for transaction details anywhere in the image.

STRICT JSON SCHEMA - You MUST follow this exact structure:
{
  "is_transaction": boolean,    // true only if this is an actual financial transaction
  "amount": number,              // REQUIRED if is_transaction=true, always positive
  "currency": string,            // REQUIRED if is_transaction=true (e.g., "MYR", "USD")
  "type": "debit" | "credit",    // REQUIRED if is_transaction=true (ONLY these two values allowed)
  "merchant": string,            // REQUIRED if is_transaction=true
  "category": string,            // OPTIONAL, see allowed categories below
  "reference": string,           // OPTIONAL, transaction reference number
  "notes": string,               // OPTIONAL, any additional details from the screenshot
  "confidence": number,          // REQUIRED, 0.0 to 1.0
  "transaction_date": string     // OPTIONAL, ISO 8601 date extracted from screenshot (e.g., "2026-01-06T16:57:00Z")
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
- Extract exact amount from screenshot
- Look for the primary transaction amount (not balances or other amounts)

MERCHANT/PAYEE EXTRACTION (CRITICAL):
- **IF USER PAYEE NOTE IS PROVIDED**: Use it as the merchant/payee value (just normalize formatting)
- User input is AUTHORITATIVE - it overrides what you see in the screenshot
- Only extract from screenshot if NO user payee note is provided
- When using user payee note: normalize it (fix spelling, proper capitalization, consistent formatting)
- Examples: "starbuk" → "Starbucks", "grab food" → "Grab Food", "ahmad" → "Ahmad"
- If NO user payee note: Look for merchant/payee name ANYWHERE in the screenshot
- Common labels: "Merchant", "Paid to", "Received from", "To", "From", "Payee", "Beneficiary", "Recipient"
- Ignore app names, bank names, or account names - focus on the actual transaction counterparty
- Be adaptive to different app layouts and formats
- If unclear, use the most prominent business/person name visible
- Examples: "Starbucks", "FP-AEON", "Ahmad bin Ali", "Grab", "Netflix"
- Ignore app names, bank names, or account names - focus on the actual merchant/payee

TRANSACTION DATE EXTRACTION (IMPORTANT):
- Look for the transaction date/time displayed ANYWHERE in the screenshot
- Common formats: "06 Jan 2026, 04:57PM", "2026-01-06 16:57", "Jan 6, 2026", "6/1/2026"
- Different apps show dates differently - be adaptive
- Convert to ISO 8601 format: "2026-01-06T16:57:00Z"
- If you can see a date/time in the screenshot, ALWAYS include it in "transaction_date"
- If no date is visible in the screenshot, omit the "transaction_date" field entirely
- The system will use metadata timestamp as fallback if you don't provide transaction_date

CONFIDENCE SCORING:
- 0.9-1.0: Clear transaction with all details visible
- 0.7-0.8: Likely transaction, some details unclear or partially visible
- 0.4-0.6: Uncertain, missing key information
- 0.0-0.3: Probably not a transaction

NON-TRANSACTION EXAMPLES (return is_transaction=false):
- Account balance screens without transaction details
- Login screens
- Settings screens
- Promotional banners
- Loading screens
- Menu screens

SCREENSHOT ANALYSIS INSTRUCTIONS:
1. **Scan the entire screenshot** - don't assume a specific layout
2. Look for transaction amount (usually prominent, may be largest number)
3. **Identify merchant/payee name** - look for business/person names, not app/bank names
4. Determine transaction type from context words like "Paid", "Received", "Debit", "Credit"
5. Extract reference/transaction ID if visible (often labeled as "Ref", "Transaction ID", "Order ID")
6. **EXTRACT TRANSACTION DATE/TIME if visible** - look anywhere in the screenshot
7. Identify category hints from merchant name or transaction context
8. Read any additional details for the notes field

HANDLING DIFFERENT APP LAYOUTS:
- Some apps show merchant at top, some at bottom
- Some use icons, some use text labels
- Some show dates prominently, others hide them
- Be flexible and adaptive - look for semantic meaning, not specific positions
- Focus on WHAT the information represents, not WHERE it appears

HANDLING ADS AND PROMOTIONAL CONTENT:
- Screenshots may contain advertisements, banners, or promotional offers
- Common examples: "Scan & Pay! Huat up to RM88 + 920 Coins", promotional images, special offers
- **IGNORE promotional content** - focus only on the actual transaction details
- Look for the core transaction information: amount, merchant, date, reference
- Ads are usually colorful banners, images with marketing text, or special offers
- Transaction details are typically in plain text with labels like "Amount", "Paid to", "Date", etc.
- If unsure whether something is an ad or transaction detail, prioritize information with clear labels

CRITICAL REMINDERS:
- Return ONLY the JSON object
- NO markdown code blocks (no \`\`\`json)
- NO additional text or explanations
- "type" field MUST be exactly "debit" or "credit" - nothing else
- Amount MUST be positive number
- If the screenshot doesn't show a clear transaction, return is_transaction=false
- If you can see a date/time in the screenshot, include it in "transaction_date" field
- Extract merchant/payee name even if layout is unfamiliar - look for the business/person name

Now analyze the screenshot and return the JSON:
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
