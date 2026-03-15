
import 'dotenv/config';
import { generateFortuneTelling } from './src/services/aiProcessor.js';

async function test() {
    console.log('🔮 Testing Fortune Telling...');
    try {
        const result = await generateFortuneTelling('Yelly', '0987363736');
        console.log('✨ Result:', result);
    } catch (e) {
        console.error('❌ Error:', e);
    }
}

test();
