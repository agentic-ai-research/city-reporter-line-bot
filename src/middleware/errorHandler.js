/**
 * Error Handler Middleware
 * Centralized error handling for Express
 */

import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

/**
 * Custom API Error class
 */
export class ApiError extends Error {
    constructor(message, statusCode = 500, details = null) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        this.isOperational = true;
    }
}

/**
 * Not Found handler
 */
export function notFoundHandler(req, res, next) {
    const error = new ApiError(`Not Found: ${req.originalUrl}`, 404);
    next(error);
}

/**
 * Global error handler middleware
 */
export function errorHandler(err, req, res, next) {
    // Log the error
    logger.error(`${req.method} ${req.path}`, err, {
        statusCode: err.statusCode || 500,
        path: req.path,
        method: req.method
    });

    // Determine status code
    const statusCode = err.statusCode || 500;

    // Build error response
    const response = {
        success: false,
        error: err.message || 'Internal Server Error'
    };

    // Add details in development
    if (!config.isProduction && err.details) {
        response.details = err.details;
    }

    // Add stack trace in development
    if (!config.isProduction && err.stack) {
        response.stack = err.stack;
    }

    res.status(statusCode).json(response);
}

/**
 * Async handler wrapper
 * Wraps async route handlers to catch errors automatically
 */
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Request logging middleware
 */
export function requestLogger(req, res, next) {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.request(req.method, req.path, res.statusCode, duration);
    });

    next();
}

export default {
    ApiError,
    notFoundHandler,
    errorHandler,
    asyncHandler,
    requestLogger
};
