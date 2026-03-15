/**
 * Language Detection & Localization Service
 * Detect user language from profile/headers and respond accordingly
 */

// Language messages for UN-Habitat alignment badge
export const UN_HABITAT_BADGE = {
    th: '🌐 ระบบนี้ดำเนินการตามแนวปฏิบัติ UN-Habitat GeoAI Toolkit',
    en: '🌐 This system follows UN-Habitat GeoAI Toolkit guidelines',
    zh: '🌐 本系統遵循聯合國人居署 GeoAI 工具包準則',
    ja: '🌐 このシステムは UN-Habitat GeoAI ツールキットのガイドラインに従っています',
    ko: '🌐 이 시스템은 UN-Habitat GeoAI 툴킷 지침을 따릅니다'
};

// Common phrases in different languages
export const MESSAGES = {
    welcome: {
        th: 'สวัสดีครับ! ผม "น้องอัจฉริยะ" พร้อมรับแจ้งปัญหาเมืองครับ 📸',
        en: 'Hello! I\'m the Smart City Assistant, ready to receive your reports 📸',
        zh: '您好！我是智慧城市助手，準備接收您的報告 📸',
        ja: 'こんにちは！スマートシティアシスタントです。レポートをお待ちしています 📸',
        ko: '안녕하세요! 스마트 시티 어시스턴트입니다. 보고서를 받을 준비가 되었습니다 📸'
    },
    confirmation: {
        th: 'ได้รับข้อมูลแล้วครับ กำลังประมวลผล...',
        en: 'Information received. Processing...',
        zh: '資訊已收到。處理中...',
        ja: '情報を受け取りました。処理中...',
        ko: '정보를 받았습니다. 처리 중...'
    },
    askLocation: {
        th: 'รบกวนส่งตำแหน่งที่ตั้งมาด้วยครับ 📍',
        en: 'Please share your location 📍',
        zh: '請分享您的位置 📍',
        ja: '位置情報を共有してください 📍',
        ko: '위치를 공유해 주세요 📍'
    }
};

/**
 * Detect language from LINE user profile or Accept-Language header
 * @param {Object} source - Event source from LINE/Telegram
 * @param {Object} headers - HTTP headers (optional)
 * @returns {string} Language code (th, en, zh, ja, ko)
 */
export function detectLanguage(source = {}, headers = {}) {
    // 1. Check if user explicitly set language (from profile)
    if (source.language) {
        const lang = source.language.toLowerCase().substring(0, 2);
        if (['th', 'en', 'zh', 'ja', 'ko'].includes(lang)) return lang;
    }

    // 2. Check Accept-Language header
    const acceptLang = headers['accept-language'] || headers['Accept-Language'] || '';
    if (acceptLang) {
        const primaryLang = acceptLang.split(',')[0].split('-')[0].toLowerCase();
        if (['th', 'en', 'zh', 'ja', 'ko'].includes(primaryLang)) return primaryLang;
    }

    // 3. Infer from user ID patterns (Telegram includes country info sometimes)
    const userId = source.userId || '';
    // If user ID contains certain patterns, we could infer...
    // For now, default to Thai as primary market

    return 'th'; // Default
}

/**
 * Get localized message
 * @param {string} key - Message key
 * @param {string} lang - Language code
 * @returns {string} Localized message
 */
export function getMessage(key, lang = 'th') {
    return MESSAGES[key]?.[lang] || MESSAGES[key]?.th || key;
}

/**
 * Get UN-Habitat badge in user's language
 * @param {string} lang - Language code
 * @returns {string} Badge text
 */
export function getUnHabitatBadge(lang = 'th') {
    return UN_HABITAT_BADGE[lang] || UN_HABITAT_BADGE.en;
}

/**
 * Format device ID for analytics
 * @param {string} userId - Raw user ID
 * @param {string} platform - Platform (line/telegram)
 * @returns {Object} Device info
 */
export function formatDeviceInfo(userId, platform = 'line') {
    return {
        deviceId: userId,
        platform,
        shortId: userId ? userId.substring(0, 8) + '...' : 'unknown',
        isAnonymous: !userId || userId === 'anonymous'
    };
}
