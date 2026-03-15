
import 'dotenv/config';
import { google } from 'googleapis';
import { Readable } from 'stream';

async function testUpload() {
    console.log('🧪 Testing Drive Image Upload...');
    console.log('📂 Upload Folder ID:', process.env.GOOGLE_DRIVE_FOLDER_ID);

    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth });

    try {
        // Create a dummy stream
        const stream = Readable.from(['fake image data']);

        const response = await drive.files.create({
            requestBody: {
                name: 'test_upload_debug.txt',
                parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
            },
            media: {
                mimeType: 'text/plain',
                body: stream,
            },
            fields: 'id, webViewLink',
        });

        console.log('✅ Upload Success! File ID:', response.data.id);
        console.log('🔗 Link:', response.data.webViewLink);

        // Cleanup
        await drive.files.delete({ fileId: response.data.id });
        console.log('🧹 Cleanup Test File Success');

    } catch (error) {
        console.error('❌ Upload Failed:', error.message);
    }
}

testUpload();
