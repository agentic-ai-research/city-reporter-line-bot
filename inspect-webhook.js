
import 'dotenv/config';
import axios from 'axios';

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

async function checkWebhook() {
    console.log('🕵️‍♂️ Inspecting LINE Webhook Config...');
    try {
        const response = await axios.get('https://api.line.me/v2/bot/channel/webhook/endpoint', {
            headers: { Authorization: `Bearer ${TOKEN}` }
        });

        console.log('✅ Current Webhook Configuration:');
        console.log(`   URL: ${response.data.endpoint}`);
        console.log(`   Active: ${response.data.active}`);

        // Check if it matches our Railway URL
        const expected = 'https://city-reporter-bot-production.up.railway.app/webhook';
        if (response.data.endpoint !== expected) {
            console.log(`⚠️ MISMATCH! Expected: ${expected}`);
            console.log('   Attempting to fix...');
            await setWebhook(expected);
        } else {
            console.log('✅ URL Match! The configuration looks correct.');
        }

    } catch (error) {
        console.error('❌ Failed to check webhook:', error.response?.data || error.message);
    }
}

async function setWebhook(url) {
    try {
        await axios.put('https://api.line.me/v2/bot/channel/webhook/endpoint',
            { endpoint: url },
            { headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } }
        );
        console.log('✨ Automatically updated Webhook URL to match Railway!');
    } catch (error) {
        console.error('❌ Failed to update webhook:', error.response?.data || error.message);
    }
}

checkWebhook();
