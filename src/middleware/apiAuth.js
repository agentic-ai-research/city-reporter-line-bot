/**
 * API Authentication Middleware
 * Protects dashboard write endpoints with a simple API key.
 *
 * Set DASHBOARD_API_KEY in your environment (Render env vars).
 * The dashboard sends it via the header:  X-API-Key: <key>
 */

export function requireApiKey(req, res, next) {
    const key = process.env.DASHBOARD_API_KEY;

    // If no key is configured, block all writes in production
    if (!key) {
        if (process.env.NODE_ENV === 'production') {
            return res.status(503).json({ error: 'API key not configured' });
        }
        // Allow in development without a key
        return next();
    }

    const provided = req.headers['x-api-key'];
    if (!provided || provided !== key) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
}
