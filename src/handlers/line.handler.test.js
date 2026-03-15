import test from 'node:test';
import assert from 'node:assert/strict';

process.env.LINE_REPLY_DEADLINE_MS = '20';

const { handleWebhookEvent } = await import('./line.handler.js');
const { reportService } = await import('../services/report.service.js');
const { notificationService, normalizeLineMessages } = await import('../services/notification.service.js');
const { socialListeningService } = await import('../services/socialListening.js');

function createTextEvent(text = 'hello') {
    return {
        type: 'message',
        replyToken: 'reply-token-123',
        source: {
            type: 'user',
            userId: 'U1234567890abcdef'
        },
        message: {
            type: 'text',
            text
        }
    };
}

test('LINE text replies immediately when processing completes within deadline', async (t) => {
    const originalProcessText = reportService.processText;
    const originalReplyToLine = notificationService.replyToLine;
    const originalSendToLine = notificationService.sendToLine;
    const originalLogConversation = socialListeningService.logConversation;
    const calls = [];

    t.after(() => {
        reportService.processText = originalProcessText;
        notificationService.replyToLine = originalReplyToLine;
        notificationService.sendToLine = originalSendToLine;
        socialListeningService.logConversation = originalLogConversation;
    });

    reportService.processText = async () => ({ response: 'ตอบกลับทันที' });
    socialListeningService.logConversation = async () => null;
    notificationService.replyToLine = async (replyToken, messages) => {
        calls.push({ channel: 'reply', replyToken, messages });
        return true;
    };
    notificationService.sendToLine = async (userId, messages) => {
        calls.push({ channel: 'push', userId, messages });
        return true;
    };

    await handleWebhookEvent(createTextEvent('ทดสอบแบบเร็ว'));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].channel, 'reply');
    assert.equal(calls[0].replyToken, 'reply-token-123');
    assert.deepEqual(calls[0].messages, ['ตอบกลับทันที']);
});

test('LINE text sends an acknowledgement first when processing exceeds the reply deadline', async (t) => {
    const originalProcessText = reportService.processText;
    const originalReplyToLine = notificationService.replyToLine;
    const originalSendToLine = notificationService.sendToLine;
    const originalLogConversation = socialListeningService.logConversation;
    const calls = [];

    t.after(() => {
        reportService.processText = originalProcessText;
        notificationService.replyToLine = originalReplyToLine;
        notificationService.sendToLine = originalSendToLine;
        socialListeningService.logConversation = originalLogConversation;
    });

    reportService.processText = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { response: 'ผลลัพธ์สุดท้าย', additionalMessages: ['ข้อมูลเพิ่ม'] };
    };
    socialListeningService.logConversation = async () => null;
    notificationService.replyToLine = async (replyToken, messages) => {
        calls.push({ channel: 'reply', replyToken, messages });
        return true;
    };
    notificationService.sendToLine = async (userId, messages) => {
        calls.push({ channel: 'push', userId, messages });
        return true;
    };

    await handleWebhookEvent(createTextEvent('ทดสอบแบบช้า'));

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], {
        channel: 'reply',
        replyToken: 'reply-token-123',
        messages: 'รับข้อความแล้วครับ กำลังประมวลผลให้อยู่นะครับ'
    });
    assert.deepEqual(calls[1], {
        channel: 'push',
        userId: 'U1234567890abcdef',
        messages: ['ผลลัพธ์สุดท้าย', 'ข้อมูลเพิ่ม']
    });
});

test('normalizeLineMessages splits oversized text and falls back for empty payloads', () => {
    const longText = 'ก'.repeat(5005);
    const normalized = normalizeLineMessages([null, longText, { type: 'text', text: 'ปิดท้าย' }]);
    const fallback = normalizeLineMessages([]);

    assert.equal(normalized.length, 3);
    assert(normalized.every(message => message.type === 'text'));
    assert(normalized.every(message => message.text.length <= 5000));
    assert.equal(normalized[2].text, 'ปิดท้าย');

    assert.deepEqual(fallback, [{
        type: 'text',
        text: 'ขออภัยครับ ระบบยังไม่มีข้อความตอบกลับในตอนนี้'
    }]);
});
