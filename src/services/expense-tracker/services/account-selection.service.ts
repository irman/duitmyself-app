import type { InlineKeyboardMarkup } from '../adapters/telegram/telegram.interface';
import type { ExtractedTransaction } from '@/shared/types/common.types';
import { readFileSync } from 'fs';

/**
 * Account configuration
 */
export interface AccountConfig {
    id: string;
    label: string;
    icon: string;
    color: string;
    tags: string[];
    matchers: {
        package_names: string[];
        keywords: string[];
        merchant_patterns: string[];
    };
    default_category?: string;
    auto_clear?: boolean;
    notes?: string;
}

/**
 * Account mapping configuration
 */
export interface AccountMappingConfig {
    accounts: AccountConfig[];
    preferences: {
        default_account_id?: string;
        show_recent_accounts_first: boolean;
        max_recent_accounts: number;
    };
}

/**
 * Account detection result
 */
export interface AccountDetectionResult {
    /** Auto-selected account ID (if confidence is high enough) */
    accountId?: string;
    /** Confidence score (0-1) */
    confidence: number;
    /** Matched accounts sorted by score */
    matches: AccountConfig[];
}

/**
 * Account Selection Service
 * 
 * Handles intelligent account detection and selection UI
 */
export class AccountSelectionService {
    private accountConfig: AccountMappingConfig;
    private recentAccounts: string[] = []; // Track recently used account IDs

    constructor(configPath: string) {
        // Load enhanced account mapping from JSON file
        const configContent = readFileSync(configPath, 'utf-8');
        this.accountConfig = JSON.parse(configContent);
    }

    /**
     * Try to auto-detect account from multiple factors
     * Returns account ID if confident, undefined if needs user selection
     */
    detectAccount(
        packageName?: string,
        extractedTransaction?: ExtractedTransaction,
        aiDetectedApp?: string
    ): AccountDetectionResult {
        const matches: Array<{ account: AccountConfig; score: number }> = [];

        for (const account of this.accountConfig.accounts) {
            let score = 0;

            // 1. Package name match (highest priority - 100 points)
            if (packageName && account.matchers.package_names.includes(packageName)) {
                score += 100;
            }

            // 2. AI-detected app keyword match (high priority - 80 points)
            if (aiDetectedApp) {
                const normalizedApp = aiDetectedApp.toLowerCase();
                for (const keyword of account.matchers.keywords) {
                    if (normalizedApp.includes(keyword.toLowerCase())) {
                        score += 80;
                        break;
                    }
                }
            }

            // 3. Merchant pattern match (medium priority - 50 points)
            if (extractedTransaction?.merchant) {
                for (const pattern of account.matchers.merchant_patterns) {
                    if (this.matchPattern(extractedTransaction.merchant, pattern)) {
                        score += 50;
                        break;
                    }
                }
            }

            // 4. Recent usage bonus (10 points)
            if (this.recentAccounts.includes(account.id)) {
                score += 10;
            }

            if (score > 0) {
                matches.push({ account, score });
            }
        }

        // Sort by score descending
        matches.sort((a, b) => b.score - a.score);

        // If top match has score >= 80, auto-select it
        if (matches.length > 0 && matches[0].score >= 80) {
            return {
                accountId: matches[0].account.id,
                confidence: matches[0].score / 100,
                matches: matches.map(m => m.account),
            };
        }

        // Otherwise, return matches for user selection
        return {
            confidence: matches.length > 0 ? matches[0].score / 100 : 0,
            matches: matches.map(m => m.account),
        };
    }

    /**
     * Get account by ID
     */
    getAccount(accountId: string): AccountConfig | undefined {
        return this.accountConfig.accounts.find(a => a.id === accountId);
    }

    /**
     * Get all accounts
     */
    getAllAccounts(): AccountConfig[] {
        return this.accountConfig.accounts;
    }

    /**
     * Create inline keyboard for account selection
     * Shows recent accounts first (if enabled), then all accounts
     */
    createAccountSelectionKeyboard(suggestedMatches?: AccountConfig[]): InlineKeyboardMarkup {
        let accountsToShow: AccountConfig[];

        if (suggestedMatches && suggestedMatches.length > 0) {
            // Show suggested matches first, then others
            const suggestedIds = suggestedMatches.map(a => a.id);
            const others = this.accountConfig.accounts.filter(
                a => !suggestedIds.includes(a.id)
            );
            accountsToShow = [...suggestedMatches, ...others];
        } else if (this.accountConfig.preferences.show_recent_accounts_first && this.recentAccounts.length > 0) {
            // Show recent accounts first, then others
            const recent = this.recentAccounts
                .slice(0, this.accountConfig.preferences.max_recent_accounts)
                .map(id => this.getAccount(id))
                .filter(Boolean) as AccountConfig[];

            const recentIds = recent.map(a => a.id);
            const others = this.accountConfig.accounts.filter(
                a => !recentIds.includes(a.id)
            );

            accountsToShow = [...recent, ...others];
        } else {
            accountsToShow = this.accountConfig.accounts;
        }

        // Create 2-column layout with icons and labels
        const buttons = [];
        for (let i = 0; i < accountsToShow.length; i += 2) {
            const row = [
                {
                    text: `${accountsToShow[i].icon} ${accountsToShow[i].label}`,
                    callback_data: `account:${accountsToShow[i].id}`,
                },
            ];

            if (i + 1 < accountsToShow.length && accountsToShow[i + 1]) {
                row.push({
                    text: `${accountsToShow[i + 1]!.icon} ${accountsToShow[i + 1]!.label}`,
                    callback_data: `account:${accountsToShow[i + 1]!.id}`,
                });
            }

            buttons.push(row);
        }

        return { inline_keyboard: buttons };
    }

    /**
     * Record account usage for recent tracking
     */
    recordAccountUsage(accountId: string): void {
        // Remove if already in list
        this.recentAccounts = this.recentAccounts.filter(id => id !== accountId);
        // Add to front
        this.recentAccounts.unshift(accountId);
        // Keep only max recent
        this.recentAccounts = this.recentAccounts.slice(
            0,
            this.accountConfig.preferences.max_recent_accounts
        );
    }

    /**
     * Get recent accounts
     */
    getRecentAccounts(): AccountConfig[] {
        return this.recentAccounts
            .map(id => this.getAccount(id))
            .filter(Boolean) as AccountConfig[];
    }

    /**
     * Match string against pattern (supports wildcards)
     */
    private matchPattern(text: string, pattern: string): boolean {
        const regexPattern = pattern
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        const regex = new RegExp(`^${regexPattern}$`, 'i');
        return regex.test(text);
    }
}
