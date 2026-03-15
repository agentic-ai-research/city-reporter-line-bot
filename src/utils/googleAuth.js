/**
 * Centralized Google Authentication Module
 * 
 * Standardizes authentication for all Google Cloud Services (Sheets, Drive, etc.)
 * Supports both OAuth2 (User) and Service Account (Server) flows.
 * 
 * Usage:
 * import { getAuthClient } from './googleAuth.js';
 * const auth = getAuthClient();
 */

import { google } from 'googleapis';
import { config } from '../config/index.js';

let cachedAuthClient = null;

/**
 * Get Authenticated Google Client
 * Uses Singleton pattern to prevent multiple auth handshakes
 * @returns {google.auth.OAuth2 | google.auth.GoogleAuth} Authenticated client
 */
export function getAuthClient() {
    if (cachedAuthClient) return cachedAuthClient;

    // 1. Priority: Service Account (Better for bots/background workers)
    // If GOOGLE_APPLICATION_CREDENTIALS is set, GoogleAuth uses it automatically.
    // However, the current project uses OAuth2 with Refresh Token for specific user access.

    // 2. OAuth2 Fallback (Current Implementation)
    if (config.google.clientId && config.google.clientSecret && config.google.refreshToken) {
        // console.log('🔐 Initializing Google Auth (OAuth2 User Mode)...');
        const oauth2Client = new google.auth.OAuth2(
            config.google.clientId,
            config.google.clientSecret,
            config.google.callbackUrl
        );

        // Force set credentials
        oauth2Client.setCredentials({
            refresh_token: config.google.refreshToken
        });

        cachedAuthClient = oauth2Client;
        return oauth2Client;
    }

    // 3. Service Account Fallback (Default Google Strategy)
    // console.log('🛡️ Initializing Google Auth (Service Account Mode)...');
    cachedAuthClient = new google.auth.GoogleAuth({
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/documents'
        ]
    });

    return cachedAuthClient;
}

/**
 * Reset auth client (useful if tokens expire or config changes)
 */
export function resetAuth() {
    cachedAuthClient = null;
}
