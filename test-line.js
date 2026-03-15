
import 'dotenv/config';
import { messagingApi } from '@line/bot-sdk';

const client = new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

async function testPush() {
    console.log('Testing LINE Push Message...');
    console.log('Token starts with:', process.env.LINE_CHANNEL_ACCESS_TOKEN?.substring(0, 10));

    // User ID from the reports list we saw earlier
    const userId = 'Uf764e4d52895a87c402ce3d45a4158cf';

    try {
        await client.pushMessage({
            to: userId,
            messages: [{ type: 'text', text: '🚧 System Diagnostics Test: Can you hear me now?' }]
        });
        console.log('✅ Push Success!');
    } catch (error) {
        console.error('❌ Push Failed:', error.response?.data || error.message);
    }
}

testPush();
