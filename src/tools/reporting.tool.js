import { conversationManager } from '../handlers/conversationFlow.js';
import { v4 as uuidv4 } from 'uuid';
import { allocateTicketNumber, createReport } from '../services/reportStore.js';

export const reportingTool = {
    declaration: {
        name: 'save_report',
        description: 'Save a city issue report to the database (Google Sheets). Use this when the user reports a problem like flooding, traffic, broken infrastructure, etc. and you have sufficient details (at least category and description).',
        parameters: {
            type: 'OBJECT',
            properties: {
                category: {
                    type: 'STRING',
                    description: 'The category of the issue (e.g., Flooding, Traffic, Infrastructure, Garbage, Security, Other)'
                },
                description: {
                    type: 'STRING',
                    description: 'A concise summary of the issue. Include key details provided by the user.'
                },
                location: {
                    type: 'STRING',
                    description: 'The location of the issue. If precise coordinates are known, describe them here. If only a general area is known, use that.'
                },
                imageUrl: {
                    type: 'STRING',
                    description: 'URL of the image if provided (optional). The system will also check context for recent images.'
                }
            },
            required: ['category', 'description']
        }
    },
    execute: async (args) => {
        const userId = args._context?.userId || 'AI_AGENT';

        // precise location from context if available
        const state = conversationManager.getState(userId);
        const ticketNumber = await allocateTicketNumber();
        const reportId = uuidv4();

        // Resolve images: Arguments > State > None
        const imageUrl = args.imageUrl || state.imageUrl || '';
        const allMaskedImages = state.imageUrls && state.imageUrls.length > 0 ? state.imageUrls.join(', ') : imageUrl;

        // Resolve location: Context > Arguments
        const locationText = (state.locationText && state.locationText !== 'ตำแหน่งจาก GPS')
            ? state.locationText
            : (args.location || state.locationText || 'Unknown');

        const reportData = {
            reportId,
            ticketNumber,
            timestamp: new Date().toISOString(),
            userId,
            phone: state.phone || 'Anonymous',
            nickname: state.nickname || '',
            problemType: args.category || state.problemType || 'อื่นๆ',
            description: args.description || state.description || 'No description',
            locationText: locationText,
            latitude: state.latitude || '',
            longitude: state.longitude || '',
            imageUrl: allMaskedImages,
            aiSummary: state.aiSummary || '',
            detailedAnalysis: state.detailedAnalysis || '',
            detailedCityAnalysis: state.detailedCityAnalysis || '',
            aiReaction: state.aiReaction || '',
            rootCauseHypothesis: state.rootCauseHypothesis || '',
            quickFix: state.quickFix || '',
            properFix: state.properFix || '',
            urgency: state.urgency || 'ปกติ',
            status: 'received',
            rating: '',
            isAnonymous: !state.phone,
            imageCount: state.imageCount || (imageUrl ? 1 : 0),
            photoMetadata: state.photoMetadata || ''
        };

        try {
            await createReport(reportData);

            // Cleanup state after successful report
            conversationManager.updateState(userId, {
                step: 'idle',
                description: null,
                imageUrl: null,
                imageUrls: [],
                imageCount: 0,
                locationText: null,
                latitude: null,
                longitude: null,
                aiSummary: null,
                detailedAnalysis: null,
                confirmedSummary: false,
                lastSubmissionTime: new Date().toISOString(),
                lastTicketNumber: ticketNumber
            });

            return {
                success: true,
                ticketNumber,
                message: `Report saved successfully! Ticket #${ticketNumber}. The team has been notified.`
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};
