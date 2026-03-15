
import { Telegraf } from 'telegraf';
import { conversationManager } from './conversationFlow.js';
import { processWithAI, extractLocationFromText } from '../services/aiProcessor.js';
import { appendReport, getAllReports, updateReport } from '../services/googleSheets.js';
import { uploadImage } from '../services/googleDrive.js';
import { geocodeAddress } from '../services/geocoding.js';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { addToHistory } from '../services/conversationMemory.js';

// Bot Factory Pattern

// Factory to create a new bot instance
export const createBot = (token) => {
    if (!token) return null;
    const bot = new Telegraf(token);
    setupBot(bot);
    return bot;
};

// Helper: Get User ID consistently
const getUserId = (ctx) => `tg_${ctx.from.id}`;

// Helper: Send Reply
const sendReply = async (ctx, text) => {
    try {
        await ctx.reply(text);
    } catch (e) {
        console.error('Telegram Send Error:', e);
    }
};

// Setup Logic
export const setupBot = (bot) => {

    // 1. Handle Text Messages
    bot.on('text', async (ctx) => {
        const userId = getUserId(ctx);
        const text = ctx.message.text;
        const lowerText = text.trim().toLowerCase();
        const state = conversationManager.getState(userId);

        console.log(`[Telegram] Text from ${userId}: ${text}`);

        // --- COMMANDS ---
        if (lowerText === '/start' || lowerText === 'แจ้งปัญหา' || lowerText === 'รายงาน') {
            conversationManager.startNewReport(userId);
            conversationManager.updateState(userId, { role: 'reporter' });
            await sendReply(ctx, "สวัสดีครับ มีปัญหาอะไร สามารถยกมือถือขึ้นมาถ่ายรูปแล้วส่งให้ผมได้เลยครับ 📸");
            return;
        }

        if (lowerText === '/roles' || lowerText === 'เปลี่ยนโหมด') {
            const rolesMsg = `🎭 เลือกโหมดที่คุณต้องการได้เลยครับ:\n\n` +
                `1. 👷 City Reporter (แจ้งปัญหาเมือง)\n` +
                `2. 👫 Friend (เพื่อนคุยแก้เหงา)\n` +
                `3. 🧠 Psychologist (ที่ปรึกษาส่วนตัว)\n` +
                `4. 🩺 Therapist (นักบำบัดจิตใจ)\n\n` +
                `พิมพ์ชื่อโหมดที่ต้องการเลือกได้เลยครับ! (เช่น "Friend", "Reporter")`;
            await sendReply(ctx, rolesMsg);
            return;
        }

        // Rating System (1-5)
        if (/^[1-5]$/.test(lowerText)) {
            try {
                const reports = await getAllReports();
                const userReports = reports.filter(r => r.user_id === userId && r.status === 'completed' && !r.rating);

                if (userReports.length > 0) {
                    // Get most recent unrated completed task
                    const lastTask = userReports[userReports.length - 1];
                    const rating = lowerText;

                    await updateReport(lastTask.report_id || lastTask.id, { rating: rating, staffComment: (lastTask.staff_comment || '') + ` [Rated: ${rating}⭐]` });

                    await sendReply(ctx, `ขอบคุณสำหรับการให้คะแนน ${rating} ดาวครับ! ⭐ ทีมงานจะนำไปปรับปรุงให้ดียิ่งขึ้นครับ 🙏`);
                    return;
                }
            } catch (e) {
                console.error('Rating Logic Error:', e);
            }
        }

        // SOS Command
        if (lowerText === 'sos' || lowerText === '/sos' || lowerText.includes('เบอร์ฉุกเฉิน') || lowerText === 'ช่วยด้วย') {
            const sosMsg = `🚨 **รวมเบอร์โทรฉุกเฉิน (Thailand SOS)** 🚨\n\n` +
                `👮‍♂️ **เหตุด่วนเหตุร้าย**: 191\n` +
                `🚑 **เจ็บป่วยฉุกเฉิน**: 1669\n` +
                `🚒 **ดับเพลิง/สัตว์เข้าบ้าน**: 199\n` +
                `🛣️ **ตำรวจทางหลวง**: 1193\n` +
                `⚡ **การไฟฟ้าส่วนภูมิภาค**: 1129\n` +
                `💧 **การประปาส่วนภูมิภาค**: 1662\n\n` +
                `*กดที่เบอร์เพื่อโทรออกได้เลยครับ!*`;
            await sendReply(ctx, sosMsg);
            return;
        }

        // Role Switching
        if (['friend', 'psychologist', 'therapist', 'reporter', 'city reporter'].includes(lowerText)) {
            const newRole = lowerText === 'city reporter' ? 'reporter' : lowerText;
            conversationManager.reset(userId);
            conversationManager.updateState(userId, { role: newRole, step: 'idle' });

            let msg = '';
            if (newRole === 'reporter') msg = 'เปลี่ยนเป็นโหมด City Reporter เรียบร้อยครับ 👷 มีปัญหาอะไรแจ้งผมได้เลย!';
            else if (newRole === 'friend') msg = 'โอเคครับ! ตอนนี้เราเป็นเพื่อนกันแล้วนะ มีอะไรเม้าท์มาได้เลย 👫';
            else if (newRole === 'psychologist') msg = 'สวัสดีครับ ผมพร้อมรับฟังทุกปัญหาของคุณแล้วครับ 🧠';
            else if (newRole === 'therapist') msg = 'ยินดีต้อนรับครับ ให้ผมช่วยดูแลจิตใจของคุณนะครับ 🩺';

            await sendReply(ctx, msg);
            return;
        }

        // Status Check
        if (lowerText === '/status' || lowerText === 'สถานะ' || lowerText === 'ติดตาม') {
            try {
                const reports = await getAllReports();
                const userReports = reports.filter(r => r.user_id === userId).slice(-5);
                if (userReports.length === 0) {
                    await sendReply(ctx, 'คุณยังไม่มีรายการแจ้งปัญหาครับ 😊 พิมพ์ "แจ้งปัญหา" เพื่อเริ่มต้นได้เลย');
                    return;
                }
                let statusMsg = '📊 ติดตามสถานะล่าสุดของคุณ:\n\n';
                userReports.forEach(r => {
                    const statusEmoji = r.status === 'completed' ? '✅' : (r.status === 'in_progress' ? '⌛' : '📝');
                    statusMsg += `${statusEmoji} ID: ${r.ticket_number || r.report_id.slice(0, 8)}\nปัญหา: ${r.problem_type}\nสถานะ: ${r.status}\n---\n`;
                });
                await sendReply(ctx, statusMsg);
            } catch (error) { await sendReply(ctx, 'ขออภัยครับ ไม่สามารถดึงข้อมูลสถานะได้ในขณะนี้ 🙏'); }
            return;
        }

        // Cancellation
        if (['ยกเลิก', 'ลบ', 'cancel'].some(k => lowerText.includes(k))) {
            conversationManager.reset(userId);
            await sendReply(ctx, "ยกเลิกการแจ้งเรื่องแล้วครับ พิมพ์ 'แจ้งปัญหา' ได้ทุกเมื่อหากพบความไม่สะดวกครับ 🙏");
            return;
        }

        // 2. Addendum Check: If user types right after a submission, append as info to previous ticket
        const now = Date.now();
        if (state.lastSubmissionTime && (now - new Date(state.lastSubmissionTime).getTime() < 120000)) { // 2 mins
            console.log(`📝 Adding addendum to ticket ${state.lastTicketNumber}`);
            // In a real app, update the Google Sheet row here. For now, acknowledge.
            await sendReply(ctx, `รับทราบครับ! ผมเพิ่มข้อมูลล่าสุดนี้เข้าไปในตั๋ว #${state.lastTicketNumber} ให้แล้วครับ ทีมงานจะได้รับทราบรายละเอียดเพิ่มเติมทันที 🙏`);
            return;
        }

        // Confirmation
        const isConfirm = ['ok', 'โอเค', 'ตกลง', 'ยืนยัน', 'ยืน'].some(k => lowerText.includes(k));

        if (isConfirm) {
            if (state.imageUrl && (state.locationText || state.latitude)) {
                await submitReport(ctx, userId);
                return;
            } else {
                await sendReply(ctx, 'ข้อมูลยังไม่ครบสำหรับออกตั๋วครับ รบกวนส่ง "รูปภาพ" หรือ "พิกัดสถานที่" ให้ผมก่อนนะครับ 😊');
                return;
            }
        }

        // --- INTELLIGENT CHAT MODE ---
        // Use the full power of Gemini with personality and memory
        const role = state.role || 'reporter';

        // Save to conversation memory
        addToHistory(userId, 'user', text);

        // Build context for intelligent chat
        const chatContext = {
            hasImage: !!state.imageUrl,
            hasLocation: !!(state.latitude || state.locationText),
            problemType: state.problemType,
            reportMode: role === 'reporter' && state.step !== 'idle'
        };

        // If in reporter mode and they just typed text, try to extract useful info
        if (role === 'reporter') {
            if (state.step === 'idle') conversationManager.startNewReport(userId);

            // Location Extraction
            const locationAnalysis = await extractLocationFromText(text);
            if (locationAnalysis && locationAnalysis.hasLocation) {
                conversationManager.updateState(userId, { locationText: locationAnalysis.locationText });
                const geocoded = await geocodeAddress(locationAnalysis.locationText);
                if (geocoded) conversationManager.updateState(userId, { latitude: geocoded.lat, longitude: geocoded.lng });
            }

            // Phone/Contact
            const phoneMatch = text.replace(/[-\s]/g, '').match(/[0-9]{9,11}/);
            if (phoneMatch) {
                conversationManager.updateState(userId, { phone: phoneMatch[0] });
            }

            // Description accumulation
            const currentDesc = state.description || '';
            conversationManager.updateState(userId, { description: (currentDesc + ' ' + text).trim() });
        }

        // Generate INTELLIGENT Reply using full Gemini power
        try {
            await ctx.sendChatAction('typing');
            const { intelligentChat } = await import('../services/aiProcessor.js');
            const smartReply = await intelligentChat(userId, text, chatContext);

            // Save bot response to memory
            addToHistory(userId, 'assistant', smartReply);
            await sendReply(ctx, smartReply);
        } catch (e) {
            console.error('IntelligentChat Error', e);
            await sendReply(ctx, "ขออภัยครับ ระบบ AI กำลังโหลด... ลองใหม่อีกทีนะครับ 🤖");
        }
    });

    // 2. Handle Photos
    bot.on('photo', async (ctx) => {
        const userId = getUserId(ctx);
        const state = conversationManager.getState(userId);

        if (state.step === 'idle') conversationManager.startNewReport(userId);

        try {
            await ctx.sendChatAction('upload_photo');
            const photo = ctx.message.photo.pop();
            const fileLink = await ctx.telegram.getFileLink(photo.file_id);
            const response = await axios({ url: fileLink.href, responseType: 'arraybuffer' });
            const buffer = Buffer.from(response.data);
            const base64Image = buffer.toString('base64');

            // 1. VISION ENGINE (MAGIC EYES) - DO THIS FIRST
            console.log(`🤖 [Vision] Starting AI Analysis...`);
            const analysis = await Promise.race([
                processWithAI({
                    description: state.description || 'วิเคราะห์จากรูปภาพ',
                    imageBase64: base64Image,
                    mimeType: 'image/jpeg'
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('VISION_TIMEOUT')), 25000))
            ]).catch(e => {
                console.error(`⚠️ [Vision] Engine Fail:`, e.message);
                return { problemType: 'อื่นๆ', urgency: 'ปานกลาง', summary: 'วิเคราะห์เบื้องต้นจากรูปภาพ', expertVisualAnalysis: ['ระบบวิเคราะห์ภาพขัดข้องชั่วคราว'] };
            });

            conversationManager.updateState(userId, {
                step: 'active',
                problemType: analysis.problemType || state.problemType,
                urgency: analysis.urgency || state.urgency,
                description: state.description || analysis.summary || 'รายงานจากรูปภาพ',
                aiSummary: analysis.summary,
                detailedCityAnalysis: analysis.detailedCityAnalysis,
                proactiveQuestion: analysis.proactiveQuestion,
                ocrText: analysis.ocrText,
                expertVisualAnalysis: analysis.expertVisualAnalysis,
                aiReaction: analysis.naturalReaction,
                imageUrl: 'processing'
            });

            // 2. MAGIC EYE DIAGNOSTICS
            let magicEye = `🔍 [Magic Eye Analysis V7.1]\n`;
            if (analysis.ocrText) magicEye += `📝 ตรวจพบข้อความ: "${analysis.ocrText}"\n`;
            if (analysis.expertVisualAnalysis?.length > 0) {
                magicEye += analysis.expertVisualAnalysis.map(v => `• ${v}`).join('\n');
            } else {
                magicEye += `• ตรวจสอบโครงสร้างและวัตถุทางเทคนิคเรียบร้อย`;
            }
            if (analysis.detailedCityAnalysis) magicEye += `\n\n🏙️ Urban Impact: ${analysis.detailedCityAnalysis}`;
            await sendReply(ctx, magicEye);

            // 3. DRIVE UPLOAD (Background)
            (async () => {
                try {
                    const { Readable } = await import('stream');
                    const stream = Readable.from(buffer);
                    const imageUrl = await uploadImage(stream, `tg_report_${photo.file_id}.jpg`);
                    conversationManager.updateState(userId, { imageUrl });
                    console.log(`✅ [Drive] Upload success: ${imageUrl}`);
                } catch (err) {
                    console.error(`❌ [Drive] Upload fail:`, err.message);
                }
            })();

            // 4. CONVERSATIONAL REPLY
            const { generateConversationalReply } = await import('../services/aiProcessor.js');
            const dynamicReply = await Promise.race([
                generateConversationalReply(conversationManager.getState(userId)),
                new Promise((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), 15000))
            ]).catch(() => "ได้รับรูปแล้วครับ! ข้อมูลครบถ้วนแล้ว พิมพ์ \"ยืนยัน\" เพื่อส่งเรื่องได้เลย ✅");

            await sendReply(ctx, dynamicReply);

        } catch (e) {
            console.error('Telegram Photo Error:', e);
            const s = conversationManager.getState(userId);
            let msg = 'ได้รับรูปแล้วครับ! เพื่อความแม่นยื่น รบกวนช่วยส่ง \'ตำแหน่งที่ตั้ง\' (Location) มาให้หน่อยได้ไหมครับ? 📍';
            if (s.latitude) msg = 'ได้รับรูปแล้วครับ! ข้อมูลครบถ้วนแล้ว พิมพ์ "ยืนยัน" เพื่อส่งเรื่องได้เลยครับ ✅';
            await sendReply(ctx, msg);
        }
    });

    // 3. Handle Location
    bot.on('location', async (ctx) => {
        const userId = getUserId(ctx);
        const { latitude, longitude } = ctx.message.location;

        conversationManager.updateState(userId, {
            latitude,
            longitude,
            locationText: 'Pinned via Telegram'
        });

        try {
            const { generateConversationalReply } = await import('../services/aiProcessor.js');
            const dynamicReply = await generateConversationalReply(conversationManager.getState(userId));
            await sendReply(ctx, dynamicReply);
        } catch (e) {
            await sendReply(ctx, "ได้รับตำแหน่งแล้วครับ! 📍");
        }
    });
}; // End setupBot


// Helper: Submit
async function submitReport(ctx, userId) {
    const state = conversationManager.getState(userId);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const ticketNumber = `TG-${dateStr}-${randomSuffix}`; // TG prefix
    const reportId = uuidv4();

    const reportData = {
        reportId,
        ticketNumber,
        timestamp: new Date().toISOString(),
        userId, // tg_12345
        phone: state.phone || 'Anonymous',
        nickname: state.nickname || (ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : '')),
        problemType: state.problemType || 'อื่นๆ',
        description: state.description || 'ตามรูปภาพ',
        locationText: state.locationText || 'Pinned Location',
        latitude: state.latitude || '',
        longitude: state.longitude || '',
        imageUrl: state.imageUrl || '',
        aiSummary: state.aiSummary || '',
        urgency: state.urgency || 'ปกติ',
        status: 'received',
        rating: '',
        isAnonymous: !state.phone
    };

    try {
        await appendReport(reportData);

        // Fix Loop: Don't hard reset. Preserve history for Addendum logic.
        conversationManager.updateState(userId, {
            step: 'idle',
            description: null,
            imageUrl: null,
            imageBase64: null,
            locationText: null,
            latitude: null,
            longitude: null,
            aiSummary: null,
            proactiveQuestion: null,
            confirmedSummary: false,
            lastSubmissionTime: new Date().toISOString(),
            lastTicketNumber: ticketNumber
        });

        const anonymousNote = reportData.isAnonymous ? '\n(ถ้ามีเบอร์โทร เจ้าหน้าที่จะติดต่อกลับได้ง่ายขึ้นครับ)' : '';

        await sendReply(ctx,
            `✅ บันทึกรายงานเรียบร้อย!\n\n` +
            `🎫 Ticket: ${ticketNumber}\n` +
            `เรื่อง: ${reportData.problemType}\n\n` +
            `ขอบคุณที่แจ้งเข้ามาครับ! 🙏${anonymousNote}`
        );

        // Helpful Resources Message (After Ticket)
        await sendReply(ctx,
            `📚 **ข้อมูลเพิ่มเติมที่น่าสนใจ:**\n\n` +
            `🛒 Digital Catalog: https://www.depa.or.th/th/digitalcatalog\n\n` +
            `📋 Smart City Criteria: https://www.smartcitythailand.or.th/criteria\n\n` +
            `📊 City Data Platform: https://www.citydataplatform.or.th\n\n` +
            `🏢 สำนักงานส่งเสริมเศรษฐกิจดิจิทัล (อาคาร A) 234/431 ถนนลาดพร้าว ซอยลาดพร้าว 10 แขวงจอมพล เขตจตุจักร กรุงเทพมหานคร 10900 Tel : +66 2026 2333 Email : scp@depa.or.th`
        );
    } catch (e) {
        console.error('Submit Error', e);
        await sendReply(ctx, "ระบบบันทึกขัดข้อง กรุณาลองใหม่ครับ");
    }
}

// export default bot; // Removed singleton
