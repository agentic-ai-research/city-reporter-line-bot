
import 'dotenv/config';
import crypto from 'crypto';
import axios from 'axios';

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const WEBHOOK_URL = 'https://city-reporter-bot-production.up.railway.app/webhook';

async function testWebhook() {
    console.log('🔍 Testing Webhook Endpoint...');
    console.log(`URL: ${WEBHOOK_URL}`);
    console.log(`Secret (First 5): ${CHANNEL_SECRET?.substring(0, 5)}...`);

    const body = JSON.stringify({
        destination: "U...fake...",
        events: [{
            type: "message",
            message: { type: "text", id: "325708", text: "/start" },
            timestamp: Date.now(),
            source: { type: "user", userId: "Ufakeuser123" },
            replyToken: "nHuyWiB7yP5Zw52FIkcQobQuGDXCTA"
        }]
    });

    const signature = crypto
        .createHmac('SHA256', CHANNEL_SECRET)
        .update(body)
        .digest('base64');

    try {
        const response = await axios.post(WEBHOOK_URL, body, {
            headers: {
                'Content-Type': 'application/json',
                'x-line-signature': signature
            }
        });
        console.log(`✅ Webhook Status: ${response.status} ${response.statusText}`);
        console.log('Server accepted the request (Signature Matched).');
    } catch (error) {
        if (error.response) {
            console.log(`❌ Webhook Failed: ${error.response.status} ${error.response.statusText}`);
            console.log('Data:', error.response.data);
            if (error.response.status === 401 || error.response.status === 403) {
                console.log('⚠️ Signature Verification Failed! checks your LINE_CHANNEL_SECRET on Railway.');
            }
        } else {
            console.log(`❌ Network Error: ${error.message}`);
        }
    }
}

testWebhook();
