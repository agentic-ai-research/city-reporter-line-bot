import { loggers } from '../utils/logger.js';
import {
    appendReport as appendReportToSheets,
    generateTicketNumber as generateSheetTicketNumber,
    getAllReports as getAllReportsFromSheets,
    updateReport as updateReportInSheets
} from './googleSheets.js';
import {
    allocateTicketNumberFromSupabase,
    appendReportToSupabase,
    getAllReportsFromSupabase,
    getReportByIdFromSupabase,
    isSupabaseEnabled,
    updateReportInSupabase
} from './supabase.js';

const log = loggers.api;
const shouldMirrorToSheets = process.env.GOOGLE_SHEETS_MIRROR !== 'false';

async function mirrorReportToSheets(reportData, version = 'v1') {
    if (!shouldMirrorToSheets) return;

    appendReportToSheets(reportData, version).catch(error => {
        log.warn('Google Sheets mirror failed for report create', {
            reportId: reportData.reportId,
            message: error.message
        });
    });
}

async function mirrorReportUpdateToSheets(reportId, updates, version = 'v1') {
    if (!shouldMirrorToSheets) return;

    updateReportInSheets(reportId, updates, version).catch(error => {
        log.warn('Google Sheets mirror failed for report update', {
            reportId,
            message: error.message
        });
    });
}

export async function listReports(version = 'v1') {
    if (isSupabaseEnabled()) {
        const reports = await getAllReportsFromSupabase(); // Supposing v2 isn't in supabase yet or handled there
        if (Array.isArray(reports)) {
            return reports;
        }

        log.warn('Supabase report list unavailable, falling back to Google Sheets');
    }

    return getAllReportsFromSheets(version);
}

export async function getReportById(id, version = 'v1') {
    if (!id) return null;

    if (isSupabaseEnabled()) {
        const report = await getReportByIdFromSupabase(id);
        if (report) {
            return report;
        }
    }

    const reports = await getAllReportsFromSheets(version);
    return reports.find(report => report.report_id === id || report.id === id) || null;
}

export async function allocateTicketNumber(version = 'v1') {
    if (isSupabaseEnabled()) {
        const ticketNumber = await allocateTicketNumberFromSupabase();
        if (ticketNumber) {
            return ticketNumber;
        }

        log.warn('Supabase ticket allocation unavailable, falling back to Google Sheets');
    }

    return generateSheetTicketNumber(version);
}

export async function createReport(reportData, version = 'v1') {
    if (isSupabaseEnabled()) {
        const savedReport = await appendReportToSupabase(reportData);
        if (savedReport) {
            void mirrorReportToSheets(reportData, version);
            return savedReport;
        }

        log.warn('Supabase report insert failed, falling back to Google Sheets', {
            reportId: reportData.reportId
        });
    }

    return appendReportToSheets(reportData, version);
}

export async function updateReportRecord(reportId, updates, version = 'v1') {
    if (!reportId) {
        throw new Error('reportId is required');
    }

    if (isSupabaseEnabled()) {
        const updated = await updateReportInSupabase(reportId, updates);
        if (updated) {
            void mirrorReportUpdateToSheets(reportId, updates, version);
            return true;
        }

        log.warn('Supabase report update failed, falling back to Google Sheets', { reportId });
    }

    await updateReportInSheets(reportId, updates, version);
    return true;
}

export default {
    allocateTicketNumber,
    createReport,
    getReportById,
    listReports,
    updateReportRecord
};
