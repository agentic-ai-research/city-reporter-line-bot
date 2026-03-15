/**
 * Notification Service
 * Handles sending notifications to LINE and Telegram users
 */

import { lineClient } from './lineClient.js';
import { loggers } from '../utils/logger.js';

import { createStatusUpdate } from '../utils/flexMessages.js';

const log = loggers.api;
const LINE_MAX_MESSAGES = 5;
const LINE_TEXT_LIMIT = 5000;
const LINE_FALLBACK_TEXT = 'ขออภัยครับ ระบบยังไม่มีข้อความตอบกลับในตอนนี้';

// Telegram bots array (populated by index.js)
let telegramBots = [];

function splitLineText(text) {
    const normalized = String(text ?? '').trim();
    if (!normalized) return [];

    const chunks = [];
    let remaining = normalized;

    while (remaining.length > LINE_TEXT_LIMIT) {
        let splitAt = remaining.lastIndexOf('\n', LINE_TEXT_LIMIT);
        if (splitAt < Math.floor(LINE_TEXT_LIMIT * 0.5)) {
            splitAt = remaining.lastIndexOf(' ', LINE_TEXT_LIMIT);
        }
        if (splitAt <= 0) {
            splitAt = LINE_TEXT_LIMIT;
        }

        chunks.push(remaining.slice(0, splitAt).trim());
        remaining = remaining.slice(splitAt).trim();
    }

    if (remaining) {
        chunks.push(remaining);
    }

    return chunks;
}

export function normalizeLineMessages(messages) {
    const sourceMessages = (Array.isArray(messages) ? messages : [messages]).filter(Boolean);
    const normalized = [];

    for (const msg of sourceMessages) {
        if (typeof msg === 'string') {
            splitLineText(msg).forEach(text => normalized.push({ type: 'text', text }));
            continue;
        }

        if (msg?.type === 'text') {
            splitLineText(msg.text).forEach(text => normalized.push({ ...msg, text }));
            continue;
        }

        if (msg) {
            normalized.push(msg);
        }
    }

    if (normalized.length === 0) {
        normalized.push({ type: 'text', text: LINE_FALLBACK_TEXT });
    }

    if (normalized.length > LINE_MAX_MESSAGES) {
        log.warn('LINE message payload truncated to platform limit', {
            originalCount: normalized.length,
            limit: LINE_MAX_MESSAGES
        });
    }

    return normalized.slice(0, LINE_MAX_MESSAGES);
}

/**
 * Set Telegram bots (called during initialization)
 */
export function setTelegramBots(bots) {
    telegramBots = bots;
}

/**
 * Get Telegram bots
 */
export function getTelegramBots() {
    return telegramBots;
}

/**
 * Notification Service Class
 */
class NotificationService {

    /**
     * Send message to user (auto-detects platform)
     */
    async sendToUser(userId, messages) {
        if (!userId) {
            log.warn('Cannot send notification: no userId');
            return false;
        }

        // Normalize messages to array
        const msgArray = Array.isArray(messages) ? messages : [messages];

        if (userId.startsWith('tg_')) {
            return this.sendToTelegram(userId.replace('tg_', ''), msgArray);
        } else {
            return this.sendToLine(userId, msgArray);
        }
    }

    /**
     * Send message to LINE user
     */
    async sendToLine(userId, messages) {
        try {
            const lineMessages = normalizeLineMessages(messages);

            log.info(`📤 LINE push attempt to ${userId.substring(0, 8)}...`, {
                messageCount: lineMessages.length,
                preview: lineMessages[0]?.text?.substring(0, 30) || 'non-text'
            });

            await lineClient.pushMessage({
                to: userId,
                messages: lineMessages
            });

            log.info(`✅ LINE notification sent to ${userId.substring(0, 8)}...`);
            return true;

        } catch (error) {
            // Capture full error details
            const errorDetails = {
                userId: userId?.substring(0, 8),
                message: error.message,
                status: error.statusCode || error.status,
                body: error.body || error.response?.data,
                originalError: error.originalError?.message
            };

            // High-visibility warning for monthly limit
            if (errorDetails.status === 429 || (typeof errorDetails.body === 'string' && errorDetails.body.includes('monthly limit'))) {
                log.warn('🚨 LINE Monthly Message Limit Reached! Push notifications will fail until the limit resets.', errorDetails);
                console.warn('\n⚠️ [LIMIT REACHED] LINE Official Account has reached its 200/month push limit. Please upgrade your plan or wait for the reset.\n');
            } else {
                log.error('❌ LINE notification failed', error, errorDetails);
            }

            console.error('LINE_PUSH_ERROR:', JSON.stringify(errorDetails, null, 2));

            return false;
        }
    }

    /**
     * Send message to Telegram user
     */
    async sendToTelegram(chatId, messages) {
        if (telegramBots.length === 0) {
            log.warn('No Telegram bots available for notification');
            return false;
        }

        let allSent = true;
        for (const msg of messages) {
            let sent = false;

            // Try each bot until one succeeds
            for (const bot of telegramBots) {
                if (sent) break;

                try {
                    if (typeof msg === 'string') {
                        await bot.telegram.sendMessage(chatId, msg);
                        sent = true;
                    } else if (msg.type === 'text') {
                        await bot.telegram.sendMessage(chatId, msg.text);
                        sent = true;
                    } else if (msg.type === 'image') {
                        await bot.telegram.sendPhoto(chatId, msg.originalContentUrl || msg.url);
                        sent = true;
                    }
                } catch (e) {
                    // Expected for wrong bot, try next
                }
            }

            if (!sent) {
                log.warn(`Failed to send Telegram notification to ${chatId} via any bot`);
                allSent = false;
            }
        }

        if (allSent) log.info(`Telegram notification sent to ${chatId}`);
        return allSent;
    }

    /**
     * Send status update notification
     */
    async sendStatusUpdate(userId, status, ticketNumber, details = {}) {
        const { teamName, staffComment, solutionImageUrl } = details;

        // Create Flex Message
        const flexMessage = createStatusUpdate({
            ticketNumber,
            status,
            teamName,
            staffComment,
            solutionImageUrl,
            timestamp: new Date().toLocaleString('th-TH')
        });

        // Add encouraging text fallback for Telegram or non-flex clients
        // (Though sendToUser determines platform, Telegram doesn't support Flex, so we might need conditional logic if we support Telegram)
        // For now, assuming LINE primary, but let's check platform.
        // The sendToUser checks startsWith('tg_').

        if (userId.startsWith('tg_')) {
            // Fallback text for Telegram
            const timestamp = new Date().toLocaleString('th-TH');
            let text = `📣 อัปเดตสถานะ #${ticketNumber}: ${status}\n\n`;
            text += `💬 ${staffComment || '-'}\n`;
            text += `🕑 ${timestamp}`;

            if (status === 'completed' && solutionImageUrl) {
                return this.sendToUser(userId, [{ type: 'image', url: solutionImageUrl, caption: text }]);
            } else {
                return this.sendToUser(userId, text);
            }
        }

        // Send Flex Message to LINE
        return this.sendToUser(userId, flexMessage);
    }

    /**
     * Reply using replyToken (LINE only)
     */
    async replyToLine(replyToken, messages) {
        try {
            const lineMessages = normalizeLineMessages(messages);

            log.info(`📤 LINE reply attempt with token ${replyToken?.substring(0, 8)}...`, {
                messageCount: lineMessages.length,
                preview: lineMessages[0]?.text?.substring(0, 30) || 'non-text'
            });

            await lineClient.replyMessage({
                replyToken,
                messages: lineMessages
            });

            log.info(`✅ LINE reply sent`);
            return true;

        } catch (error) {
            const errorDetails = {
                replyToken: replyToken?.substring(0, 8),
                message: error.message,
                status: error.statusCode || error.status,
                body: error.body || error.response?.data
            };

            log.error('❌ LINE reply failed', error, errorDetails);
            console.error('LINE_REPLY_ERROR:', JSON.stringify(errorDetails, null, 2));

            return false;
        }
    }

    /**
     * Reply to Telegram context
     */
    async replyToTelegram(ctx, messages) {
        try {
            const msgArray = Array.isArray(messages) ? messages : [messages];

            for (const msg of msgArray) {
                if (typeof msg === 'string') {
                    await ctx.reply(msg);
                } else if (msg.type === 'text') {
                    await ctx.reply(msg.text);
                } else if (msg.type === 'image') {
                    await ctx.replyWithPhoto(msg.originalContentUrl || msg.url);
                }
            }

            return true;

        } catch (error) {
            log.error('Telegram reply failed', error);
            return false;
        }
    }
}

// Singleton instance
export const notificationService = new NotificationService();
export default notificationService;
