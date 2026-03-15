import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    const apiKey = process.env.GEMINI_API_KEY;
    const modelsToTest = [
        'gemini-flash-latest',
        'gemini-2.0-flash',
        'gemini-2.5-flash',
        'gemini-2.0-flash-lite'
    ];

    for (const modelName of modelsToTest) {
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Hi");
            console.log(`✅ ${modelName} worked! Response: ${result.response.text().substring(0, 20)}...`);
        } catch (e) {
            console.error(`❌ ${modelName} failed:`, e.message);
        }
    }
}

test();
