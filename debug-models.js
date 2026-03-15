import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

async function listModels() {
    console.log('🔍 Listing available Gemini models...');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    try {
        // Did you know? The method is usually on the client or model factory.
        // Actually, looking at docs, usually it's genAI.getGenerativeModel... 
        // But there isn't always a direct list method exposed in the helper if it's the simplified SDK.
        // Let's try to assume we can just use a known one, OR try a raw request if needed.
        // Actually, the error message said: "Call ListModels to see the list..."
        // but the SDK structure in node_modules might vary.
        // Let's try this standard approach first.
        // If the SDK doesn't expose it easily, we can just fetch via REST.

        const apiKey = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.models) {
            console.log('\n✅ Available Models:');
            data.models.forEach(m => {
                if (m.name.includes('gemini')) {
                    console.log(`- ${m.name} (Ver: ${m.version}) [Methods: ${m.supportedGenerationMethods?.join(', ')}]`);
                }
            });
        } else {
            console.log('❌ No models found in response:', data);
        }

    } catch (error) {
        console.error('❌ Failed to list models:', error);
    }
}

listModels();
