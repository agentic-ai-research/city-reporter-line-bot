
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KB_FILE = path.join(__dirname, '../data/kb_index.json');
const OUTPUT_FILE = '/Users/non/.gemini/antigravity/brain/431141b8-d3f6-46eb-834f-863cb2a8f58e/knowledge_map.md';

function generateMap() {
    if (!fs.existsSync(KB_FILE)) {
        console.error('KB Index not found');
        return;
    }

    const data = JSON.parse(fs.readFileSync(KB_FILE, 'utf8'));
    const { fileIndex, contentIndex } = data;

    let md = '# 🗺️ Smart City Knowledge Map\n\n';
    md += `Based on **${fileIndex.length}** documents indexed from your Knowledge Base.\n\n`;

    // 1. Core Concepts (from Keywords)
    md += '## 🧠 Core Concepts Detected\n';
    const allKeywords = {};
    Object.values(contentIndex).forEach(doc => {
        if (doc.keywords) {
            doc.keywords.forEach(k => {
                allKeywords[k] = (allKeywords[k] || 0) + 1;
            });
        }
    });

    const topKeywords = Object.entries(allKeywords)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([k, count]) => `\`${k}\``)
        .join(', ');

    md += `> **Top Themes:** ${topKeywords}\n\n`;

    // 2. "Smart City" Insights
    md += '## 🏙️ "Smart City" Insights\n';
    md += 'Extracts containing "smart city" or "livable" from your primers:\n\n';

    let insightCount = 0;
    Object.values(contentIndex).forEach(doc => {
        if (insightCount >= 5) return;

        const content = doc.content.toLowerCase();
        if (content.includes('smart city') || content.includes('livable')) {
            // Find sentence
            const idx = content.indexOf('smart city');
            const start = Math.max(0, idx - 50);
            const end = Math.min(content.length, idx + 150);
            const snippet = doc.content.substring(start, end).replace(/\n/g, ' ').trim();

            md += `### 📄 ${doc.name}\n`;
            md += `"...${snippet}..."\n\n`;
            insightCount++;
        }
    });

    // 3. Document Index
    md += '## 📚 Document Index\n';
    md += '| Document Name | Type | Key Topics |\n';
    md += '|---|---|---|\n';

    fileIndex.slice(0, 20).forEach(file => {
        let topics = '-';
        if (contentIndex[file.id] && contentIndex[file.id].keywords) {
            topics = contentIndex[file.id].keywords.slice(0, 3).join(', ');
        }
        md += `| [${file.name}](${file.link}) | ${file.type.replace('application/', '')} | ${topics} |\n`;
    });

    if (fileIndex.length > 20) {
        md += `\n*(...and ${fileIndex.length - 20} more documents)*\n`;
    }

    fs.writeFileSync(OUTPUT_FILE, md);
    console.log(`Knowledge Map generated at ${OUTPUT_FILE}`);
}

generateMap();
