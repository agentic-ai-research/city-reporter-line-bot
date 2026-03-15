
import 'dotenv/config';
import { google } from 'googleapis';
import { getAuthClient } from '../src/utils/googleAuth.js';

const SOURCE_SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const TARGET_SPREADSHEET_ID = '1apeg77Iawe4MGroPWl5RXPRTz0hVPevCgpxQxaSOa7U'; // User provided

async function migrateData() {
    console.log('🚀 Starting Data Migration...');
    console.log(`📂 Source: ${SOURCE_SPREADSHEET_ID}`);
    console.log(`📂 Target: ${TARGET_SPREADSHEET_ID}`);

    try {
        const auth = getAuthClient();
        const sheets = google.sheets({ version: 'v4', auth });

        // 1. READ from Source
        console.log('📖 Reading data from source...');
        const sourceRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SOURCE_SPREADSHEET_ID,
            range: 'Reports!A:AC',
        });

        const rows = sourceRes.data.values || [];
        console.log(`✅ Found ${rows.length} rows in source.`);

        if (rows.length === 0) {
            console.warn('⚠️ No data to migrate.');
            return;
        }

        // 2. WRITE to Target
        // We'll try to append to 'Sheet1' or 'Reports'. Let's check metadata first to see what sheets exist.
        const meta = await sheets.spreadsheets.get({ spreadsheetId: TARGET_SPREADSHEET_ID });
        const requestSheetName = meta.data.sheets[0].properties.title; // Default to first sheet
        console.log(`🎯 Target Sheet Name: ${requestSheetName}`);

        console.log('✍️ Writing data to target...');

        // We overwrite from A1 to ensure headers and everything matches
        // OR we can just append if the user wants "merge". 
        // User said "merge that CSV file with the Google sheet". 
        // Safer to APPEND if there is existing data, or OVERWRITE if empty.
        // Let's try OVERWRITING the whole range to ensure consistency with the backup.

        const updateRes = await sheets.spreadsheets.values.update({
            spreadsheetId: TARGET_SPREADSHEET_ID,
            range: `${requestSheetName}!A1`,
            valueInputOption: 'RAW',
            requestBody: { values: rows }
        });

        console.log(`✅ Migration Complete! Updated ${updateRes.data.updatedCells} cells.`);

    } catch (error) {
        console.error('❌ Migration Failed:', error.message);
        if (error.code === 403) {
            console.error('🚨 PERMISSION ERROR: The bot email does not have edit access to the new sheet.');
            console.error('👉 Please make sure you shared the sheet with the email in your Refresh Token.');
        }
    }
}

migrateData();
