
import 'dotenv/config';
import { google } from 'googleapis';
import { getAuthClient } from '../src/utils/googleAuth.js';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

async function checkLastRows() {
    console.log('🔎 Checking last 5 rows of Google Sheet...');
    try {
        const auth = getAuthClient();
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Reports!A:B', // Just ID and Ticket Num
        });

        const rows = response.data.values || [];
        const last5 = rows.slice(-5);

        console.log('📊 Last 5 Entries:');
        last5.forEach(r => console.log(r));

        const count = rows.length;
        console.log(`\nTotal Rows: ${count}`);

    } catch (error) {
        console.error('❌ Check Failed:', error.message);
    }
}

checkLastRows();
