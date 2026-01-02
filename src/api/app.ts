import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { logger } from '@/shared/utils/logger';

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

    // Request logging middleware
    app.use('/*', honoLogger((message) => {
        logger.info({ event: 'http.request' }, message);
    }));

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
