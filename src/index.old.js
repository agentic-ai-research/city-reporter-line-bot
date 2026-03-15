import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { middleware } from '@line/bot-sdk';
import { handleWebhookEvent } from './handlers/lineWebhook.js';
import { lineClient } from './services/lineClient.js';
import { createBot } from './handlers/telegramBot.js';
import { initializeSpreadsheet, updateReport } from './services/googleSheets.js';
import { google } from 'googleapis';
import { debugLogger } from './handlers/debugLogger.js';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_CALLBACK_URL || (process.env.NODE_ENV === 'production'
    ? 'https://city-reporter-bot-production.up.railway.app/oauth2callback'
    : 'http://localhost:3000/oauth2callback')
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const telegramBots = []; // Global Array for Multi-Bot Support

// Serve static files (privacy policy, terms of use)
app.use(express.static(path.join(__dirname, '../public')));

// LINE SDK configuration
const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

// OAuth Routes
app.get('/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/contacts.readonly'
    ],
    prompt: 'consent'
  });
  console.log('Generating Auth URL...');
  console.log('Client ID:', process.env.GOOGLE_CLIENT_ID?.substring(0, 10) + '...');
  console.log('Redirect URI:', oauth2Client.redirectUri);
  console.log('Generated URL:', url);
  res.redirect(url);
});

app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    // Save tokens to .env (for now we print them and save manually for security)
    console.log('\n✅ GOOGLE REFRESH TOKEN RECEIVED:');
    console.log(tokens.refresh_token);

    // In a real app, we'd save this to a database or secure storage
    // For this demo, let's keep it in memory for the session or save to .env
    res.send('<h1>Authentication Successful!</h1><p>You can close this window now. The bot is now connected to your Google Drive.</p>');
  } catch (error) {
    console.error('Error getting tokens:', error);
    res.status(500).send(`<h1>Authentication Failed</h1><p>Error details: ${error.message}</p><pre>${JSON.stringify(error.response?.data || {}, null, 2)}</pre>`);
  }
});

// Health check endpoint
// Health check / Dashboard endpoint
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// API to get all reports for the dashboard with simple caching to prevent 429
let reportsCache = { data: null, lastFetch: 0 };
const CACHE_TTL = 2000; // 2 seconds (Demo Mode)

app.get('/api/reports', async (req, res) => {
  try {
    const now = Date.now();
    if (reportsCache.data && (now - reportsCache.lastFetch < CACHE_TTL)) {
      return res.json(reportsCache.data);
    }

    const { getAllReports } = await import('./services/googleSheets.js');
    const reports = await getAllReports();

    reportsCache = { data: reports, lastFetch: now };
    res.json(reports);
  } catch (error) {
    console.error('Error fetching reports:', error);
    // Return cached data if available even if it's stale
    if (reportsCache.data) {
      return res.json(reportsCache.data);
    }
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

import multer from 'multer';
import fs from 'fs';

// File Upload Configuration
const storage = multer.memoryStorage();
const upload = multer({ storage });

// API: Upload Evidence
app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const { uploadImage } = await import('./services/googleDrive.js');
    const filename = `proof-${Date.now()}-${req.file.originalname.replace(/\s/g, '_')}`;
    const fileUrl = await uploadImage(req.file.buffer, filename);
    res.json({ url: fileUrl });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// API: Dashboard Stats & News (Dashboard V2.0)
app.get('/api/stats', async (req, res) => {
  try {
    const { getAllReports } = await import('./services/googleSheets.js');
    const reports = await getAllReports();

    // 1. Calculate Avg Handle Time
    let totalHandleTimeMs = 0;
    let completedCount = 0;

    reports.forEach(r => {
      if (r.status === 'completed' && r.timestamp && r.completed_timestamp) { // Use snake_case from getAllReports conversion if needed? No, getAllReports converts to snake or keeps raw? 
        // getAllReports converts to snake_case keys: 'Completed Timestamp' -> 'completed_timestamp'
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

    // 2. Category Breakdown
    const categories = {};
    reports.forEach(r => {
      const type = r.problem_type || 'อื่นๆ';
      categories[type] = (categories[type] || 0) + 1;
    });

    // 3. Curated Smart City News (Static for Stability)
    const news = [
      {
        id: 1,
        title: "Bangkok AI Flood Network Live",
        summary: "500 sensors now active across Chatuchak district.",
        source: "City PR",
        time: "2h ago",
        icon: "droplets"
      },
      {
        id: 2,
        title: "Traffic Optimization Success",
        summary: "AI signal controls reduce congestion by 18% in CBD.",
        source: "Traffic Dept",
        time: "5h ago",
        icon: "activity"
      },
      {
        id: 3,
        title: "Smart Pole Deployment",
        summary: "New safety lighting installed in 50 risk zones.",
        source: "Infra Unit",
        time: "1d ago",
        icon: "zap"
      },
      {
        id: 4,
        title: "Waste Mgmt Efficiency Up",
        summary: "Optimized routes save 20% fuel this month.",
        source: "Env Bureau",
        time: "2d ago",
        icon: "trash-2"
      }
    ];

    res.json({
      totalReports: reports.length,
      pendingCount: reports.filter(r => r.status === 'received').length,
      completedCount: reports.filter(r => r.status === 'completed').length,
      avgHandleTimeMinutes,
      categories,
      news
    });

  } catch (error) {
    console.error('Stats API Error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// API: Update Status & Workflow
app.post('/api/reports/:id/status', express.json(), async (req, res) => {
  const { id } = req.params;
  const { status, staffName, staffComment, teamName, internalNotes, solutionImageUrl } = req.body;

  try {
    const { getAllReports, updateReport } = await import('./services/googleSheets.js');
    const reports = await getAllReports();
    const report = reports.find(r => (r.report_id === id || r.id === id));

    if (!report) return res.status(404).json({ error: 'Report not found' });

    const now = new Date().toISOString();
    const updates = { status, staffName, staffComment, teamName, internalNotes, solutionImageUrl };

    if (status === 'assigned') updates.ackTimestamp = now;
    if (status === 'in_progress') updates.inProgressTimestamp = now;
    if (status === 'completed') updates.completedTimestamp = now;

    await updateReport(report.report_id || report.id, updates);

    // Thai Notifications
    const messages = [];
    const ticket = report.ticket_number || 'SCTH-INIT';

    if (status === 'assigned') {
      messages.push({
        type: 'text',
        text: `📌 รับคำร้องแล้ว #${ticket}\n\nเจ้าหน้าที่ได้รับเรื่องแล้ว และมอบหมายทีม ${teamName || 'ส่วนกลาง'} เข้าดำเนินการ\n\n💬 โน้ต: ${staffComment || 'รอการตรวจสอบ'}\n🕑 เวลา: ${new Date(now).toLocaleString('th-TH')}`
      });
    } else if (status === 'in_progress') {
      messages.push({
        type: 'text',
        text: `⚙️ กำลังดำเนินการ #${ticket}\n\nทีม ${teamName || ''} กำลังอยู่ระหว่างการแก้ไขปัญหาครับ\n\n💬 ความคืบหน้า: ${staffComment}\n🕑 เวลา: ${new Date(now).toLocaleString('th-TH')}`
      });
    } else if (status === 'completed') {
      messages.push({
        type: 'text',
        text: `✅ ดำเนินการเสร็จสิ้น #${ticket}\n\nปัญหาได้รับการแก้ไขเรียบร้อยแล้วโดยทีม ${teamName || 'ส่วนกลาง'}! 🙏\n\n💬 รายละเอียด: ${staffComment || 'ทำงานเรียบร้อย'}\n🕑 เวลา: ${new Date(now).toLocaleString('th-TH')}\n\nพึงพอใจการทำงาน? พิมพ์เลข 1-5 เพื่อให้คะแนนได้เลยครับ ⭐`
      });

      // Add Evidence Photo if available
      if (solutionImageUrl && solutionImageUrl.startsWith('http')) {
        messages.push({
          type: 'image',
          originalContentUrl: solutionImageUrl,
          previewImageUrl: solutionImageUrl
        });
      }
    }

    if (messages.length > 0 && report.user_id) {
      if (report.user_id.startsWith('tg_')) {
        // Telegram Notification (Try all bots, one will work)
        const tgId = report.user_id.replace('tg_', '');
        for (const msg of messages) {
          let sent = false;
          // Try sending via each bot (brute force delivery)
          for (const bot of telegramBots) {
            if (sent) break;
            try {
              if (msg.type === 'text') {
                await bot.telegram.sendMessage(tgId, msg.text);
                sent = true;
              } else if (msg.type === 'image') {
                await bot.telegram.sendPhoto(tgId, msg.originalContentUrl);
                sent = true;
              }
            } catch (e) {
              // Warning expected for the "wrong" bot
            }
          }
          if (!sent) console.error(`Failed to send Telegram notification to ${tgId} (User blocked all bots?)`);
        }
      } else {
        // LINE Notification
        await lineClient.pushMessage({ to: report.user_id, messages });
      }
    }

    res.json({ success: true, timestamp: now });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Failed' });
  }
});

// LINE webhook endpoint
app.post('/webhook', express.json(), (req, res) => {
  const events = req.body.events;
  if (!events || events.length === 0) return res.status(200).send('OK');

  // Log to debugLogger
  events.forEach(ev => debugLogger.logEvent(ev));

  // Respond IMMEDIATELY
  res.status(200).json({ success: true });

  // Process events in background
  (async () => {
    for (const event of events) {
      try {
        console.log(`📡 [Background] Processing: ${event.type}`);
        await handleWebhookEvent(event);
      } catch (error) {
        console.error('❌ [Background Event Error]:', error);
        debugLogger.logError('WebhookBackground', error);
      }
    }
  })();
});

// DEBUG CENTER: Profile + Logs
app.get('/api/debug-center', async (req, res) => {
  try {
    const profile = await lineClient.getBotInfo();
    res.json({
      bot: profile,
      env: { HAS_TOKEN: !!process.env.LINE_CHANNEL_ACCESS_TOKEN },
      logs: debugLogger.getReport()
    });
  } catch (error) {
    res.status(500).json({ error: error.message, logs: debugLogger.getReport() });
  }
});

// API to update category
app.post('/api/reports/:id/category', express.json(), async (req, res) => {
  const { id } = req.params;
  const { category } = req.body;
  try {
    const { updateReport } = await import('./services/googleSheets.js');
    await updateReport(id, {
      problemType: category,
      auditLog: `Category manually changed to ${category} at ${new Date().toISOString()}`
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DIAGNOSTIC ROUTE: Test Outbound LINE Reply
app.get('/api/test-line', async (req, res) => {
  try {
    const testUserId = req.query.uid;
    if (!testUserId) return res.status(400).send('Missing uid query param');

    console.log(`🧪 Testing Outbound LINE to: ${testUserId}`);
    await lineClient.pushMessage({
      to: testUserId,
      messages: [{ type: 'text', text: `🧪 ระบบทดสอบ: เชื่อมต่อสำเร็จ! (V5.1-PROBE)\n\nหากคุณได้รับข้อความนี้ แสดงว่า TOKEN ของเราถูกต้องครับ!` }]
    });
    res.send('Success! Check your LINE.');
  } catch (error) {
    console.error('❌ LINE Test Fail:', error);
    res.status(500).send(`Fail: ${error.message}`);
  }
});

// API to toggle lock
app.post('/api/reports/:id/lock', express.json(), async (req, res) => {
  const { id } = req.params;
  const { locked } = req.body;
  try {
    const { updateReport, createAuditEntry, appendAuditLog } = await import('./services/googleSheets.js');
    await updateReport(id, {
      categoryLocked: locked,
      auditLog: createAuditEntry(locked ? 'CATEGORY_LOCKED' : 'CATEGORY_UNLOCKED', { by: 'dashboard' })
    });
    await appendAuditLog(id, createAuditEntry(locked ? 'CATEGORY_LOCKED' : 'CATEGORY_UNLOCKED', { by: 'dashboard' }));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// UN-Habitat GeoAI: GeoJSON Export API
app.get('/api/reports/geojson', async (req, res) => {
  try {
    const { getAllReports } = await import('./services/googleSheets.js');
    const reports = await getAllReports();

    // Filter by date if provided
    let filtered = reports;
    if (req.query.from) {
      const from = new Date(req.query.from);
      filtered = filtered.filter(r => new Date(r.timestamp) >= from);
    }
    if (req.query.to) {
      const to = new Date(req.query.to);
      filtered = filtered.filter(r => new Date(r.timestamp) <= to);
    }

    // Convert to GeoJSON
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
  } catch (error) {
    console.error('GeoJSON export error:', error);
    res.status(500).json({ error: 'Failed to export GeoJSON' });
  }
});

// UN-Habitat GeoAI: Early Warning API
app.get('/api/early-warnings', async (req, res) => {
  try {
    const { getEarlyWarnings } = await import('./services/patternDetection.js');
    const warnings = await getEarlyWarnings();
    res.json(warnings);
  } catch (error) {
    console.error('Early warning error:', error);
    res.status(500).json({ alerts: [], analytics: {}, error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Smart City Thailand CDP is running on port ${PORT}`);
  console.log(`📍 Webhook URL: https://your-domain.com/webhook`);

  // Initialize services (Delayed to ensure server starts first)
  console.log('🔄 Deployment Update: Force Refresh at ' + new Date().toISOString() + ' (v3.0 - STABLE PERSISTENCE)');
  setTimeout(async () => {
    try {
      console.log('🔄 Initializing external services...');
      const { initializeSpreadsheet } = await import('./services/googleSheets.js');
      const { indexKnowledgeBase } = await import('./services/knowledgeBase.js');

      await initializeSpreadsheet();
      await indexKnowledgeBase();
      console.log('✅ Services initialized');
    } catch (err) {
      console.error('⚠️ Failed to initialize services (This is normal if tokens are missing):', err.message);
    }
  }, 5000); // 5 second delay

  // Start Telegram Bots (Multi-Bot Support)
  const telegramTokens = [
    process.env.TELEGRAM_BOT_TOKEN,
    process.env.TELEGRAM_BOT_TOKEN_2
  ].filter(Boolean);

  if (telegramTokens.length > 0) {
    console.log(`🚀 Launching ${telegramTokens.length} Telegram Bot(s)...`);

    // Import factory
    const { createBot } = await import('./handlers/telegramBot.js');

    telegramTokens.forEach((token, index) => {
      try {
        const bot = createBot(token);
        if (bot) {
          bot.launch().then(() => console.log(`✅ Telegram Bot #${index + 1} started!`)).catch(e => console.error(`❌ Bot #${index + 1} failed:`, e.message));
          telegramBots.push(bot); // Push to global array
        }
      } catch (e) { console.error(`❌ Setup Error Bot #${index + 1}:`, e.message); }
    });

    // Graceful stop
    process.once('SIGINT', () => telegramBots.forEach(b => b.stop('SIGINT')));
    process.once('SIGTERM', () => telegramBots.forEach(b => b.stop('SIGTERM')));
  }
});
// Redeploy trigger: 1769852110
