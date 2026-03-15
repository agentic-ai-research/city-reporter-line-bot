# City Reporter LINE Bot (Smart City Thailand) 🏙️🤖

> **"Empowering Citizens, Enabling Smarter Cities."**

The **City Reporter LINE Bot** is the production-focused City Reporter deployment for Smart City Thailand. It is the cleaner operational branch intended for real-world municipal usage, separate from the demo-oriented `city-reporter-bot` service.

![Status](https://img.shields.io/badge/Status-Live-success) ![Platform](https://img.shields.io/badge/Platform-LINE%20%7C%20Telegram-blue) ![AI](https://img.shields.io/badge/AI-Gemini%20Flash-orange)

## 🌐 Live Systems
*   **Command Center Dashboard:** [https://city-reporter-line-bot.onrender.com](https://city-reporter-line-bot.onrender.com)
*   **GitHub Repository:** [https://github.com/Nonarkara/city-reporter-line-bot](https://github.com/Nonarkara/city-reporter-line-bot)

---

## 🌟 Key Features

### 👁️ Magic Eye AI (Computer Vision)
*   **Forensic Analysis:** Automatically analyzes uploaded photos to detect potholes, floods, waste, and more.
*   **Metadata Extraction:** Extracts GPS coordinates and timestamps directly from image EXIF data for verified locations.
*   **Severity Assessment:** AI estimates the dimensions and urgency of the issue (e.g., "50cm deep pothole").

### 💬 LINE-First Operations
*   **Primary Channel:** Optimized for LINE-based civic reporting and field operations.
*   **Operational Focus:** Tuned for cleaner production workflows, with the demo deployment kept separate.

### 📊 Real-Time Command Center
*   **Dark Mode UI:** A professional, "Apple-style" dark theme dashboard for city officials.
*   **Live Map:** Leaflet.js integration showing incident clusters and heatmaps.
*   **Social Pulse:** Real-time sentiment analysis of city conversations.
*   **AI Briefings:** Auto-generated intelligence briefs summarizing daily trends and risks.

### 🧠 Intelligent Conversationalist
*   **Persona:** "Non" - A reflective, skeptical, yet helpful urban planner persona.
*   **Deterministic Flow:** Robust state machine ensures critical data (Photo > Location > Category) is collected accurately while maintaining a natural conversation.

### ☁️ Operational Storage Path
*   **Current Fallback:** Google Sheets and Google Drive still support the app out of the box.
*   **Production Upgrade Path:** Supabase-backed reports and queue persistence are built in for heavier real-world usage.

---

## 🛠️ Technical Architecture

*   **Runtime:** Node.js v18+ (Express.js)
*   **AI Model:** Google Gemini 1.5 Flash (via Google Generative AI SDK)
*   **Database:** Supabase primary with Google Sheets fallback
*   **Storage:** Google Drive API v3
*   **Maps:** OpenStreetMap / Leaflet.js
*   **Deployment:** Render web service via [DEPLOYMENT.md](DEPLOYMENT.md)

---

## 📂 Project Structure Overview

*   `src/handlers/`: Platform-specific logic (LINE/Telegram webhooks).
*   `src/services/`: Core logic (AI, Google Sheets, Reports, Notifications).
*   `src/config/`: Configuration and Persona definitions.
*   `public/`: The Command Center Dashboard (HTML/CSS/JS).
*   `scripts/`: Utility scripts for health checks, testing, and data migration.

---

## 📬 Contact & Support

**Project Maintainer:** Nonarkara
*   **GitHub:** [https://github.com/Nonarkara](https://github.com/Nonarkara)
*   **Dashboard Access:** Request access via the maintainer.

---

*Built with ❤️ for a Smarter Thailand.*
