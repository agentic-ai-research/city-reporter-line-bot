import { randomUUID } from 'crypto';
import { MESSAGES } from '../config/index.js';
import { loggers } from '../utils/logger.js';
import { getSupabaseClient, isSupabaseEnabled } from './supabase.js';
import { notificationService } from './notification.service.js';
import { reportService } from './report.service.js';
import { socialListeningService } from './socialListening.js';

const log = loggers.db;
const WORKER_POLL_MS = Number.parseInt(process.env.MESSAGE_WORKER_POLL_MS || '1500', 10);
const MAX_OUTBOX_ATTEMPTS = Number.parseInt(process.env.MESSAGE_OUTBOX_MAX_ATTEMPTS || '5', 10);
const RETRY_BASE_MS = Number.parseInt(process.env.MESSAGE_OUTBOX_RETRY_MS || '5000', 10);
const PERSISTENT_QUEUE_COOLDOWN_MS = Number.parseInt(process.env.MESSAGE_QUEUE_DB_COOLDOWN_MS || '30000', 10);

const localState = {
    inbox: [],
    jobs: [],
    outbox: []
};

let workerTimer = null;
let workerTickActive = false;
let persistentQueueDisabledUntil = 0;

function nowIso() {
    return new Date().toISOString();
}

function queueMode() {
    if (process.env.BOT_QUEUE_MODE === 'memory') return 'memory';
    if (!isSupabaseEnabled() || !getSupabaseClient()) return 'memory';
    if (Date.now() < persistentQueueDisabledUntil) return 'memory';
    return 'supabase';
}

function disablePersistentQueue(reason) {
    persistentQueueDisabledUntil = Date.now() + PERSISTENT_QUEUE_COOLDOWN_MS;
    log.warn('Persistent queue disabled temporarily; falling back to memory queue', {
        reason,
        until: new Date(persistentQueueDisabledUntil).toISOString()
    });
}

function buildOutgoingMessages(result) {
    const messages = [];

    if (result?.response) {
        messages.push(result.response);
    }

    if (Array.isArray(result?.additionalMessages)) {
        messages.push(...result.additionalMessages.filter(Boolean));
    }

    return messages.length > 0 ? messages : [MESSAGES.errors.generic];
}

function formatMessagesForLog(messages) {
    return messages.map(msg => {
        if (typeof msg === 'string') return msg;
        if (msg?.type === 'text') return msg.text;
        if (msg?.altText) return msg.altText;
        return JSON.stringify(msg);
    }).join('\n');
}

function getFailureMessages(jobType) {
    if (jobType === 'image') {
        return ['วิเคราะห์รูปไม่สำเร็จครับ 😅 กรุณาส่งรูปอีกครั้งนะครับ 📸'];
    }

    if (jobType === 'location') {
        return ['ได้รับตำแหน่งแล้วครับ แต่ระบบยังอัปเดตเคสไม่สำเร็จ ลองส่งอีกครั้งได้เลยครับ 📍'];
    }

    return [MESSAGES.errors.generic];
}

function getLocationLogText(payload = {}) {
    if (payload.address) return `[Location Shared]: ${payload.address}`;
    if (payload.latitude != null && payload.longitude != null) {
        return `[Location Shared]: ${payload.latitude},${payload.longitude}`;
    }
    return '[Location Shared]';
}

function getRetryDelayMs(attempts) {
    return RETRY_BASE_MS * Math.max(1, 2 ** Math.max(0, attempts - 1));
}

function createLocalEnvelope(payload) {
    const createdAt = nowIso();

    const inbox = {
        id: randomUUID(),
        backend: 'memory',
        platform: payload.platform,
        user_id: payload.userId,
        message_type: payload.jobType,
        payload: payload.payload,
        raw_input: payload.rawInput || null,
        status: 'queued',
        error: null,
        created_at: createdAt,
        processed_at: null
    };

    const job = {
        id: randomUUID(),
        backend: 'memory',
        inbox_id: inbox.id,
        platform: payload.platform,
        user_id: payload.userId,
        job_type: payload.jobType,
        payload: payload.payload,
        raw_input: payload.rawInput || null,
        status: 'pending',
        attempts: 0,
        available_at: createdAt,
        locked_at: null,
        completed_at: null,
        last_error: null,
        created_at: createdAt,
        updated_at: createdAt
    };

    localState.inbox.push(inbox);
    localState.jobs.push(job);

    return { backend: 'memory', inboxId: inbox.id, jobId: job.id };
}

async function enqueuePersistent(payload) {
    const client = getSupabaseClient();
    const createdAt = nowIso();
    const inboxId = randomUUID();
    const jobId = randomUUID();

    const inboxRecord = {
        id: inboxId,
        platform: payload.platform,
        user_id: payload.userId,
        message_type: payload.jobType,
        payload: payload.payload,
        raw_input: payload.rawInput || null,
        status: 'queued',
        created_at: createdAt
    };

    const jobRecord = {
        id: jobId,
        inbox_id: inboxId,
        platform: payload.platform,
        user_id: payload.userId,
        job_type: payload.jobType,
        payload: payload.payload,
        status: 'pending',
        attempts: 0,
        available_at: createdAt,
        created_at: createdAt,
        updated_at: createdAt
    };

    const { error: inboxError } = await client.from('bot_inbox').insert(inboxRecord);
    if (inboxError) throw inboxError;

    const { error: jobError } = await client.from('ai_jobs').insert(jobRecord);
    if (jobError) throw jobError;

    return { backend: 'supabase', inboxId, jobId };
}

export async function enqueueMessageJob({ platform, userId, jobType, payload, rawInput = null }) {
    const envelope = { platform, userId, jobType, payload, rawInput };

    if (queueMode() === 'supabase') {
        try {
            return await enqueuePersistent(envelope);
        } catch (error) {
            disablePersistentQueue(error.message);
        }
    }

    return createLocalEnvelope(envelope);
}

function claimLocalJob() {
    const now = Date.now();
    const job = localState.jobs.find(item =>
        item.status === 'pending' &&
        (!item.available_at || new Date(item.available_at).getTime() <= now)
    );

    if (!job) return null;

    job.status = 'processing';
    job.attempts += 1;
    job.locked_at = nowIso();
    job.updated_at = job.locked_at;

    const inbox = localState.inbox.find(item => item.id === job.inbox_id);
    if (inbox) inbox.status = 'processing';

    return job;
}

async function claimPersistentJob() {
    const client = getSupabaseClient();
    const now = nowIso();
    const { data, error } = await client.from('ai_jobs')
        .select('*')
        .eq('status', 'pending')
        .lte('available_at', now)
        .order('created_at', { ascending: true })
        .limit(1);

    if (error) throw error;
    const nextJob = data?.[0];
    if (!nextJob) return null;

    const { data: claimedJob, error: claimError } = await client.from('ai_jobs')
        .update({
            status: 'processing',
            attempts: (nextJob.attempts || 0) + 1,
            locked_at: now,
            updated_at: now
        })
        .eq('id', nextJob.id)
        .eq('status', 'pending')
        .select('*')
        .maybeSingle();

    if (claimError) throw claimError;
    if (!claimedJob) return null;

    await client.from('bot_inbox')
        .update({ status: 'processing' })
        .eq('id', claimedJob.inbox_id);

    return { ...claimedJob, backend: 'supabase' };
}

async function claimNextJob() {
    if (queueMode() === 'supabase') {
        try {
            return await claimPersistentJob();
        } catch (error) {
            disablePersistentQueue(error.message);
        }
    }

    return claimLocalJob();
}

function completeLocalJob(job) {
    const timestamp = nowIso();
    job.status = 'completed';
    job.completed_at = timestamp;
    job.updated_at = timestamp;

    const inbox = localState.inbox.find(item => item.id === job.inbox_id);
    if (inbox) {
        inbox.status = 'completed';
        inbox.processed_at = timestamp;
        inbox.error = null;
    }
}

async function completePersistentJob(job) {
    const client = getSupabaseClient();
    const timestamp = nowIso();

    await client.from('ai_jobs')
        .update({
            status: 'completed',
            completed_at: timestamp,
            last_error: null,
            updated_at: timestamp
        })
        .eq('id', job.id);

    await client.from('bot_inbox')
        .update({
            status: 'completed',
            processed_at: timestamp,
            error: null
        })
        .eq('id', job.inbox_id);
}

async function completeJob(job) {
    if (job.backend === 'supabase') {
        try {
            await completePersistentJob(job);
        } catch (error) {
            disablePersistentQueue(error.message);
        }

        return;
    }

    completeLocalJob(job);
}

function failLocalJob(job, error) {
    const timestamp = nowIso();
    job.status = 'failed';
    job.completed_at = timestamp;
    job.updated_at = timestamp;
    job.last_error = error.message;

    const inbox = localState.inbox.find(item => item.id === job.inbox_id);
    if (inbox) {
        inbox.status = 'failed';
        inbox.processed_at = timestamp;
        inbox.error = error.message;
    }
}

async function failPersistentJob(job, error) {
    const client = getSupabaseClient();
    const timestamp = nowIso();

    await client.from('ai_jobs')
        .update({
            status: 'failed',
            completed_at: timestamp,
            last_error: error.message,
            updated_at: timestamp
        })
        .eq('id', job.id);

    await client.from('bot_inbox')
        .update({
            status: 'failed',
            processed_at: timestamp,
            error: error.message
        })
        .eq('id', job.inbox_id);
}

async function failJob(job, error) {
    if (job.backend === 'supabase') {
        try {
            await failPersistentJob(job, error);
        } catch (persistError) {
            disablePersistentQueue(persistError.message);
        }

        return;
    }

    failLocalJob(job, error);
}

function createLocalOutbox({ sourceJobId, platform, userId, messages }) {
    const record = {
        id: randomUUID(),
        backend: 'memory',
        source_job_id: sourceJobId || null,
        platform,
        user_id: userId,
        messages,
        status: 'pending',
        attempts: 0,
        available_at: nowIso(),
        delivered_at: null,
        last_error: null,
        created_at: nowIso(),
        updated_at: nowIso()
    };

    localState.outbox.push(record);
    return record;
}

async function createPersistentOutbox({ sourceJobId, platform, userId, messages }) {
    const client = getSupabaseClient();
    const timestamp = nowIso();
    const record = {
        id: randomUUID(),
        source_job_id: sourceJobId || null,
        platform,
        user_id: userId,
        messages,
        status: 'pending',
        attempts: 0,
        available_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp
    };

    const { error } = await client.from('bot_outbox').insert(record);
    if (error) throw error;

    return { ...record, backend: 'supabase' };
}

async function enqueueOutboxRecord(record) {
    if (queueMode() === 'supabase') {
        try {
            return await createPersistentOutbox(record);
        } catch (error) {
            disablePersistentQueue(error.message);
        }
    }

    return createLocalOutbox(record);
}

function claimLocalOutbox() {
    const now = Date.now();
    const item = localState.outbox.find(record =>
        record.status === 'pending' &&
        (!record.available_at || new Date(record.available_at).getTime() <= now)
    );

    if (!item) return null;

    item.status = 'processing';
    item.attempts += 1;
    item.updated_at = nowIso();
    return item;
}

async function claimPersistentOutbox() {
    const client = getSupabaseClient();
    const now = nowIso();
    const { data, error } = await client.from('bot_outbox')
        .select('*')
        .eq('status', 'pending')
        .lte('available_at', now)
        .order('created_at', { ascending: true })
        .limit(1);

    if (error) throw error;
    const nextItem = data?.[0];
    if (!nextItem) return null;

    const { data: claimedItem, error: claimError } = await client.from('bot_outbox')
        .update({
            status: 'processing',
            attempts: (nextItem.attempts || 0) + 1,
            updated_at: now
        })
        .eq('id', nextItem.id)
        .eq('status', 'pending')
        .select('*')
        .maybeSingle();

    if (claimError) throw claimError;
    return claimedItem ? { ...claimedItem, backend: 'supabase' } : null;
}

async function claimNextOutbox() {
    if (queueMode() === 'supabase') {
        try {
            return await claimPersistentOutbox();
        } catch (error) {
            disablePersistentQueue(error.message);
        }
    }

    return claimLocalOutbox();
}

function markLocalOutboxDelivered(item) {
    item.status = 'delivered';
    item.delivered_at = nowIso();
    item.last_error = null;
    item.updated_at = item.delivered_at;
}

async function markPersistentOutboxDelivered(item) {
    const client = getSupabaseClient();
    const timestamp = nowIso();

    await client.from('bot_outbox')
        .update({
            status: 'delivered',
            delivered_at: timestamp,
            last_error: null,
            updated_at: timestamp
        })
        .eq('id', item.id);
}

async function markOutboxDelivered(item) {
    if (item.backend === 'supabase') {
        try {
            await markPersistentOutboxDelivered(item);
        } catch (error) {
            disablePersistentQueue(error.message);
        }

        return;
    }

    markLocalOutboxDelivered(item);
}

function rescheduleLocalOutbox(item, error) {
    const timestamp = nowIso();
    const shouldRetry = item.attempts < MAX_OUTBOX_ATTEMPTS;

    item.status = shouldRetry ? 'pending' : 'failed';
    item.available_at = shouldRetry
        ? new Date(Date.now() + getRetryDelayMs(item.attempts)).toISOString()
        : item.available_at;
    item.last_error = error.message;
    item.updated_at = timestamp;
}

async function reschedulePersistentOutbox(item, error) {
    const client = getSupabaseClient();
    const timestamp = nowIso();
    const shouldRetry = item.attempts < MAX_OUTBOX_ATTEMPTS;

    await client.from('bot_outbox')
        .update({
            status: shouldRetry ? 'pending' : 'failed',
            available_at: shouldRetry
                ? new Date(Date.now() + getRetryDelayMs(item.attempts)).toISOString()
                : item.available_at,
            last_error: error.message,
            updated_at: timestamp
        })
        .eq('id', item.id);
}

async function rescheduleOutbox(item, error) {
    if (item.backend === 'supabase') {
        try {
            await reschedulePersistentOutbox(item, error);
        } catch (persistError) {
            disablePersistentQueue(persistError.message);
        }

        return;
    }

    rescheduleLocalOutbox(item, error);
}

async function processQueuedJob(job) {
    switch (job.job_type) {
        case 'text': {
            const result = await reportService.processText(job.user_id, job.payload.text, job.platform);
            return {
                messages: buildOutgoingMessages(result),
                userMessage: job.raw_input || job.payload.text
            };
        }

        case 'image': {
            const buffer = Buffer.from(job.payload.imageBase64, 'base64');
            const result = await reportService.processImage(job.user_id, buffer, job.platform);
            return {
                messages: [result.magicEyeResponse, result.followUpResponse].filter(Boolean),
                userMessage: job.raw_input || '[Image Uploaded]'
            };
        }

        case 'location': {
            const result = await reportService.processLocation(
                job.user_id,
                job.payload.latitude,
                job.payload.longitude,
                job.payload.address,
                job.platform
            );

            return {
                messages: [result.response],
                userMessage: job.raw_input || getLocationLogText(job.payload)
            };
        }

        default:
            throw new Error(`Unsupported job type: ${job.job_type}`);
    }
}

async function logQueuedConversation(job, userMessage, messages) {
    try {
        await socialListeningService.logConversation(
            job.user_id,
            userMessage,
            formatMessagesForLog(messages),
            job.platform
        );
    } catch (error) {
        log.warn('Queued conversation log failed', {
            jobId: job.id,
            message: error.message
        });
    }
}

async function processNextJob() {
    const job = await claimNextJob();
    if (!job) return false;

    try {
        const { messages, userMessage } = await processQueuedJob(job);
        await logQueuedConversation(job, userMessage, messages);
        await enqueueOutboxRecord({
            sourceJobId: job.id,
            platform: job.platform,
            userId: job.user_id,
            messages
        });
        await completeJob(job);
    } catch (error) {
        log.error('Queued job processing failed', error, {
            jobId: job.id,
            jobType: job.job_type,
            platform: job.platform
        });

        await failJob(job, error);
        await enqueueOutboxRecord({
            sourceJobId: job.id,
            platform: job.platform,
            userId: job.user_id,
            messages: getFailureMessages(job.job_type)
        });
    }

    return true;
}

async function processNextOutbox() {
    const item = await claimNextOutbox();
    if (!item) return false;

    try {
        const delivered = await notificationService.sendToUser(item.user_id, item.messages);
        if (!delivered) {
            throw new Error('Notification delivery returned false');
        }

        await markOutboxDelivered(item);
    } catch (error) {
        log.warn('Outbox delivery failed', {
            outboxId: item.id,
            userId: item.user_id,
            attempt: item.attempts,
            message: error.message
        });
        await rescheduleOutbox(item, error);
    }

    return true;
}

export async function processMessageQueueTick() {
    if (workerTickActive) return false;

    workerTickActive = true;

    try {
        const processedJob = await processNextJob();
        const processedOutbox = await processNextOutbox();
        return processedJob || processedOutbox;
    } finally {
        workerTickActive = false;
    }
}

export function startMessageWorker() {
    if (workerTimer) return;

    workerTimer = setInterval(() => {
        processMessageQueueTick().catch(error => {
            log.error('Message queue tick failed', error);
        });
    }, WORKER_POLL_MS);
    workerTimer.unref?.();

    void processMessageQueueTick().catch(error => {
        log.error('Initial message queue tick failed', error);
    });

    log.info(`Message queue worker started (${queueMode()} backend)`, {
        pollMs: WORKER_POLL_MS
    });
}

export function stopMessageWorker() {
    if (!workerTimer) return;

    clearInterval(workerTimer);
    workerTimer = null;
}

export function getQueueHealthSnapshot() {
    const pendingJobs = localState.jobs.filter(item => item.status === 'pending').length;
    const pendingOutbox = localState.outbox.filter(item => item.status === 'pending').length;

    return {
        backend: queueMode(),
        workerRunning: !!workerTimer,
        pendingJobs: queueMode() === 'memory' ? pendingJobs : null,
        pendingOutbox: queueMode() === 'memory' ? pendingOutbox : null
    };
}

export function resetMessageQueueForTests() {
    stopMessageWorker();
    localState.inbox.length = 0;
    localState.jobs.length = 0;
    localState.outbox.length = 0;
    workerTickActive = false;
    persistentQueueDisabledUntil = 0;
}

export default {
    enqueueMessageJob,
    getQueueHealthSnapshot,
    processMessageQueueTick,
    resetMessageQueueForTests,
    startMessageWorker,
    stopMessageWorker
};
