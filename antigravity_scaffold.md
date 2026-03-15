# 🌌 Antigravity Scaffold: City Reporter AI Bot

This is a **High-Density System Backbone** designed for rapid reconstruction in a new workspace. It captures the essential logic and architectural patterns in minimum lines of code.

## 📦 1. Essential Stack (package.json)
```json
{
  "dependencies": {
    "@line/bot-sdk": "^9.0.0",
    "node-telegram-bot-api": "^0.66.0",
    "@google/generative-ai": "^0.11.0",
    "googleapis": "^140.0.0",
    "express": "^4.19.2",
    "dotenv": "^16.4.5"
  }
}
```

## 🔐 2. Required Config (.env)
```bash
LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...
TELEGRAM_BOT_TOKEN=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GOOGLE_SPREADSHEET_ID=...
GOOGLE_DRIVE_FOLDER_ID=...
GEMINI_API_KEY=...
```

## 🧠 3. Core Backbone (server.js - Condensed)
```javascript
import express from 'express';
import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as line from '@line/bot-sdk';
import TelegramBot from 'node-telegram-bot-api';

const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const tgBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const lineClient = new line.messagingApi.MessagingApiClient({ channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN });

// --- AI Service (Vision + Logic) ---
async function analyzeIssue(imageB64, mime = 'image/jpeg') {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Role: Forensic Engineer. Task: Analyze urban issue. Output JSON: {problemType:string, urgency: "สูง/กลาง/ต่ำ", summary: string, reaction: string}`;
    const result = await model.generateContent([{ text: prompt }, { inlineData: { data: imageB64, mimeType: mime } }]);
    return JSON.parse(result.response.text().replace(/```json|```/g, ''));
}

// --- Data Service (Google Sheets) ---
async function saveReport(data) {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
        range: 'Reports!A:Z',
        valueInputOption: 'RAW',
        requestBody: { values: [[new Date().toISOString(), data.user, data.problem, data.summary, data.urgency]] }
    });
}

// --- Webhook Handlers (Unified) ---
app.post('/webhook', line.middleware({ channelSecret: process.env.LINE_CHANNEL_SECRET }), async (req, res) => {
    for (const event of req.body.events) {
        if (event.type === 'message' && event.message.type === 'image') {
            const blob = await (await fetch(`https://api-data.line.me/v2/bot/message/${event.message.id}/content`, { headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` } })).blob();
            const b64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
            const analysis = await analyzeIssue(b64);
            await saveReport({ user: event.source.userId, ...analysis });
            await lineClient.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: analysis.reaction }] });
        }
    }
    res.sendStatus(200);
});

// --- Dashboard (Minimal SSE) ---
app.get('/api/stats', async (req, res) => {
    // Fetch from Sheets and return JSON
    res.json({ success: true, stats: { total: 100, pending: 5 } });
});

// Stability
process.on('uncaughtException', (e) => console.error('CRASH:', e));
app.get('/health', (req, res) => res.send('OK'));
app.listen(3000, () => console.log('🚀 Backbone Active'));
```

## 📊 4. Minimal Dashboard (Condensed HTML)
```html
<body class="dark-theme">
    <div id="stats">Total: <span id="count">0</span></div>
    <div id="map"></div>
    <script>
        setInterval(async () => {
            const data = await (await fetch('/api/stats')).json();
            document.getElementById('count').innerText = data.stats.total;
        }, 5000);
    </script>
</body>
```
