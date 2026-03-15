
import 'dotenv/config';
import { google } from 'googleapis';

async function test() {
    console.log('🧪 Testing Knowledge Base Diagnostics...');
    console.log('📂 Target Folder ID:', process.env.GOOGLE_DRIVE_KB_FOLDER_ID);

    // Auth Setup
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth });

    try {
        // 1. Who am I?
        const about = await drive.about.get({ fields: 'user' });
        console.log('👤 Authenticated as:', about.data.user.emailAddress, `(${about.data.user.displayName})`);

        // 2. Check Folder Metadata
        try {
            const folder = await drive.files.get({
                fileId: process.env.GOOGLE_DRIVE_KB_FOLDER_ID,
                fields: 'id, name, mimeType, webViewLink'
            });
            console.log('📂 Folder Found:', folder.data.name);
            console.log('Summary:', folder.data);
        } catch (e) {
            console.error('❌ Folder Lookup Failed:', e.message);
        }

        // 3. List Index
        console.log('📑 Attempting List...');
        const res = await drive.files.list({
            q: `'${process.env.GOOGLE_DRIVE_KB_FOLDER_ID}' in parents and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 10,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
        });

        if (res.data.files && res.data.files.length === 0) {
            console.log('⚠️ Result: 0 Files found in this folder.');
        } else {
            console.log(`✅ Result: ${res.data.files.length} Files found!`, res.data.files);
        }

    } catch (e) {
        console.error('Diagnostic Error:', e);
    }
}

test();
