
import 'dotenv/config';
import { google } from 'googleapis';
import { Readable } from 'stream';

// Initialize Google OAuth2 client
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
);

oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function uploadTest() {
    console.log('Testing Google Drive Upload...');
    try {
        const fileMetadata = {
            name: 'test-upload.txt',
            parents: [process.env.GOOGLE_DRIVE_FOLDER_ID]
        };
        const media = {
            mimeType: 'text/plain',
            body: Readable.from(['Hello World'])
        };
        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink'
        });
        console.log('✅ Upload Success! File ID:', file.data.id);
    } catch (error) {
        console.log('❌ Upload Failed:', error.message);
        if (error.response) {
            console.log('Details:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

uploadTest();
