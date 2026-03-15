/**
 * Structured Logger Utility
 * Consistent logging with levels, context, and formatting
 */

import { config } from '../config/index.js';

const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};

const LEVEL_ICONS = {
    debug: '🔍',
    info: '📋',
    warn: '⚠️',
    error: '❌'
};

const LEVEL_COLORS = {
    debug: '\x1b[36m',  // Cyan
    info: '\x1b[32m',   // Green
    warn: '\x1b[33m',   // Yellow
    error: '\x1b[31m'   // Red
};

const RESET = '\x1b[0m';

// Current log level from environment
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LOG_LEVELS.info;

/**
 * Format timestamp for logs
 */
function formatTimestamp() {
    return new Date().toISOString();
}

/**
 * Format context object for logging
 */
function formatContext(context) {
    if (!context || Object.keys(context).length === 0) return '';
    return ' ' + JSON.stringify(context);
}

/**
 * Create a logger instance with optional prefix
 */
export function createLogger(prefix = '') {
    const formatPrefix = prefix ? `[${prefix}]` : '';

    return {
        debug(message, context = {}) {
            if (LOG_LEVELS.debug < currentLevel) return;
            const icon = LEVEL_ICONS.debug;
            const color = LEVEL_COLORS.debug;
            console.log(`${color}${icon} ${formatTimestamp()} DEBUG${formatPrefix} ${message}${formatContext(context)}${RESET}`);
        },

        info(message, context = {}) {
            if (LOG_LEVELS.info < currentLevel) return;
            const icon = LEVEL_ICONS.info;
            const color = LEVEL_COLORS.info;
            console.log(`${color}${icon} ${formatTimestamp()} INFO${formatPrefix} ${message}${formatContext(context)}${RESET}`);
        },

        warn(message, context = {}) {
            if (LOG_LEVELS.warn < currentLevel) return;
            const icon = LEVEL_ICONS.warn;
            const color = LEVEL_COLORS.warn;
            console.warn(`${color}${icon} ${formatTimestamp()} WARN${formatPrefix} ${message}${formatContext(context)}${RESET}`);
        },

        error(message, error = null, context = {}) {
            if (LOG_LEVELS.error < currentLevel) return;
            const icon = LEVEL_ICONS.error;
            const color = LEVEL_COLORS.error;

            let errorInfo = '';
            if (error instanceof Error) {
                errorInfo = ` | ${error.message}`;
                if (!config.isProduction && error.stack) {
                    errorInfo += `\n${error.stack}`;
                }
            } else if (error) {
                errorInfo = ` | ${JSON.stringify(error)}`;
            }

            console.error(`${color}${icon} ${formatTimestamp()} ERROR${formatPrefix} ${message}${errorInfo}${formatContext(context)}${RESET}`);
        },

        /**
         * Log API request
         */
        request(method, path, statusCode, durationMs, context = {}) {
            const level = statusCode >= 400 ? 'warn' : 'info';
            this[level](`${method} ${path} ${statusCode} ${durationMs}ms`, context);
        },

        /**
         * Log AI operation
         */
        ai(operation, durationMs, success, context = {}) {
            if (success) {
                this.info(`AI:${operation} completed in ${durationMs}ms`, context);
            } else {
                this.warn(`AI:${operation} failed after ${durationMs}ms`, context);
            }
        },

        /**
         * Log messaging platform event
         */
        platform(platform, event, userId, context = {}) {
            const maskedUserId = userId ? `${userId.substring(0, 8)}...` : 'unknown';
            this.info(`${platform.toUpperCase()}:${event} from ${maskedUserId}`, context);
        }
    };
}

// Default logger instance
export const logger = createLogger();

// Named loggers for different modules
export const loggers = {
    api: createLogger('API'),
    ai: createLogger('AI'),
    line: createLogger('LINE'),
    telegram: createLogger('TG'),
    db: createLogger('DB'),
    report: createLogger('Report')
};

export default logger;
