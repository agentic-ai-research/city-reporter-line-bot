
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY;

async function findWorkingModel() {
    console.log("🔍 Testing Discovered Flash Models...");
    const genAI = new GoogleGenerativeAI(API_KEY);

    const candidates = [
        "gemini-2.0-flash-lite-001",
        "gemini-flash-lite-latest",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash-001",
        "gemini-flash-latest",
        "gemini-3-flash-preview",
        "gemini-2.0-flash"
    ];

    for (const modelName of candidates) {
        process.stdout.write(`Testing ${modelName.padEnd(30)} `);
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Test");
            console.log(`✅ OK (Response: ${result.response.text().trim()})`);
        } catch (e) {
            let status = e.status || 'Unknown';
            if (e.message.includes('404')) status = '404 (Not Found)';
            if (e.message.includes('429')) status = '429 (Rate Limit)';
            if (e.message.includes('503')) status = '503 (Overloaded)';
            console.log(`❌ ${status} - ${e.message.substring(0, 50)}...`);
        }
    }
}

findWorkingModel();
