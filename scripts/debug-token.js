import 'dotenv/config';
import { google } from 'googleapis';
import { config } from '../src/config/index.js';

async function debugToken() {
    console.log('🔍 Debugging Token Refresh...');
    console.log('Client ID:', config.google.clientId ? 'Present' : 'Missing');
    console.log('Client Secret:', config.google.clientSecret ? 'Present' : 'Missing');
    console.log('Refresh Token:', config.google.refreshToken ? 'Present' : 'Missing');

    const oauth2Client = new google.auth.OAuth2(
        config.google.clientId,
        config.google.clientSecret,
        config.google.callbackUrl
    );

    oauth2Client.setCredentials({
        refresh_token: config.google.refreshToken
    });

    try {
        console.log('⏳ Attempting to refresh access token...');
        const { credentials } = await oauth2Client.refreshAccessToken();
        console.log('✅ Access Token Refreshed Successfully!');
        console.log('Access Token:', credentials.access_token.substring(0, 20) + '...');
        console.log('Expiry Date:', new Date(credentials.expiry_date));
    } catch (error) {
        console.error('❌ Token Refresh Failed:', error.message);
        if (error.response) {
            console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

debugToken();
