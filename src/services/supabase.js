/**
 * Supabase Service
 * Dual-write database alongside Google Sheets
 * Graceful degradation: if SUPABASE_URL/KEY not set, all functions return null
 */

import { createClient } from '@supabase/supabase-js';
import { loggers } from '../utils/logger.js';

const log = loggers.api;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = (supabaseUrl && supabaseKey)
    ? createClient(supabaseUrl, supabaseKey)
    : null;

if (supabase) {
    log.info('Supabase client initialized');
} else {
    log.warn('Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY missing) — using Google Sheets only');
}

export function isSupabaseEnabled() {
    return !!supabase;
}

export function getSupabaseClient() {
    return supabase;
}

function parsePhotoMetadata(photoMetadata) {
    if (!photoMetadata) return null;
    if (typeof photoMetadata === 'object') return photoMetadata;

    try {
        return JSON.parse(photoMetadata);
    } catch (err) {
        log.warn('Supabase photo metadata parse failed', err.message);
        return null;
    }
}

// ─── REPORTS ─────────────────────────────────────────────────────────────────

export async function appendReportToSupabase(reportData) {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase.from('reports').insert({
            report_id: reportData.reportId,
            ticket_number: reportData.ticketNumber,
            timestamp: reportData.timestamp,
            user_id: reportData.userId,
            platform: reportData.userId?.startsWith('tg_') ? 'telegram' : 'line',
            phone: reportData.phone,
            nickname: reportData.nickname,
            problem_type: reportData.problemType,
            description: reportData.description,
            location_text: reportData.locationText,
            latitude: reportData.latitude ? parseFloat(reportData.latitude) : null,
            longitude: reportData.longitude ? parseFloat(reportData.longitude) : null,
            image_url: reportData.imageUrl,
            ai_summary: reportData.aiSummary,
            detailed_analysis: reportData.detailedAnalysis,
            smart_analysis: reportData.detailedCityAnalysis,
            urgency: reportData.urgency,
            status: reportData.status || 'received',
            ai_reaction: reportData.aiReaction,
            photo_metadata: parsePhotoMetadata(reportData.photoMetadata)
        }).select();

        if (error) throw error;
        log.info(`Supabase: report ${reportData.ticketNumber} saved`);
        return data?.[0] || null;
    } catch (err) {
        log.warn('Supabase report insert failed', err.message);
        return null;
    }
}

export async function updateReportInSupabase(reportId, updates) {
    if (!supabase) return null;
    try {
        const mapped = { updated_at: new Date().toISOString() };
        if ('status' in updates) mapped.status = updates.status;
        if ('staffName' in updates) mapped.staff_name = updates.staffName;
        if ('staffComment' in updates) mapped.staff_comment = updates.staffComment;
        if ('teamName' in updates) mapped.team_name = updates.teamName;
        if ('solutionImageUrl' in updates) mapped.solution_image_url = updates.solutionImageUrl;
        if ('ackTimestamp' in updates) mapped.ack_timestamp = updates.ackTimestamp;
        if ('inProgressTimestamp' in updates) mapped.in_progress_timestamp = updates.inProgressTimestamp;
        if ('completedTimestamp' in updates) mapped.completed_timestamp = updates.completedTimestamp;
        if ('problemType' in updates) mapped.problem_type = updates.problemType;
        if ('auditLog' in updates) mapped.audit_log = updates.auditLog;
        if ('categoryLocked' in updates) mapped.category_locked = updates.categoryLocked;
        if ('internalNotes' in updates) mapped.internal_notes = updates.internalNotes;
        if ('rating' in updates) mapped.rating = updates.rating;

        const { data: byReportId, error: byReportIdError } = await supabase.from('reports')
            .update(mapped)
            .eq('report_id', reportId)
            .select('report_id')
            .maybeSingle();

        if (byReportIdError) throw byReportIdError;
        if (byReportId) return true;

        const { data: byPrimaryId, error: byPrimaryIdError } = await supabase.from('reports')
            .update(mapped)
            .eq('id', reportId)
            .select('report_id')
            .maybeSingle();

        if (byPrimaryIdError) throw byPrimaryIdError;
        return !!byPrimaryId;
    } catch (err) {
        log.warn('Supabase report update failed', err.message);
        return null;
    }
}

export async function getReportByIdFromSupabase(id) {
    if (!supabase || !id) return null;

    try {
        const { data: byReportId, error: byReportIdError } = await supabase.from('reports')
            .select('*')
            .eq('report_id', id)
            .maybeSingle();

        if (byReportIdError) throw byReportIdError;
        if (byReportId) return byReportId;

        const { data: byPrimaryId, error: byPrimaryIdError } = await supabase.from('reports')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (byPrimaryIdError) throw byPrimaryIdError;
        return byPrimaryId || null;
    } catch (err) {
        log.warn('Supabase report lookup failed', err.message);
        return null;
    }
}

export async function getAllReportsFromSupabase() {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase.from('reports')
            .select('*')
            .order('timestamp', { ascending: false });

        if (error) throw error;

        // Map column names to match Google Sheets format (snake_case already matches)
        return data;
    } catch (err) {
        log.warn('Supabase reports query failed', err.message);
        return null;
    }
}

export async function allocateTicketNumberFromSupabase() {
    if (!supabase) return null;

    try {
        const { data, error } = await supabase.rpc('allocate_ticket_number');
        if (error) throw error;

        return data || null;
    } catch (err) {
        log.warn('Supabase ticket allocation failed', err.message);
        return null;
    }
}

// ─── CONVERSATION STATE ──────────────────────────────────────────────────────

export async function loadAllStatesFromSupabase() {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase.from('conversation_states')
            .select('user_id, state');

        if (error) throw error;

        const states = {};
        for (const row of data) {
            states[row.user_id] = row.state;
        }
        log.info(`Supabase: loaded ${data.length} conversation states`);
        return states;
    } catch (err) {
        log.warn('Supabase state load failed', err.message);
        return null;
    }
}

export async function saveStateToSupabase(userId, state) {
    if (!supabase) return;
    try {
        await supabase.from('conversation_states')
            .upsert({
                user_id: userId,
                state,
                updated_at: new Date().toISOString()
            });
    } catch (err) {
        // Silent — non-critical
    }
}

// ─── CONVERSATION MEMORY ─────────────────────────────────────────────────────

export async function loadMemoryFromSupabase() {
    if (!supabase) return null;
    try {
        // Load conversations (last 20 per user)
        const { data: convRows } = await supabase.from('conversation_memory')
            .select('user_id, role, content, timestamp')
            .order('timestamp', { ascending: true });

        // Load user facts
        const { data: factRows } = await supabase.from('user_facts')
            .select('user_id, fact, learned_at');

        // Load user meta
        const { data: metaRows } = await supabase.from('user_meta')
            .select('*');

        const conversations = {};
        for (const row of (convRows || [])) {
            if (!conversations[row.user_id]) conversations[row.user_id] = [];
            conversations[row.user_id].push({
                role: row.role,
                content: row.content,
                timestamp: row.timestamp
            });
            // Keep only last 20
            if (conversations[row.user_id].length > 20) {
                conversations[row.user_id] = conversations[row.user_id].slice(-20);
            }
        }

        const userFacts = {};
        for (const row of (factRows || [])) {
            if (!userFacts[row.user_id]) userFacts[row.user_id] = [];
            userFacts[row.user_id].push({ fact: row.fact, learnedAt: row.learned_at });
        }

        const userMeta = {};
        for (const row of (metaRows || [])) {
            userMeta[row.user_id] = {
                name: row.name,
                firstSeen: row.first_seen,
                lastSeen: row.last_seen,
                totalMessages: row.total_messages
            };
        }

        log.info(`Supabase: loaded memory for ${Object.keys(conversations).length} users`);
        return { conversations, userFacts, userMeta };
    } catch (err) {
        log.warn('Supabase memory load failed', err.message);
        return null;
    }
}

export async function saveConversationToSupabase(userId, role, content) {
    if (!supabase) return;
    try {
        await supabase.from('conversation_memory').insert({
            user_id: userId,
            role,
            content,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        // Silent — non-critical
    }
}

export async function saveFactToSupabase(userId, fact) {
    if (!supabase) return;
    try {
        await supabase.from('user_facts').upsert({
            user_id: userId,
            fact,
            learned_at: new Date().toISOString()
        });
    } catch (err) {
        // Silent — non-critical
    }
}

export async function saveUserMetaToSupabase(userId, meta) {
    if (!supabase) return;
    try {
        await supabase.from('user_meta').upsert({
            user_id: userId,
            name: meta.name || null,
            first_seen: meta.firstSeen || new Date().toISOString(),
            last_seen: meta.lastSeen || new Date().toISOString(),
            total_messages: meta.totalMessages || 0
        });
    } catch (err) {
        // Silent — non-critical
    }
}

// ─── IMAGE UPLOAD TO SUPABASE STORAGE ────────────────────────────────────────

export async function uploadImageToSupabase(buffer, filename) {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase.storage
            .from('report-images')
            .upload(filename, buffer, {
                contentType: 'image/jpeg',
                upsert: true
            });

        if (error) throw error;

        const { data: urlData } = supabase.storage
            .from('report-images')
            .getPublicUrl(filename);

        return urlData.publicUrl;
    } catch (err) {
        log.warn('Supabase image upload failed', err.message);
        return null;
    }
}

export default supabase;
