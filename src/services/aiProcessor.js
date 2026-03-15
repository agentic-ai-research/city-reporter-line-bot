import { aiService } from './ai.service.js';
export const processWithAI = aiService.analyzeImage.bind(aiService);
export const intelligentChat = aiService.chat.bind(aiService);
export const generateConversationalReply = aiService.generateReply.bind(aiService);
export const generateFortuneTelling = aiService.generateFortune.bind(aiService);
export const extractLocationFromText = aiService.extractFacts.bind(aiService); // Approximation
export default aiService;
