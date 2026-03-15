/**
 * Report Service — Deterministic Conversation Flow
 *
 * The flow is template-driven. AI is ONLY used for:
 *   - Magic Eye image analysis
 *   - Free-form Q&A chat (when user is NOT in an active report)
 *
 * Flow:
 *   1. PHOTO → Magic Eye summary + checklist
 *   2. LOCATION (auto from EXIF or manual) → updated checklist
 *   3. NAME + PHONE (or "skip") → updated checklist
 *   4. "OK" → submit → ticket number
 */

import { v4 as uuidv4 } from 'uuid';
import { config, MESSAGES } from '../config/index.js';
import { loggers } from '../utils/logger.js';
import { aiService } from './ai.service.js';
import { conversationManager } from '../handlers/conversationFlow.js';
import { uploadImage } from './googleDrive.js';
import { addToHistory, formatHistoryForPrompt, getUserFacts, learnFact, setUserName } from './conversationMemory.js';
import { socialListeningService } from './socialListening.js';
import { uploadImageToSupabase } from './supabase.js';
import { allocateTicketNumber, createReport, listReports } from './reportStore.js';

const log = loggers.report;

// ─── TEMPLATES ────────────────────────────────────────────────────────────────

/**
 * Build a checklist message showing what's collected and what's missing.
 * Returns { message, nextStep, isComplete }
 */
function buildChecklist(state) {
    const hasImage = !!(state.imageUrl && state.imageUrl !== 'processing');
    const hasLocation = !!(state.latitude || state.locationText);
    const hasContact = !!(state.phone || state.nickname);

    const lines = [
        `${hasImage ? '✅' : '⬜'} รูปภาพ${state.imageCount > 0 ? ` (${state.imageCount} รูป)` : ''}`,
        `${hasLocation ? '✅' : '⬜'} พิกัดสถานที่`,
        `${hasContact ? '✅' : '⬜'} ชื่อ-เบอร์ติดต่อ`
    ];

    let nextStep = '';
    if (!hasImage) {
        nextStep = '📸 กรุณาส่งรูปถ่ายปัญหามาให้ครับ';
    } else if (!hasLocation) {
        nextStep = '📍 กรุณาส่ง "ตำแหน่งที่ตั้ง" (Location) มาครับ\n(กดปุ่ม + แล้วเลือก Location ในแชท)';
    } else if (!hasContact) {
        nextStep = '👤 กรุณาพิมพ์ ชื่อ + เบอร์โทร ครับ\n(เช่น "สมชาย 0812345678" หรือพิมพ์ "ข้าม")';
    } else {
        nextStep = '✅ ข้อมูลครบแล้ว! พิมพ์ **ok** เพื่อส่งรายงานครับ';
    }

    return {
        message: `📋 สถานะข้อมูล:\n${lines.join('\n')}`,
        nextStep,
        isComplete: hasImage && hasLocation && hasContact
    };
}

/**
 * Format the full status response with checklist + next step
 */
function statusResponse(state, headerMessage = '') {
    const { message: checklist, nextStep } = buildChecklist(state);
    const parts = [];
    if (headerMessage) parts.push(headerMessage);
    parts.push(checklist);
    parts.push(`\n👉 ${nextStep}`);
    return parts.join('\n\n');
}

// ─── COMMAND MATCHING ─────────────────────────────────────────────────────────

const CONFIRM_WORDS = ['ok', 'okay', 'yes', 'โอเค', 'ตกลง', 'ยืนยัน', 'ได้เลย', 'confirm', 'send', 'submit', 'จัดไป', 'ส่งเลย'];
const SKIP_WORDS = ['ข้าม', 'skip', 'next', 'ไม่มี', 'none', 'ไม่ต้อง'];
const CANCEL_WORDS = ['ยกเลิก', 'cancel', '/reset', 'reset', 'ล้าง', 'clear'];
const START_WORDS = ['แจ้งปัญหา', 'รายงาน', '/start', 'start', 'เริ่ม', 'report'];
const SOS_WORDS = ['sos', '/sos', 'help', 'เบอร์ฉุกเฉิน', 'ช่วยด้วย', 'emergency'];
const STATUS_WORDS = ['/status', 'สถานะ', 'ติดตาม', 'status', 'check status', 'track'];

function isCommand(text, wordList) {
    const lower = text.trim().toLowerCase();
    return wordList.some(w => lower === w || lower.startsWith(w + ' '));
}

// ─── SERVICE ──────────────────────────────────────────────────────────────────

class ReportService {

    /**
     * ===========================
     * PROCESS TEXT MESSAGE
     * ===========================
     * Deterministic flow:
     * - Commands (sos, reset, cancel, status) → handle immediately
     * - "ok" / confirm → submit if data complete
     * - "skip" → skip contact info, mark as ready
     * - Phone/name detected → store and show checklist
     * - Active report but no special input → show checklist reminder
     * - Idle (no active report) → AI chat for questions
     */
    async processText(userId, text, platform = 'line') {
        const state = conversationManager.getState(userId);
        const lowerText = text.trim().toLowerCase();

        log.info(`Processing text from ${userId.substring(0, 8)}...`, { platform, preview: text.substring(0, 30) });

        // ── 1. COMMANDS ──
        if (isCommand(text, SOS_WORDS)) return { action: 'sos', response: MESSAGES.sos };
        if (isCommand(text, CANCEL_WORDS)) {
            conversationManager.reset(userId);
            aiService.clearHistory(userId);
            return { action: 'cancel', response: MESSAGES.commands.cancel };
        }
        if (isCommand(text, STATUS_WORDS)) return await this.handleStatusCheck(userId);
        if (isCommand(text, START_WORDS)) {
            conversationManager.startNewReport(userId);
            return { action: 'start', response: 'สวัสดีครับ! 📸 ส่งรูปถ่ายปัญหามาได้เลยครับ แล้วระบบจะวิเคราะห์ให้อัตโนมัติ' };
        }

        // ── 2. SKIP (contact info) ──
        if (isCommand(text, SKIP_WORDS) && state.step !== 'idle') {
            if (state.imageUrl && (state.latitude || state.locationText)) {
                // Has image + location, skipping contact → mark contact as "Anonymous"
                conversationManager.updateState(userId, { nickname: 'ไม่ระบุ', phone: 'Anonymous' });
                const updatedState = conversationManager.getState(userId);
                return {
                    action: 'chat',
                    response: statusResponse(updatedState, '👌 ข้ามข้อมูลติดต่อครับ')
                };
            }
        }

        // ── 3. CONFIRM (OK / Submit) ──
        if (isCommand(text, CONFIRM_WORDS)) {
            const hasImage = !!(state.imageUrl && state.imageUrl !== 'processing');
            const hasLocation = !!(state.latitude || state.locationText);

            if (hasImage && hasLocation) {
                // If no contact yet, submit as anonymous
                if (!state.phone && !state.nickname) {
                    conversationManager.updateState(userId, { nickname: 'ไม่ระบุ', phone: 'Anonymous' });
                }
                return await this.submitReport(userId, platform);
            } else {
                // Not enough data
                return {
                    action: 'chat',
                    response: statusResponse(state, '⚠️ ข้อมูลยังไม่ครบครับ')
                };
            }
        }

        // ── 4. PHONE / NAME DETECTION (during active report) ──
        if (state.step !== 'idle') {
            const phoneMatch = text.replace(/[-\s]/g, '').match(/[0-9]{9,10}/);
            if (phoneMatch) {
                const phone = phoneMatch[0];
                const possibleName = text.replace(/[-\s]*\d{9,10}[-\s]*/g, '').trim();
                conversationManager.updateState(userId, {
                    phone,
                    nickname: possibleName || state.nickname || 'ไม่ระบุ'
                });
                log.info(`Phone detected: ${phone}, Name: ${possibleName || 'none'}`);

                const updatedState = conversationManager.getState(userId);
                return {
                    action: 'chat',
                    response: statusResponse(updatedState, `📞 บันทึกเบอร์ ${phone} เรียบร้อยครับ${possibleName ? ` (คุณ${possibleName})` : ''}`)
                };
            }

            // If we're waiting for contact and user sends a short name
            const hasImage = !!(state.imageUrl && state.imageUrl !== 'processing');
            const hasLocation = !!(state.latitude || state.locationText);
            const hasContact = !!(state.phone || state.nickname);

            if (hasImage && hasLocation && !hasContact && text.length <= 30 && !text.includes(' ')) {
                // Likely just a name
                conversationManager.updateState(userId, { nickname: text.trim() });
                const updatedState = conversationManager.getState(userId);
                return {
                    action: 'chat',
                    response: statusResponse(updatedState, `👤 บันทึกชื่อ "${text.trim()}" เรียบร้อยครับ\n\n📞 มีเบอร์โทรจะฝากไว้ไหมครับ? (หรือพิมพ์ "ข้าม")`)
                };
            }
        }

        // ── 5. ACTIVE REPORT — Show reminder checklist ──
        if (state.step !== 'idle' && state.imageUrl) {
            // User sent text during active report that's not a command/phone/name
            // Use AI to respond BUT ALSO append the checklist
            addToHistory(userId, 'user', text);

            try {
                const conversationHistory = formatHistoryForPrompt(userId, 6);
                const userFacts = getUserFacts(userId);
                const chatContext = {
                    hasImage: !!state.imageUrl,
                    imageAnalysis: state.aiSummary,
                    hasLocation: !!(state.latitude || state.locationText),
                    problemType: state.problemType,
                    reportMode: true
                };

                const aiResponse = await aiService.chat(userId, text, chatContext, conversationHistory, userFacts);
                addToHistory(userId, 'assistant', aiResponse);

                // Append checklist to the AI response
                const { message: checklist, nextStep } = buildChecklist(state);
                const fullResponse = `${aiResponse}\n\n---\n${checklist}\n👉 ${nextStep}`;

                return { action: 'chat', response: fullResponse };
            } catch (err) {
                log.error('AI chat failed during report', err);
                return { action: 'chat', response: statusResponse(state) };
            }
        }

        // ── 6. IDLE — Free-form AI chat ──
        addToHistory(userId, 'user', text);

        try {
            const conversationHistory = formatHistoryForPrompt(userId, 8);
            const userFacts = getUserFacts(userId);
            const response = await aiService.chat(userId, text, { reportMode: false }, conversationHistory, userFacts);
            addToHistory(userId, 'assistant', response);

            // Learn facts in background
            this.learnFactsAsync(userId, text);
            socialListeningService.logConversation(userId, text, response, platform).catch(() => { });

            return { action: 'chat', response };
        } catch (err) {
            log.error('AI chat failed', err);
            return { action: 'chat', response: 'สวัสดีครับ! 📸 ถ้ามีปัญหาอะไรอยากแจ้ง ส่งรูปมาได้เลยครับ หรือพิมพ์ "แจ้งปัญหา" เพื่อเริ่มต้นครับ' };
        }
    }

    /**
     * ===========================
     * PROCESS IMAGE
     * ===========================
     * 1. Start report if idle
     * 2. Extract GPS from EXIF if available
     * 3. Run Magic Eye analysis
     * 4. Upload image
     * 5. Return: short summary + checklist
     */
    async processImage(userId, imageBuffer, platform = 'line') {
        const state = conversationManager.getState(userId);

        log.info(`Processing image from ${userId.substring(0, 8)}...`, { platform, size: imageBuffer.length });

        if (state.step === 'idle') {
            conversationManager.startNewReport(userId);
        }

        // ── GPS from EXIF ──
        let gpsExtracted = false;
        let gpsMessage = '';
        try {
            const metadata = await import('../utils/exif.js').then(m => m.extractPhotoMetadata(imageBuffer));
            if (metadata) {
                const updates = { photoMetadata: JSON.stringify(metadata) };
                if (metadata.latitude && metadata.longitude) {
                    updates.latitude = metadata.latitude;
                    updates.longitude = metadata.longitude;
                    updates.locationText = 'GPS จากภาพถ่าย (EXIF)';
                    gpsExtracted = true;
                    gpsMessage = `📍 พบพิกัด GPS ในภาพ: ${metadata.latitude.toFixed(4)}, ${metadata.longitude.toFixed(4)}`;
                }
                conversationManager.updateState(userId, updates);
            }
        } catch (e) {
            log.warn('EXIF extraction failed', e.message);
        }

        // ── Magic Eye Analysis ──
        const base64Image = imageBuffer.toString('base64');
        const analysis = await aiService.analyzeImage(base64Image, 'image/jpeg', state.description || '');

        const currentImages = state.images || [];
        const imageIndex = currentImages.length + 1;

        conversationManager.updateState(userId, {
            step: 'active',
            problemType: analysis.problemType || state.problemType,
            urgency: analysis.urgency || state.urgency,
            description: (state.description ? state.description + ' | ' : '') + (analysis.summary || 'รายงานจากรูปภาพ'),
            aiSummary: analysis.summary,
            detailedAnalysis: analysis.detailedAnalysis,
            detailedCityAnalysis: analysis.detailedCityAnalysis,
            proactiveQuestion: analysis.proactiveQuestion,
            ocrText: analysis.ocrText,
            expertVisualAnalysis: analysis.expertVisualAnalysis,
            aiReaction: analysis.naturalReaction,
            imageUrl: 'processing',
            imageCount: imageIndex
        });

        // ── Upload Image ──
        const imageUrl = await this.uploadImageAsync(userId, imageBuffer, platform, imageIndex);

        // ── Build Response ──
        let magicEyeLine = '🔍 ';
        if (!imageUrl) {
            magicEyeLine += '⚠️ อัพโหลดรูปไม่สำเร็จ กรุณาส่งรูปอีกครั้งครับ\n';
        }
        if (analysis.problemType) magicEyeLine += `ปัญหา: **${analysis.problemType}**`;
        if (analysis.summary) magicEyeLine += `\n${analysis.summary}`;

        // GPS line
        if (gpsMessage) magicEyeLine += `\n${gpsMessage}`;

        // Build checklist
        const updatedState = conversationManager.getState(userId);
        const magicEyeResponse = statusResponse(updatedState, magicEyeLine);

        addToHistory(userId, 'assistant', magicEyeResponse);

        return { analysis, magicEyeResponse, gpsExtracted, imageIndex, imageUrl };
    }

    /**
     * ===========================
     * PROCESS LOCATION
     * ===========================
     */
    async processLocation(userId, latitude, longitude, address = null, platform = 'line') {
        let state = conversationManager.getState(userId);

        if (state.step === 'idle' && !state.imageUrl && !state.description) {
            conversationManager.startNewReport(userId);
        }

        conversationManager.updateState(userId, {
            step: 'active',
            locationText: address || 'ตำแหน่งจาก GPS',
            latitude,
            longitude
        });

        const updatedState = conversationManager.getState(userId);
        const response = statusResponse(updatedState, `📍 บันทึกตำแหน่งเรียบร้อยครับ!`);

        return { action: 'location_received', response };
    }

    /**
     * ===========================
     * STATUS CHECK
     * ===========================
     */
    async handleStatusCheck(userId) {
        try {
            const reports = await listReports();
            const userReports = reports.filter(r => r.user_id === userId).slice(-5);
            if (userReports.length === 0) return { action: 'status', response: 'คุณยังไม่มีรายการแจ้งปัญหาครับ 😊' };
            let msg = '📊 สถานะของคุณ:\n\n';
            userReports.forEach(r => {
                const emoji = r.status === 'completed' ? '✅' : '📝';
                msg += `${emoji} #${r.ticket_number}\nสถานะ: ${r.status}\n---\n`;
            });
            return { action: 'status', response: msg };
        } catch (e) { return { action: 'status', response: 'ดึงข้อมูลไม่สำเร็จครับ' }; }
    }

    /**
     * ===========================
     * SUBMIT REPORT
     * ===========================
     */
    async submitReport(userId, platform = 'line') {
        const state = conversationManager.getState(userId);
        log.info(`📝 Submitting report for ${userId.substring(0, 8)}...`);

        const ticketNumber = await this.generateTicketNumber();
        const reportId = uuidv4();

        const reportData = {
            reportId, ticketNumber, timestamp: new Date().toISOString(), userId,
            phone: state.phone || 'Anonymous', nickname: state.nickname || '',
            problemType: state.problemType || 'อื่นๆ', description: state.description || 'ตามรูปภาพ',
            locationText: state.locationText || 'สกัดจาก GPS',
            latitude: state.latitude || '', longitude: state.longitude || '',
            imageUrl: state.imageUrl || '', aiSummary: state.aiSummary || '',
            detailedAnalysis: state.detailedAnalysis || '', urgency: state.urgency || 'ปกติ',
            status: 'received', isAnonymous: !state.phone || state.phone === 'Anonymous'
        };

        log.debug('Report Data Payload:', JSON.stringify(reportData, null, 2));

        try {
            const res = await createReport(reportData);
            log.info(`✅ Report saved. Response: ${JSON.stringify(res)}`);

            aiService.clearHistory(userId);
            conversationManager.updateState(userId, {
                step: 'idle', description: null, imageUrl: null, imageUrls: [], imageCount: 0,
                locationText: null, latitude: null, longitude: null, lastSubmissionTime: new Date().toISOString(),
                lastTicketNumber: ticketNumber
            });

            return {
                action: 'submitted',
                response: `✅ ส่งรายงานเรียบร้อย!\n\n🎫 หมายเลขเคส: #${ticketNumber}\n📋 ปัญหา: ${state.problemType || 'อื่นๆ'}\n📍 สถานที่: ${state.locationText || 'ตามพิกัด GPS'}\n\nขอบคุณที่แจ้งปัญหาครับ! 🙏\nพิมพ์ "สถานะ" เพื่อติดตามผลได้ครับ`,
                additionalMessages: [MESSAGES.resources],
                ticketNumber
            };
        } catch (error) {
            log.error('❌ CRITICAL: Submit report failed', error);
            return { action: 'error', response: 'ขออภัย ระบบขัดข้องในการบันทึกข้อมูลครับ กรุณาลองพิมพ์ "ok" อีกครั้ง' };
        }
    }

    async generateTicketNumber() {
        try {
            return await allocateTicketNumber();
        } catch (e) { return String(Date.now()).slice(-4); }
    }

    async uploadImageAsync(userId, imageBuffer, platform, imageIndex = 1) {
        const filename = `${platform}_${Date.now()}.jpg`;
        let driveUrl = null;
        let supabaseUrl = null;

        // Upload to Google Drive (primary)
        try {
            driveUrl = await uploadImage(imageBuffer, filename);
        } catch (e) {
            log.error('Google Drive upload failed', e.message);
        }

        // Upload to Supabase Storage (backup, fire-and-forget)
        uploadImageToSupabase(imageBuffer, `reports/${filename}`)
            .then(url => { if (url) log.info(`Supabase image backup: ${url}`); })
            .catch(() => {});

        // Use whichever succeeded
        const finalUrl = driveUrl;
        if (finalUrl) {
            conversationManager.updateState(userId, { imageUrl: finalUrl });
            log.info(`Image uploaded: ${finalUrl}`);
            return finalUrl;
        }

        log.error('All image uploads failed — resetting imageUrl from processing state');
        // CRITICAL FIX: Reset imageUrl so checklist shows failure, not stuck "processing"
        conversationManager.updateState(userId, { imageUrl: null });
        return null;
    }

    async learnFactsAsync(userId, message) {
        try {
            const { facts, name } = await aiService.extractFacts(message);
            if (facts) facts.forEach(f => learnFact(userId, f));
            if (name) setUserName(userId, name);
        } catch (e) { }
    }
}

export const reportService = new ReportService();
export default reportService;
