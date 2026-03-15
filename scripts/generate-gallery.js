
import 'dotenv/config';
import fs from 'fs';
import { getAllReports } from '../src/services/googleSheets.js';

async function generateGallery() {
    console.log('🖼️  Generating Photo Gallery...');
    try {
        const reports = await getAllReports();
        const febReports = reports.filter(r => r.timestamp?.startsWith('2026-02')).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        let html = `
<!DOCTYPE html>
<html>
<head>
    <title>Demo Photo Audit</title>
    <style>
        body { font-family: sans-serif; background: #0a0a0a; color: #fff; padding: 40px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; }
        .card { background: #1a1a1a; padding: 15px; border-radius: 12px; border: 1px solid #333; }
        img { width: 100%; border-radius: 8px; height: 180px; object-fit: cover; background: #000; }
        .ticket { font-weight: bold; color: #0a84ff; margin-bottom: 5px; }
        .meta { font-size: 10px; color: #666; margin-top: 10px; }
    </style>
</head>
<body>
    <h1>🖼️ Demo Photo Audit (Feb 13-14)</h1>
    <p>This gallery displays all images successfully retrieved from the Google Sheet for the demo period.</p>
    <div class="grid">
`;

        febReports.forEach(r => {
            const displayUrl = r.image_url && r.image_url.includes('google')
                ? r.image_url.replace('google.com/d/', 'google.com/thumbnail?sz=w500&id=').split('&id=')[1]
                    ? `https://drive.google.com/thumbnail?id=${r.image_url.split('/d/')[1]}&sz=w500`
                    : r.image_url
                : r.image_url;

            html += `
        <div class="card">
            <div class="ticket">${r.ticket_number || 'N/A'}</div>
            <img src="${displayUrl}" onerror="this.src='https://placehold.co/400x300/101010/333?text=Load+Error'">
            <div class="meta">
                ${r.timestamp}<br>
                ${r.problem_type}
            </div>
        </div>`;
        });

        html += `
    </div>
</body>
</html>`;

        fs.writeFileSync('demo_gallery.html', html);
        console.log('✅ Gallery generated: demo_gallery.html');
    } catch (error) {
        console.error('❌ Failed:', error.message);
    }
}

generateGallery();
