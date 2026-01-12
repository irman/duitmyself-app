import { readFileSync } from 'fs';
import { join } from 'path';
import { validateEnv, validateAccountMapping, type ValidatedEnv } from '../utils/validators';
import type { AccountMapping } from '../types/common.types';
import { logger } from '../utils/logger';

/**
 * Load and validate environment variables
 */
function loadEnv(): ValidatedEnv {
    try {
        return validateEnv(process.env);
    } catch (error) {
        logger.error('Failed to validate environment variables', { error });
        throw new Error('Invalid environment configuration. Check .env file.');
    }
}

/**
 * Load account mapping from config file
 * Supports both simple format (Record<string, string>) and enhanced format (with accounts array)
 */
function loadAccountMapping(): AccountMapping {
    try {
        const configPath = join(process.cwd(), 'config', 'account-mapping.json');
        const configContent = readFileSync(configPath, 'utf-8');
        const rawMapping = JSON.parse(configContent) as unknown;

        // Check if it's the enhanced format (has 'accounts' array)
        if (rawMapping && typeof rawMapping === 'object' && 'accounts' in rawMapping) {
            logger.info('Loading enhanced account mapping format');

            // Validate enhanced format
            const { validateEnhancedAccountMapping } = require('../utils/validators');
            const enhancedMapping = validateEnhancedAccountMapping(rawMapping);

            // Convert enhanced format to simple format
            const mapping: AccountMapping = {};
            for (const account of enhancedMapping.accounts) {
                for (const packageName of account.matchers.package_names) {
                    mapping[packageName] = account.id;
                    logger.debug({
                        event: 'account.mapping.loaded',
                        packageName,
                        accountId: account.id,
                        label: account.label,
                    }, `Mapped ${packageName} to account ${account.id} (${account.label})`);
                }
            }

            logger.info({
                event: 'account.mapping.success',
                format: 'enhanced',
                accountCount: enhancedMapping.accounts.length,
                mappingCount: Object.keys(mapping).length,
            }, 'Successfully loaded enhanced account mapping');

            return mapping;
        }

        // Otherwise, validate as simple format
        logger.info('Loading simple account mapping format');
        const mapping = validateAccountMapping(rawMapping);

        logger.info({
            event: 'account.mapping.success',
            format: 'simple',
            mappingCount: Object.keys(mapping).length,
        }, 'Successfully loaded simple account mapping');

        return mapping;
    } catch (error) {
        logger.error({
            event: 'account.mapping.failed',
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        }, 'Failed to load account mapping from config file, using empty mapping');
        return {};
    }
}

/**
 * Merge account mapping from config file and environment variables
 * Environment variables take precedence over config file
 */
function mergeAccountMapping(
    fileMapping: AccountMapping,
    env: ValidatedEnv
): AccountMapping {
    const merged: AccountMapping = { ...fileMapping };

    // Environment variable overrides (using APK package names)
    if (env.ACCOUNT_MAYBANK_MAE) {
        merged['com.maybank2u.life'] = env.ACCOUNT_MAYBANK_MAE;
    }
    if (env.ACCOUNT_GRAB) {
        merged['com.grabtaxi.passenger'] = env.ACCOUNT_GRAB;
    }
    if (env.ACCOUNT_TNG_EWALLET) {
        merged['my.com.tngdigital.ewallet'] = env.ACCOUNT_TNG_EWALLET;
    }
    if (env.ACCOUNT_SHOPEEPAY) {
        merged['com.shopeepay.my'] = env.ACCOUNT_SHOPEEPAY;
    }

    return merged;
}

// Load configuration
const env = loadEnv();
const fileMapping = loadAccountMapping();
const accountMapping = mergeAccountMapping(fileMapping, env);

/**
 * Application configuration
 */
export const config = {
    // Server
    server: {
        port: env.PORT,
        env: env.NODE_ENV,
        isDevelopment: env.NODE_ENV === 'development',
        isProduction: env.NODE_ENV === 'production',
    },

    // Logging
    logging: {
        level: env.LOG_LEVEL,
    },

    // API Keys
    gemini: {
        apiKey: env.GEMINI_API_KEY,
    },

    lunchMoney: {
        apiKey: env.LUNCH_MONEY_API_KEY,
        baseUrl: 'https://dev.lunchmoney.app/v1',
    },

    locationIQ: {
        apiKey: env.LOCATIONIQ_API_KEY,
        baseUrl: 'https://us1.locationiq.com/v1',
    },

    // Telegram Bot (Expense Tracker)
    telegram: {
        expenseBotToken: process.env.TELEGRAM_EXPENSE_BOT_TOKEN || '',
        expenseChatId: process.env.TELEGRAM_EXPENSE_CHAT_ID || '',
    },

    // Security
    security: {
        webhookSecret: env.WEBHOOK_SECRET,
    },

    // Rate Limiting
    rateLimit: {
        windowMs: env.RATE_LIMIT_WINDOW_MS,
        maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    },

    // Retry Configuration
    retry: {
        limit: env.API_RETRY_LIMIT,
        backoffMs: env.API_RETRY_BACKOFF_MS,
    },

    // Account Mapping
    accountMapping,

    // Allowed banking apps (APK package names)
    allowedApps: [
        'com.maybank2u.life',
        'my.com.tngdigital.ewallet',
        'com.grabtaxi.passenger',
        'com.shopee.my',
        'com.shopeepay.my',
    ] as const,
} as const;

/**
 * Get account ID for a banking app
 * 
 * @param appName - Banking app name
 * @returns Account ID or undefined if not found
 */
export function getAccountId(appName: string): string | undefined {
    return config.accountMapping[appName];
}

/**
 * Check if an app is allowed
 * 
 * @param appName - Banking app name
 * @returns True if app is in allowed list
 */
export function isAllowedApp(appName: string): boolean {
    return config.allowedApps.includes(appName as (typeof config.allowedApps)[number]);
}

/**
 * Log configuration summary (without sensitive data)
 */
export function logConfigSummary() {
    logger.info({
        server: {
            port: config.server.port,
            env: config.server.env,
        },
        logging: {
            level: config.logging.level,
        },
        rateLimit: config.rateLimit,
        retry: config.retry,
        accountMapping: Object.keys(config.accountMapping),
        allowedApps: config.allowedApps,
    }, 'Configuration loaded');
}
