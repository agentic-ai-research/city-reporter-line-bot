
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { getAuthClient } from '../src/utils/googleAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

async function exportToCSV() {
    console.log('📦 Starting Emergency Data Export...');

    try {
        const auth = getAuthClient();
        const sheets = google.sheets({ version: 'v4', auth });

        // 1. Fetch Request
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Reports!A:AC',
        });

        const rows = response.data.values || [];
        if (rows.length === 0) {
            console.log('No data found.');
            return;
        }

        // 2. Convert to CSV
        const csvContent = rows.map(r =>
            r.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')
        ).join('\n');

        // 3. Save to Public folder
        const outputPath = path.join(__dirname, '../public/city_reports_backup.csv');
        fs.writeFileSync(outputPath, csvContent);

        console.log(`✅ CSV Exported to: ${outputPath}`);
        console.log(`📊 Total Records: ${rows.length - 1}`);

        // 4. CLEANUP: Check for "TEST_CONNECTION" and remove it if found
        // This is a bit risky to do by index in a script, but we know it's near the end.
        // Better to just delete the specific row if we find the ID.

        const testRowIndex = rows.findIndex(r => r[0] === 'TEST_CONNECTION');
        if (testRowIndex !== -1) {
            console.log(`⚠️ Found corrupted row "TEST_CONNECTION" at index ${testRowIndex}. Deleting...`);
            const sheetId = 0; // Default sheet ID is usually 0. PROD Check: assuming 0 for "Reports" usually.

            // To delete a row, we need the shutId (GID). Since we don't have it explicitly in config, 
            // we'll assume 0 OR fetch metadata. Let's fetch metadata to be safe.
            const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
            const reportsSheet = meta.data.sheets.find(s => s.properties.title === 'Reports');
            const gid = reportsSheet.properties.sheetId;

            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                requestBody: {
                    requests: [{
                        deleteDimension: {
                            range: {
                                sheetId: gid,
                                dimension: 'ROWS',
                                startIndex: testRowIndex, // 0-based
                                endIndex: testRowIndex + 1
                            }
                        }
                    }]
                }
            });
            console.log('🧹 Corrupted row deleted.');
        }

    } catch (error) {
        console.error('❌ Export/Cleanup Failed:', error);
    }
}

exportToCSV();
