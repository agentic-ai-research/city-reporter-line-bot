import { google } from 'googleapis';
import readline from 'readline';
import 'dotenv/config';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in the environment.');
    process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
);

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.readonly'
];

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
});

console.log('1. Open this URL in your browser:');
console.log('\x1b[36m%s\x1b[0m', authUrl);
console.log('\n2. Sign in and copy the authorization code');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question('3. Paste the code here: ', async (code) => {
    try {
        const { tokens } = await oauth2Client.getToken(code);
        console.log('\n✅ Tokens generated successfully!');
        console.log('Copy this Refresh Token and paste it back to the chat:');
        console.log('\x1b[32m%s\x1b[0m', tokens.refresh_token);
    } catch (error) {
        console.error('Error retrieving access token:', error.message);
    }
    rl.close();
});
