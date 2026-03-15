/**
 * Flex Message Utilities
 * Templates for rich visual messages on LINE
 */

const THEME_COLOR = '#0D99FF'; // Modern Blue
const SUCCESS_COLOR = '#1DB446';
const WARNING_COLOR = '#FF9500';
const DANGER_COLOR = '#FF3B30';

/**
 * Get urgency color
 */
function getUrgencyColor(urgency) {
    if (urgency === 'สูง') return DANGER_COLOR;
    if (urgency === 'ปานกลาง') return WARNING_COLOR;
    return SUCCESS_COLOR;
}

/**
 * Create Report Confirmation Flex Message
 * Shown immediately after user uploads an image and AI analyzes it
 */
export function createReportConfirmation(data) {
    const {
        imageUrl,
        problemType,
        urgency,
        aiSummary,
        ticketNumber
    } = data;

    // If imageUrl is local/private, we can't show it in Flex Message main image easily without public URL.
    // However, if we utilize the public drive URL logic we have, it should work.
    // Fallback to a generic icon if no URL or if URL is local path.
    const validImageUrl = (imageUrl && imageUrl.startsWith('http'))
        ? imageUrl
        : 'https://cdn-icons-png.flaticon.com/512/3588/3588247.png'; // Generic Report Icon

    return {
        type: "flex",
        altText: "📝 รับเรื่องแล้วครับ!",
        contents: {
            type: "bubble",
            hero: {
                type: "image",
                url: validImageUrl,
                size: "full",
                aspectRatio: "20:13",
                aspectMode: "cover",
                action: {
                    type: "uri",
                    uri: validImageUrl
                }
            },
            body: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: "รับเรื่องเรียบร้อย! ✅",
                        weight: "bold",
                        size: "xl",
                        color: THEME_COLOR
                    },
                    {
                        type: "box",
                        layout: "vertical",
                        margin: "lg",
                        spacing: "sm",
                        contents: [
                            {
                                type: "box",
                                layout: "baseline",
                                spacing: "sm",
                                contents: [
                                    {
                                        type: "text",
                                        text: "ปัญหา",
                                        color: "#aaaaaa",
                                        size: "sm",
                                        flex: 2
                                    },
                                    {
                                        type: "text",
                                        text: problemType || "กำลังวิเคราะห์...",
                                        wrap: true,
                                        color: "#666666",
                                        size: "sm",
                                        flex: 5,
                                        weight: "bold"
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "baseline",
                                spacing: "sm",
                                contents: [
                                    {
                                        type: "text",
                                        text: "ความเร่งด่วน",
                                        color: "#aaaaaa",
                                        size: "sm",
                                        flex: 2
                                    },
                                    {
                                        type: "text",
                                        text: urgency || "ปกติ",
                                        wrap: true,
                                        color: getUrgencyColor(urgency),
                                        size: "sm",
                                        flex: 5,
                                        weight: "bold"
                                    }
                                ]
                            },
                            {
                                type: "box",
                                layout: "baseline",
                                spacing: "sm",
                                contents: [
                                    {
                                        type: "text",
                                        text: "วิเคราะห์",
                                        color: "#aaaaaa",
                                        size: "sm",
                                        flex: 2
                                    },
                                    {
                                        type: "text",
                                        text: (aiSummary || "รอสักครู่...").substring(0, 100) + (aiSummary?.length > 100 ? "..." : ""),
                                        wrap: true,
                                        color: "#666666",
                                        size: "xs",
                                        flex: 5
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            footer: {
                type: "box",
                layout: "vertical",
                spacing: "sm",
                contents: [
                    {
                        type: "button",
                        style: "primary",
                        height: "sm",
                        action: {
                            type: "message",
                            label: "ยืนยัน (OK)",
                            text: "ok"
                        },
                        color: THEME_COLOR
                    },
                    {
                        type: "button",
                        style: "secondary",
                        height: "sm",
                        action: {
                            type: "message",
                            label: "ยกเลิก (Cancel)",
                            text: "cancel"
                        }
                    },
                    {
                        type: "text",
                        text: "👆 กด 'ยืนยัน' เพื่อส่งเรื่องให้เจ้าหน้าที่ทันที",
                        size: "xs",
                        color: "#aaaaaa",
                        align: "center",
                        margin: "md"
                    }
                ],
                paddingAll: "20px"
            }
        }
    };
}


/**
 * Create Status Update Flex Message
 */
export function createStatusUpdate(data) {
    const {
        ticketNumber,
        status, // received, assigned, in_progress, completed
        teamName,
        staffComment,
        solutionImageUrl,
        timestamp
    } = data;

    let headerText = "";
    let headerColor = THEME_COLOR;
    let statusText = "";
    let progressBarPercent = 0;

    switch (status) {
        case 'received':
            headerText = "ได้รับเรื่องแล้ว";
            statusText = "ระบบได้รับเรื่องเรียบร้อย";
            headerColor = THEME_COLOR;
            progressBarPercent = 25;
            break;
        case 'assigned':
            headerText = "มอบหมายงานแล้ว";
            statusText = `ทีม ${teamName || 'ส่วนกลาง'} รับเรื่องแล้ว`;
            headerColor = WARNING_COLOR;
            progressBarPercent = 50;
            break;
        case 'in_progress':
            headerText = "กำลังดำเนินการ";
            statusText = "เจ้าหน้าที่กำลังเข้าพื้นที่แก้ไข";
            headerColor = WARNING_COLOR;
            progressBarPercent = 75;
            break;
        case 'completed':
            headerText = "ดำเนินการเสร็จสิ้น";
            statusText = "แก้ไขปัญหาเรียบร้อยแล้ว";
            headerColor = SUCCESS_COLOR;
            progressBarPercent = 100;
            break;
        default:
            headerText = "อัปเดตสถานะ";
            statusText = status;
    }

    const bubble = {
        type: "bubble",
        size: "mega",
        header: {
            type: "box",
            layout: "vertical",
            contents: [
                {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                        {
                            type: "text",
                            text: headerText,
                            weight: "bold",
                            color: "#ffffff",
                            size: "lg"
                        },
                        {
                            type: "text",
                            text: `#${ticketNumber}`,
                            weight: "bold",
                            color: "#ffffff",
                            size: "sm",
                            align: "end"
                        }
                    ]
                }
            ],
            backgroundColor: headerColor,
            paddingTop: "15px",
            paddingBottom: "15px",
            paddingStart: "20px",
            paddingEnd: "20px"
        },
        body: {
            type: "box",
            layout: "vertical",
            contents: [
                {
                    type: "text",
                    text: statusText,
                    weight: "bold",
                    size: "md",
                    margin: "md"
                },
                {
                    type: "text",
                    text: staffComment || "เจ้าหน้าที่กำลังดำเนินการ...",
                    size: "xs",
                    color: "#aaaaaa",
                    wrap: true,
                    margin: "sm"
                },
                {
                    type: "box",
                    layout: "vertical",
                    margin: "lg",
                    contents: [
                        {
                            type: "box",
                            layout: "vertical",
                            contents: [
                                {
                                    type: "box",
                                    layout: "horizontal",
                                    contents: [
                                        {
                                            type: "box",
                                            layout: "vertical",
                                            width: `${progressBarPercent}%`,
                                            backgroundColor: headerColor,
                                            height: "6px"
                                        },
                                        {
                                            type: "box",
                                            layout: "vertical",
                                            width: `${100 - progressBarPercent}%`,
                                            backgroundColor: "#eeeeee",
                                            height: "6px"
                                        }
                                    ]
                                }
                            ],
                            cornerRadius: "3px",
                            width: "100%"
                        }
                    ]
                },
                {
                    type: "text",
                    text: timestamp || new Date().toLocaleString('th-TH'),
                    size: "xxs",
                    color: "#bbbbbb",
                    align: "end",
                    margin: "md"
                }
            ],
            paddingAll: "20px"
        }
    };

    // If completed and has solution image, add it
    if (status === 'completed' && solutionImageUrl && solutionImageUrl.startsWith('http')) {
        bubble.hero = {
            type: "image",
            url: solutionImageUrl,
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover"
        };
    }

    return {
        type: "flex",
        altText: `📢 อัปเดตงาน #${ticketNumber}: ${headerText}`,
        contents: bubble
    };
}
