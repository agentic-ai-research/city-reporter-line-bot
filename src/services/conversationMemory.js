/**
 * Conversation Memory Service
 * Stores conversation history per user for intelligent context-aware responses
 * Dual-writes to Supabase for persistence across Render redeploys
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    isSupabaseEnabled, loadMemoryFromSupabase,
    saveConversationToSupabase, saveFactToSupabase, saveUserMetaToSupabase
} from './supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEMORY_FILE = path.join(__dirname, '../../data/conversation_memory.json');
const MAX_HISTORY_PER_USER = 20;
const MAX_USER_FACTS = 10;

// In-memory store
let memoryStore = {
    conversations: {},
    userFacts: {},
    userMeta: {}
};

let hydrationPromise = null;

function mergeMemoryStore(supaData) {
    if (!supaData) return;

    memoryStore.conversations = { ...memoryStore.conversations, ...supaData.conversations };
    memoryStore.userFacts = { ...memoryStore.userFacts, ...supaData.userFacts };
    memoryStore.userMeta = { ...memoryStore.userMeta, ...supaData.userMeta };
}

// Load from disk first, then patch from Supabase
function loadMemory() {
    try {
        if (fs.existsSync(MEMORY_FILE)) {
            const data = fs.readFileSync(MEMORY_FILE, 'utf8');
            memoryStore = JSON.parse(data);
            console.log(`Loaded conversation memory for ${Object.keys(memoryStore.conversations).length} users`);
        }
    } catch (e) {
        console.error('Memory load error:', e.message);
    }

    // If local file empty/missing, try Supabase
    if (isSupabaseEnabled() && Object.keys(memoryStore.conversations).length === 0) {
        loadMemoryFromSupabase().then(supaData => {
            if (supaData) {
                mergeMemoryStore(supaData);
                console.log(`Loaded memory from Supabase for ${Object.keys(supaData.conversations).length} users`);
                saveMemorySync();
            }
        }).catch(() => {});
    }
}

// Save to disk (debounced)
let saveTimeout = null;
function saveMemory() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveMemorySync, 1000);
    saveTimeout.unref?.();
}

function saveMemorySync() {
    try {
        fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryStore, null, 2));
    } catch (e) {
        console.error('Memory save error:', e.message);
    }
}

// Initialize
loadMemory();

export async function hydrateConversationMemory() {
    if (!isSupabaseEnabled()) return 0;

    if (!hydrationPromise) {
        hydrationPromise = loadMemoryFromSupabase()
            .then(supaData => {
                if (supaData) {
                    mergeMemoryStore(supaData);
                    saveMemorySync();
                    return Object.keys(supaData.conversations || {}).length;
                }
                return 0;
            })
            .catch(error => {
                console.error('Conversation memory hydration failed:', error.message);
                return 0;
            });
    }

    return hydrationPromise;
}

/**
 * Add a message to conversation history
 */
export function addToHistory(userId, role, content) {
    if (!memoryStore.conversations[userId]) {
        memoryStore.conversations[userId] = [];
    }

    memoryStore.conversations[userId].push({
        role,
        content,
        timestamp: new Date().toISOString()
    });

    // Trim to max size
    if (memoryStore.conversations[userId].length > MAX_HISTORY_PER_USER) {
        memoryStore.conversations[userId] = memoryStore.conversations[userId].slice(-MAX_HISTORY_PER_USER);
    }

    // Update meta
    if (!memoryStore.userMeta[userId]) {
        memoryStore.userMeta[userId] = {
            firstSeen: new Date().toISOString(),
            totalMessages: 0
        };
    }
    memoryStore.userMeta[userId].totalMessages++;
    memoryStore.userMeta[userId].lastSeen = new Date().toISOString();

    saveMemory();

    // Dual-write to Supabase (fire-and-forget)
    saveConversationToSupabase(userId, role, content).catch(() => {});
    saveUserMetaToSupabase(userId, memoryStore.userMeta[userId]).catch(() => {});
}

/**
 * Get conversation history for a user
 */
export function getHistory(userId, limit = 10) {
    const history = memoryStore.conversations[userId] || [];
    return history.slice(-limit);
}

/**
 * Learn a fact about a user
 */
export function learnFact(userId, fact) {
    if (!memoryStore.userFacts[userId]) {
        memoryStore.userFacts[userId] = [];
    }

    // Avoid duplicates
    const existing = memoryStore.userFacts[userId].find(f =>
        f.fact.toLowerCase().includes(fact.toLowerCase().substring(0, 20))
    );
    if (existing) return;

    memoryStore.userFacts[userId].push({
        fact,
        learnedAt: new Date().toISOString()
    });

    // Trim to max
    if (memoryStore.userFacts[userId].length > MAX_USER_FACTS) {
        memoryStore.userFacts[userId] = memoryStore.userFacts[userId].slice(-MAX_USER_FACTS);
    }

    saveMemory();

    // Dual-write to Supabase
    saveFactToSupabase(userId, fact).catch(() => {});
}

/**
 * Get facts about a user
 */
export function getUserFacts(userId) {
    return memoryStore.userFacts[userId] || [];
}

/**
 * Get user metadata
 */
export function getUserMeta(userId) {
    return memoryStore.userMeta[userId] || null;
}

/**
 * Set user name/nickname
 */
export function setUserName(userId, name) {
    if (!memoryStore.userMeta[userId]) {
        memoryStore.userMeta[userId] = { firstSeen: new Date().toISOString(), totalMessages: 0 };
    }
    memoryStore.userMeta[userId].name = name;
    saveMemory();

    // Dual-write to Supabase
    saveUserMetaToSupabase(userId, memoryStore.userMeta[userId]).catch(() => {});
}

/**
 * Format history for AI prompt
 */
export function formatHistoryForPrompt(userId, limit = 6) {
    const history = getHistory(userId, limit);
    if (history.length === 0) return '';

    return history.map(h =>
        `${h.role === 'user' ? 'ผู้ใช้' : 'น้องอัจฉริยะ'}: ${h.content}`
    ).join('\n');
}

export default {
    addToHistory,
    getHistory,
    learnFact,
    getUserFacts,
    getUserMeta,
    setUserName,
    formatHistoryForPrompt
};
