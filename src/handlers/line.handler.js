/**
 * LINE Webhook Handler (Refactored)
 * Slim handler - all business logic delegated to services
 */

import { lineBlobClient } from '../services/lineClient.js';
import { enqueueMessageJob } from '../services/messageQueue.service.js';
import { reportService } from '../services/report.service.js';
import { notificationService } from '../services/notification.service.js';
import { socialListeningService } from '../services/socialListening.js';
import { loggers } from '../utils/logger.js';
import { MESSAGES } from '../config/index.js';

const log = loggers.line;
const TEXT_REPLY_DEADLINE_MS = Number.parseInt(process.env.LINE_REPLY_DEADLINE_MS || '12000', 10);
const DELAYED_TEXT_ACK = 'รับข้อความแล้วครับ กำลังประมวลผลให้อยู่นะครับ';

function getLineSourceId(source = {}) {
    return source.userId || source.groupId || source.roomId || null;
}

function maskId(id) {
    return id ? id.substring(0, 8) : 'unknown';
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

function logConversation(userId, userMessage, outgoingMessages) {
    void socialListeningService.logConversation(
        userId,
        userMessage,
        formatMessagesForLog(outgoingMessages),
        'line'
    );
}

async function settleWithin(promise, timeoutMs) {
    return Promise.race([
        promise.then(
            value => ({ status: 'resolved', value }),
            error => ({ status: 'rejected', error })
        ),
        new Promise(resolve => setTimeout(() => resolve({ status: 'pending' }), timeoutMs))
    ]);
}

async function sendPushOnly(userId, messages) {
    if (!userId) {
        log.warn('Cannot push LINE result without a source id');
        return false;
    }

    const delivered = await notificationService.sendToLine(userId, messages);
    if (!delivered) {
        log.error('LINE push delivery failed after delayed processing', null, { userId: maskId(userId) });
    }
    return delivered;
}

/**
 * Handle incoming LINE webhook events
 */
export async function handleWebhookEvent(event) {
    const userId = getLineSourceId(event.source);
    const replyToken = event.replyToken;

    if (event.type === 'follow') {
        await sendReply(replyToken, MESSAGES.welcome, userId);
        return;
    }

    if (event.type === 'join') {
        await sendReply(replyToken, 'สวัสดีครับ! ส่งรูปหรือพิมพ์ "แจ้งปัญหา" ได้เลยครับ', userId);
        return;
    }

    if (event.type !== 'message') {
        log.info('Ignoring unsupported LINE event', {
            eventType: event.type,
            sourceType: event.source?.type || 'unknown'
        });
        return;
    }

    log.platform('line', event.message.type, userId, {
        messageType: event.message.type,
        sourceType: event.source?.type || 'unknown'
    });

    try {
        switch (event.message.type) {
            case 'text':
                await handleTextMessage(userId, replyToken, event.message.text);
                break;

            case 'image':
                await handleImageMessage(userId, replyToken, event.message.id);
                break;

            case 'location':
                await handleLocationMessage(userId, replyToken, event.message);
                break;

            default:
                await sendReply(replyToken, MESSAGES.errors.unsupported, userId);
        }
    } catch (error) {
        log.error('Webhook event error', error, {
            userId: maskId(userId),
            eventType: event.type,
            messageType: event.message?.type || 'unknown'
        });
        await sendReply(replyToken, MESSAGES.errors.generic, userId);
    }
}

/**
 * Handle text messages
 */
async function handleTextMessage(userId, replyToken, text) {
    const resultPromise = reportService.processText(userId, text, 'line');
    const settled = await settleWithin(resultPromise, TEXT_REPLY_DEADLINE_MS);

    if (settled.status === 'rejected') {
        throw settled.error;
    }

    if (settled.status === 'resolved') {
        const outgoingMessages = buildOutgoingMessages(settled.value);
        logConversation(userId, text, outgoingMessages);
        await sendReply(replyToken, outgoingMessages, userId);
        return;
    }

    log.warn('Text processing exceeded LINE reply deadline; sending acknowledgement first', {
        userId: maskId(userId),
        deadlineMs: TEXT_REPLY_DEADLINE_MS
    });

    const acknowledged = replyToken
        ? await notificationService.replyToLine(replyToken, DELAYED_TEXT_ACK)
        : false;

    try {
        const result = await resultPromise;
        const outgoingMessages = buildOutgoingMessages(result);
        logConversation(userId, text, outgoingMessages);

        if (acknowledged) {
            await sendPushOnly(userId, outgoingMessages);
        } else {
            await sendReply(replyToken, outgoingMessages, userId);
        }
    } catch (error) {
        log.error('Delayed LINE text processing failed', error, { userId: maskId(userId) });

        if (acknowledged) {
            await sendPushOnly(userId, MESSAGES.errors.generic);
            return;
        }

        throw error;
    }
}

/**
 * Handle image messages
 * Strategy: Send immediate ack via replyToken (fast, free), then push analysis result
 * This prevents replyToken expiration during slow AI processing (10-60s)
 */
async function handleImageMessage(userId, replyToken, messageId) {
    // 1. IMMEDIATELY acknowledge receipt (replyToken expires in ~30s)
    await sendReply(replyToken, 'ได้รับรูปแล้วครับ! 📸 กำลังวิเคราะห์...', userId);
    let buffer = null;

    try {
        // 2. Fetch image content from LINE
        const imageResponse = await lineBlobClient.getMessageContent(messageId);

        const chunks = [];
        for await (const chunk of imageResponse) {
            chunks.push(chunk);
        }
        buffer = Buffer.concat(chunks);

        log.debug(`Image received`, { size: buffer.length });

        await enqueueMessageJob({
            platform: 'line',
            userId,
            jobType: 'image',
            payload: { imageBase64: buffer.toString('base64') },
            rawInput: '[Image Uploaded]'
        });

    } catch (error) {
        log.error('Image queue handler error', error);

        if (buffer) {
            try {
                const result = await reportService.processImage(userId, buffer, 'line');
                await notificationService.sendToLine(
                    userId,
                    [result.magicEyeResponse, result.followUpResponse].filter(Boolean)
                );
                return;
            } catch (fallbackError) {
                log.error('Image handler fallback error', fallbackError);
            }
        }

        // Push error message (replyToken already used)
        await notificationService.sendToLine(userId, [
            'วิเคราะห์รูปไม่สำเร็จครับ 😅 กรุณาส่งรูปอีกครั้งนะครับ 📸'
        ]);
    }
}

/**
 * Handle location messages
 */
async function handleLocationMessage(userId, replyToken, location) {
    const result = await reportService.processLocation(
        userId,
        location.latitude,
        location.longitude,
        location.address,
        'line'
    );

    // Log to Social Listening
    socialListeningService.logConversation(
        userId,
        `[Location Shared]: ${location.address || `${location.latitude},${location.longitude}`}`,
        result.response,
        'line'
    );

    await sendReply(replyToken, result.response, userId);
}

/**
 * Send reply - uses replyToken FIRST (free, no monthly limit)
 * Only falls back to push if replyToken fails/expired
 */
async function sendReply(replyToken, messages, userId = null) {
    const msgArray = Array.isArray(messages) ? messages : [messages];
    const previewMessage = typeof msgArray[0] === 'string'
        ? msgArray[0]
        : msgArray[0]?.text || msgArray[0]?.altText || 'message';

    log.debug(`Sending reply`, {
        count: msgArray.length,
        preview: previewMessage.substring(0, 30),
        hasUserId: !!userId
    });

    // Try replyToken FIRST — free, no monthly limit
    if (replyToken) {
        try {
            const result = await notificationService.replyToLine(replyToken, msgArray);
            if (result) return true;
        } catch (replyErr) {
            log.warn('ReplyToken failed (may be expired), trying push...', replyErr.message);
        }
    }

    // Fallback to push (subject to monthly limit)
    if (userId) {
        const success = await notificationService.sendToLine(userId, msgArray);
        if (success) return true;
        log.warn('Push also failed');
    }

    log.error('Both replyToken and push failed — message NOT delivered');
    return false;
}

export default { handleWebhookEvent };
