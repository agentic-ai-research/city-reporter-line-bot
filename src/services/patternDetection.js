/**
 * Pattern Detection Service
 * UN-Habitat GeoAI: Early warning through temporal & spatial clustering
 */

import { listReports } from './reportStore.js';

// Haversine distance in meters
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Detect geographic clusters of reports
 * @param {Array} reports - Array of reports
 * @param {number} radiusMeters - Cluster radius (default 500m)
 * @param {number} minReports - Minimum reports to form cluster (default 3)
 * @returns {Array} Array of cluster alerts
 */
export function detectGeographicClusters(reports, radiusMeters = 500, minReports = 3) {
    const recentReports = reports.filter(r => {
        if (!r.latitude || !r.longitude) return false;
        const reportDate = new Date(r.timestamp);
        const hoursDiff = (Date.now() - reportDate.getTime()) / (1000 * 60 * 60);
        return hoursDiff <= 24; // Last 24 hours
    });

    const clusters = [];
    const processed = new Set();

    for (const report of recentReports) {
        if (processed.has(report.report_id)) continue;

        const cluster = [report];
        const lat1 = parseFloat(report.latitude);
        const lon1 = parseFloat(report.longitude);

        for (const other of recentReports) {
            if (other.report_id === report.report_id || processed.has(other.report_id)) continue;

            const lat2 = parseFloat(other.latitude);
            const lon2 = parseFloat(other.longitude);
            const distance = haversineDistance(lat1, lon1, lat2, lon2);

            if (distance <= radiusMeters) {
                cluster.push(other);
                processed.add(other.report_id);
            }
        }

        if (cluster.length >= minReports) {
            const centerLat = cluster.reduce((sum, r) => sum + parseFloat(r.latitude), 0) / cluster.length;
            const centerLng = cluster.reduce((sum, r) => sum + parseFloat(r.longitude), 0) / cluster.length;

            // Analyze categories in cluster
            const categories = {};
            cluster.forEach(r => {
                const cat = r.problem_type || 'อื่นๆ';
                categories[cat] = (categories[cat] || 0) + 1;
            });

            const dominantCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];

            clusters.push({
                type: 'GEOGRAPHIC_CLUSTER',
                severity: cluster.length >= 5 ? 'high' : 'medium',
                reportCount: cluster.length,
                centerLat,
                centerLng,
                radiusMeters,
                dominantCategory: dominantCategory[0],
                categoryBreakdown: categories,
                reportIds: cluster.map(r => r.report_id),
                message: `🚨 ${cluster.length} รายงานในรัศมี ${radiusMeters}m (ส่วนใหญ่: ${dominantCategory[0]})`
            });
        }

        processed.add(report.report_id);
    }

    return clusters;
}

/**
 * Detect category spikes (unusual increase in specific problem types)
 * @param {Array} reports - Array of reports
 * @returns {Array} Array of spike alerts
 */
export function detectCategorySpikes(reports) {
    const now = new Date();
    const last24h = reports.filter(r => {
        const reportDate = new Date(r.timestamp);
        return (now - reportDate) / (1000 * 60 * 60) <= 24;
    });
    const previous7d = reports.filter(r => {
        const reportDate = new Date(r.timestamp);
        const hoursDiff = (now - reportDate) / (1000 * 60 * 60);
        return hoursDiff > 24 && hoursDiff <= 168;
    });

    // Calculate daily average per category from previous 7 days
    const baseline = {};
    previous7d.forEach(r => {
        const cat = r.problem_type || 'อื่นๆ';
        baseline[cat] = (baseline[cat] || 0) + 1;
    });
    Object.keys(baseline).forEach(cat => {
        baseline[cat] = baseline[cat] / 7; // Daily average
    });

    // Current 24h counts
    const current = {};
    last24h.forEach(r => {
        const cat = r.problem_type || 'อื่นๆ';
        current[cat] = (current[cat] || 0) + 1;
    });

    const spikes = [];
    for (const [category, count] of Object.entries(current)) {
        const avg = baseline[category] || 1;
        const ratio = count / avg;

        if (ratio >= 2 && count >= 3) { // At least 2x and min 3 reports
            spikes.push({
                type: 'CATEGORY_SPIKE',
                severity: ratio >= 3 ? 'high' : 'medium',
                category,
                currentCount: count,
                baselineAvg: avg.toFixed(1),
                ratio: ratio.toFixed(1),
                message: `⚠️ ${category}: ${count} รายงานใน 24 ชม. (สูงกว่าปกติ ${ratio.toFixed(1)}x)`
            });
        }
    }

    return spikes;
}

/**
 * Get all early warnings
 * @returns {Object} Combined alerts and analytics
 */
export async function getEarlyWarnings() {
    try {
        const reports = await listReports();

        const geoClusters = detectGeographicClusters(reports);
        const categorySpikes = detectCategorySpikes(reports);

        // Unique device/user analytics
        const uniqueUsers = new Set(reports.map(r => r.user_id)).size;
        const usersByPlatform = {
            line: reports.filter(r => r.user_id && !r.user_id.startsWith('tg_')).length,
            telegram: reports.filter(r => r.user_id && r.user_id.startsWith('tg_')).length
        };

        return {
            alerts: [...geoClusters, ...categorySpikes].sort((a, b) =>
                a.severity === 'high' ? -1 : b.severity === 'high' ? 1 : 0
            ),
            analytics: {
                totalReports: reports.length,
                uniqueDevices: uniqueUsers,
                platformBreakdown: usersByPlatform,
                alertCount: geoClusters.length + categorySpikes.length
            }
        };
    } catch (error) {
        console.error('Early warning error:', error);
        return { alerts: [], analytics: {} };
    }
}
