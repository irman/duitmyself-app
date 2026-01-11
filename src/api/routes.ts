import { Hono } from 'hono';
import type { TransactionProcessor } from '@/services/expense-tracker/transaction-processor.service';
import type { CCStatementService } from '@/services/cc-statements/cc-statement.service';
import type { TelegramConversationService } from '@/services/expense-tracker/services/telegram-conversation.service';
import { createWebhookRoutes } from '@/services/expense-tracker/routes/webhook.route';
import { createCCStatementRoutes } from '@/services/cc-statements/routes/cc-statement.route';
import { createTelegramRoutes } from '@/services/expense-tracker/routes/telegram.route';
import type { HealthCheckResponse } from '@/shared/types/common.types';

/**
 * Create and configure all API routes
 * 
 * @param processor - Transaction processor instance
 * @param ccStatementService - CC Statement service instance (optional)
 * @param telegramConversationService - Telegram conversation service instance (optional)
 * @returns Hono app with all routes configured
 */
export function createRoutes(
    processor: TransactionProcessor,
    ccStatementService?: CCStatementService,
    telegramConversationService?: TelegramConversationService
) {
    const app = new Hono();

    // Health check endpoint
    app.get('/health', async (c) => {
        // Validate all adapters
        const adapterStatus = await processor.validateAdapters();

        // Determine overall health
        const allHealthy = Object.values(adapterStatus).every((status) => status === true);
        const status = allHealthy ? 'healthy' : 'degraded';

        const response: HealthCheckResponse = {
            status,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            adapters: {
                ai: adapterStatus.ai ? 'connected' : 'error',
                budget: adapterStatus.budget ? 'connected' : 'error',
                geocoding: adapterStatus.geocoding ? 'connected' : 'error',
            },
        };

        return c.json(response, status === 'healthy' ? 200 : 503);
    });

    // Metrics endpoint (basic stats)
    app.get('/metrics', (c) => {
        // For MVP, return basic metrics
        // In the future, track these in-memory or in a database
        return c.json({
            totalTransactions: 0, // TODO: Track this
            successRate: 1.0, // TODO: Calculate from actual data
            averageProcessingTime: 0, // TODO: Track this
            uptime: process.uptime(),
        });
    });

    // Mount webhook routes
    const webhookRoutes = createWebhookRoutes(processor);
    app.route('/', webhookRoutes);

    // Mount CC statement routes (if service is available)
    if (ccStatementService) {
        const ccStatementRoutes = createCCStatementRoutes(ccStatementService);
        app.route('/', ccStatementRoutes);
    }

    // Mount Telegram routes (if service is available)
    if (telegramConversationService) {
        const telegramRoutes = createTelegramRoutes(telegramConversationService);
        app.route('/', telegramRoutes);
    }

    return app;
}
