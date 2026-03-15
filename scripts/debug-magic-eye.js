
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

// MOCK DATA
const MOCK_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="; // Valid 1x1
const VISION_MODEL = process.env.GEMINI_VISION_MODEL || 'gemini-flash-latest';
const API_KEY = process.env.GEMINI_API_KEY;

async function testMagicEye() {
    console.log("🔬 TESTING MAGIC EYE...");
    console.log(`🔑 API Key Length: ${API_KEY ? API_KEY.length : 'MISSING'}`);
    console.log(`🤖 Model: ${VISION_MODEL}`);

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: VISION_MODEL });

    const prompt = "Describe this image in detail.";

    try {
        console.log("🚀 Sending request...");
        const result = await model.generateContent({
            contents: [{
                role: 'user',
                parts: [
                    { text: prompt },
                    { inlineData: { data: MOCK_IMAGE_BASE64, mimeType: 'image/png' } }
                ]
            }]
        });

        console.log("✅ SUCCESS!");
        console.log("📄 Response:", result.response.text());

    } catch (error) {
        console.error("❌ FAILURE:");
        console.error("Status:", error.status);
        console.error("Message:", error.message);
        console.error("Full Stack:", error);
    }
}

testMagicEye();
