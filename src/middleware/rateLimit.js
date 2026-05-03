/**
 * Rate limiters for dashboard write endpoints.
 *
 * Layered before requireApiKey so a leaked key has a hard blast-radius cap.
 * Public GET endpoints (reports, stats, news) and the LINE /webhook (signature-
 * validated, LINE-side rate-limited) are intentionally NOT limited here.
 */

import rateLimit from 'express-rate-limit';

const standardJsonHandler = (req, res /* , next, options */) => {
    res.status(429).json({
        error: 'Too many requests',
        retryAfterSeconds: Math.ceil((req.rateLimit?.resetTime?.getTime?.() - Date.now()) / 1000) || 60
    });
};

// 30 writes / minute / IP for status, category, lock, intelligence
export const dashboardWriteLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: standardJsonHandler
});

// 10 uploads / minute / IP — image uploads are expensive (Drive/Supabase round-trip)
export const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: standardJsonHandler
});
