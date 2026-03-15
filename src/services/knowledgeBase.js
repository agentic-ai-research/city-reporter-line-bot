/**
 * Knowledge Base Service
 *
 * Smart indexing system that:
 * 1. Indexes Google Drive folder contents
 * 2. Extracts text from documents for semantic search
 * 3. Maintains hardcoded Q&A for instant responses
 * 4. Provides context for AI conversations
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { PDFParse } from 'pdf-parse';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRIVES_FOLDER_ID = process.env.GOOGLE_DRIVE_KB_FOLDER_ID;
const INDEX_FILE_PATH = path.join(__dirname, '../../data/kb_index.json');

// OAuth setup
const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
);
auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth });

// In-memory index
let kbIndex = null;
let contentIndex = {};  // Extracted text content from files
let lastIndexTime = null;

// ============================================
// HARDCODED KNOWLEDGE BASE (Instant Responses)
// ============================================
const HARDCODED_KB = [
    // Smart City Fundamentals
    {
        keywords: ['กี่ด้าน', '7 ด้าน', 'ด้านอะไรบ้าง', 'องค์ประกอบ', 'seven dimensions', 'components', 'dimension'],
        answer: '🏙️ Smart City Thailand ประกอบด้วย 7 ด้านหลักครับ:\n\n1. 🍃 Smart Environment (สิ่งแวดล้อมอัจฉริยะ)\n2. 🚌 Smart Mobility (การเดินทางอัจฉริยะ)\n3. 🏠 Smart Living (การดำรงชีวิตอัจฉริยะ)\n4. 👥 Smart People (พลเมืองอัจฉริยะ)\n5. ⚡ Smart Energy (พลังงานอัจฉริยะ)\n6. 💰 Smart Economy (เศรษฐกิจอัจฉริยะ)\n7. 🏛️ Smart Governance (การบริหารภาครัฐอัจฉริยะ)',
        category: 'framework'
    },
    {
        keywords: ['smart city', 'สมาร์ทซิตี้', 'คืออะไร', 'what is', 'เมืองอัจฉริยะ', 'samastity', 'samart city', 'smartcity'],
        answer: 'Smart City (เมืองอัจฉริยะ) ไม่ใช่แค่เรื่องของเทคโนโลยีหรือภาครัฐฝ่ายเดียวครับ แต่คือ "แพลตฟอร์ม" ที่ต้องดึงศักยภาพของภาคเอกชนและนวัตกรรมมาช่วยแก้ปัญหา เพื่อเพิ่มประสิทธิภาพการบริการและลดการใช้ทรัพยากร โดยเป้าหมายสูงสุดคือการทำให้เมืองน่าอยู่ขึ้นสำหรับทุกคนครับ\n\n💡 หัวใจสำคัญ: โซลูชันจากเอกชน (Private Solutions) เป็นฟันเฟืองที่จะทำให้เมืองสาธารณะ (Public City) พัฒนาไปได้จริงครับ',
        category: 'definition'
    },
    {
        keywords: ['ติดต่อ', 'เบอร์โทร', 'call center', 'contact', 'phone', 'email'],
        answer: '📞 ติดต่อศูนย์บัญชาการ Smart City Thailand:\n\n🏢 สำนักงานส่งเสริมเศรษฐกิจดิจิทัล (อาคาร A) 234/431 ถนนลาดพร้าว ซอยลาดพร้าว 10 แขวงจอมพล เขตจตุจักร กรุงเทพมหานคร 10900 Tel : +66 2026 2333 Email : scp@depa.or.th\n🌐 Website: depa.or.th',
        category: 'contact'
    },
    // Dr. Non's Philosophy
    {
        keywords: ['philosophy', 'ultimate goal', 'ปรัชญา', 'เป้าหมาย', 'human city', 'people first', 'คน'],
        answer: '💡 Non\'s Smart City Philosophy:\n\n"A smarter city is ultimately the most human city. We have to build people first, because without people, cities are just buildings anyway."\n\n✨ เมืองอัจฉริยะที่สุด คือเมืองที่มีความเป็นมนุษย์มากที่สุด\n\nเราต้องสร้างคนก่อน เพราะเมืองที่ไม่มีคนก็เป็นแค่ตึก ไม่มี Smart People ก็ยากที่จะมีเมืองที่น่าอยู่',
        category: 'philosophy'
    },
    {
        keywords: ['livability', 'livable', 'smartness', 'น่าอยู่', 'relationship', 'tool'],
        answer: '🏙️ Smart + Livable = Non\'s Formula:\n\n"The smartness becomes a tool that makes livability a reality, and not just something that we can only dream of."\n\n💡 ความอัจฉริยะเป็นเครื่องมือที่ทำให้ความน่าอยู่เป็นจริงได้\n\nไม่ใช่แค่ความฝัน - แต่เป็นสิ่งที่วัดได้ ทำได้ และปรับปรุงได้',
        category: 'philosophy'
    },
    // ABCDE Framework
    {
        keywords: ['abcde', 'framework', 'a b c d e', 'กรอบ', 'citizen-centric', 'inclusive'],
        answer: '📋 Thailand\'s ABCDE Framework for Smart City:\n\n🅰️ Affordabilities - ความสามารถในการจ่าย (ไม่แพงเกินไป)\n🅱️ Bureaucracies - ระบบราชการ (ต้องปรับให้เร็วขึ้น)\n🅲️ Capacities - ขีดความสามารถ (บุคลากร + เครื่องมือ)\n🅳️ Design - การออกแบบ (User-centric)\n🅴️ Equity/Inclusion - ความเท่าเทียม (ไม่ทิ้งใครไว้ข้างหลัง)\n\n🎯 Framework นี้ช่วยให้ technology adoption เป็น citizen-centric และ impactful!',
        category: 'framework'
    },
    // Implementation Wisdom
    {
        keywords: ['policy', 'implementation', 'นโยบาย', 'covid', 'strategy', 'execute'],
        answer: '📊 Non on Policy vs Implementation:\n\n"Policy is really not useful unless you really have a strategy for implementation."\n\n💡 นโยบายไม่มีประโยชน์ถ้าไม่มียุทธศาสตร์ในการนำไปใช้จริง\n\nช่วง COVID ผมย้ายจาก policy ลงมา implementation เพราะเห็นว่าถ้าไม่ลงมือทำ ทุกอย่างก็เป็นแค่กระดาษ',
        category: 'implementation'
    },
    {
        keywords: ['learning', 'reinvent', 'wheel', 'เรียนรู้', 'mistakes', 'countries', 'best practice'],
        answer: '🌍 Non on Learning from Others:\n\n"Reinventing the wheels every time we want to do something new is costly, time consuming, and labor intensive. The best approach is to learn from other people, especially their mistakes."\n\n📚 การเรียนรู้จากความผิดพลาดของคนอื่นช่วยให้เราพัฒนาได้เร็วขึ้น\n\nไทยไม่จำเป็นต้องทำทุกอย่างใหม่ - ศึกษา adapt และ improve จากที่อื่น',
        category: 'implementation'
    },
    // AI & Technology
    {
        keywords: ['ai', 'useful', 'artificial intelligence', 'ปัญญาประดิษฐ์', 'machine learning'],
        answer: '🤖 Non on AI for Public Services:\n\n"We don\'t need to talk about whether or not AI is useful anymore, because it is. The answer depends on how we use it."\n\n💡 ไม่ต้องถกเถียงอีกเลยว่า AI มีประโยชน์หรือไม่\n\nคำตอบอยู่ที่เราใช้มันอย่างไร - ใช้เพื่อ empower คน ไม่ใช่ replace คน',
        category: 'technology'
    },
    // Case Studies
    {
        keywords: ['electricity', 'carbon', 'building', 'energy saving', 'gpu', 'reduction', 'ไฟฟ้า', 'พลังงาน'],
        answer: '🏢 Case Study: AI Energy Reduction\n\n"A system using AI algorithms running on GPUs inside a building achieved a reduction in electricity consumption of almost 200 million baht in one year, which significantly reduced the carbon footprint."\n\n⚡ ระบบ AI ลด Carbon footprint และค่าไฟได้เกือบ 200 ล้านบาทต่อปี!\n\nนี่คือตัวอย่างที่ AI สร้าง ROI ที่วัดได้จริง',
        category: 'case_study'
    },
    {
        keywords: ['phuket', 'traffic', 'roundabout', 'ภูเก็ต', 'จราจร', 'วงเวียน'],
        answer: '🚗 Case Study: Phuket Traffic AI\n\n"In Phuket, by using AI analysis of one main roundabout, it was possible - just by extending the solid lines on the ground - to completely change traffic flow and eliminate traffic jams."\n\n🎯 เปลี่ยนเส้นจราจรเพียงเล็กน้อยจาก AI analysis\n\nไม่ต้องสร้างถนนใหม่ ไม่ต้องใช้เงินมหาศาล - แค่ใช้ data ให้เป็น',
        category: 'case_study'
    },
    // Procurement & Governance
    {
        keywords: ['startup', 'kpi', 'success', 'innovation hub', 'series a', 'ipo', 'วัดผล'],
        answer: '📈 Non on Measuring Startup Success:\n\n"The KPI should be the number of startups that can get Series A, Series B or IPO. Many hubs that claim to be successful only look at outputs like the number of participants or events - which is not a true measure of success."\n\n🎯 ตัวชี้วัดความสำเร็จที่แท้จริง = จำนวน Startups ที่ได้ Series A/B หรือ IPO\n\nไม่ใช่แค่จำนวนคนเข้าร่วมหรือจำนวนงาน',
        category: 'governance'
    },
    {
        keywords: ['cloud', 'procurement', 'intangible', 'mayor', 'data center', 'จัดซื้อ'],
        answer: '☁️ Non on Procuring Intangible Tech:\n\n"When you want to procure a cloud system, you can\'t touch it. I sometimes have to show the data center to the mayor, so the mayor feels very safe about putting his data on the cloud rather than on premise."\n\n💡 เทคโนโลยีที่จับต้องไม่ได้ต้องนำเสนอให้ผู้บริหารเห็นภาพ\n\nบางทีต้องพา mayor ไปดู data center จริงๆ',
        category: 'governance'
    },
    {
        keywords: ['aid', 'technical assistance', 'ustda', 'kdi', 'jica', 'development agency', 'ความช่วยเหลือ', 'foreign'],
        answer: '🌐 Non on International Development Assistance:\n\n"The one purpose of all this... is to open up opportunities for their companies, for their own country. If it works, we can buy more products from the country."\n\n💼 จุดประสงค์ของโครงการความช่วยเหลือคือการเปิดโอกาสให้บริษัทของประเทศผู้ให้\n\nเข้าใจ dynamics นี้ แล้วใช้ประโยชน์ให้เป็น - Win-Win Business',
        category: 'governance'
    },
    // Liverpool (for fun!)
    {
        keywords: ['liverpool', 'ลิเวอร์พูล', 'หงส์แดง', 'reds', 'anfield', 'klopp', 'slot'],
        answer: '⚽ Non on Liverpool FC:\n\nAs a systems analyst who happens to support Liverpool:\n\n"Football tactics are like urban planning - it\'s about shape, constraints, and tradeoffs. The best teams, like the best cities, create systems where individual brilliance can flourish within collective structure."\n\n🔴 YNWA - You\'ll Never Walk Alone',
        category: 'liverpool'
    }
];

// ============================================
// INDEXING FUNCTIONS
// ============================================

let isIndexing = false;

/**
 * Build a comprehensive index from Google Drive KB folder
 * Includes file metadata + extracted text content
 */
export async function indexKnowledgeBase(force = false) {
    if (isIndexing) {
        console.log('📑 Indexing already in progress, skipping...');
        return kbIndex || [];
    }

    if (!DRIVES_FOLDER_ID) {
        console.log('📑 No KB folder ID configured, using hardcoded KB only');
        return HARDCODED_KB;
    }

    // Try loading from cache first to save startup time
    if (!force && fs.existsSync(INDEX_FILE_PATH)) {
        try {
            const raw = fs.readFileSync(INDEX_FILE_PATH, 'utf8');
            const cache = JSON.parse(raw);
            const ageHours = (new Date() - new Date(cache.timestamp)) / (1000 * 60 * 60);

            // Always load cache first to be responsive
            kbIndex = cache.fileIndex;
            contentIndex = cache.contentIndex || {};

            if (ageHours < 24) {
                console.log(`📑 Loaded KB from cache (${cache.fileIndex.length} files, ${ageHours.toFixed(1)}h old)`);
                return kbIndex;
            }

            console.log(`📑 KB cache expired (${ageHours.toFixed(1)}h old). Using stale data and refreshing in background...`);
            // Trigger background refresh (don't await)
            indexKnowledgeBase(true).catch(err => console.error('Background KB refresh failed:', err));
            return kbIndex;

        } catch (e) {
            console.warn('⚠️ Corrupt KB cache, re-indexing:', e.message);
        }
    }

    try {
        isIndexing = true;
        console.log('📑 Building KB Index from Google Drive...');

        // List all files in KB folder (including subfolders)
        const files = await listAllFiles(DRIVES_FOLDER_ID);

        // Don't clear immediately if we have stale data, build new first
        const newKbIndex = [];
        const newContentIndex = {};

        console.log(`📑 Processing ${files.length} files...`);
        let count = 0;

        for (const file of files) {
            count++;
            const entry = {
                id: file.id,
                name: file.name,
                link: file.webViewLink,
                desc: file.description || '',
                type: file.mimeType,
                modifiedTime: file.modifiedTime
            };

            newKbIndex.push(entry);

            // Extract content for text-based files
            if (isTextBasedFile(file.mimeType)) {
                try {
                    process.stdout.write(`  [${count}/${files.length}] Digesting: ${file.name}... `);
                    const content = await extractFileContent(file.id, file.mimeType);
                    if (content) {
                        newContentIndex[file.id] = {
                            name: file.name,
                            content: content.substring(0, 10000), // Limit to 10k chars per file
                            keywords: extractKeywords(content + ' ' + file.name)
                        };
                        process.stdout.write(`✅ (${content.length} chars)\n`);
                    } else {
                        process.stdout.write(`⚠️ (No content extracted)\n`);
                    }
                } catch (e) {
                    process.stdout.write(`❌ Error: ${e.message}\n`);
                }
            }
        }

        // Atomically swap
        kbIndex = newKbIndex;
        contentIndex = newContentIndex;

        // Save index to file for persistence
        saveIndexToFile();

        lastIndexTime = new Date();
        console.log(`\n🎉 RE-INDEX COMPLETE!`);
        console.log(`✅ Indexed ${kbIndex.length} files total.`);
        console.log(`✅ Digested content from ${Object.keys(contentIndex).length} documents.`);

        return kbIndex;

    } catch (e) {
        console.error('❌ Indexing failed:', e.message);
        // Try to load from saved file if we don't have one
        if (!kbIndex) loadIndexFromFile();
        return kbIndex || [];
    } finally {
        isIndexing = false;
    }
}

/**
 * List all files recursively in a folder
 */
async function listAllFiles(folderId, allFiles = []) {
    try {
        // Debug: Check folder access first
        if (allFiles.length === 0) {
            try {
                const folderMeta = await drive.files.get({
                    fileId: folderId,
                    fields: 'name, capabilities(canListChildren)',
                    supportsAllDrives: true
                });
                console.log(`📂 Target Folder: ${folderMeta.data.name} (Can List: ${folderMeta.data.capabilities?.canListChildren})`);
            } catch (err) {
                console.error(`❌ Cannot access folder ${folderId}:`, err.message);
                return [];
            }
        }

        console.log(`🔎 Listing files in ${folderId}...`);
        let pageToken = null;
        let folderFiles = [];

        do {
            const res = await drive.files.list({
                q: `'${folderId}' in parents and trashed = false`,
                fields: 'nextPageToken, files(id, name, webViewLink, description, mimeType, modifiedTime)',
                pageSize: 100,
                pageToken: pageToken,
                supportsAllDrives: true,
                includeItemsFromAllDrives: true
            });

            if (res.data.files) {
                folderFiles = folderFiles.concat(res.data.files);
            }
            pageToken = res.data.nextPageToken;
        } while (pageToken);

        console.log(`   found ${folderFiles.length} items.`);

        for (const file of folderFiles) {

            if (file.mimeType === 'application/vnd.google-apps.folder') {
                // Recurse into subfolders
                await listAllFiles(file.id, allFiles);
            } else {
                allFiles.push(file);
            }
        }

        return allFiles;
    } catch (e) {
        console.error('Error listing files:', e.message);
        return allFiles;
    }
}

/**
 * Check if file type supports text extraction
 */
function isTextBasedFile(mimeType) {
    const textTypes = [
        'application/vnd.google-apps.document',
        'application/vnd.google-apps.spreadsheet',
        'application/vnd.google-apps.presentation',
        'text/plain',
        'text/markdown',
        'application/pdf'
    ];
    return textTypes.some(t => mimeType.includes(t));
}

/**
 * Extract text content from a file
 */
async function extractFileContent(fileId, mimeType) {
    try {
        if (mimeType.includes('google-apps.document')) {
            // Export Google Doc as plain text
            const res = await drive.files.export({
                fileId: fileId,
                mimeType: 'text/plain'
            });
            return res.data;
        } else if (mimeType.includes('google-apps.spreadsheet')) {
            // Export Google Sheet as CSV
            const res = await drive.files.export({
                fileId: fileId,
                mimeType: 'text/csv'
            });
            return res.data;
        } else if (mimeType.includes('google-apps.presentation')) {
            // Export Google Slides as plain text
            const res = await drive.files.export({
                fileId: fileId,
                mimeType: 'text/plain'
            });
            return res.data;
        } else if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
            // Download text file directly
            const res = await drive.files.get({
                fileId: fileId,
                alt: 'media'
            });
            return res.data;
        } else if (mimeType === 'application/pdf') {
            // SECURITY/STABILITY: Disable PDF text extraction on Render free tier
            // Parsing 100+ PDFs simultaneously causes Out-Of-Memory (OOM) crashes on 512MB instances.
            // We still index the file metadata (name, url), but skip full-text extraction.
            if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
                return null;
            }

            // Download PDF as arraybuffer
            const res = await drive.files.get({
                fileId: fileId,
                alt: 'media'
            }, { responseType: 'arraybuffer' });

            // Extract text using pdf-parse
            const parser = new PDFParse({ data: res.data });
            const data = await parser.getText();
            const text = data.text;
            await parser.destroy();
            return text;

        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Extract keywords from text for better matching
 */
function extractKeywords(text) {
    if (!text) return [];

    // Normalize and split
    const words = text.toLowerCase()
        .replace(/[^\u0E00-\u0E7Fa-z0-9\s]/g, ' ')  // Keep Thai and English alphanumeric
        .split(/\s+/)
        .filter(w => w.length > 2);

    // Count frequency
    const freq = {};
    words.forEach(w => {
        freq[w] = (freq[w] || 0) + 1;
    });

    // Return top keywords
    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([word]) => word);
}

/**
 * Save index to file for persistence
 */
function saveIndexToFile() {
    try {
        const data = {
            timestamp: new Date().toISOString(),
            fileIndex: kbIndex,
            contentIndex: contentIndex
        };
        fs.writeFileSync(INDEX_FILE_PATH, JSON.stringify(data, null, 2));
        console.log('💾 KB index saved to file');
    } catch (e) {
        console.error('Error saving KB index:', e.message);
    }
}

/**
 * Load index from file
 */
function loadIndexFromFile() {
    try {
        if (fs.existsSync(INDEX_FILE_PATH)) {
            const data = JSON.parse(fs.readFileSync(INDEX_FILE_PATH, 'utf8'));
            kbIndex = data.fileIndex || [];
            contentIndex = data.contentIndex || {};
            lastIndexTime = new Date(data.timestamp);
            console.log(`📂 Loaded KB index from file (${kbIndex.length} files)`);
            return true;
        }
    } catch (e) {
        console.error('Error loading KB index:', e.message);
    }
    return false;
}

// ============================================
// SEARCH FUNCTIONS
// ============================================

/**
 * Smart Search - checks hardcoded KB first, then content index, then file names
 * Returns answer text and optional context for AI
 */
export async function searchKnowledgeBase(query) {
    const lowerQuery = query.toLowerCase();

    // 1. Check Hardcoded KB First (Fastest & Guaranteed)
    const hardcodedHit = HARDCODED_KB.find(item =>
        item.keywords.some(k => lowerQuery.includes(k.toLowerCase()))
    );
    if (hardcodedHit) {
        return {
            answer: hardcodedHit.answer,
            source: 'hardcoded',
            category: hardcodedHit.category
        };
    }

    // 2. Search Content Index (Semantic-ish search)
    const contentHits = searchContentIndex(lowerQuery);
    if (contentHits.length > 0) {
        const relevantContent = contentHits
            .slice(0, 3)
            .map(hit => `📄 ${hit.name}:\n${hit.excerpt}`)
            .join('\n\n');

        return {
            answer: null,  // Let AI generate answer based on context
            context: relevantContent,
            source: 'content_index',
            files: contentHits.map(h => ({ name: h.name, link: h.link }))
        };
    }

    // 3. Search File Names
    if (!kbIndex) await indexKnowledgeBase();
    if (kbIndex && kbIndex.length > 0) {
        const fileHits = kbIndex.filter(f =>
            f.name.toLowerCase().includes(lowerQuery) ||
            (f.desc && f.desc.toLowerCase().includes(lowerQuery))
        ).slice(0, 3);

        if (fileHits.length > 0) {
            let reply = `🔎 พบข้อมูลที่เกี่ยวข้องในคลังความรู้ SCTH:\n\n`;
            fileHits.forEach(f => {
                reply += `📄 ${f.name}\n🔗 ${f.link}\n\n`;
            });

            return {
                answer: reply,
                source: 'file_index',
                files: fileHits
            };
        }
    }

    // 4. Live Search in Google Drive (Fallback)
    if (DRIVES_FOLDER_ID) {
        try {
            const res = await drive.files.list({
                q: `'${DRIVES_FOLDER_ID}' in parents and fullText contains '${query}' and trashed = false`,
                fields: 'files(id, name, webViewLink)',
                pageSize: 3
            });

            if (res.data.files && res.data.files.length > 0) {
                let reply = `🔎 พบข้อมูลในคลังความรู้:\n\n`;
                res.data.files.forEach(f => {
                    reply += `📄 ${f.name}\n🔗 ${f.webViewLink}\n\n`;
                });

                return {
                    answer: reply,
                    source: 'live_search',
                    files: res.data.files
                };
            }
        } catch (e) {
            console.error('Live search error:', e.message);
        }
    }

    return null;
}

/**
 * Search within extracted content
 */
function searchContentIndex(query) {
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const results = [];

    for (const [fileId, data] of Object.entries(contentIndex)) {
        const content = data.content.toLowerCase();
        const name = data.name.toLowerCase();

        // Score based on keyword matches
        let score = 0;
        let matchedTerms = [];

        for (const word of queryWords) {
            if (content.includes(word)) {
                score += 2;
                matchedTerms.push(word);
            }
            if (name.includes(word)) {
                score += 3;
                matchedTerms.push(word);
            }
            if (data.keywords && data.keywords.includes(word)) {
                score += 1;
            }
        }

        if (score > 0) {
            // Extract relevant excerpt
            const excerpt = extractRelevantExcerpt(data.content, matchedTerms);
            const fileEntry = kbIndex?.find(f => f.id === fileId);

            results.push({
                fileId,
                name: data.name,
                link: fileEntry?.link,
                score,
                excerpt,
                matchedTerms
            });
        }
    }

    return results.sort((a, b) => b.score - a.score);
}

/**
 * Extract a relevant excerpt containing matched terms
 */
function extractRelevantExcerpt(content, matchedTerms) {
    if (!content || matchedTerms.length === 0) return content?.substring(0, 200);

    const lowerContent = content.toLowerCase();
    let bestStart = 0;

    // Find position of first matched term
    for (const term of matchedTerms) {
        const pos = lowerContent.indexOf(term);
        if (pos !== -1) {
            bestStart = Math.max(0, pos - 50);
            break;
        }
    }

    return content.substring(bestStart, bestStart + 300) + '...';
}

/**
 * Get context from knowledge base for AI conversations
 * This provides relevant background info to make AI smarter
 */
export async function getKnowledgeContext(query) {
    const result = await searchKnowledgeBase(query);

    if (!result) return null;

    if (result.context) {
        return result.context;
    }

    if (result.answer && result.source === 'hardcoded') {
        return `[From Non's Knowledge Base]\n${result.answer}`;
    }

    return null;
}

/**
 * Get all categories available in hardcoded KB
 */
export function getKBCategories() {
    const categories = {};
    HARDCODED_KB.forEach(item => {
        categories[item.category] = (categories[item.category] || 0) + 1;
    });
    return categories;
}

/**
 * Force refresh the index
 */
export async function refreshIndex() {
    console.log('🔄 Force refreshing KB index...');
    kbIndex = null;
    contentIndex = {};
    return await indexKnowledgeBase();
}

// Export for use in other services
export { HARDCODED_KB };
