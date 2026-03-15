/**
 * Analytics Service
 * Processes conversation data for the dashboard
 */
import { getAllConversations, getAllReports } from './googleSheets.js';
import { loggers } from '../utils/logger.js';

const log = loggers.report; // Reuse report logger or create new one

export class AnalyticsService {

    /**
     * Get Social Pulse data
     * - Sentiment trends
     * - Topic distribution
     * - Activity over time
     */
    async getSocialPulse() {
        try {
            const conversations = await getAllConversations();

            if (!conversations || conversations.length === 0) {
                return {
                    totalConversations: 0,
                    sentiment: { positive: 0, neutral: 0, negative: 0, urgent: 0 },
                    topics: [],
                    recentActivity: []
                };
            }

            // 1. Sentiment Stats
            const sentiment = { positive: 0, neutral: 0, negative: 0, urgent: 0 };
            conversations.forEach(c => {
                const s = c.sentiment?.toLowerCase() || 'neutral';
                if (sentiment[s] !== undefined) sentiment[s]++;
                else sentiment.neutral++;
            });

            // 2. Topic Analysis
            const topicCounts = {};
            conversations.forEach(c => {
                c.topics.forEach(t => {
                    if (t && t.length > 2) {
                        topicCounts[t] = (topicCounts[t] || 0) + 1;
                    }
                });
            });

            const sortedTopics = Object.entries(topicCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10) // Top 10
                .map(([topic, count]) => ({ topic, count }));

            // 3. Activity (Last 24h)
            // Simplified: just return last 20 entries
            const recentActivity = conversations
                .slice(-20)
                .reverse() // Newest first
                .map(c => ({
                    time: c.timestamp,
                    user: c.userId.substring(0, 8),
                    message: c.userMessage,
                    sentiment: c.sentiment
                }));

            return {
                totalConversations: conversations.length,
                sentiment,
                topics: sortedTopics,
                recentActivity
            };

        } catch (error) {
            log.error('Analytics failed', error);
            return null;
        }
    }

    /**
     * Get combined dashboard stats (Report + Social)
     */
    async getDashboardStats() {
        // Can be expanded to merge report stats with social stats
        return await this.getSocialPulse();
    }
}

export const analyticsService = new AnalyticsService();
