import test from 'node:test';
import assert from 'node:assert/strict';

process.env.BOT_QUEUE_MODE = 'memory';

const {
    enqueueMessageJob,
    getQueueHealthSnapshot,
    processMessageQueueTick,
    resetMessageQueueForTests
} = await import('./messageQueue.service.js');
const { reportService } = await import('./report.service.js');
const { notificationService } = await import('./notification.service.js');
const { socialListeningService } = await import('./socialListening.js');

function restoreMethod(target, key, original) {
    target[key] = original;
}

test('memory queue processes text jobs and delivers queued messages', async (t) => {
    resetMessageQueueForTests();

    const originalProcessText = reportService.processText;
    const originalSendToUser = notificationService.sendToUser;
    const originalLogConversation = socialListeningService.logConversation;
    const deliveries = [];

    t.after(() => {
        restoreMethod(reportService, 'processText', originalProcessText);
        restoreMethod(notificationService, 'sendToUser', originalSendToUser);
        restoreMethod(socialListeningService, 'logConversation', originalLogConversation);
        resetMessageQueueForTests();
    });

    reportService.processText = async () => ({
        response: 'ตอบกลับจากคิว',
        additionalMessages: ['ข้อมูลเสริม']
    });
    notificationService.sendToUser = async (userId, messages) => {
        deliveries.push({ userId, messages });
        return true;
    };
    socialListeningService.logConversation = async () => null;

    await enqueueMessageJob({
        platform: 'telegram',
        userId: 'tg_12345',
        jobType: 'text',
        payload: { text: 'สวัสดี' },
        rawInput: 'สวัสดี'
    });

    assert.equal(getQueueHealthSnapshot().pendingJobs, 1);

    const processed = await processMessageQueueTick();

    assert.equal(processed, true);
    assert.deepEqual(deliveries, [{
        userId: 'tg_12345',
        messages: ['ตอบกลับจากคิว', 'ข้อมูลเสริม']
    }]);
    assert.equal(getQueueHealthSnapshot().pendingJobs, 0);
    assert.equal(getQueueHealthSnapshot().pendingOutbox, 0);
});

test('memory queue sends a fallback failure message when image processing fails', async (t) => {
    resetMessageQueueForTests();

    const originalProcessImage = reportService.processImage;
    const originalSendToUser = notificationService.sendToUser;
    const deliveries = [];

    t.after(() => {
        restoreMethod(reportService, 'processImage', originalProcessImage);
        restoreMethod(notificationService, 'sendToUser', originalSendToUser);
        resetMessageQueueForTests();
    });

    reportService.processImage = async () => {
        throw new Error('vision unavailable');
    };
    notificationService.sendToUser = async (userId, messages) => {
        deliveries.push({ userId, messages });
        return true;
    };

    await enqueueMessageJob({
        platform: 'line',
        userId: 'U123456789',
        jobType: 'image',
        payload: { imageBase64: Buffer.from('fake-image').toString('base64') },
        rawInput: '[Image Uploaded]'
    });

    const processed = await processMessageQueueTick();

    assert.equal(processed, true);
    assert.deepEqual(deliveries, [{
        userId: 'U123456789',
        messages: ['วิเคราะห์รูปไม่สำเร็จครับ 😅 กรุณาส่งรูปอีกครั้งนะครับ 📸']
    }]);
});
