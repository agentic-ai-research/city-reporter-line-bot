import * as knowledgeBaseService from '../services/knowledgeBase.js';

export const knowledgeTool = {
    declaration: {
        name: 'search_knowledge_base',
        description: 'Search the knowledge base for information about city policies, emergency contacts, event schedules, or general facts. Use this to answer user questions.',
        parameters: {
            type: 'OBJECT',
            properties: {
                query: {
                    type: 'STRING',
                    description: 'The search query or keywords to find relevant information.'
                }
            },
            required: ['query']
        }
    },
    execute: async (args) => {
        try {
            const results = await knowledgeBaseService.searchKnowledgeBase(args.query);

            if (!results) {
                return { found: false, message: "No relevant information found in knowledge base." };
            }

            // Format results for the AI to consume
            let context = '';
            if (results.answer) {
                context += `[Direct Answer]: ${results.answer}\n`;
            }
            if (results.context) {
                context += `[Context]: ${results.context}\n`;
            }
            if (results.files) {
                context += `[Sources]: ${results.files.map(f => f.name).join(', ')}`;
            }

            return { found: true, context: context };
        } catch (error) {
            return { found: false, error: error.message };
        }
    }
};
