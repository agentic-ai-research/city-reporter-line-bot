import { google } from 'googleapis';
import { Readable } from 'stream';
import { getAuthClient } from '../utils/googleAuth.js';

// Get auth client from centralized security module
function getAuth() {
    return getAuthClient();
}

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

/**
 * Upload image to Google Drive
 * @param {ReadableStream} imageStream - Image stream from LINE
 * @param {string} filename - Filename for the uploaded image
 * @returns {string} - Public URL of the uploaded image
 */
export async function uploadImage(imageStream, filename) {
    try {
        const auth = getAuth();
        const drive = google.drive({ version: 'v3', auth });

        // Collect stream data into buffer if it's a stream
        let buffer;
        if (Buffer.isBuffer(imageStream)) {
            buffer = imageStream;
        } else {
            const chunks = [];
            for await (const chunk of imageStream) {
                chunks.push(chunk);
            }
            buffer = Buffer.concat(chunks);
        }

        // Create readable stream from buffer
        const readable = new Readable();
        readable.push(buffer);
        readable.push(null);

        // Upload file to Drive
        const response = await drive.files.create({
            requestBody: {
                name: filename,
                parents: FOLDER_ID ? [FOLDER_ID] : undefined,
            },
            media: {
                mimeType: 'image/jpeg',
                body: readable,
            },
            fields: 'id, webViewLink',
        });

        const fileId = response.data.id;

        // Make file publicly viewable
        await drive.permissions.create({
            fileId,
            requestBody: {
                role: 'reader',
                type: 'anyone',
            },
        });

        // Return direct image URL for LINE/Telegram compatibility
        // lh3.googleusercontent.com/d/FILE_ID provides direct image access
        const directUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
        console.log(`Image uploaded: ${directUrl} (Direct URL for messaging apps)`);
        return directUrl;

    } catch (error) {
        console.error('Error uploading image to Drive:', error);
        throw error;
    }
}

/**
 * Delete an image from Google Drive
 * @param {string} fileUrl - URL of the file to delete
 */
export async function deleteImage(fileUrl) {
    try {
        // Extract file ID from URL
        const match = fileUrl.match(/\/d\/([^/]+)/);
        if (!match) return;

        const fileId = match[1];
        const auth = getAuth();
        const drive = google.drive({ version: 'v3', auth });

        await drive.files.delete({ fileId });
        console.log(`Image deleted: ${fileId}`);

    } catch (error) {
        console.error('Error deleting image:', error);
        // Don't throw - deletion failure is not critical
    }
}
