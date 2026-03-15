
import 'dotenv/config';
import { getAllReports } from '../src/services/googleSheets.js';

async function auditData() {
    console.log('📊 Auditing Google Sheets Data...');
    try {
        const reports = await getAllReports();
        console.log(`Total Reports Found: ${reports.length}`);

        if (reports.length === 0) {
            console.log('⚠️ No reports found in the sheets.');
            return;
        }

        // Group by Date and Check Coordinates/Images
        const dates = {};
        let withCoords = 0;
        let withImages = 0;

        reports.forEach(r => {
            const date = r.timestamp?.substring(0, 10) || 'Unknown';
            dates[date] = (dates[date] || 0) + 1;
            if (r.latitude && r.longitude && parseFloat(r.latitude) !== 0) {
                withCoords++;
            }
            if (r.image_url && r.image_url.trim() !== '') {
                withImages++;
            }
        });

        console.log('\n📅 Reports by Date:');
        Object.keys(dates).sort().reverse().forEach(date => {
            console.log(`${date}: ${dates[date]} reports`);
        });

        console.log(`\n📍 Reports with valid Coordinates: ${withCoords} / ${reports.length}`);
        console.log(`🖼️  Reports with Image URLs: ${withImages} / ${reports.length}`);

        // List all Feb reports
        const febReports = reports.filter(r => r.timestamp?.startsWith('2026-02')).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        console.log(`\n📋 All Feb 2026 Reports (${febReports.length}):`);
        febReports.forEach(r => {
            const hasUrl = r.image_url && r.image_url.includes('google');
            console.log(`[${r.timestamp?.substring(5, 16)}] ${r.ticket_number || 'N/A'}: ${hasUrl ? '✅' : '❌'} ${r.image_url || 'EMPTY'}`);
        });

        // Check for recent data (Feb 14-18)
        const recentCount = Object.keys(dates)
            .filter(d => d.startsWith('2026-02'))
            .reduce((sum, d) => sum + dates[d], 0);

        console.log(`\nVerified Recent Reports (Feb 2026): ${recentCount}`);

        if (recentCount === 0) {
            console.log('🚨 WARNING: No reports found for Feb 2026! This might confirm the user\'s fear of lost data.');
        } else {
            console.log('✅ Recent data is present.');
        }

    } catch (error) {
        console.error('❌ Audit Failed:', error.message);
    }
}

auditData();
