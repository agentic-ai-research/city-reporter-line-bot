
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY;
const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;

const results = [];

function log(category, status, detail) {
    const icon = status === 'OK' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
    console.log(`${icon} [${category}] ${detail}`);
    results.push({ category, status, detail });
}

async function fetchJSON(path) {
    const res = await fetch(`${BASE_URL}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function main() {
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   🏥 FULL SYSTEM HEALTH CHECK               ║');
    console.log('║   Smart City Thailand CDP V2.0               ║');
    console.log('╚══════════════════════════════════════════════╝\n');

    // ═══════════════════════════════════════════
    // 1. MAGIC EYE (Vision AI)
    // ═══════════════════════════════════════════
    console.log('━━━ 1. MAGIC EYE (Vision AI) ━━━');
    try {
        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
        const mockImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

        const result = await model.generateContent({
            contents: [{
                role: 'user', parts: [
                    { text: 'Describe this image briefly.' },
                    { inlineData: { data: mockImage, mimeType: 'image/png' } }
                ]
            }]
        });
        const text = result.response.text();
        log('Magic Eye', 'OK', `Vision works! Response: "${text.substring(0, 60)}..."`);
    } catch (e) {
        log('Magic Eye', 'FAIL', `Vision failed: ${e.status || e.message}`);
    }

    // ═══════════════════════════════════════════
    // 2. SMARTBOT (Chat AI + Tools)
    // ═══════════════════════════════════════════
    console.log('\n━━━ 2. SMARTBOT (Chat AI + Tools) ━━━');
    try {
        const genAI = new GoogleGenerativeAI(API_KEY);
        const tools = [{
            functionDeclarations: [{
                name: "test_tool", description: "A test tool",
                parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] }
            }]
        }];
        const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest', tools });
        const chat = model.startChat();
        const result = await chat.sendMessage("Use the test_tool with query 'hello'");
        const calls = result.response.functionCalls();
        if (calls && calls.length > 0) {
            log('SmartBot', 'OK', `Tool calling works! Detected: ${calls.map(c => c.name).join(', ')}`);
        } else {
            log('SmartBot', 'OK', `Chat works (no tool call triggered, but model responded: "${result.response.text().substring(0, 40)}...")`);
        }
    } catch (e) {
        log('SmartBot', 'FAIL', `Chat/Tools failed: ${e.status || e.message}`);
    }

    // ═══════════════════════════════════════════
    // 3. GOOGLE SHEETS SYNC
    // ═══════════════════════════════════════════
    console.log('\n━━━ 3. GOOGLE SHEETS SYNC ━━━');
    try {
        const reports = await fetchJSON('/api/reports');
        if (Array.isArray(reports)) {
            log('Sheets', 'OK', `Connected! ${reports.length} reports loaded from spreadsheet.`);

            // Check for image URLs
            const withImages = reports.filter(r => r.image_url && r.image_url.startsWith('http'));
            log('Sheets', withImages.length > 0 ? 'OK' : 'WARN', `${withImages.length}/${reports.length} reports have valid image URLs.`);
        } else {
            log('Sheets', 'FAIL', 'API returned non-array data');
        }
    } catch (e) {
        log('Sheets', 'FAIL', `Sheets connection failed: ${e.message}`);
    }

    // ═══════════════════════════════════════════
    // 4. PHOTO DISPLAY ON DASHBOARD
    // ═══════════════════════════════════════════
    console.log('\n━━━ 4. PHOTO DISPLAY ━━━');
    try {
        const reports = await fetchJSON('/api/reports');
        const withImages = reports.filter(r => r.image_url && r.image_url.startsWith('http'));
        if (withImages.length > 0) {
            const sampleUrl = withImages[0].image_url;
            log('Photos', 'OK', `Sample image URL: ${sampleUrl.substring(0, 60)}...`);

            // Test if image is accessible
            try {
                const imgRes = await fetch(sampleUrl, { method: 'HEAD' });
                log('Photos', imgRes.ok ? 'OK' : 'WARN', `Image accessibility: HTTP ${imgRes.status}`);
            } catch (imgErr) {
                log('Photos', 'WARN', `Could not verify image accessibility: ${imgErr.message}`);
            }
        } else {
            log('Photos', 'WARN', 'No reports with images found to verify.');
        }
    } catch (e) {
        log('Photos', 'FAIL', `Photo check failed: ${e.message}`);
    }

    // ═══════════════════════════════════════════
    // 5. LINE CONNECTIVITY
    // ═══════════════════════════════════════════
    console.log('\n━━━ 5. LINE CONNECTIVITY ━━━');
    try {
        const hasToken = !!process.env.LINE_CHANNEL_ACCESS_TOKEN;
        const hasSecret = !!process.env.LINE_CHANNEL_SECRET;
        log('LINE', hasToken ? 'OK' : 'FAIL', `Channel Access Token: ${hasToken ? 'Present (' + process.env.LINE_CHANNEL_ACCESS_TOKEN.length + ' chars)' : 'MISSING'}`);
        log('LINE', hasSecret ? 'OK' : 'FAIL', `Channel Secret: ${hasSecret ? 'Present' : 'MISSING'}`);

        // Test webhook endpoint
        const webhookRes = await fetch(`${BASE_URL}/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events: [] })
        });
        log('LINE', webhookRes.ok ? 'OK' : 'FAIL', `Webhook endpoint: HTTP ${webhookRes.status}`);

        // Test debug center (which calls LINE API)
        try {
            const debug = await fetchJSON('/api/debug-center');
            log('LINE', debug.bot ? 'OK' : 'WARN', `Bot Info: ${debug.bot?.displayName || debug.bot?.botId || 'Retrieved'}`);
        } catch (debugErr) {
            log('LINE', 'WARN', `Debug center: ${debugErr.message}`);
        }
    } catch (e) {
        log('LINE', 'FAIL', `LINE check failed: ${e.message}`);
    }

    // ═══════════════════════════════════════════
    // 6. TELEGRAM CONNECTIVITY
    // ═══════════════════════════════════════════
    console.log('\n━━━ 6. TELEGRAM CONNECTIVITY ━━━');
    const hasTgToken = !!process.env.TELEGRAM_BOT_TOKEN;
    const hasTgToken2 = !!process.env.TELEGRAM_BOT_TOKEN_2;
    log('Telegram', hasTgToken ? 'OK' : 'WARN', `Bot Token 1: ${hasTgToken ? 'Present' : 'Not configured'}`);
    log('Telegram', hasTgToken2 ? 'OK' : 'WARN', `Bot Token 2: ${hasTgToken2 ? 'Present' : 'Not configured'}`);

    // ═══════════════════════════════════════════
    // 7. DASHBOARD & API ENDPOINTS
    // ═══════════════════════════════════════════
    console.log('\n━━━ 7. DASHBOARD & API ENDPOINTS ━━━');

    const endpoints = [
        { path: '/', name: 'Dashboard HTML' },
        { path: '/api/reports', name: 'Reports API' },
        { path: '/api/stats', name: 'Stats API' },
        { path: '/api/news', name: 'News API' },
        { path: '/api/reports/geojson', name: 'GeoJSON Export' },
        { path: '/api/early-warnings', name: 'Early Warnings' },
        { path: '/api/analytics/social', name: 'Social Analytics' },
        { path: '/api/intelligence/latest', name: 'Intelligence Brief' },
    ];

    for (const ep of endpoints) {
        try {
            const res = await fetch(`${BASE_URL}${ep.path}`);
            log('Dashboard', res.ok ? 'OK' : 'FAIL', `${ep.name} (${ep.path}): HTTP ${res.status}`);
        } catch (e) {
            log('Dashboard', 'FAIL', `${ep.name} (${ep.path}): ${e.message}`);
        }
    }

    // ═══════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║   📊 HEALTH CHECK SUMMARY                    ║');
    console.log('╚══════════════════════════════════════════════╝');

    const okCount = results.filter(r => r.status === 'OK').length;
    const warnCount = results.filter(r => r.status === 'WARN').length;
    const failCount = results.filter(r => r.status === 'FAIL').length;

    console.log(`\n   ✅ PASS: ${okCount}   ⚠️ WARN: ${warnCount}   ❌ FAIL: ${failCount}`);
    console.log(`   Total checks: ${results.length}`);

    if (failCount === 0) {
        console.log('\n   🎉 ALL SYSTEMS OPERATIONAL!\n');
    } else {
        console.log('\n   ⚠️ Some issues detected. Review above for details.\n');
    }

    // Print failures
    const failures = results.filter(r => r.status === 'FAIL');
    if (failures.length > 0) {
        console.log('   FAILURES:');
        failures.forEach(f => console.log(`   ❌ [${f.category}] ${f.detail}`));
    }
}

main().catch(e => console.error('Health check crashed:', e));
