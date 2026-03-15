import { google } from 'googleapis';
import { getAuthClient } from '../utils/googleAuth.js';

// Get auth client from centralized security module
function getAuth() {
    return getAuthClient();
}

// Dynamic getter to ensure env var is loaded
function getSpreadsheetId() {
    return process.env.GOOGLE_SPREADSHEET_ID;
}
const SHEET_NAME_V1 = 'Reports';
const SHEET_NAME_V2 = 'Reports_V2';

// Column headers for the spreadsheet
const HEADERS = [
    'Report ID',
    'Ticket Number',
    'Timestamp',
    'User ID',
    'Phone',
    'Problem Type',
    'Description',
    'Location Text',
    'Latitude',
    'Longitude',
    'Image URL',
    'AI Summary',
    'Urgency',
    'Status',
    'Rating',
    'Solution Image URL',
    'Staff Name',
    'Staff Comment',
    'Category Locked',
    'Audit Log',
    'Ack Timestamp',
    'InProgress Timestamp',
    'Completed Timestamp',
    'Team Name',
    'Internal Notes',
    'Nickname',
    'Smart Analysis',
    'AI Reaction',
    'Photo Metadata' // Column AC (29)
];

// Conversation sheet configuration
const CONVO_SHEET_NAME = 'Conversations';
const CONVO_HEADERS = [
    'Timestamp',
    'User ID',
    'Platform',
    'User Message',
    'AI Response',
    'Sentiment',
    'Sentiment Score',
    'Topics',
    'Entities'
];

// Briefs sheet configuration
const BRIEF_SHEET_NAME = 'Intelligence_Briefs';
const BRIEF_HEADERS = [
    'Timestamp',
    'Content',
    'Stats JSON'
];

/**
 * Initialize the spreadsheet with headers if empty
 */
export async function initializeSpreadsheet() {
    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        // Get spreadsheet metadata to check if sheets exist
        const meta = await sheets.spreadsheets.get({
            spreadsheetId: getSpreadsheetId(),
        });

        // 1. Check Reports Sheets (V1 and V2)
        for (const sheetName of [SHEET_NAME_V1, SHEET_NAME_V2]) {
            const exists = meta.data.sheets.some(s => s.properties.title === sheetName);
            if (!exists) {
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId: getSpreadsheetId(),
                    requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] }
                });
                console.log(`Created sheet: ${sheetName}`);
            }

            // Update Headers for both
            const resp = await sheets.spreadsheets.values.get({
                spreadsheetId: getSpreadsheetId(),
                range: `${sheetName}!A1:AC1`,
            });
            const currentHeaders = resp.data.values ? resp.data.values[0] : [];
            if (currentHeaders.join(',') !== HEADERS.join(',')) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: getSpreadsheetId(),
                    range: `${sheetName}!A1:AC1`,
                    valueInputOption: 'RAW',
                    requestBody: { values: [HEADERS] },
                });
                console.log(`${sheetName} headers synchronized`);
            }
        }

        // 2. Check Conversations Sheet
        const convoSheetExists = meta.data.sheets.some(s => s.properties.title === CONVO_SHEET_NAME);
        if (!convoSheetExists) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: getSpreadsheetId(),
                requestBody: { requests: [{ addSheet: { properties: { title: CONVO_SHEET_NAME } } }] }
            });
            console.log(`Created sheet: ${CONVO_SHEET_NAME}`);
        }

        // 3. Check Intelligence_Briefs Sheet
        const briefSheetExists = meta.data.sheets.some(s => s.properties.title === BRIEF_SHEET_NAME);
        if (!briefSheetExists) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: getSpreadsheetId(),
                requestBody: { requests: [{ addSheet: { properties: { title: BRIEF_SHEET_NAME } } }] }
            });
            await sheets.spreadsheets.values.update({
                spreadsheetId: getSpreadsheetId(),
                range: `${BRIEF_SHEET_NAME}!A1:C1`,
                valueInputOption: 'RAW',
                requestBody: { values: [BRIEF_HEADERS] },
            });
            console.log(`Created sheet: ${BRIEF_SHEET_NAME}`);
        }

        // 2. Check Conversations Sheet (Handled above in initialize loop if we wanted, but keeping separate for now or refactoring)

        // 4. Update Conversations Headers
        const convoResp = await sheets.spreadsheets.values.get({
            spreadsheetId: getSpreadsheetId(),
            range: `${CONVO_SHEET_NAME}!A1:I1`,
        });
        const currentConvoHeaders = convoResp.data.values ? convoResp.data.values[0] : [];
        if (currentConvoHeaders.join(',') !== CONVO_HEADERS.join(',')) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: getSpreadsheetId(),
                range: `${CONVO_SHEET_NAME}!A1:I1`,
                valueInputOption: 'RAW',
                requestBody: { values: [CONVO_HEADERS] },
            });
            console.log('Conversations headers synchronized');
        }

    } catch (error) {
        console.error('Error initializing spreadsheet:', error);
    }
}




/**
 * Initialize the spreadsheet with headers if empty
 */


/**
 * Retry helper for Sheets API calls
 */
async function withSheetRetry(fn, operation = 'Sheets operation', maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            const isRetryable = error.code === 429 || error.code >= 500 || error.message?.includes('ECONNRESET') || error.message?.includes('ETIMEDOUT');
            if (!isRetryable || attempt === maxRetries) {
                console.error(`❌ ${operation} failed after ${attempt} attempts:`, error.message);
                throw error;
            }
            const delay = 1000 * Math.pow(2, attempt - 1);
            console.warn(`⚠️ ${operation} attempt ${attempt} failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

/**
 * Log conversation to Conversations sheet (with retry)
 * @param {Array} values - Array of values matching CONVO_HEADERS
 */
export async function logConversationToSheet(values) {
    try {
        await withSheetRetry(async () => {
            const auth = getAuth();
            const sheets = google.sheets({ version: 'v4', auth });

            await sheets.spreadsheets.values.append({
                spreadsheetId: getSpreadsheetId(),
                range: `${CONVO_SHEET_NAME}!A:I`,
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                requestBody: { values: [values] },
            });
        }, 'logConversation');
    } catch (error) {
        console.error('Error logging conversation (all retries exhausted):', error.message);
    }
}

/**
 * Append a new report to the spreadsheet
 * @param {Object} report - Report data
 * @param {string} version - 'v1' or 'v2'
 */
export async function appendReport(report, version = 'v1') {
    const sheetName = version === 'v2' ? SHEET_NAME_V2 : SHEET_NAME_V1;
    console.log(`[Sheets] Appending Report ${report.ticketNumber} to ${sheetName}...`);
    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        // ... (row construction) ...
        const row = [
            report.reportId,
            report.ticketNumber || '',
            report.timestamp,
            report.userId,
            report.phone || '',
            report.problemType,
            report.description,
            report.locationText,
            report.latitude,
            report.longitude,
            report.imageUrl,
            report.aiSummary,
            report.urgency,
            report.status,
            report.rating || '',
            report.solutionImageUrl || '',
            report.staffName || '',
            report.staffComment || '',
            '', // Category Locked
            '', // Audit Log
            '', // Ack Timestamp
            '', // InProgress Timestamp
            '', // Completed Timestamp
            '', // Team Name
            '', // Internal Notes
            report.nickname || '', // Nickname
            report.detailedCityAnalysis || '', // Smart Analysis
            report.aiReaction || '', // AI Reaction
            report.photoMetadata || '' // Photo Metadata
        ];

        console.log(`[Sheets] Payload prepared. Size: ${row.length} columns.`);
        const response = await sheets.spreadsheets.values.append({
            spreadsheetId: getSpreadsheetId(),
            range: `${sheetName}!A:AC`, // 29 columns
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: {
                values: [row],
            },
        });

        console.log('[Sheets] ✅ Append Success:', response.data.updates);
        return response.data;
    } catch (error) {
        console.error('[Sheets] ❌ Append Failed:', error.message);
        // ... (existing error handling) ...
        if (error.code === 403) {
            console.error('💡 TIP: "The caller does not have permission" usually means you need to share your Google Sheet with the email used in the Refresh Token. Run `node scripts/check-auth.js` to find the email.');
        } else if (error.code === 404) {
            console.error('💡 TIP: "Requested entity was not found" means the GOOGLE_SPREADSHEET_ID in your .env might be incorrect.');
        }
        throw error;
    }
}

/**
 * Get all reports from the spreadsheet
 * @param {string} version - 'v1' or 'v2'
 * @returns {Array} - Array of report objects
 */
export async function getAllReports(version = 'v1') {
    const sheetName = version === 'v2' ? SHEET_NAME_V2 : SHEET_NAME_V1;
    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: getSpreadsheetId(),
            range: `${sheetName}!A:AC`, // 29 columns
        });

        const rows = response.data.values || [];

        if (rows.length <= 1) return []; // Only headers or empty

        // Convert rows to objects
        const headers = rows[0];
        return rows.slice(1).map(row => {
            const obj = {};
            headers.forEach((header, index) => {
                const key = header.toLowerCase().replace(/ /g, '_');
                obj[key] = row[index] || '';
            });
            return obj;
        });
    } catch (error) {
        console.error('Error getting reports:', error);
        throw error;
    }
}

/**
 * Generate sequential ticket number
 * @param {string} version - 'v1' or 'v2'
 */
export async function generateTicketNumber(version = 'v1') {
    try {
        const reports = await getAllReports(version);
        const nextNumber = reports.length + 1;
        return String(nextNumber).padStart(4, '0');
    } catch (error) {
        // Fallback: use timestamp-based number if sheets unavailable
        console.warn('Could not fetch report count for ticket number, using fallback');
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        return `${day}${hour}${min}`;
    }
}

/**
 * Update report details
 * @param {string} reportId - Report ID to update
 * @param {Object} updates - { status, staffName, staffComment }
 * @param {string} version - 'v1' or 'v2'
 */
export async function updateReport(reportId, updates, version = 'v1') {
    const sheetName = version === 'v2' ? SHEET_NAME_V2 : SHEET_NAME_V1;
    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        // First, find the row with this report ID
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: getSpreadsheetId(),
            range: `${sheetName}!A:A`,
        });

        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => row[0] === reportId);

        if (rowIndex === -1) {
            throw new Error(`Report ${reportId} not found`);
        }

        const rowNumber = rowIndex + 1;

        // Update columns: N(Status), F(Type), Q(Staff), R(Comment), S(Locked), T(Audit), U(AckTS), V(InProgTS), W(CompTS), X(Team), Y(Internal)
        const requests = [];

        if (updates.status) requests.push({ range: `${SHEET_NAME}!N${rowNumber}`, values: [[updates.status]] });
        if (updates.rating) requests.push({ range: `${SHEET_NAME}!O${rowNumber}`, values: [[updates.rating]] });
        if (updates.problemType) requests.push({ range: `${SHEET_NAME}!F${rowNumber}`, values: [[updates.problemType]] });
        if (updates.staffName) requests.push({ range: `${SHEET_NAME}!Q${rowNumber}`, values: [[updates.staffName]] });
        if (updates.staffComment) requests.push({ range: `${SHEET_NAME}!R${rowNumber}`, values: [[updates.staffComment]] });
        if (updates.categoryLocked !== undefined) requests.push({ range: `${SHEET_NAME}!S${rowNumber}`, values: [[updates.categoryLocked.toString()]] });
        if (updates.auditLog) requests.push({ range: `${SHEET_NAME}!T${rowNumber}`, values: [[updates.auditLog]] });

        // Detailed Timestamps
        if (updates.ackTimestamp) requests.push({ range: `${SHEET_NAME}!U${rowNumber}`, values: [[updates.ackTimestamp]] });
        if (updates.inProgressTimestamp) requests.push({ range: `${SHEET_NAME}!V${rowNumber}`, values: [[updates.inProgressTimestamp]] });
        if (updates.completedTimestamp) requests.push({ range: `${SHEET_NAME}!W${rowNumber}`, values: [[updates.completedTimestamp]] });

        if (updates.teamName) requests.push({ range: `${sheetName}!X${rowNumber}`, values: [[updates.teamName]] });
        if (updates.internalNotes) requests.push({ range: `${sheetName}!Y${rowNumber}`, values: [[updates.internalNotes]] });
        if (updates.solutionImageUrl) requests.push({ range: `${sheetName}!P${rowNumber}`, values: [[updates.solutionImageUrl]] });

        for (const req of requests) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: getSpreadsheetId(),
                range: req.range,
                valueInputOption: 'RAW',
                requestBody: { values: req.values },
            });
        }

        console.log(`Report ${reportId} updated:`, updates);
    } catch (error) {
        console.error('Error updating report:', error);
        throw error;
    }
}

/**
 * Generate a formatted audit log entry
 * @param {string} action - Action type (CREATED, AI_CLASSIFIED, STATUS_CHANGE, etc.)
 * @param {Object} details - Action details
 * @returns {string} Formatted audit entry
 */
export function createAuditEntry(action, details = {}) {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const parts = [`[${timestamp}] ${action}`];

    if (details.by) parts.push(`by ${details.by}`);
    if (details.via) parts.push(`via ${details.via}`);
    if (details.from && details.to) parts.push(`${details.from}→${details.to}`);
    if (details.confidence) parts.push(`confidence=${details.confidence}`);
    if (details.reason) parts.push(`reason="${details.reason}"`);
    if (details.deviceId) parts.push(`device=${details.deviceId}`);
    if (details.language) parts.push(`lang=${details.language}`);

    return parts.join(' ');
}

/**
 * Append audit entry to existing audit log
 * @param {string} reportId - Report ID
 * @param {string} entry - New audit entry
 * @param {string} version - 'v1' or 'v2'
 */
export async function appendAuditLog(reportId, entry, version = 'v1') {
    const sheetName = version === 'v2' ? SHEET_NAME_V2 : SHEET_NAME_V1;
    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        // Get current audit log
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: getSpreadsheetId(),
            range: `${sheetName}!A:T`,
        });

        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => row[0] === reportId);

        if (rowIndex === -1) {
            console.log(`Report ${reportId} not found for audit log`);
            return;
        }

        const rowNumber = rowIndex + 1;
        const currentLog = rows[rowIndex][19] || ''; // Column T (index 19)
        const newLog = currentLog ? `${currentLog}\n${entry}` : entry;

        await sheets.spreadsheets.values.update({
            spreadsheetId: getSpreadsheetId(),
            range: `${sheetName}!T${rowNumber}`,
            valueInputOption: 'RAW',
            requestBody: { values: [[newLog]] },
        });

        console.log(`📝 Audit log appended for ${reportId}`);
    } catch (error) {
        console.error('Error appending audit log:', error);
        // Non-critical, don't throw
    }
}

/**
 * Get all conversations for analysis
 */
export async function getAllConversations() {
    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: getSpreadsheetId(),
            range: `${CONVO_SHEET_NAME}!A:I`, // 9 columns
        });

        const rows = response.data.values || [];
        if (rows.length <= 1) return [];

        const headers = rows[0];
        // Map based on headers safely
        return rows.slice(1).map(row => {
            const obj = {};
            // Standard mapping based on CONVO_HEADERS order
            // ['Timestamp', 'User ID', 'Platform', 'User Message', 'AI Response', 'Sentiment', 'Sentiment Score', 'Topics', 'Entities']
            obj.timestamp = row[0];
            obj.userId = row[1];
            obj.platform = row[2];
            obj.userMessage = row[3];
            obj.aiResponse = row[4];
            obj.sentiment = row[5];
            obj.score = parseFloat(row[6] || 0);
            obj.topics = row[7] ? row[7].split(',').map(t => t.trim()) : [];
            obj.entities = row[8] ? row[8].split(',').map(e => e.trim()) : [];
            return obj;
        });
    } catch (error) {
        console.error('Error getting conversations:', error);
        return [];
    }
}

/**
 * Save an Intelligence Brief
 */
export async function saveBrief(content, stats) {
    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        await sheets.spreadsheets.values.append({
            spreadsheetId: getSpreadsheetId(),
            range: `${BRIEF_SHEET_NAME}!A:C`,
            valueInputOption: 'RAW',
            requestBody: {
                values: [[
                    new Date().toISOString(),
                    content,
                    JSON.stringify(stats)
                ]]
            }
        });
        console.log('Intelligence Brief saved to Sheets');
        return true;
    } catch (error) {
        console.error('Error saving brief:', error);
        return false;
    }
}

/**
 * Get the latest Intelligence Brief
 */
export async function getLatestBrief() {
    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: getSpreadsheetId(),
            range: `${BRIEF_SHEET_NAME}!A:C`,
        });

        const rows = response.data.values || [];
        if (rows.length <= 1) return null;

        // Get last row
        const lastRow = rows[rows.length - 1];
        return {
            timestamp: lastRow[0],
            content: lastRow[1],
            stats: lastRow[2] ? JSON.parse(lastRow[2]) : {}
        };
    } catch (error) {
        console.error('Error getting brief:', error);
        return null;
    }
}
