import 'dotenv/config';
import { appendReport } from '../services/googleSheets.js';
import { v4 as uuidv4 } from 'uuid';

const LOCATIONS = [
    { text: 'Siam Paragon, Bangkok', lat: 13.7469, lng: 100.5349 },
    { text: 'Chatuchak Market, Bangkok', lat: 13.8023, lng: 100.5508 },
    { text: 'Lumphini Park', lat: 13.7314, lng: 100.5414 },
    { text: 'Central World, Ratchaprasong', lat: 13.7466, lng: 100.5393 },
    { text: 'Victory Monument Area', lat: 13.7649, lng: 100.5383 }
];

const PROBLEMS = [
    { type: 'ถนน', desc: 'หลุมใหญ่กลางถนน รถติดมาก', urgency: 'สูง' },
    { type: 'ไฟฟ้า', desc: 'ไฟส่องสว่างดับทั้งซอย อันตราย', urgency: 'ปานกลาง' },
    { type: 'ขยะ', desc: 'ขยะล้นถัง ส่งกลิ่นเหม็นรบกวน', urgency: 'ปกติ' },
    { type: 'น้ำท่วม', desc: 'ท่อระบายน้ำอุดตัน น้ำขังรอระบาย', urgency: 'สูง' },
    { type: 'ทางเท้า', desc: 'กระเบื้องทางเท้าพัง เดินสะดุด', urgency: 'ต่ำ' }
];

async function seed() {
    console.log('🌱 Seeding detailed reports...');

    // Create 1 realistic report immediately
    const loc = LOCATIONS[0];
    const prob = PROBLEMS[0];

    const reportVal = {
        reportId: uuidv4(),
        ticketNumber: `SCTH-SEED-${Math.floor(Math.random() * 10000)}`,
        timestamp: new Date().toISOString(),
        userId: 'U_SEEDER_BOT',
        phone: '0812345678',
        problemType: prob.type,
        description: prob.desc,
        locationText: loc.text,
        latitude: loc.lat,
        longitude: loc.lng,
        imageUrl: 'https://cdn.pixabay.com/photo/2014/06/04/16/36/manhole-cover-362150_1280.jpg',
        aiSummary: `AI Detected: ${prob.type} issue. Urgency: ${prob.urgency}`,
        urgency: prob.urgency,
        status: 'received',
        rating: '',
        isAnonymous: false
    };

    try {
        await appendReport(reportVal);
        console.log(`✅ Seeded 1 report at ${loc.text}`);
    } catch (e) {
        console.error('❌ Seeding failed:', e);
    }
}

seed();
