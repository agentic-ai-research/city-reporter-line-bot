
import 'dotenv/config';
import { google } from 'googleapis';
import { getAuthClient } from '../src/utils/googleAuth.js';

const NEW_SHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

async function testWrite() {
    console.log(`📝 Testing Write to New Sheet: ${NEW_SHEET_ID}`);
    try {
        const auth = getAuthClient();
        const sheets = google.sheets({ version: 'v4', auth });

        // Check title to confirm it's the right one
        const meta = await sheets.spreadsheets.get({ spreadsheetId: NEW_SHEET_ID });
        console.log(`✅ Connected to Sheet: "${meta.data.properties.title}"`);

        // Append a "SYSTEM_READY" row
        const res = await sheets.spreadsheets.values.append({
            spreadsheetId: NEW_SHEET_ID,
            range: 'Sheet1!A:C', // Assuming Sheet1 for the user's new sheet
            valueInputOption: 'RAW',
            requestBody: {
                values: [['SYSTEM_CHECK', new Date().toISOString(), 'Link Established']]
            }
        });

        console.log('✅ Write Successful!');
        console.log('Updated Cells:', res.data.updates.updatedCells);

    } catch (error) {
        console.error('❌ Write Failed:', error.message);
    }
}

testWrite();
