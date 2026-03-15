
import 'dotenv/config';
import { google } from 'googleapis';

async function testSheet() {
    console.log('🧪 Testing Google Sheets Connection...');
    console.log('📄 Spreadsheet ID:', process.env.GOOGLE_SPREADSHEET_ID);

    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

    const sheets = google.sheets({ version: 'v4', auth });

    try {
        // Try to read metadata
        const meta = await sheets.spreadsheets.get({
            spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID
        });
        console.log('✅ Spreadsheet Found:', meta.data.properties.title);

        // Try to read rows
        const rows = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
            range: 'Reports!A1:B2'
        });
        console.log('✅ Read Access OK. Rows:', rows.data.values);

    } catch (error) {
        console.error('❌ Sheets Error:', error.message);
        if (error.response) console.error('Details:', error.response.data);
    }
}

testSheet();
