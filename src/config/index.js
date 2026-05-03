/**
 * Centralized Configuration Module
 * All environment variables and constants in one place
 */

const defaultPort = parseInt(process.env.PORT || '3000', 10);
// Public-facing URL the bot is reachable on. Set EXTERNAL_BASE_URL when running
// behind a Cloudflare Tunnel (or any reverse proxy). Falls back to Render's
// platform-provided vars for backward compat.
const externalBaseUrl = process.env.EXTERNAL_BASE_URL
    || process.env.RENDER_EXTERNAL_URL
    || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : '');
const defaultCallbackUrl = externalBaseUrl
    ? `${externalBaseUrl}/oauth2callback`
    : `http://localhost:${defaultPort}/oauth2callback`;

// Validate required environment variables
const required = [
    'LINE_CHANNEL_SECRET',
    'LINE_CHANNEL_ACCESS_TOKEN',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
    'GOOGLE_SPREADSHEET_ID',
    'GEMINI_API_KEY'
];

const missing = required.filter(key => !process.env[key]);
if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    console.warn(`Warning: Missing environment variables: ${missing.join(', ')}`);
}

export const config = {
    // Server
    port: defaultPort,
    nodeEnv: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
    externalBaseUrl,

    // LINE
    line: {
        channelSecret: process.env.LINE_CHANNEL_SECRET,
        channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
    },

    // Telegram
    telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        botToken2: process.env.TELEGRAM_BOT_TOKEN_2
    },

    // Google OAuth2
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
        callbackUrl: process.env.GOOGLE_CALLBACK_URL || defaultCallbackUrl
    },

    // Google Services
    sheets: {
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
        sheetName: 'Reports'
    },

    drive: {
        folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
        kbFolderId: process.env.GOOGLE_DRIVE_KB_FOLDER_ID
    },

    maps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY
    },

    // Gemini AI
    ai: {
        apiKey: process.env.GEMINI_API_KEY,
        defaultModel: 'gemini-flash-latest', // Stable model (Resolves to 3.0 Flash Preview)
        visionModel: 'gemini-flash-latest',  // Stable model (Resolves to 3.0 Flash Preview)
        maxRetries: 3,
        timeout: 40000 // Increased timeout for long waits
    },

    // Supabase
    supabase: {
        url: process.env.SUPABASE_URL,
        serviceKey: process.env.SUPABASE_SERVICE_KEY,
        enabled: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
    },

    // App Settings
    app: {
        cacheTtl: 2000, // 2 seconds for demo
        sessionTimeout: 30 * 60 * 1000, // 30 minutes
        maxHistoryPerUser: 100,
        maxUserFacts: 20
    }
};

// Problem types for classification
export const PROBLEM_TYPES = [
    'ไฟฟ้า (ไฟดับ/ไฟเสีย/สายไฟ)',
    'ประปา (น้ำไม่ไหล/ท่อแตก)',
    'หลุมบนถนน/ถนนชำรุด',
    'คลองระบายน้ำ/ทางระบายน้ำอุดตัน',
    'ต้นไม้ (กิ่งไม้บดบัง/โค่นล้ม)',
    'ผู้ป่วยติดเตียง (ขอความช่วยเหลือ)',
    'สัตว์จรจัด (สุนัข/แมว/สัตว์มีพิษ)',
    'งานก่อสร้างที่เป็นอันตราย',
    'ขยะ/ของเสีย',
    'กลิ่น/เสียงรบกวน',
    'อื่นๆ'
];

export const URGENCY_LEVELS = ['สูง', 'ปานกลาง', 'ต่ำ'];

export const STATUS_TYPES = ['received', 'assigned', 'in_progress', 'completed'];

// Thai messages for notifications
export const MESSAGES = {
    errors: {
        generic: 'ตอนนี้ AI ของผมกำลังทำงานหนักมาก 😅 แต่ผมได้รับข้อความของคุณแล้วครับ! \n\n✅ ถ้าข้อมูลครบแล้ว พิมพ์ "ok" เพื่อส่งเรื่องได้เลยครับ \n\nหรือถ้าต้องการส่งรูป/พิกัดเพิ่มเติม ก็ส่งมาได้เลยครับ ผมบันทึกให้ตลอด 🙏',
        aiTimeout: 'ขออภัยครับ ระบบ AI กำลังคิดหนัก... ลองใหม่อีกทีนะครับ',
        unsupported: 'ขอโทษครับ ตอนนี้ผมรับแจ้งผ่านรูปภาพ ข้อความ และตำแหน่งที่ตั้งครับ'
    },
    commands: {
        reset: 'ล้างสถานะการคุยเรียบร้อยเริ่มใหม่ได้เลยครับ!',
        cancel: 'ยกเลิกข้อมูลเดิมแล้วครับ ทักหาผมได้ใหม่ทุกเมื่อนะครับ'
    },
    sos: `🚨 **รวมเบอร์โทรฉุกเฉิน (Thailand SOS)** 🚨

👮‍♂️ **เหตุด่วนเหตุร้าย**: 191
🚑 **เจ็บป่วยฉุกเฉิน**: 1669
🚒 **ดับเพลิง/สัตว์เข้าบ้าน**: 199
🛣️ **ตำรวจทางหลวง**: 1193
⚡ **การไฟฟ้าส่วนภูมิภาค**: 1129
💧 **การประปาส่วนภูมิภาค**: 1662

*กดที่เบอร์เพื่อโทรออกได้เลยครับ!*`,

    welcome: `สวัสดีครับ! มีอะไรให้ผมช่วยรายงาน หรืออยากเล่าให้ฟังไหมครับ? 📸

(ถ้ามีรูปถ่าย ส่งมาได้เลยนะครับ จะดีมากเลย!)

หรือถ้ามีคำถามเกี่ยวกับ Smart City หรือเรื่องอื่นๆ ก็ถาม "น้องสมาร์ท" (msmartbot) ได้เลยครับ ผมตอบได้หมด! ✨`,

    resources: `📚 ข้อมูลเพิ่มเติมที่น่าสนใจ:

🛒 **Digital Catalog** (ระบบจัดซื้อจัดจ้างดิจิทัล)
   👉 https://www.depa.or.th/th/digitalcatalog

📋 **Smart City Criteria** (เกณฑ์เมืองอัจฉริยะ)
   👉 https://www.smartcitythailand.or.th/criteria

📊 **City Data Platform** (แพลตฟอร์มข้อมูลเมือง)
   👉 https://www.citydataplatform.or.th

🏢 **เยี่ยมชมสำนักงาน**
   สำนักงานส่งเสริมเศรษฐกิจดิจิทัล (อาคาร A) 234/431 ถนนลาดพร้าว ซอยลาดพร้าว 10 แขวงจอมพล เขตจตุจักร กรุงเทพมหานคร 10900 Tel : +66 2026 2333 Email : scp@depa.or.th`
};

export default config;
