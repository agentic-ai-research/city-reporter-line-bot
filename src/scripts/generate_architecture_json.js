import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, '../../');
const OUTPUT_PATH = process.argv[2] || 'system_codebase_v8.json';

const SYSTEM_ARCH = {
    name: "Smart City Reporter System (V8.0)",
    description: "A dual-platform (LINE + Telegram) chatbot for reporting city issues, powered by Gemini AI for analysis, Google Sheets for persistence, and a real-time Web Dashboard for operations. includes 'Loop Killer' state machine and 'Star Rating' system.",
    tech_stack: [
        "Node.js (Express)",
        "LINE Messaging API (Webhook)",
        "Telegram Bot API (Polling)",
        "Google Gemini 1.5 Flash (AI Vision & NLU)",
        "Google Sheets API (Database)",
        "Google Drive API (Storage)",
        "Vanilla JS/Tailwind (Dashboard)"
    ],
    architecture_flow: {
        "step_1": "User sends Image/Text/Location to Bot (LINE/Telegram).",
        "step_2": "Server receives event (Webhook for LINE, Polling for Telegram).",
        "step_3": "Server invokes 'aiProcessor.js' to analyze image/text using Gemini.",
        "step_4": "Data is normalized and saved to Google Sheets via 'googleSheets.js'.",
        "step_5": "Dashboard ('staff.html') polls '/api/reports' to update UI in real-time.",
        "step_6": "Staff updates status (Completed) -> User gets notification.",
        "step_7": "User rates service (1-5) -> Server updates 'Rating' column in Sheets."
    },
    component_dependencies: {
        "src/index.js": ["src/handlers/lineWebhook.js", "src/handlers/telegramBot.js", "src/services/googleSheets.js"],
        "src/handlers/lineWebhook.js": ["src/services/aiProcessor.js", "src/services/googleSheets.js", "src/services/googleDrive.js", "src/services/lineClient.js"],
        "src/handlers/telegramBot.js": ["src/services/aiProcessor.js", "src/services/googleSheets.js", "src/services/googleDrive.js"]
    },
    files: {}
};

const FILES_TO_INCLUDE = [
    'package.json',
    'Procfile',
    'src/index.js',
    'src/handlers/lineWebhook.js',
    'src/handlers/telegramBot.js',
    'src/handlers/conversationFlow.js',
    'src/handlers/debugLogger.js',
    'src/services/aiProcessor.js',
    'src/services/googleSheets.js',
    'src/services/googleDrive.js',
    'src/services/geocoding.js',
    'src/services/knowledgeBase.js',
    'src/services/lineClient.js',
    'src/utils/exif.js',
    'public/staff.html'
];

FILES_TO_INCLUDE.forEach(relPath => {
    try {
        const fullPath = path.join(ROOT, relPath);
        if (fs.existsSync(fullPath)) {
            SYSTEM_ARCH.files[relPath] = fs.readFileSync(fullPath, 'utf8');
        } else {
            SYSTEM_ARCH.files[relPath] = "[FILE NOT FOUND]";
        }
    } catch (e) {
        SYSTEM_ARCH.files[relPath] = `[ERROR READING FILE: ${e.message}]`;
    }
});

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(SYSTEM_ARCH, null, 2));
console.log(`Exported system to ${OUTPUT_PATH}`);
