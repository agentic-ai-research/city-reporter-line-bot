# System Architecture

## Overview

The Smart City Thailand platform is a distributed system designed for high availability, low latency, and deterministic reliability. It connects citizens (via LINE/Telegram) to city officials (via a real-time Dashboard) using a zero-database architecture powered by Google Sheets and Gemini AI.

## 🏗️ High-Level Architecture

```mermaid
flowchart TB
    subgraph Citizen Interface
        LINE["LINE App"]
        TG["Telegram"]
    end
    
    subgraph Core Engine [" Node.js Server "]
        LH["LINE Handler"]
        TH["Telegram Handler"]
        RS["Report Service"]
        AI["AI Service (Gemini)"]
        SL["Social Listening"]
        NS["Notification Service"]
    end
    
    subgraph Data Layer [" Google Cloud "]
        GS["Google Sheets (Database)"]
        GD["Google Drive (Media Storage)"]
    end
    
    subgraph Admin Interface
        DB["Command Center Dashboard"]
        MAP["Real-time Map"]
    end
    
    Citizen Interface -->|Webhook| Core Engine
    Core Engine -->|REST API| Data Layer
    Core Engine -->|WebSocket/Polling| Admin Interface
    Admin Interface -->|Status Update| Core Engine
    Core Engine -->|Push Notification| Citizen Interface
```

## 🧠 Core Components

### 1. Report Service (`report.service.js`)
The central nervous system of the bot.
*   **Deterministic State Machine:** Manages the user's reporting journey (`idle` → `photo` → `location` → `contact` → `confirm`).
*   **Checklist Enforcer:** Ensures no report is submitted without critical data (e.g., location).
*   **Command Processor:** Handles keywords like `SOS`, `cancel`, `status`.

### 2. AI Service (`ai.service.js`)
Powered by Google Gemini 1.5 Flash.
*   **Magic Eye:** analyzing uploaded photos to extract "Forensic Data" (problem type, material, dimensions).
*   **Persona Engine:** "Non" - A dual-layer persona (Inner Monologue + Public Voice) that ensures responses are thoughtful, empathetic, and urban-planning focused.
*   **Fallback Mechanism:** Smart handling of 429 (Rate Limit) errors by falling back to simpler responses or secondary models.

### 3. Google Sheets Adapter (`googleSheets.js`)
Acts as the ORM (Object-Relational Mapping) layer.
*   **Reports Sheet:** Stores 29 columns of data per report.
*   **Conversations Sheet:** Logs every interaction for sentiment analysis.
*   **Intelligence Briefs:** Stores aggregated city insights.
*   **Reliability:** Implements exponential backoff for API reliability.

### 4. Dashboard (`dashboard.html`)
A single-page application (SPA) built with Vanilla JS and Tailwind CSS.
*   **Dark Mode:** "Johnny Ive" inspired aesthetic for low-light command center environments.
*   **Real-time Sync:** Polls the backend for new reports every 30 seconds.
*   **Rich Visualization:** Leaflet.js maps, Chart.js statistics, and live sentiment tracking.

## 🔄 Data Flow: The "Life of a Report"

1.  **Ingestion:** User sends Image → `line.handler.js` receives webhook.
2.  **Analysis:** `report.service.js` helps `ai.service.js` analyze image (Magic Eye).
3.  **Enrichment:**
    *   **GPS:** Extracted from image EXIF data.
    *   **Context:** User provides missing details via chat.
4.  **Submission:** Data is written to Google Sheets row.
5.  **Visualization:** Dashboard fetches new row and plays "Alert Sound".
6.  **Resolution:** Admin updates status → `notification.service.js` pushes LINE message to user.

## 🔒 Security Principles

*   **OAuth2:** Used for strict Google Service authentication.
*   **Environment Variables:** All secrets managed via `.env`.
*   **Passcode Protection:** Simple frontend gate for dashboard access.
*   **Data Isolation:** Each city deployment uses its own Sheet/Drive.
