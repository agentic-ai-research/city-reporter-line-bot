import { createReportConfirmation, createStatusUpdate } from '../src/utils/flexMessages.js';

console.log("--- Report Confirmation Flex ---");
const reportFlex = createReportConfirmation({
    imageUrl: 'https://example.com/image.jpg',
    problemType: 'น้ำท่วม',
    urgency: 'สูง',
    aiSummary: 'พบน้ำท่วมขังบริเวณถนน วิเคราะห์ความลึกประมาณ 30 ซม.',
    ticketNumber: 'DRAFT'
});
console.log(JSON.stringify(reportFlex, null, 2));

console.log("\n--- Status Update Flex (Assigned) ---");
const statusFlexAssigned = createStatusUpdate({
    ticketNumber: '1234',
    status: 'assigned',
    teamName: 'โยธาเขต',
    staffComment: 'กำลังส่งทีมไปดูครับ',
    timestamp: '10/10/2023 10:00:00'
});
console.log(JSON.stringify(statusFlexAssigned, null, 2));

console.log("\n--- Status Update Flex (Completed) ---");
const statusFlexCompleted = createStatusUpdate({
    ticketNumber: '1234',
    status: 'completed',
    teamName: 'โยธาเขต',
    staffComment: 'แก้ไขเรียบร้อย ลอกท่อแล้ว',
    solutionImageUrl: 'https://example.com/solved.jpg',
    timestamp: '10/10/2023 12:00:00'
});
console.log(JSON.stringify(statusFlexCompleted, null, 2));
