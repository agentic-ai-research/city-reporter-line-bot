import fs from 'fs';
import path from 'path';
import { loadAllStatesFromSupabase, saveStateToSupabase, isSupabaseEnabled } from './supabase.js';

const STATE_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(STATE_DIR, 'conversation_state.json');

// Ensure data directory exists
if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
}

// Debounce timer for Supabase saves
let supabaseSaveTimeout = null;
const pendingSupabaseUpdates = new Set();

/**
 * Load all states — tries Supabase first (survives Render redeploys),
 * falls back to local file
 */
export async function loadAllStatesAsync() {
    // Try Supabase first (persistent across deploys)
    if (isSupabaseEnabled()) {
        const states = await loadAllStatesFromSupabase();
        if (states && Object.keys(states).length > 0) {
            // Also save locally as cache
            try {
                fs.writeFileSync(STATE_FILE, JSON.stringify(states, null, 2), 'utf8');
            } catch (e) { /* ignore */ }
            return states;
        }
    }

    // Fall back to local file
    return loadAllStatesSync();
}

/**
 * Synchronous load from local file (used at startup for immediate availability)
 */
function loadAllStatesSync() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = fs.readFileSync(STATE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading states:', error);
    }
    return {};
}

/**
 * Load all states synchronously (backward-compatible)
 */
export function loadAllStates() {
    const states = loadAllStatesSync();

    // Kick off async Supabase load in background to patch in any missing states
    if (isSupabaseEnabled()) {
        loadAllStatesFromSupabase().then(supabaseStates => {
            if (supabaseStates) {
                // Merge: Supabase states fill gaps (don't overwrite active local states)
                for (const [userId, state] of Object.entries(supabaseStates)) {
                    if (!states[userId] || states[userId].step === 'idle') {
                        states[userId] = state;
                    }
                }
            }
        }).catch(() => {});
    }

    return states;
}

/**
 * Save all states to disk + debounced Supabase upsert
 */
export function saveAllStates(states) {
    // Save to local file immediately
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(states, null, 2), 'utf8');
    } catch (error) {
        console.error('Error saving states:', error);
    }

    // Debounced Supabase save (batch updates every 2 seconds)
    if (isSupabaseEnabled()) {
        for (const userId of Object.keys(states)) {
            pendingSupabaseUpdates.add(userId);
        }

        if (supabaseSaveTimeout) clearTimeout(supabaseSaveTimeout);
        supabaseSaveTimeout = setTimeout(() => {
            const updates = [...pendingSupabaseUpdates];
            pendingSupabaseUpdates.clear();

            for (const userId of updates) {
                if (states[userId]) {
                    saveStateToSupabase(userId, states[userId]).catch(() => {});
                }
            }
        }, 2000);
        supabaseSaveTimeout.unref?.();
    }
}
