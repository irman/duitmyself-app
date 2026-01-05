import { Hono } from 'hono';
import type { CCStatementService } from '../cc-statement.service';
import { logger } from '@/shared/utils/logger';
import { tracer } from '@/shared/utils/tracing';
import { addSpanAttributes, setSpanStatus } from '@/shared/utils/tracing-utils';
import { trace, context } from '@opentelemetry/api';

/**
 * Create CC Statement job routes
 * 
 * @param service - CC Statement service instance
 * @returns Hono app with job routes
 */
export function createCCStatementRoutes(service: CCStatementService) {
    const app = new Hono();

    /**
     * POST /jobs/cc-statements
     * 
     * Execute the CC statement creation job
     * Called by Dokploy cron scheduler (daily at 1 AM)
     */
    app.post('/jobs/cc-statements', async (c) => {
        const span = tracer.startSpan('api.jobs.cc_statements');

        return await context.with(trace.setSpan(context.active(), span), async () => {
            try {
                addSpanAttributes(span, {
                    'http.method': 'POST',
                    'http.route': '/jobs/cc-statements',
                    'job.type': 'cc_statement_creation',
                });

                logger.info({
                    event: 'api.jobs.cc_statements.start',
                }, 'CC statement job triggered via API');

                // Execute the job
                const result = await service.executeJob();

                // Log result
                logger.info({
                    event: 'api.jobs.cc_statements.complete',
                    result,
                }, `CC statement job complete: ${result.statementsCreated} created, ${result.duplicatesSkipped} skipped`);

                addSpanAttributes(span, {
                    'job.statements_created': result.statementsCreated,
                    'job.duplicates_skipped': result.duplicatesSkipped,
                    'job.errors': result.errors.length,
                    'job.success': result.success,
                });

                setSpanStatus(span, result.success);
                span.end();

                // Return result
                return c.json({
                    success: result.success,
                    message: result.success
                        ? `Successfully created ${result.statementsCreated} statement(s)`
                        : `Job completed with ${result.errors.length} error(s)`,
                    data: {
                        statementsCreated: result.statementsCreated,
                        duplicatesSkipped: result.duplicatesSkipped,
                        errors: result.errors,
                    },
                }, result.success ? 200 : 500);
            } catch (error) {
                setSpanStatus(span, false, error instanceof Error ? error.message : 'Unknown error');
                if (error instanceof Error) {
                    span.recordException(error);
                }
                span.end();

                logger.error({
                    event: 'api.jobs.cc_statements.error',
                    error: error instanceof Error ? error.message : 'Unknown error',
                }, 'CC statement job failed');

                return c.json(
                    {
                        success: false,
                        error: 'CC statement job failed',
                        message: error instanceof Error ? error.message : 'Unknown error',
                    },
                    500
                );
            }
        });
    });

    return app;
}
