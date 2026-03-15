/**
 * AI Service
 *
 * Centralized Gemini AI operations with:
 * - Retry logic with exponential backoff
 * - Knowledge base integration
 * - Non's dual-layer persona
 * - Auto-reminders for city reporting
 * - Anti-loop conversation tracking
 */

/**
 * Strip <thinking> tags from model chain-of-thought output
 */
function cleanResponse(text) {
    if (!text) return text;
    return text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
}

import { GoogleGenerativeAI } from '@google/generative-ai';
import { config, PROBLEM_TYPES, URGENCY_LEVELS } from '../config/index.js';
import { persona, generatePersonaPrompt, getRandomReminder, isEnglish } from '../config/persona.js';
import { searchKnowledgeBase, getKnowledgeContext } from './knowledgeBase.js';
import { loggers } from '../utils/logger.js';
import { debugLogger } from '../handlers/debugLogger.js';
import { toolRegistry } from '../tools/registry.js';
import { reportingTool } from '../tools/reporting.tool.js';
import { knowledgeTool } from '../tools/knowledge.tool.js';
import { notificationService } from './notification.service.js'; // Added for Push

const log = loggers.ai;

// Initialize Gemini
const genAI = new GoogleGenerativeAI(config.ai.apiKey);

// Conversation tracking for anti-loop
const recentResponses = new Map();  // userId -> last 3 responses
const MAX_TRACKED_RESPONSES = 3;

// Message counter for periodic report reminders
const messageCounters = new Map();  // userId -> message count since last reminder

// Default analysis result for failures
const DEFAULT_ANALYSIS = {
    problemType: 'อื่นๆ',
    urgency: 'ปานกลาง',
    summary: 'ระบบได้รับภาพแล้ว (กำลังรอการวิเคราะห์ละเอียด)',
    detailedCityAnalysis: 'ขออภัยครับ ระบบ Vision AI กำลังทำงานหนักและตอบสนองล่าช้า แต่ภาพนี้ถูกบันทึกแล้ว เจ้าหน้าที่จะตรวจสอบด้วยตนเองครับ',
    proactiveQuestion: 'เพื่อความรวดเร็ว รบกวนช่วยระบุรายละเอียดเพิ่มเติมสั้นๆ ได้ไหมครับ?',
    ocrText: null,
    expertVisualAnalysis: ['บันทึกภาพลงฐานข้อมูลแล้ว (AI Busy)'],
    naturalReaction: 'ได้รับรูปภาพเรียบร้อยครับ (ระบบกำลังประมวลผลหนาแน่น)'
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Retry wrapper with exponential backoff
 */
async function withRetry(fn, options = {}) {
    let lastError;
    const { maxRetries = config.ai.maxRetries, baseDelay = 8000, operation = 'AI call' } = options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Attempt with primary model first
            return await fn({ model: 'gemini-2.0-flash' }); // Assuming primary model is 2.0-flash
        } catch (error) {
            lastError = error;
            const isQuotaOrOverloadError = error.status === 429 || error.status === 503 || error.message?.includes('429') || error.message?.includes('503');

            if (isQuotaOrOverloadError) {
                log.warn(`⚠️ [AI] Primary model (${operation}) hit quota/overload (${error.status}). Attempting Secondary Fallback (Gemini 2.0 Flash Lite)...`);
                try {
                    // Try Secondary Model (Gemini Flash Latest) - Reliable Fallback
                    return await fn({ model: 'gemini-flash-latest' });
                } catch (secondaryError) {
                    log.warn(`⚠️ [AI] Secondary model (${operation}) also failed. Accessing emergency mode.`, secondaryError.message);
                    // If secondary fails, then proceed with original retry logic for the last error
                    lastError = secondaryError;
                }
            }

            // Original retry logic for non-quota/overload errors or if secondary model also failed
            const errorToCheck = lastError || error; // Use lastError if set (secondary failure), else original error
            const isRetryable = (errorToCheck.status >= 500 || errorToCheck.message?.includes('TIMEOUT')) && !isQuotaOrOverloadError;

            if (!isRetryable || attempt === maxRetries) {
                if (isQuotaOrOverloadError) {
                    log.warn(`${operation} hit quota/overload limit (429/503) on both models. Failing fast to maintain responsiveness.`);
                } else {
                    log.error(`${operation} failed after ${attempt} attempts`, errorToCheck);
                }
                throw errorToCheck;
            }

            const delay = baseDelay * Math.pow(1.5, attempt - 1);
            log.warn(`${operation} attempt ${attempt} failed, retrying in ${delay}ms`, { error: errorToCheck.message });
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

/**
 * Timeout wrapper
 */
async function withTimeout(promise, timeoutMs, operation) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${operation} TIMEOUT after ${timeoutMs}ms`)), timeoutMs)
        )
    ]);
}

/**
 * Parse JSON from AI response safely
 */
function parseJsonResponse(text) {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        } catch (e) {
            log.warn('Failed to parse JSON from AI response', { preview: text.substring(0, 100) });
        }
    }
    return null;
}

/**
 * Track response to prevent loops
 */
function trackResponse(userId, response) {
    if (!recentResponses.has(userId)) {
        recentResponses.set(userId, []);
    }
    const history = recentResponses.get(userId);
    history.push(response.substring(0, 200));  // Track first 200 chars
    if (history.length > MAX_TRACKED_RESPONSES) {
        history.shift();
    }
}

/**
 * Check if response is too similar to recent ones
 */
function isTooSimilar(userId, newResponse) {
    const history = recentResponses.get(userId) || [];
    const newStart = newResponse.substring(0, 100).toLowerCase();

    for (const prev of history) {
        const prevStart = prev.substring(0, 100).toLowerCase();
        // Simple similarity check - if starts are 70%+ similar, flag it
        const matches = newStart.split('').filter((c, i) => c === prevStart[i]).length;
        if (matches / newStart.length > 0.7) {
            return true;
        }
    }
    return false;
}

// ============================================
// AI SERVICE CLASS
// ============================================

class AIService {
    constructor() {
        // [DEMO STABILITY] Use highly available models
        this.primaryModelName = config.ai.defaultModel || 'gemini-2.0-flash';
        this.backupModels = []; // Disable broken backups (User key is 2.0 only)

        // Register Tools
        toolRegistry.register(reportingTool);
        toolRegistry.register(knowledgeTool);

        // Initialize model WITH tools
        this.model = genAI.getGenerativeModel({
            model: this.primaryModelName,
            tools: toolRegistry.getDefinitions()
        });

        this.visionModel = genAI.getGenerativeModel({ model: config.ai.visionModel || 'gemini-flash-latest' });
    }

    /**
     * Helper: Generate content with Model Fallback
     */
    async generateWithFallback(callFn, operationName, overridePrimaryModel = null) {
        // Try primary model first
        try {
            return await callFn(overridePrimaryModel || this.model);
        } catch (error) {
            // Catch 429 (Quota), 400 (Bad Request - explicit model reject), 403 (Permission), 503 (Overloaded)
            if (error.status === 429 || error.status === 400 || error.status === 403 || error.status === 503 || error.message?.includes('429')) {
                log.warn(`${operationName} failed on primary model (${error.status}). Attempting fallbacks...`);

                for (const modelName of this.backupModels) {
                    try {
                        log.info(`Switching to backup model: ${modelName}`);
                        const backupModel = genAI.getGenerativeModel({ model: modelName });
                        return await callFn(backupModel);
                    } catch (backupError) {
                        log.warn(`Backup model ${modelName} also failed`, backupError.message);
                        // Continue to next backup
                    }
                }
            }
            throw error; // Throw original or last error if all fail
        }
    }

    /**
     * Generate text from prompt with fallback (for external services)
     */
    async generateText(prompt) {
        return withRetry(
            () => withTimeout(
                this.generateWithFallback(async (activeModel) => {
                    const finalModel = genAI.getGenerativeModel({
                        // Use _modelName if we attached it, or model key if available, or fall back to known-good alias
                        model: activeModel._modelName || activeModel.model || 'gemini-flash-latest'
                    });
                    return finalModel.generateContent(prompt);
                }, 'generateText'),
                config.ai.timeout,
                'Text generation'
            ),
            { operation: 'generateText' }
        );
    }

    /**
     * Analyze image with Magic Eye vision system (Enhanced with Non's persona)
     * OPTIMIZED PROMPT to save tokens and reduce 429 errors
     */
    async analyzeImage(imageBase64, mimeType = 'image/jpeg', description = '') {
        const startTime = Date.now();

        // 1. Sanitize Base64
        const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '');

        // 2. High-Fidelity Forensic Prompt (The "Smart" Version)
        const prompt = `Role: "Magic Eye" (Non) - Thailand's top forensic city engineer.
Task: Perform a deep visual audit of this urban issue.

STRICT JSON OUTPUT FORMAT:
{
    "problemType": "Select ONE: ${PROBLEM_TYPES.join(', ')}",
    "urgency": "สูง/ปานกลาง/ต่ำ",
    "summary": "Precise technical summary (10 words)",
    "detailedAnalysis": "Professional engineering analysis (4-5 sentences). Specify measurements if possible (e.g., approx 50cm deep, 2m wide), identify materials (asphalt, concrete, PVC), assess structural risk, and mention environmental impact (leaking into drain, blocking sidewalk).",
    "naturalReaction": "Your vivid, human reaction as 'Non'. Start with 'โห...' or 'อื้อหือ...'. Mention 3 specific visual textures or defects. Maintain a calm but serious tone. ASK for Name and Phone to follow up if missing.",
    "ocrText": "Exact text from signs/labels if visible, otherwise null"
}`;

        try {
            const result = await withRetry(
                () => withTimeout(
                    this.generateWithFallback(async (activeModel) => {
                        return activeModel.generateContent({
                            contents: [{
                                role: 'user',
                                parts: [
                                    { text: prompt },
                                    { inlineData: { data: cleanBase64, mimeType } }
                                ]
                            }]
                        });
                    }, 'analyzeImage', this.visionModel),
                    60000,
                    'Vision analysis'
                ),
                { operation: 'analyzeImage' }
            );

            const responseText = result.response.text();
            console.log("DEBUG_AI_RAW:", responseText); // FORCE LOG

            const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '');
            const parsed = parseJsonResponse(cleanText);

            const duration = Date.now() - startTime;
            log.ai('analyzeImage', duration, true, { problemType: parsed?.problemType });

            if (parsed) {
                return {
                    problemType: parsed.problemType || 'อื่นๆ',
                    urgency: parsed.urgency || 'ปานกลาง',
                    summary: parsed.summary || description || 'พบปัญหาเมือง (รอตรวจสอบ)',
                    detailedAnalysis: parsed.detailedAnalysis || 'ระบบบันทึกภาพแล้ว เจ้าหน้าที่จะตรวจสอบรายละเอียดเพิ่มเติมครับ',
                    ocrText: parsed.ocrText || null,
                    naturalReaction: parsed.naturalReaction || 'ได้รับภาพแล้วครับ รบกวนขอชื่อและเบอร์ติดต่อเพื่อประสานงานต่อด้วยนะครับ',
                    // Map legacy fields for compatibility
                    detailedCityAnalysis: parsed.detailedAnalysis,
                    expertVisualAnalysis: [parsed.summary]
                };
            }

            return { ...DEFAULT_ANALYSIS, summary: description || DEFAULT_ANALYSIS.summary };

        } catch (error) {
            log.error('analyzeImage failed', error);
            console.error('Full AI Error Stack:', error); // Explicitly log stack for debugging

            // Graceful Fallback for Rate Limits
            return {
                ...DEFAULT_ANALYSIS,
                problemType: 'อื่นๆ',
                summary: description || 'ระบบบันทึกภาพแล้ว (AI Busy)',
                naturalReaction: 'ตอนนี้คนแจ้งเข้ามาเยอะมากครับ ระบบ AI ผมวิเคราะห์ไม่ทัน 😅 แต่ผมบันทึกรูปไว้เรียบร้อยแล้วครับ! รบกวนขอทราบ "ชื่อและเบอร์ติดต่อ" ได้เลยครับ เดี๋ยวเจ้าหน้าที่ดูรูปแล้วโทรกลับครับ'
            };
        }
    }

    /**
     * Generate fortune telling (Mutelu style) - GIMMICK
     */
    async generateFortune(nickname, phone) {
        if (!nickname || !phone) return null;

        const startTime = Date.now();
        const prompt = `รับบท "หมอดูมูเตลู" อารมณ์ดี! 🔮
วิเคราะห์ดวงจาก:
- ชื่อเล่น: "${nickname}"
- เบอร์โทร: "${phone}" (วิเคราะห์เลขท้าย)

ตอบสั้นๆ ตลกๆ (ไม่เกิน 30 คำ):
"ชื่อ...ความหมายคือ... ส่วนเลขท้าย... นี่มันเลข... ชัดๆ! (ทำนายเคร็ดลับความเฮง)"
ปิดท้ายด้วย Emoji ฮาๆ`;

        try {
            const result = await withRetry(
                () => withTimeout(
                    this.model.generateContent(prompt),
                    10000,
                    'Fortune'
                ),
                { operation: 'generateFortune', maxRetries: 1 } // Lower retries for gimmick
            );

            log.ai('generateFortune', Date.now() - startTime, true);
            return cleanResponse(result.response.text());
        } catch (error) {
            // Static fallback if AI fails
            return `ชื่อ ${nickname} นี่เท่จริงๆ! ส่วนเลขท้ายเบอร์ ${phone.slice(-4)} นี่มันเลขเศรษฐีชัดๆ! 🔮💰`;
        }
    }

    /**
    * Analyze sentiment and intent
    */
    async analyzeSentiment(message) {
        const prompt = `Analyze intent of: "${message}"
JSON ONLY:
{
  "intent": "report/chat/question/complaint",
  "sentiment": "positive/negative/neutral",
  "requiresPhoto": boolean (true if user mentions a physical object they want to show)
}`;
        try {
            const result = await this.model.generateContent(prompt);
            return parseJsonResponse(result.response.text()) || { intent: 'chat', sentiment: 'neutral' };
        } catch (e) {
            return { intent: 'chat', sentiment: 'neutral' };
        }
    }

    /**
     * Extract location from text
     */
    async extractLocation(text) {
        const startTime = Date.now();

        const prompt = `จากข้อความต่อไปนี้ ให้ดึงข้อมูลสถานที่หรือที่อยู่ออกมา:

"${text}"

ตอบในรูปแบบ JSON:
{
  "hasLocation": true,
  "locationText": "ที่อยู่หรือสถานที่ที่พบ หรือ null",
  "landmarks": ["จุดสังเกต", "อาคาร", "ถนน"]
}

ตอบเฉพาะ JSON เท่านั้น`;

        try {
            const result = await withRetry(
                () => withTimeout(
                    this.model.generateContent(prompt),
                    10000,
                    'Location extraction'
                ),
                { operation: 'extractLocation', maxRetries: 2 }
            );

            const parsed = parseJsonResponse(result.response.text());
            const duration = Date.now() - startTime;
            log.ai('extractLocation', duration, !!parsed, { hasLocation: parsed?.hasLocation });

            return parsed || { hasLocation: false, locationText: null, landmarks: [] };

        } catch (error) {
            log.error('extractLocation failed', error);
            return { hasLocation: false, locationText: null, landmarks: [] };
        }
    }

    /**
     * Generate conversational reply based on report state (uses full Non persona)
     */
    async generateReply(state) {
        const startTime = Date.now();

        // Build a data checklist for the AI
        const collected = [];
        const missing = [];

        if (state.imageUrl) collected.push('📸 รูปภาพ');
        else missing.push('📸 รูปภาพ');

        if (state.latitude || state.locationText) collected.push('📍 พิกัด/สถานที่');
        else missing.push('📍 พิกัด (กดปุ่ม + แล้วเลือก Location)');

        if (state.nickname) collected.push(`👤 ชื่อ: ${state.nickname}`);
        else missing.push('👤 ชื่อผู้แจ้ง');

        if (state.phone) collected.push(`📞 เบอร์: ${state.phone}`);
        else missing.push('📞 เบอร์โทรศัพท์');

        const hasAllRequired = state.imageUrl && (state.latitude || state.locationText);
        const hasAllData = hasAllRequired && state.phone && state.nickname;

        const prompt = `You ARE "Non" (นนท์) — Smart City strategist.
        
CURRENT STATUS:
- Description: "${state.description || ''}"
- Collected: ${collected.join(', ')}
- Missing: ${missing.join(', ')}
- Fortune Gimmick Result: "${state.fortune || 'Not available'}"

TASK:
1. If ALL DATA COMPLETE: Ask user to type "ok" to submit.
2. If MISSING DATA: Ask for it politely.
3. If user just provided name/phone: Thank them and YOU MUST include the "Fortune Gimmick Result" in your reply (it's a fun prediction based on their number).

Reply in Thai, short and friendly (2 sentences).`;

        try {
            const result = await withRetry(
                () => withTimeout(
                    this.model.generateContent({
                        contents: [{ role: 'user', parts: [{ text: prompt }] }]
                    }),
                    15000,
                    'Generate reply'
                ),
                { operation: 'generateReply', maxRetries: 2 }
            );

            let response = cleanResponse(result.response.text());
            const duration = Date.now() - startTime;

            log.ai('generateReply', duration, true);
            return response;

        } catch (error) {
            log.error('generateReply failed', error);

            // Fallback responses
            if (!state.imageUrl) {
                return "สวัสดีครับ ผม Non พร้อมรับเรื่องครับ! รบกวนถ่ายรูปปัญหาแจ้งเข้ามาได้เลยครับ 📸";
            }
            if (!state.locationText && !state.latitude) {
                return "ผมได้รับรูปแล้วครับ! เพื่อความแม่นยำ รบกวนช่วยส่ง 'ตำแหน่งที่ตั้ง' (Location) มาให้หน่อยได้ไหมครับ? 📍";
            }
            return "✅ **ได้รับข้อมูลครบถ้วนแล้วครับ!** \n\n(AI กำลังทำงานหนัก แต่ผมบันทึกข้อมูลให้เรียบร้อยแล้ว)\n\n👉 พิมพ์ **'ok'** หรือ **'ตกลง'** เพื่อส่งเรื่องได้เลยครับ! 😊";
        }
    }

    /**
     * Intelligent chat with memory, knowledge base, and Non's dual-layer persona
     * This is the MAIN chat function - smart, knowledgeable, and always helpful
     */
    async chat(userId, message, context = {}, conversationHistory = '', userFacts = [], isBackgroundRetry = false) {
        const startTime = Date.now();
        console.log(`🧠 [Agent] Starting chat for ${userId} (Background: ${isBackgroundRetry})`);

        // 1. Agent System Prompt (Persona + Instructions)
        const systemPrompt = generatePersonaPrompt({
            conversationHistory,
            userFacts,
            knowledgeContext: context.knowledgeContext,
            reportMode: context.reportMode,
            hasImage: context.hasImage
        });

        try {
            const result = await withRetry(
                async (retryContext) => {
                    const activeModelName = retryContext.model || this.primaryModelName;

                    return await withTimeout(
                        (async () => {
                            // Get model with tools
                            const agentModel = genAI.getGenerativeModel({
                                model: activeModelName,
                                tools: toolRegistry.getDefinitions(),
                                systemInstruction: systemPrompt
                            });

                            const chatSession = agentModel.startChat({
                                generationConfig: { maxOutputTokens: 2000, temperature: 0.7 },
                            });

                            // 2. Loop for Tool Execution
                            let userMessage = message;
                            let loopCount = 0;
                            const MAX_LOOPS = 5;
                            let finalResponse = "";

                            // Initial send
                            let chatResult = await chatSession.sendMessage(userMessage);
                            let response = chatResult.response;
                            let functionCalls = response.functionCalls();

                            while (functionCalls && functionCalls.length > 0 && loopCount < MAX_LOOPS) {
                                loopCount++;
                                console.log(`🤖 Agent executing ${functionCalls.length} tools (Loop ${loopCount})`);

                                const toolParts = [];
                                for (const call of functionCalls) {
                                    const toolName = call.name;
                                    const toolArgs = call.args;
                                    const contextArgs = { ...toolArgs, _context: { userId } };

                                    const toolOutput = await toolRegistry.execute(toolName, contextArgs);

                                    toolParts.push({
                                        functionResponse: {
                                            name: toolName,
                                            response: { content: toolOutput }
                                        }
                                    });
                                }

                                // Send results back
                                chatResult = await chatSession.sendMessage(toolParts);
                                response = chatResult.response;
                                functionCalls = response.functionCalls();
                            }

                            return cleanResponse(response.text());
                        })(),
                        60000,
                        'Agent Chat'
                    );
                },
                { operation: 'agentChat' }
            );

            log.ai('chat', Date.now() - startTime, true);
            return result;

        } catch (error) {
            log.error('Agent chat failed', error);

            // [EMERGENCY FALLBACK - KEYWORD RESPONSE + AUTO-SAVE]
            const lowerMsg = message.toLowerCase();
            const hasReportData = context.hasImage && context.hasLocation;

            // EMERGENCY SUBMISSION: If AI fails but user meant "OK/Confirm", save it anyway!
            const isOk = ['ok', 'okay', 'yes', 'ตกลง', 'ยืนยัน', 'โอเค', 'confirm', 'จัดไป', 'ส่งเลย'].some(cmd => lowerMsg.includes(cmd)) || lowerMsg.length <= 3;

            if (isOk && hasReportData && context.reportMode) {
                try {
                    console.log(`🛡️ [Emergency] Gemini failed during confirmation. Triggering Manual Save for ${userId}...`);
                    // We can't call the tool registry directly here easily without import cycles, 
                    // but we can return a special token that reportService handles, 
                    // or better, handle the logic here if we have the tools.
                    // For now, return a response that tells the system to force save.
                    return "__EMERGENCY_SAVE__";
                } catch (saveErr) {
                    log.error('Emergency save failed', saveErr);
                }
            }

            // Standard Fallbacks
            if (lowerMsg.includes('hello') || lowerMsg.includes('hi') || lowerMsg.includes('สวัสดี')) {
                return "สวัสดีครับ! ผม 'นนท์' ยินดีที่ได้พบครับ ✨\n\n(ระบบ AI มีผู้ใช้งานเป็นจำนวนมาก ผมขออนุญาตบันทึกเรื่องแบบ Safe Mode ครับ)\n\n📸 ส่งรูปถ่ายเพื่อแจ้งปัญหาได้เลยครับ";
            }

            if (lowerMsg.includes('แจ้ง') || lowerMsg.includes('report') || lowerMsg.includes('ปัญหา')) {
                return "ได้รับเรื่องแล้วครับ! ✅\n\n(ขณะนี้ AI กำลังจัดคิวประมวลผล แต่ผมบันทึกข้อมูลให้ทันทีครับ)\n\n📸 รบกวน **ถ่ายรูปปัญหา** ส่งมาให้ผมหน่อยนะครับ";
            }

            // Context-Aware Fallbacks (Don't say "Saved!" if user is just chatting)
            if (context.reportMode && context.hasImage) {
                return "✅ **บันทึกข้อมูลเรียบร้อยแล้วครับ!** \n\n(ขณะนี้ AI ตอบล่าช้าเล็กน้อย แต่เจ้าหน้าที่เห็นข้อมูลบนแดชบอร์ดแน่นอนครับ)\n\n👉 พิมพ์ **'ok'** เพื่อยืนยันส่งเรื่องได้ทันทีเลยครับ 🙏";
            } else if (context.reportMode && !context.hasImage) {
                return "รับทราบครับ! (AI ตอบกลับช้าเล็กน้อย) 📸 รบกวนถ่ายรูปปัญหาแจ้งเข้ามาได้เลยครับ เดี๋ยวผมดูแลต่อให้ครับ";
            } else {
                return "ขออภัยครับ ตอนนี้มีผู้ใช้งานเข้ามาเยอะมากจนระบบผมประมวลผลไม่ทัน 😅 รบกวนพิมพ์ถามอีกครั้งในอีกสักครู่นะครับ (หรือถ้าต้องการแจ้งปัญหา พิมพ์ ว่า 'เริ่ม' ได้เลยครับ)";
            }
        }
    }

    // Removed broken background queue logic to prevent "Thinking..." hang.
    async processQuestionInBackground() {
        // Disabled for stability
        return;
    }

    /**
     * Add variety to a response that's too similar to recent ones
     */
    async addVariety(originalResponse, originalMessage) {
        try {
            const result = await this.model.generateContent({
                contents: [{
                    role: 'user',
                    parts: [{
                        text: `Rephrase this response to make it sound fresh and different while keeping the same meaning. The original was in response to "${originalMessage}".

Original: "${originalResponse}"

Provide a rephrased version that:
1. Uses different sentence structures
2. Starts differently
3. Keeps the same helpful information
4. Maintains Non's direct, warm, professional tone

Rephrased version:`
                    }]
                }],
                generationConfig: { maxOutputTokens: 400, temperature: 0.9 }
            });
            return cleanResponse(result.response.text());
        } catch (e) {
            return originalResponse;  // Return original if rephrasing fails
        }
    }

    /**
     * Extract and learn facts from user message
     */
    async extractFacts(message) {
        const startTime = Date.now();

        const prompt = `จากข้อความนี้ มีข้อมูลส่วนตัวหรือข้อเท็จจริงเกี่ยวกับผู้พูดที่ควรจดจำไหม?

ข้อความ: "${message}"

ถ้ามี ตอบเป็น JSON:
{"facts": ["ข้อเท็จจริง 1", "ข้อเท็จจริง 2"], "name": "ชื่อถ้าบอก หรือ null"}

ถ้าไม่มีข้อมูลใหม่ที่ควรจำ ตอบ: {"facts": [], "name": null}`;

        try {
            const result = await withTimeout(
                this.model.generateContent(prompt),
                8000,
                'Extract facts'
            );

            const parsed = parseJsonResponse(result.response.text());
            const duration = Date.now() - startTime;
            log.ai('extractFacts', duration, !!parsed);

            return parsed || { facts: [], name: null };

        } catch (error) {
            // Non-critical, fail silently
            return { facts: [], name: null };
        }
    }

    /**
     * Clear response history for a user (call on report submission or session reset)
     */
    clearHistory(userId) {
        recentResponses.delete(userId);
        messageCounters.delete(userId);
    }
}

// Singleton instance
export const aiService = new AIService();
export default aiService;
