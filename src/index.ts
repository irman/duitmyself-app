// IMPORTANT: Import tracing FIRST to enable auto-instrumentation
import './shared/utils/tracing';

import { createApp } from './api/app';
import { createRoutes } from './api/routes';
import { TransactionProcessor } from './services/expense-tracker/transaction-processor.service';
import { GeminiAdapter } from './services/expense-tracker/adapters/ai/gemini.adapter';
import { LunchMoneyAdapter } from './services/expense-tracker/adapters/budget/lunch-money.adapter';
import { LocationIQAdapter } from './services/expense-tracker/adapters/geocoding/locationiq.adapter';
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
        const routes = createRoutes(transactionProcessor);

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
