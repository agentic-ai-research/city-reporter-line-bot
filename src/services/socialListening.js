/**
 * Social Listening Service
 * Captures, analyzes, and logs all conversations for city intelligence
 */

import { config } from '../config/index.js';
import { loggers } from '../utils/logger.js';
import { logConversationToSheet } from './googleSheets.js';
import { aiService } from './ai.service.js';

const log = loggers.ai;

class SocialListeningService {
    constructor() {
        this.sheetName = 'Conversations';
        this.ignoredTopics = ['undefined', 'null', 'none', 'n/a'];
    }

    /**
     * Log a conversation turn
     * @param {string} userId - User ID
     * @param {string} userMessage - Text sent by user
     * @param {string} aiResponse - Response sent by AI
     * @param {string} platform - 'line' or 'telegram'
     */
    async logConversation(userId, userMessage, aiResponse, platform = 'line') {
        try {
            // 1. Analyze sentiment and topics (lightweight AI call)
            const analysis = await this.analyzeMessage(userMessage);

            // 2. Prepare log data
            const timestamp = new Date().toISOString();
            const logEntry = {
                timestamp,
                userId,
                platform,
                userMessage,
                aiResponse,
                sentiment: analysis.sentiment,
                sentimentScore: analysis.score,
                topics: analysis.topics.join(', '),
                entities: analysis.entities.join(', ')
            };

            // 3. Fire and forget - log to Sheets
            this.appendToSheets(logEntry).catch(err =>
                log.error('Failed to log conversation to Sheets', err)
            );

            // 4. Update user profile statistics (in background)
            this.updateUserProfile(userId, analysis).catch(err =>
                log.error('Failed to update user profile', err)
            );

            return analysis;

        } catch (error) {
            log.error('Social listening log failed', error);
            return null;
        }
    }

    /**
     * Analyze message for sentiment and topics
     * Uses AI Service to save tokens, or a specialized lightweight model prompt
     */
    async analyzeMessage(text) {
        // Skip short messages to save AI cost/time
        if (!text || text.length < 4) {
            return { sentiment: 'neutral', score: 0, topics: [], entities: [] };
        }

        try {
            // [DEMO STABILITY] Disabled background AI analysis to preserve quota for chat
            /*
            const prompt = `Analyze this message for social listening.
...
            const result = await aiService.generateText(prompt);
            const responseText = result.response.text();

            // Parse JSON
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            */
            return { sentiment: 'neutral', score: 0, topics: [], entities: [] };
        } catch (e) {
            log.warn('Sentiment analysis failed', e);
        }

        return { sentiment: 'neutral', score: 0, topics: [], entities: [] };
    }

    /**
     * Append to Google Sheets
     */
    async appendToSheets(data) {
        // Row format: [Timestamp, UserID, Platform, UserMessage, BotResponse, Sentiment, Score, Topics, Entities]
        const values = [
            data.timestamp,
            data.userId,
            data.platform,
            data.userMessage,
            data.aiResponse,
            data.sentiment,
            data.score,
            data.topics,
            data.entities
        ];

        await logConversationToSheet(values);
    }

    /**
     * Update user profile stats
     */
    async updateUserProfile(userId, analysis) {
        // TODO: Implement user profile tracking
        // This would track engagement frequency, favorite topics, etc.
    }
}

export const socialListeningService = new SocialListeningService();
export default socialListeningService;
