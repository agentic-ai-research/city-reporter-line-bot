import 'dotenv/config';
import { getAuthClient } from '../src/utils/googleAuth.js';
import { google } from 'googleapis';

async function checkAuth() {
    console.log('🔍 Checking Google Authentication Identity...');

    try {
        const auth = getAuthClient();
        const oauth2 = google.oauth2({ version: 'v2', auth });
        const userInfo = await oauth2.userinfo.get();

        console.log('\n✅ Authentication Successful!');
        console.log(`📧 Email: ${userInfo.data.email}`);
        console.log(`🆔 ID: ${userInfo.data.id}`);
        console.log(`👤 Name: ${userInfo.data.name}`);

        console.log('\n📋 NEXT STEPS:');
        console.log(`1. Go to your Google Sheet: https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SPREADSHEET_ID}`);
        console.log(`2. Click "Share" (Top Right)`);
        console.log(`3. Ensure "${userInfo.data.email}" is added as an EDITOR.`);
        console.log('4. Restart the bot server.');

    } catch (error) {
        console.error('\n❌ Authentication Check Failed:');
        console.error(error.message);
        if (error.response?.data) {
            console.error('Details:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

checkAuth();
