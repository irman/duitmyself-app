// IMPORTANT: Import tracing FIRST to enable auto-instrumentation
import './shared/utils/tracing';
// Initialize OTLP log export
import './shared/utils/otel-logger';

import { createApp } from './api/app';
import { createRoutes } from './api/routes';
import { TransactionProcessor } from './services/expense-tracker/transaction-processor.service';
import { GeminiAdapter } from './services/expense-tracker/adapters/ai/gemini.adapter';
import { LunchMoneyAdapter } from './services/expense-tracker/adapters/budget/lunch-money.adapter';
import { LocationIQAdapter } from './services/expense-tracker/adapters/geocoding/locationiq.adapter';
import { CCStatementService } from './services/cc-statements/cc-statement.service';
import { NotionAdapterImpl } from './services/cc-statements/adapters/notion/notion.adapter';
import { TelegramAdapterImpl } from './services/cc-statements/adapters/telegram/telegram.adapter';
import { config, logConfigSummary } from './shared/config/config';
import { logger } from './shared/utils/logger';

/**
 * Application entry point
 */
async function main() {
    try {
        logger.info('Starting duitmyself expense automation service...');

        // Log configuration summary
        logConfigSummary();

        // Initialize adapters
        logger.info('Initializing adapters...');

        const geminiAdapter = new GeminiAdapter(config.gemini.apiKey);
        const lunchMoneyAdapter = new LunchMoneyAdapter(
            config.lunchMoney.apiKey,
            config.lunchMoney.baseUrl,
            config.retry
        );
        const locationIQAdapter = new LocationIQAdapter(
            config.locationIQ.apiKey,
            config.locationIQ.baseUrl,
            config.retry
        );

        // Create transaction processor
        const transactionProcessor = new TransactionProcessor(
            geminiAdapter,
            lunchMoneyAdapter,
            locationIQAdapter
        );

        // Initialize CC Statement Service (if credentials are provided)
        let ccStatementService: CCStatementService | undefined;
        if (process.env.NOTION_API_KEY && process.env.TELEGRAM_BOT_TOKEN) {
            logger.info('Initializing CC Statement Service...');

            const notionAdapter = new NotionAdapterImpl(
                process.env.NOTION_API_KEY,
                process.env.NOTION_CC_DATABASE_ID || '2354fc10333980c1bcd1e9f796486d6c',
                process.env.NOTION_STATEMENTS_DATABASE_ID || '2354fc1033398059b218d5c397f63698'
            );

            const telegramAdapter = new TelegramAdapterImpl(
                process.env.TELEGRAM_BOT_TOKEN,
                process.env.TELEGRAM_CHAT_ID || '1053248458'
            );

            ccStatementService = new CCStatementService(notionAdapter, telegramAdapter);

            // Validate CC statement adapters
            const ccAdapterStatus = await ccStatementService.validateAdapters();
            logger.info({
                event: 'cc_statement.adapters.validated',
                status: ccAdapterStatus,
            }, 'CC Statement adapter validation complete');

            if (!ccAdapterStatus.notion) {
                logger.warn('Notion adapter validation failed - check NOTION_API_KEY');
            }
            if (!ccAdapterStatus.telegram) {
                logger.warn('Telegram adapter validation failed - check TELEGRAM_BOT_TOKEN');
            }
        } else {
            logger.info('CC Statement Service disabled - missing NOTION_API_KEY or TELEGRAM_BOT_TOKEN');
        }

        // Validate adapters on startup
        logger.info('Validating adapter connections...');
        const adapterStatus = await transactionProcessor.validateAdapters();

        logger.info({
            event: 'adapters.validated',
            status: adapterStatus,
        }, 'Adapter validation complete');

        // Warn if any adapters failed validation
        if (!adapterStatus.ai) {
            logger.warn('AI adapter validation failed - check GEMINI_API_KEY');
        }
        if (!adapterStatus.budget) {
            logger.warn('Budget adapter validation failed - check LUNCH_MONEY_API_KEY');
        }
        if (!adapterStatus.geocoding) {
            logger.warn('Geocoding adapter validation failed - check LOCATIONIQ_API_KEY');
        }

        // Create and configure app
        const app = createApp();
        const routes = createRoutes(transactionProcessor, ccStatementService);

        // Mount routes
        app.route('/', routes);

        // Start server
        const server = Bun.serve({
            port: config.server.port,
            fetch: app.fetch,
            development: config.server.isDevelopment,
        });

        logger.info({
            event: 'server.started',
            port: config.server.port,
            env: config.server.env,
            url: `http://localhost:${config.server.port}`,
        }, `Server started on port ${config.server.port}`);

        // Graceful shutdown
        process.on('SIGINT', () => {
            logger.info('Received SIGINT, shutting down gracefully...');
            server.stop();
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            logger.info('Received SIGTERM, shutting down gracefully...');
            server.stop();
            process.exit(0);
        });
    } catch (error) {
        logger.error({
            event: 'startup.error',
            error,
        }, 'Failed to start server');
        process.exit(1);
    }
}

// Start the application
main();
