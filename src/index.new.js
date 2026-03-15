/**
 * Smart City Thailand CDP - Main Entry Point (Refactored V2.0)
 * Clean architecture with service layer
 */

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { google } from 'googleapis';

// Config
import { config } from './config/index.js';
import { logger, loggers } from './utils/logger.js';

// Services
import { lineClient } from './services/lineClient.js';
import { initializeSpreadsheet, getAllReports, updateReport } from './services/googleSheets.js';
import { uploadImage } from './services/googleDrive.js';
import { indexKnowledgeBase } from './services/knowledgeBase.js';
import { notificationService, setTelegramBots } from './services/notification.service.js';

// Handlers
import { handleWebhookEvent } from './handlers/line.handler.js';
import { createBot } from './handlers/telegram.handler.js';
import { debugLogger } from './handlers/debugLogger.js';

// Middleware
import { errorHandler, notFoundHandler, requestLogger, asyncHandler } from './middleware/errorHandler.js';

const log = loggers.api;

// Setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const telegramBots = [];

// OAuth2 Client
const oauth2Client = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.callbackUrl
);

// Middleware
app.use(requestLogger);
app.use(express.static(path.join(__dirname, '../public')));

// File upload
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ============================================
// ROUTES
// ============================================

// Dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// OAuth Routes
app.get('/auth/google', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive.file',
        ],
        prompt: 'consent'
    });
    log.info('OAuth URL generated');
    res.redirect(url);
});

app.get('/oauth2callback', asyncHandler(async (req, res) => {
    const { code } = req.query;
    const { tokens } = await oauth2Client.getToken(code);
    log.info('OAuth tokens received');
    res.send('<h1>Authentication Successful!</h1><p>You can close this window now.</p>');
}));

// ============================================
// API ROUTES
// ============================================

// Reports Cache
let reportsCache = { data: null, lastFetch: 0 };

app.get('/api/reports', asyncHandler(async (req, res) => {
    const now = Date.now();
    if (reportsCache.data && (now - reportsCache.lastFetch < config.app.cacheTtl)) {
        return res.json(reportsCache.data);
    }

    const reports = await getAllReports();
    reportsCache = { data: reports, lastFetch: now };
    res.json(reports);
}));

// Upload endpoint
app.post('/api/upload', upload.single('image'), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filename = `proof-${Date.now()}-${req.file.originalname.replace(/\s/g, '_')}`;
    const fileUrl = await uploadImage(req.file.buffer, filename);
    res.json({ url: fileUrl });
}));

// Stats endpoint
app.get('/api/stats', asyncHandler(async (req, res) => {
    const reports = await getAllReports();

    // Calculate avg handle time
    let totalHandleTimeMs = 0;
    let completedCount = 0;

    reports.forEach(r => {
        if (r.status === 'completed' && r.timestamp && r.completed_timestamp) {
            const start = new Date(r.timestamp).getTime();
            const end = new Date(r.completed_timestamp).getTime();
            if (!isNaN(start) && !isNaN(end) && end > start) {
                totalHandleTimeMs += (end - start);
                completedCount++;
            }
        }
    });

    const avgHandleTimeMinutes = completedCount > 0
        ? Math.round((totalHandleTimeMs / completedCount) / 60000)
        : 0;

    // Category breakdown
    const categories = {};
    reports.forEach(r => {
        const type = r.problem_type || 'อื่นๆ';
        categories[type] = (categories[type] || 0) + 1;
    });

    // Static news (can be replaced with AI-curated news later)
    const news = [
        { id: 1, title: "Bangkok AI Flood Network Live", summary: "500 sensors now active across Chatuchak district.", source: "City PR", time: "2h ago", icon: "droplets" },
        { id: 2, title: "Traffic Optimization Success", summary: "AI signal controls reduce congestion by 18% in CBD.", source: "Traffic Dept", time: "5h ago", icon: "activity" },
        { id: 3, title: "Smart Pole Deployment", summary: "New safety lighting installed in 50 risk zones.", source: "Infra Unit", time: "1d ago", icon: "zap" },
        { id: 4, title: "Waste Mgmt Efficiency Up", summary: "Optimized routes save 20% fuel this month.", source: "Env Bureau", time: "2d ago", icon: "trash-2" }
    ];

    res.json({
        totalReports: reports.length,
        pendingCount: reports.filter(r => r.status === 'received').length,
        completedCount: reports.filter(r => r.status === 'completed').length,
        avgHandleTimeMinutes,
        categories,
        news
    });
}));

// Update status endpoint
app.post('/api/reports/:id/status', express.json(), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, staffName, staffComment, teamName, internalNotes, solutionImageUrl } = req.body;

    const reports = await getAllReports();
    const report = reports.find(r => (r.report_id === id || r.id === id));

    if (!report) return res.status(404).json({ error: 'Report not found' });

    const now = new Date().toISOString();
    const updates = { status, staffName, staffComment, teamName, internalNotes, solutionImageUrl };

    if (status === 'assigned') updates.ackTimestamp = now;
    if (status === 'in_progress') updates.inProgressTimestamp = now;
    if (status === 'completed') updates.completedTimestamp = now;

    await updateReport(report.report_id || report.id, updates);

    // Send notification to user
    const ticket = report.ticket_number || 'SCTH-INIT';
    if (report.user_id) {
        await notificationService.sendStatusUpdate(report.user_id, status, ticket, {
            teamName,
            staffComment,
            solutionImageUrl
        });
    }

    res.json({ success: true, timestamp: now });
}));

// Update category
app.post('/api/reports/:id/category', express.json(), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { category } = req.body;
    await updateReport(id, {
        problemType: category,
        auditLog: `Category manually changed to ${category} at ${new Date().toISOString()}`
    });
    res.json({ success: true });
}));

// Toggle lock
app.post('/api/reports/:id/lock', express.json(), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { locked } = req.body;
    await updateReport(id, {
        categoryLocked: locked,
        auditLog: `Category state ${locked ? 'LOCKED' : 'UNLOCKED'} at ${new Date().toISOString()}`
    });
    res.json({ success: true });
}));

// Debug center
app.get('/api/debug-center', asyncHandler(async (req, res) => {
    const profile = await lineClient.getBotInfo();
    res.json({
        bot: profile,
        env: { HAS_TOKEN: !!config.line.channelAccessToken },
        logs: debugLogger.getReport()
    });
}));

// Test LINE message
app.get('/api/test-line', asyncHandler(async (req, res) => {
    const testUserId = req.query.uid;
    if (!testUserId) return res.status(400).send('Missing uid query param');

    await lineClient.pushMessage({
        to: testUserId,
        messages: [{ type: 'text', text: `🧪 ระบบทดสอบ: เชื่อมต่อสำเร็จ! (V8.0-Refactored)\n\nหากคุณได้รับข้อความนี้ แสดงว่า TOKEN ของเราถูกต้องครับ!` }]
    });
    res.send('Success! Check your LINE.');
}));

// ============================================
// WEBHOOKS
// ============================================

// LINE webhook
app.post('/webhook', express.json(), (req, res) => {
    const events = req.body.events;
    if (!events || events.length === 0) return res.status(200).send('OK');

    // Log events
    events.forEach(ev => debugLogger.logEvent(ev));

    // Respond immediately
    res.status(200).json({ success: true });

    // Process in background
    (async () => {
        for (const event of events) {
            try {
                log.info(`Processing LINE event: ${event.type}`);
                await handleWebhookEvent(event);
            } catch (error) {
                log.error('Webhook event processing error', error);
                debugLogger.logError('WebhookBackground', error);
            }
        }
    })();
});

// ============================================
// ERROR HANDLING
// ============================================

app.use(notFoundHandler);
app.use(errorHandler);

// ============================================
// SERVER STARTUP
// ============================================

const PORT = config.port;

app.listen(PORT, '0.0.0.0', async () => {
    logger.info(`🚀 Smart City Thailand CDP V2.0 (Refactored) running on port ${PORT}`);

    // Initialize services with delay
    setTimeout(async () => {
        try {
            logger.info('Initializing services...');
            await initializeSpreadsheet();
            await indexKnowledgeBase();
            logger.info('✅ Services initialized');
        } catch (err) {
            logger.warn('Service initialization warning', { error: err.message });
        }
    }, 5000);

    // Start Telegram bots
    const telegramTokens = [
        config.telegram.botToken,
        config.telegram.botToken2
    ].filter(Boolean);

    if (telegramTokens.length > 0) {
        logger.info(`Launching ${telegramTokens.length} Telegram bot(s)...`);

        telegramTokens.forEach((token, index) => {
            try {
                const bot = createBot(token);
                if (bot) {
                    bot.launch()
                        .then(() => logger.info(`✅ Telegram Bot #${index + 1} started`))
                        .catch(e => logger.error(`Telegram Bot #${index + 1} failed`, e));
                    telegramBots.push(bot);
                }
            } catch (e) {
                logger.error(`Telegram Bot #${index + 1} setup error`, e);
            }
        });

        // Share bots with notification service
        setTelegramBots(telegramBots);

        // Graceful shutdown
        process.once('SIGINT', () => telegramBots.forEach(b => b.stop('SIGINT')));
        process.once('SIGTERM', () => telegramBots.forEach(b => b.stop('SIGTERM')));
    }
});

// Redeploy trigger: refactored-v2.0
