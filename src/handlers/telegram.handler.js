/**
 * Telegram Bot Handler (Refactored)
 * Slim handler - all business logic delegated to services
 */

import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import axios from 'axios';
import { reportService } from '../services/report.service.js';
import { notificationService } from '../services/notification.service.js';
import { socialListeningService } from '../services/socialListening.js';
import { enqueueMessageJob } from '../services/messageQueue.service.js';
import { loggers } from '../utils/logger.js';
import { MESSAGES } from '../config/index.js';
import { conversationManager } from './conversationFlow.js';

const log = loggers.telegram;
const TELEGRAM_TEXT_ACK = 'รับข้อความแล้วครับ กำลังประมวลผลให้อยู่นะครับ';
const TELEGRAM_IMAGE_ACK = 'ได้รับรูปแล้วครับ! 📸 กำลังวิเคราะห์...';
const TELEGRAM_LOCATION_ACK = 'ได้รับตำแหน่งแล้วครับ! 📍 กำลังอัปเดตเคสให้...';

/**
 * Get user ID with Telegram prefix
 */
const getUserId = (ctx) => `tg_${ctx.from.id}`;

/**
 * Send reply to Telegram context
 */
const sendReply = async (ctx, messages) => {
    const msgArray = Array.isArray(messages) ? messages : [messages];
    return notificationService.replyToTelegram(ctx, msgArray);
};

async function sendResultReply(ctx, result) {
    if (result.additionalMessages) {
        await sendReply(ctx, result.response);
        for (const msg of result.additionalMessages) {
            await sendReply(ctx, msg);
        }
        return;
    }

    await sendReply(ctx, result.response);
}

/**
 * Create and configure a Telegram bot instance
 */
export function createBot(token) {
    if (!token) return null;

    const bot = new Telegraf(token);
    setupBot(bot);
    return bot;
}

/**
 * Setup bot handlers
 */
function setupBot(bot) {

    // Handle text messages
    bot.on(message('text'), async (ctx) => {
        const userId = getUserId(ctx);
        const text = ctx.message.text;

        log.platform('telegram', 'text', userId, { preview: text.substring(0, 30) });

        try {
            // Handle role switching commands (Telegram-specific)
            const lowerText = text.trim().toLowerCase();

            if (lowerText === '/roles' || lowerText === 'เปลี่ยนโหมด') {
                await sendReply(ctx, getRolesMessage());
                return;
            }

            if (isRoleSwitch(lowerText)) {
                await handleRoleSwitch(ctx, userId, lowerText);
                return;
            }

            await sendReply(ctx, TELEGRAM_TEXT_ACK);
            await enqueueMessageJob({
                platform: 'telegram',
                userId,
                jobType: 'text',
                payload: { text },
                rawInput: text
            });

        } catch (error) {
            log.error('Text queue handler error', error);

            try {
                const result = await reportService.processText(userId, text, 'telegram');
                socialListeningService.logConversation(
                    userId,
                    text,
                    typeof result.response === 'string' ? result.response : JSON.stringify(result.response),
                    'telegram'
                );
                await sendResultReply(ctx, result);
            } catch (fallbackError) {
                log.error('Text handler fallback error', fallbackError);
                await sendReply(ctx, MESSAGES.errors.generic);
            }
        }
    });

    // Handle photos
    bot.on(message('photo'), async (ctx) => {
        const userId = getUserId(ctx);
        let buffer = null;

        log.platform('telegram', 'photo', userId);

        try {
            await ctx.sendChatAction('upload_photo');
            await sendReply(ctx, TELEGRAM_IMAGE_ACK);

            // Get largest photo
            const photo = ctx.message.photo.pop();
            const fileLink = await ctx.telegram.getFileLink(photo.file_id);

            // Download image
            const response = await axios({
                url: fileLink.href,
                responseType: 'arraybuffer'
            });
            buffer = Buffer.from(response.data);

            await enqueueMessageJob({
                platform: 'telegram',
                userId,
                jobType: 'image',
                payload: { imageBase64: buffer.toString('base64') },
                rawInput: '[Image Uploaded]'
            });

        } catch (error) {
            log.error('Photo queue handler error', error, {
                message: error.message,
                stack: error.stack,
                description: error.description // Telegram API often sends description
            });

            if (buffer) {
                try {
                    const result = await reportService.processImage(userId, buffer, 'telegram');
                    await sendReply(ctx, result.magicEyeResponse);
                    if (result.followUpResponse) {
                        await sendReply(ctx, result.followUpResponse);
                    }
                    return;
                } catch (fallbackError) {
                    log.error('Photo handler fallback error', fallbackError);
                }
            }

            await sendReply(ctx, 'วิเคราะห์รูปไม่สำเร็จครับ 😅 กรุณาส่งรูปอีกครั้งนะครับ 📸');
        }
    });

    // Handle location
    bot.on(message('location'), async (ctx) => {
        const userId = getUserId(ctx);
        const { latitude, longitude } = ctx.message.location;

        log.platform('telegram', 'location', userId, { lat: latitude, lng: longitude });

        try {
            await sendReply(ctx, TELEGRAM_LOCATION_ACK);
            await enqueueMessageJob({
                platform: 'telegram',
                userId,
                jobType: 'location',
                payload: {
                    latitude,
                    longitude,
                    address: 'Pinned via Telegram'
                },
                rawInput: `[Location Shared]: ${latitude},${longitude}`
            });

        } catch (error) {
            log.error('Location queue handler error', error);

            try {
                const result = await reportService.processLocation(
                    userId,
                    latitude,
                    longitude,
                    'Pinned via Telegram',
                    'telegram'
                );

                socialListeningService.logConversation(
                    userId,
                    `[Location Shared]: ${latitude},${longitude}`,
                    result.response,
                    'telegram'
                );

                await sendReply(ctx, result.response);
            } catch (fallbackError) {
                log.error('Location handler fallback error', fallbackError);
                await sendReply(ctx, 'ได้รับตำแหน่งแล้วครับ! 📍');
            }
        }
    });
}

/**
 * Get roles menu message
 */
function getRolesMessage() {
    return `🎭 เลือกโหมดที่คุณต้องการได้เลยครับ:

1. 👷 City Reporter (แจ้งปัญหาเมือง)
2. 👫 Friend (เพื่อนคุยแก้เหงา)
3. 🧠 Psychologist (ที่ปรึกษาส่วนตัว)
4. 🩺 Therapist (นักบำบัดจิตใจ)

พิมพ์ชื่อโหมดที่ต้องการเลือกได้เลยครับ! (เช่น "Friend", "Reporter")`;
}

/**
 * Check if text is a role switch command
 */
function isRoleSwitch(text) {
    return ['friend', 'psychologist', 'therapist', 'reporter', 'city reporter'].includes(text);
}

/**
 * Handle role switching
 */
async function handleRoleSwitch(ctx, userId, text) {
    const newRole = text === 'city reporter' ? 'reporter' : text;

    conversationManager.reset(userId);
    conversationManager.updateState(userId, { role: newRole, step: 'idle' });

    const messages = {
        reporter: 'เปลี่ยนเป็นโหมด City Reporter เรียบร้อยครับ 👷 มีปัญหาอะไรแจ้งผมได้เลย!',
        friend: 'โอเคครับ! ตอนนี้เราเป็นเพื่อนกันแล้วนะ มีอะไรเม้าท์มาได้เลย 👫',
        psychologist: 'สวัสดีครับ ผมพร้อมรับฟังทุกปัญหาของคุณแล้วครับ 🧠',
        therapist: 'ยินดีต้อนรับครับ ให้ผมช่วยดูแลจิตใจของคุณนะครับ 🩺'
    };

    await sendReply(ctx, messages[newRole] || messages.reporter);
}

export default { createBot };
