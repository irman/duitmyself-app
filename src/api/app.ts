import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from '@/shared/utils/logger';
import { wideEventMiddleware } from '@/shared/middleware/wide-event.middleware';

/**
 * Create and configure the main Hono application
 * 
 * @returns Configured Hono app
 */
export function createApp() {
    const app = new Hono();

    // CORS middleware
    app.use('/*', cors({
        origin: '*', // Allow all origins for webhook
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
    }));

    // Wide Event middleware - emits single canonical log line per request
    app.use('/*', wideEventMiddleware());

    // Error handling middleware
    app.onError((err, c) => {
        logger.error({
            event: 'http.error',
            error: {
                message: err.message,
                name: err.name,
                stack: err.stack,
            },
            path: c.req.path,
            method: c.req.method,
        }, 'HTTP error occurred');

        return c.json(
            {
                success: false,
                error: 'Internal server error',
            },
            500
        );
    });

    // 404 handler
    app.notFound((c) => {
        return c.json(
            {
                success: false,
                error: 'Not found',
            },
            404
        );
    });

    return app;
}
