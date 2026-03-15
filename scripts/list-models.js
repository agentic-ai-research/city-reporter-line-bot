
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY;

async function listModels() {
    console.log("📋 Listing Available Models...");
    const genAI = new GoogleGenerativeAI(API_KEY);
    // There isn't a direct listModels method on the client instance in some versions,
    // but let's try to infer or just test a few known ones.
    // Actually, the error message said: "Call ListModels to see the list..." 
    // This usually implies using the REST API or the model manager if available.
    // The JS SDK might not expose listModels directly on the main class easily without browsing docs.
    // So instead, I will brute-force test a list of known candidates.

    const candidates = [
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite-preview-02-05",
        "gemini-2.0-pro-exp-02-05",
        "gemini-1.5-flash"
    ];

    for (const modelName of candidates) {
        process.stdout.write(`Testing ${modelName}... `);
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Test");
            console.log(`✅ OK`);
        } catch (e) {
            console.log(`❌ ${e.status || e.message}`);
        }
    }
}

listModels();
