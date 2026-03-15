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
import { validateSignature } from '@line/bot-sdk';

// Config
import { config, MESSAGES } from './config/index.js';
import { logger, loggers } from './utils/logger.js';

// Services
import { lineClient } from './services/lineClient.js';
import { initializeSpreadsheet, getLatestBrief } from './services/googleSheets.js';
import { uploadImage } from './services/googleDrive.js';
import { indexKnowledgeBase } from './services/knowledgeBase.js';
import { getQueueHealthSnapshot, startMessageWorker } from './services/messageQueue.service.js';
import { notificationService, setTelegramBots } from './services/notification.service.js';
import { analyticsService } from './services/analytics.service.js';
import { policyEngine } from './services/policyEngine.js';
import { isSupabaseEnabled } from './services/supabase.js';
import { getReportById, listReports, updateReportRecord } from './services/reportStore.js';

// Handlers
import { handleWebhookEvent } from './handlers/line.handler.js';
import { createBot } from './handlers/telegram.handler.js';
import { hydrateConversationStates } from './handlers/conversationFlow.js';
import { debugLogger } from './handlers/debugLogger.js';
import { hydrateConversationMemory } from './services/conversationMemory.js';

// Middleware
import { errorHandler, notFoundHandler, requestLogger, asyncHandler } from './middleware/errorHandler.js';

const log = loggers.api;

// Setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DEBUG: Verify Address Persistence
console.log("\n🏢 [CONFIG CHECK] Resources Message:\n", MESSAGES.resources, "\n");

// ============================================
// PROCESS HANDLERS (STABILITY FIX)
// ============================================

// Prevent crashes on unhandled exceptions
process.on('uncaughtException', (err) => {
    console.error('❌ CRITICAL: Uncaught Exception:', err);
    // For bot uptime, log aggressively and let the platform restart if needed.
    // logging is crucial.
    if (loggers?.api) loggers.api.error('Uncaught Exception', err);
});

// Prevent crashes on unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ CRITICAL: Unhandled Rejection:', reason);
    if (loggers?.api) loggers.api.error('Unhandled Rejection', reason);
});


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

// Health Check
app.get('/health', (req, res) => {
    const queue = getQueueHealthSnapshot();

    res.status(200).json({
        status: 'ok',
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        supabase: isSupabaseEnabled(),
        reportsBackend: isSupabaseEnabled() ? 'supabase' : 'google_sheets',
        telegramBots: telegramBots.length,
        queue
    });
});


// OAuth Routes
app.get('/auth/google', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/drive.readonly',
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
    console.log('REFRESH_TOKEN:', tokens.refresh_token); // Valid for terminal copying
    res.send(`
        <h1>Authentication Successful!</h1>
        <p>Please update your .env file with this Refresh Token:</p>
        <pre style="background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto;">${tokens.refresh_token}</pre>
        <p>Full Response:</p>
        <pre>${JSON.stringify(tokens, null, 2)}</pre>
    `);
}));

// ============================================
// API ROUTES
// ============================================

// Reports Cache
let reportsCache = { data: null, lastFetch: 0 };
let marinePortsCache = { data: null, lastFetch: 0 };

const MARINE_DEPARTMENT_BERTH_CSV_URL = 'https://data.go.th/dataset/c490c97c-04c2-4b3b-871f-b010da8ff4d0/resource/36ed98c1-3a65-4b48-b7f0-d4b0a1ca3215/download/xx.csv';
const MARINE_DEPARTMENT_DATASET_URL = 'https://www.data.go.th/dataset/item_1e10ba75-33d0-49cf-9c3c-643eea6ad7c8';
const PHUKET_MARINE_PORT_COORDS = {
    CL001: { lat: 7.820833, lng: 98.344444, label: 'Ao Chalong Pier' },
    HKT03: { lat: 8.06906, lng: 98.44471, label: 'Ao Po Grand Marina' },
    PA001: { lat: 7.8962, lng: 98.2958, label: 'Ao Patong Pier' }
};
const PHUKET_MARINE_PORTS_FALLBACK = [
    { berthName: 'เดอะ โบ๊ทลากูน มารีน่า', portCode: 'PKM03', province: 'ภูเก็ต' },
    { berthName: 'ท่าเทียบเรือประมงยี่หงส์', portCode: 'PUM03', province: 'ภูเก็ต' },
    { berthName: 'ท่าเทียบเรือศุลกากรภูเก็ต', portCode: 'HKT05', province: 'ภูเก็ต' },
    { berthName: 'ท่าเรือประมงโชคภานุชิต', portCode: 'PUM04', province: 'ภูเก็ต' },
    { berthName: 'ท่าเรือประมงภูเก็ต (องค์การสะพานปลา)', portCode: 'PUM01', province: 'ภูเก็ต' },
    { berthName: 'ท่าเรือประมงศรีไทย', portCode: 'PUM02', province: 'ภูเก็ต' },
    { berthName: 'ท่าเรืออ่าวฉลอง', portCode: 'CL001', province: 'ภูเก็ต' },
    { berthName: 'ท่าเรืออ่าวป่าตอง', portCode: 'PA001', province: 'ภูเก็ต' },
    { berthName: 'ท่าเรืออ่าวมะขาม', portCode: 'HKT07', province: 'ภูเก็ต' },
    { berthName: 'บริษัท เจ้าพระยาท่าเรือสากล จํากัด', portCode: 'HKT01', province: 'ภูเก็ต' },
    { berthName: 'บริษัท ปตท.จํากัด (มหาขน)', portCode: 'HKT02', province: 'ภูเก็ต' },
    { berthName: 'ภูเก็ต ยอร์ช เฮเว่น', portCode: 'HKT04', province: 'ภูเก็ต' },
    { berthName: 'รอยัล ภูเก็ต มารีน่า', portCode: 'PKM04', province: 'ภูเก็ต' },
    { berthName: 'อ่าวปอ แกรนด์ มารีน่า', portCode: 'HKT03', province: 'ภูเก็ต' }
];

function invalidateReportsCache() {
    reportsCache = { data: null, lastFetch: 0 };
}

function parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index++) {
        const char = line[index];
        const nextChar = line[index + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                index++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
            continue;
        }

        current += char;
    }

    values.push(current.trim());
    return values;
}

async function getPhuketMarinePorts() {
    const now = Date.now();
    if (marinePortsCache.data && (now - marinePortsCache.lastFetch < 6 * 60 * 60 * 1000)) {
        return marinePortsCache.data;
    }

    let rawPorts = [];

    try {
        const response = await fetch(MARINE_DEPARTMENT_BERTH_CSV_URL, {
            headers: {
                'User-Agent': 'city-reporter-line-bot/1.0'
            }
        });
        if (!response.ok) {
            throw new Error(`Marine Department berth feed failed: ${response.status}`);
        }

        const decoder = new TextDecoder('windows-874');
        const csvText = decoder.decode(Buffer.from(await response.arrayBuffer()));
        const lines = csvText.split(/\r?\n/).filter(Boolean);
        const rows = lines.map(parseCsvLine);

        rawPorts = rows
            .slice(1)
            .map(([berthName, portCode, province]) => ({
                berthName: String(berthName || '').trim(),
                portCode: String(portCode || '').trim(),
                province: String(province || '').trim()
            }))
            .filter((port) => port.province === 'ภูเก็ต' && port.berthName);
    } catch (error) {
        log.warn('Marine Department berth feed unavailable, using Phuket fallback snapshot', error);
        rawPorts = PHUKET_MARINE_PORTS_FALLBACK;
    }

    const ports = rawPorts
        .map((port) => ({
            ...port,
            coordinates: PHUKET_MARINE_PORT_COORDS[port.portCode] || null
        }))
        .sort((left, right) => left.berthName.localeCompare(right.berthName, 'th'));

    marinePortsCache = { data: ports, lastFetch: now };
    return ports;
}

app.get('/api/reports', asyncHandler(async (req, res) => {
    const now = Date.now();
    if (reportsCache.data && (now - reportsCache.lastFetch < config.app.cacheTtl)) {
        return res.json(reportsCache.data);
    }

    const reports = await listReports();

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
    const reports = await listReports();

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

// Dynamic City News - Generated from report data patterns
app.get('/api/news', asyncHandler(async (req, res) => {
    const reports = await listReports();
    const news = [];
    const now = new Date();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);

    const recentReports = reports.filter(r => new Date(r.timestamp) > weekAgo);
    const todayReports = reports.filter(r => new Date(r.timestamp) > dayAgo);

    // Category trends
    const catCounts = {};
    recentReports.forEach(r => {
        const cat = r.problem_type || 'อื่นๆ';
        catCounts[cat] = (catCounts[cat] || 0) + 1;
    });
    const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];

    // Resolution stats
    const completedThisWeek = recentReports.filter(r => r.status === 'completed').length;
    const totalCompleted = reports.filter(r => r.status === 'completed').length;
    const resolutionRate = reports.length > 0 ? Math.round((totalCompleted / reports.length) * 100) : 0;

    if (todayReports.length > 0) {
        news.push({
            icon: '📊',
            title: `วันนี้มีการแจ้งปัญหาใหม่ ${todayReports.length} รายการ`,
            summary: `ระบบรับเรื่องแล้ว กำลังประสานงานทีมลงพื้นที่`
        });
    }

    if (topCat) {
        news.push({
            icon: '📈',
            title: `ปัญหา "${topCat[0]}" สูงสุดประจำสัปดาห์ (${topCat[1]} เรื่อง)`,
            summary: `AI แนะนำจัดสรรทรัพยากรเพิ่มเติมในหมวดนี้`
        });
    }

    if (completedThisWeek > 0) {
        news.push({
            icon: '✅',
            title: `แก้ไขสำเร็จ ${completedThisWeek} รายการ ในสัปดาห์นี้`,
            summary: `อัตราการแก้ไขรวม: ${resolutionRate}% จากทั้งหมด ${reports.length} เรื่อง`
        });
    }

    // Aging alerts
    const aging = reports.filter(r => r.status !== 'completed')
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    if (aging.length > 0) {
        const oldest = aging[0];
        const ageHours = Math.floor((now - new Date(oldest.timestamp)) / (1000 * 60 * 60));
        if (ageHours > 48) {
            news.push({
                icon: '⚠️',
                title: `เคสค้างนานที่สุด: ${ageHours} ชั่วโมง`,
                summary: `${oldest.problem_type || 'ทั่วไป'} - ${oldest.ticket_number || 'N/A'}`
            });
        }
    }

    if (news.length === 0) {
        news.push({
            icon: '🏙️',
            title: 'ระบบทำงานปกติ',
            summary: 'ไม่มีเหตุการณ์ที่ต้องแจ้งเตือนในขณะนี้'
        });
    }

    res.json({ news, generatedAt: now.toISOString() });
}));

app.get('/api/marine/phuket-ports', asyncHandler(async (req, res) => {
    const ports = await getPhuketMarinePorts();

    res.set('Cache-Control', 'public, max-age=1800');
    res.json({
        ports,
        source: {
            name: 'Thai Marine Department berth dataset via data.go.th',
            datasetUrl: MARINE_DEPARTMENT_DATASET_URL,
            csvUrl: MARINE_DEPARTMENT_BERTH_CSV_URL
        },
        fetchedAt: new Date().toISOString()
    });
}));

// GeoJSON Export (UN-Habitat GeoAI Compatible)
app.get('/api/reports/geojson', asyncHandler(async (req, res) => {
    const reports = await listReports();

    let filtered = reports;
    if (req.query.from) {
        const from = new Date(req.query.from);
        filtered = filtered.filter(r => new Date(r.timestamp) >= from);
    }
    if (req.query.to) {
        const to = new Date(req.query.to);
        filtered = filtered.filter(r => new Date(r.timestamp) <= to);
    }

    const geojson = {
        type: 'FeatureCollection',
        features: filtered
            .filter(r => r.latitude && r.longitude)
            .map(r => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [parseFloat(r.longitude), parseFloat(r.latitude)]
                },
                properties: {
                    id: r.report_id,
                    ticket: r.ticket_number,
                    type: r.problem_type,
                    urgency: r.urgency,
                    status: r.status,
                    summary: r.ai_summary,
                    timestamp: r.timestamp,
                    deviceId: r.user_id
                }
            }))
    };

    res.setHeader('Content-Type', 'application/geo+json');
    res.json(geojson);
}));

// Early Warning System (Pattern Detection)
app.get('/api/early-warnings', asyncHandler(async (req, res) => {
    try {
        const { getEarlyWarnings } = await import('./services/patternDetection.js');
        const warnings = await getEarlyWarnings();
        res.json(warnings);
    } catch (error) {
        log.error('Early warning error:', error);
        res.json({ alerts: [], analytics: { uniqueDevices: 0 }, error: error.message });
    }
}));

// Social Pulse Analytics
app.get('/api/analytics/social', asyncHandler(async (req, res) => {
    const stats = await analyticsService.getSocialPulse();
    res.set('Cache-Control', 'no-store');
    res.json(stats || {});
}));

// Intelligence Briefs
app.post('/api/intelligence/generate', asyncHandler(async (req, res) => {
    const brief = await policyEngine.generateBrief();
    res.json(brief);
}));

app.get('/api/intelligence/latest', asyncHandler(async (req, res) => {
    const brief = await getLatestBrief();
    res.json(brief || { content: '' });
}));

// Update status endpoint
app.post('/api/reports/:id/status', express.json(), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, staffName, staffComment, teamName, internalNotes, solutionImageUrl } = req.body;

    const report = await getReportById(id);

    if (!report) return res.status(404).json({ error: 'Report not found' });

    const now = new Date().toISOString();
    const updates = { status, staffName, staffComment, teamName, internalNotes, solutionImageUrl };

    if (status === 'assigned') updates.ackTimestamp = now;
    if (status === 'in_progress') updates.inProgressTimestamp = now;
    if (status === 'completed') updates.completedTimestamp = now;

    await updateReportRecord(report.report_id || report.id, updates);
    invalidateReportsCache();

    // Send notification to user
    const ticket = report.ticket_number || 'SCTH-INIT';
    if (report.user_id) {
        log.info(`🔔 Sending status update for ${ticket} to user ${report.user_id} (Status: ${status})`);
        try {
            const notified = await notificationService.sendStatusUpdate(report.user_id, status, ticket, {
                teamName,
                staffComment,
                solutionImageUrl
            });
            log.info(`🔔 Notification result for ${ticket}: ${notified ? 'SUCCESS' : 'FAILED'}`);
        } catch (notifyErr) {
            log.error(`🔔 Notification CRITICAL ERROR for ${ticket}:`, notifyErr);
        }
    } else {
        log.warn(`🔕 No user_id found for report ${report.report_id || report.id} - Notification skipped.`);
    }

    res.json({ success: true, timestamp: now });
}));

// Update category
app.post('/api/reports/:id/category', express.json(), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { category } = req.body;
    await updateReportRecord(id, {
        problemType: category,
        auditLog: `Category manually changed to ${category} at ${new Date().toISOString()}`
    });
    invalidateReportsCache();
    res.json({ success: true });
}));

// Toggle lock
app.post('/api/reports/:id/lock', express.json(), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { locked } = req.body;
    await updateReportRecord(id, {
        categoryLocked: locked,
        auditLog: `Category state ${locked ? 'LOCKED' : 'UNLOCKED'} at ${new Date().toISOString()}`
    });
    invalidateReportsCache();
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

// LINE webhook — uses raw body for signature validation
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    // Validate LINE signature
    const signature = req.headers['x-line-signature'];
    if (!signature || !validateSignature(req.body, config.line.channelSecret, signature)) {
        log.warn('Invalid LINE webhook signature — rejecting');
        return res.status(403).send('Invalid signature');
    }

    const parsed = JSON.parse(req.body.toString());
    console.log('📨 INCOMING WEBHOOK:', JSON.stringify(parsed, null, 2));
    const events = parsed.events;
    if (!events || events.length === 0) return res.status(200).send('OK');

    // Log events
    events.forEach(ev => debugLogger.logEvent(ev));

    // Respond immediately (LINE requires 200 within seconds)
    res.status(200).json({ success: true });

    // Process in background with timeout protection
    (async () => {
        for (const event of events) {
            try {
                log.info(`Processing LINE event: ${event.type}`);
                await Promise.race([
                    handleWebhookEvent(event),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Webhook handler timeout (55s)')), 55000))
                ]);
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
    startMessageWorker();

    hydrateConversationStates()
        .then(count => logger.info(`Conversation states hydrated (${count} users)`))
        .catch(error => logger.warn('Conversation state hydration warning', { error: error.message }));

    hydrateConversationMemory()
        .then(count => logger.info(`Conversation memory hydrated (${count} users)`))
        .catch(error => logger.warn('Conversation memory hydration warning', { error: error.message }));

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

    // Start Telegram bots (webhook mode — more reliable than polling on Render)
    const telegramTokens = [
        config.telegram.botToken,
        config.telegram.botToken2
    ].filter(Boolean);

    if (telegramTokens.length > 0) {
        logger.info(`Setting up ${telegramTokens.length} Telegram bot(s) in webhook mode...`);

        telegramTokens.forEach((token, index) => {
            try {
                const bot = createBot(token);
                if (bot) {
                    const webhookPath = `/telegram-webhook-${index}`;
                    const webhookUrl = config.externalBaseUrl
                        ? `${config.externalBaseUrl}${webhookPath}`
                        : null;

                    if (webhookUrl) {
                        bot.telegram.setWebhook(webhookUrl)
                            .then(() => logger.info(`✅ Telegram Bot #${index + 1} webhook set at ${webhookPath}`))
                            .catch(e => logger.error(`Telegram Bot #${index + 1} webhook setup failed`, e));
                    } else {
                        logger.warn(`Telegram Bot #${index + 1} webhook URL unavailable; set RENDER_EXTERNAL_URL manually outside Render or deploy on Render with a public URL`);
                    }

                    // Mount webhook handler on Express
                    app.use(bot.webhookCallback(webhookPath));
                    telegramBots.push(bot);
                }
            } catch (e) {
                logger.error(`Telegram Bot #${index + 1} setup error`, e);
            }
        });

        // Share bots with notification service
        setTelegramBots(telegramBots);
    }
});
