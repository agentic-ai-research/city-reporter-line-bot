
import 'dotenv/config';
import { aiService } from '../src/services/ai.service.js';

async function verifyFix() {
    console.log("🔍 Verifying Magic Eye Fix (via AI Service)...");

    // 1. Test Text (to verify default model)
    console.log("\n🧪 Testing Text Chat...");
    try {
        const textResponse = await aiService.chat('user_test', 'Hello, are you working?');
        console.log("✅ Text Chat OK:", textResponse.substring(0, 50) + "...");
    } catch (e) {
        console.error("❌ Text Chat Failed:", e.message);
    }

    // 2. Test Vision (to verify Magic Eye)
    console.log("\n🧪 Testing Magic Eye (Vision)...");
    const mockImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="; // Valid 1x1
    try {
        const analysis = await aiService.analyzeImage(mockImage, 'image/png');
        console.log("✅ Magic Eye OK!");
        console.log("   Problem Type:", analysis.problemType);
        console.log("   Summary:", analysis.summary);
    } catch (e) {
        console.error("❌ Magic Eye Failed:", e.message);
    }
}

verifyFix();
