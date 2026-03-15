import { loadAllStates, loadAllStatesAsync, saveAllStates } from '../services/persistentState.js';

// In-memory store for conversation states
// Initialized from disk on startup
const userStates = loadAllStates();

const INITIAL_STATE = {
    step: 'idle', // idle, waiting_description, waiting_photo, waiting_location, waiting_phone, confirming
    description: null,
    problemType: null,
    imageUrl: null,
    imageUrls: [],           // Support multiple images
    imageCount: 0,
    imageBase64: null,
    mimeType: null,
    locationText: null,
    latitude: null,
    longitude: null,
    phone: null,
    nickname: null,
    urgency: null,
    aiSummary: null,
    detailedAnalysis: null,  // Full paragraph analysis
    detailedCityAnalysis: null,
    proactiveQuestion: null,
    ocrText: null,
    expertVisualAnalysis: null,
    rootCauseHypothesis: null,
    quickFix: null,
    properFix: null,
    aiReaction: null,
    confirmedSummary: false,
    rating: null,
    startedAt: null,
    lastSubmissionTime: null,
    lastTicketNumber: null,
    role: 'reporter'         // Default role
};

let hydrationPromise = null;

function mergeLoadedStates(loadedStates = {}) {
    for (const [userId, state] of Object.entries(loadedStates)) {
        userStates[userId] = { ...INITIAL_STATE, ...state };
    }
}

// Helper to update and save
function updateAndSave(userId, state) {
    userStates[userId] = state;
    saveAllStates(userStates);
}

export const conversationManager = {
    /**
     * Get current state for a user
     */
    getState(userId) {
        if (!userStates[userId]) {
            userStates[userId] = { ...INITIAL_STATE };
        }
        return userStates[userId];
    },

    /**
     * Start a new report
     */
    startNewReport(userId) {
        const newState = {
            ...INITIAL_STATE,
            step: 'waiting_description',
            startedAt: new Date().toISOString()
        };
        updateAndSave(userId, newState);
        return newState;
    },

    /**
     * Set the problem description
     */
    setDescription(userId, description) {
        const state = this.getState(userId);
        state.description = description;
        state.step = 'waiting_photo';
        updateAndSave(userId, state);
    },

    /**
     * Set the current step
     */
    setStep(userId, step) {
        const state = this.getState(userId);
        state.step = step;
        updateAndSave(userId, state);
    },

    /**
     * Update state with partial data
     */
    updateState(userId, updates) {
        const state = this.getState(userId);
        Object.assign(state, updates);
        updateAndSave(userId, state);
    },

    /**
     * Reset user state
     */
    reset(userId) {
        updateAndSave(userId, { ...INITIAL_STATE });
    },

    /**
     * Check if report is complete
     */
    isComplete(userId) {
        const state = this.getState(userId);
        return state.description && state.latitude && state.longitude;
    },

    /**
     * Clean up old sessions (call periodically)
     */
    cleanupOldSessions(maxAgeMs = 30 * 60 * 1000) { // 30 minutes
        const now = Date.now();
        let changed = false;
        for (const userId in userStates) {
            const state = userStates[userId];
            if (state.startedAt) {
                const age = now - new Date(state.startedAt).getTime();
                if (age > maxAgeMs) {
                    delete userStates[userId];
                    changed = true;
                }
            }
        }
        if (changed) saveAllStates(userStates);
    }
};

export async function hydrateConversationStates() {
    if (!hydrationPromise) {
        hydrationPromise = loadAllStatesAsync()
            .then(states => {
                if (states && Object.keys(states).length > 0) {
                    mergeLoadedStates(states);
                }
                return Object.keys(states || {}).length;
            })
            .catch(error => {
                console.error('Conversation state hydration failed:', error.message);
                return 0;
            });
    }

    return hydrationPromise;
}

// Clean up old sessions every 10 minutes without pinning short-lived processes.
const cleanupTimer = setInterval(() => conversationManager.cleanupOldSessions(), 10 * 60 * 1000);
cleanupTimer.unref?.();
