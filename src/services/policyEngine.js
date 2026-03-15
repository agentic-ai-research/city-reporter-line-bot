/**
 * Policy Engine Service
 * Aggregates city data and generates strategic intelligence briefs
 */
import { listReports } from './reportStore.js';
import { aiService } from './ai.service.js';
import { analyticsService } from './analytics.service.js';
import { loggers } from '../utils/logger.js';

const log = loggers.report; // Reuse report logger

export class PolicyEngine {

    /**
     * Generate a new Intelligence Brief
     */
    async generateBrief() {
        try {
            log.info('Starting Intelligence Brief generation...');

            // 1. Fetch Data
            const reports = await listReports();
            const socialStats = await analyticsService.getSocialPulse();

            // 2. Process Stats (Last 7 Days)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const recentReports = reports.filter(r => new Date(r.timestamp) > sevenDaysAgo);

            const stats = {
                totalReports7d: recentReports.length,
                resolved7d: recentReports.filter(r => r.status === 'completed').length,
                pendingTotal: reports.filter(r => r.status !== 'completed').length
            };

            // 3. Identify Hotspots (Simple clustering by location text)
            const locations = {};
            recentReports.forEach(r => {
                if (r.location_text) {
                    // Simple tokenization for grouping
                    const key = r.location_text.substring(0, 10);
                    locations[key] = (locations[key] || 0) + 1;
                }
            });
            const hotspots = Object.entries(locations)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([loc, count]) => `${loc}... (${count} reports)`);

            // 4. Critical Reports (High urgency)
            const criticalReports = recentReports
                .filter(r => r.urgency === 'สูง' || r.urgency === 'ด่วนที่สุด')
                .slice(0, 3)
                .map(r => ({
                    id: r.ticket_number,
                    type: r.problem_type,
                    desc: r.description
                }));

            // 5. Generate with AI
            const context = {
                stats,
                social: socialStats,
                hotspots,
                criticalReports
            };

            const briefContent = await aiService.generatePolicyBrief(context);

            // 6. Return (persistence will be handled by caller or added here)
            return {
                timestamp: new Date().toISOString(),
                content: briefContent,
                stats
            };

        } catch (error) {
            log.error('Policy Engine failed', error);
            throw error;
        }
    }
}

export const policyEngine = new PolicyEngine();
