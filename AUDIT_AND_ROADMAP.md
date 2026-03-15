# Smart City Thailand CDP - Comprehensive Audit & Improvement Roadmap

**Audit Date:** February 4, 2026
**Auditor:** Claude Opus 4.5
**Codebase:** city-reporter-line-bot (~2,900 lines)

---

## Executive Summary

You've built a functional civic engagement platform that allows citizens to report problems via LINE/Telegram, uses Gemini AI for image analysis, and stores data in Google Sheets. The system works, but needs architectural improvements to support your vision of:

1. **Advanced AI analytics** (trend detection, unsupervised learning, efficiency metrics)
2. **Team competition/leaderboards**
3. **Robust, scalable infrastructure**
4. **Clean, maintainable code**

---

## Part 1: Current State Analysis

### What's Working Well ✅

| Component | Status | Notes |
|-----------|--------|-------|
| LINE/Telegram Integration | ✅ Solid | Multi-bot support, proper webhook handling |
| Gemini Vision ("Magic Eyes") | ✅ Good | Expert-level prompting, OCR integration |
| Conversation Flow | ✅ Good | State machine with persistence |
| Google Drive Storage | ✅ Works | Direct URLs for messaging compatibility |
| Basic Dashboard | ✅ Functional | Leaflet maps, report cards, status workflow |
| Conversation Memory | ✅ Clever | Fact learning, history tracking |

### What Needs Work ⚠️

| Component | Issue | Impact |
|-----------|-------|--------|
| Database (Google Sheets) | Won't scale past ~5,000 rows | Critical |
| Analytics/ML Pipeline | Non-existent | Major gap |
| Code Organization | Some 400+ line files | Maintenance burden |
| Error Handling | Inconsistent | Reliability |
| Testing | No tests | Risk |
| News Feed | Hardcoded static data | Not real AI |
| Team Features | Partially implemented | Missing leaderboards |
| Unsupervised Learning | Not implemented | Your key requirement |

---

## Part 2: Detailed Code Issues

### 2.1 Architecture Issues

#### A. Database Bottleneck (CRITICAL)
**Location:** `src/services/googleSheets.js`

Google Sheets limitations:
- 10 million cells per spreadsheet
- API rate limits (100 requests/100 seconds per user)
- No indexing, queries scan entire sheet
- No transactions

**Current Code Problem:**
```javascript
// getAllReports() reads ENTIRE spreadsheet every time
const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:Z`,  // ALL rows, ALL columns
});
```

**Recommendation:** Migrate to Firebase Firestore (stays in Google ecosystem)
- Real-time subscriptions
- Automatic scaling
- Proper indexing
- Transaction support

#### B. Duplicated Code Between LINE and Telegram
**Location:** `src/handlers/lineWebhook.js` (484 lines) + `src/handlers/telegramBot.js` (394 lines)

~60% of logic is duplicated:
- Report submission
- Rating handling
- SOS command
- Confirmation flow

**Recommendation:** Extract shared business logic into a `ReportService`

#### C. Missing Service Layer
Currently, handlers do everything: validation, business logic, AI calls, database writes.

**Current Structure:**
```
handlers/
├── lineWebhook.js    (484 lines - does EVERYTHING)
├── telegramBot.js    (394 lines - does EVERYTHING)
└── conversationFlow.js
```

**Recommended Structure:**
```
handlers/
├── line.handler.js        (50 lines - just LINE SDK specifics)
├── telegram.handler.js    (50 lines - just Telegraf specifics)
services/
├── report.service.js      (business logic)
├── ai.service.js          (all AI operations)
├── notification.service.js
├── analytics.service.js   (NEW - for trend analysis)
```

### 2.2 AI Processor Issues

**Location:** `src/services/aiProcessor.js`

#### A. No Retry Logic
```javascript
// Current: Single attempt, no retry
const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
```

AI calls can fail due to rate limits, network issues, or model overload.

#### B. No Response Validation
```javascript
const jsonMatch = response.match(/\{[\s\S]*\}/);
if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);  // Can throw!
    return { ... };
}
```

If Gemini returns malformed JSON, this silently falls through.

#### C. Hardcoded Model
```javascript
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
```

Should be configurable for different use cases (speed vs quality).

### 2.3 Security Considerations

#### A. No Input Sanitization
User descriptions are passed directly to AI prompts:
```javascript
const prompt = `...ข้อความ: "${text}"...`;  // Potential prompt injection
```

#### B. No Rate Limiting
```javascript
app.post('/webhook', express.json(), (req, res) => {
    // No rate limiting - vulnerable to abuse
});
```

#### C. Environment Variables Exposed in Logs
```javascript
console.log('Client ID:', process.env.GOOGLE_CLIENT_ID?.substring(0, 10) + '...');
```

### 2.4 Missing Features (Your Requirements)

| Feature You Mentioned | Current State | Gap |
|----------------------|---------------|-----|
| "AI analyzing queries coming in" | ❌ Missing | Need analytics pipeline |
| "Unsupervised learning for patterns" | ❌ Missing | Need ML service |
| "Team competition/leaderboards" | 🟡 Partial | Team name exists, no scoring |
| "AI efficiency dashboards" | ❌ Missing | Need metrics service |
| "News related to work" | 🟡 Hardcoded | Need real aggregation |
| "Analyzing which teams do better" | ❌ Missing | Need team analytics |

---

## Part 3: Improvement Roadmap

### Phase 1: Foundation (Week 1-2)
**Goal:** Clean up code, add proper architecture

1. **Refactor into Service Layer**
   - Create `ReportService` for shared business logic
   - Create `AIService` wrapper with retry logic
   - Create `NotificationService` for LINE/Telegram notifications

2. **Add Error Handling**
   - Consistent error wrapper
   - Proper logging with levels (debug, info, warn, error)
   - Error reporting (Sentry or similar)

3. **Add Basic Tests**
   - Unit tests for services
   - Integration tests for API endpoints

### Phase 2: Database Migration (Week 2-3)
**Goal:** Move from Google Sheets to Firestore

1. **Set up Firestore**
   - Create collections: `reports`, `teams`, `analytics`, `users`
   - Design indexes for common queries

2. **Migration Script**
   - Export existing Sheets data
   - Import to Firestore
   - Dual-write period for safety

3. **Update Services**
   - Replace Sheets calls with Firestore
   - Add real-time listeners for dashboard

### Phase 3: Analytics Pipeline (Week 3-4)
**Goal:** Add the AI analytics you want

1. **Create Analytics Service**
   ```javascript
   // src/services/analytics.service.js
   class AnalyticsService {
     async analyzeTrends(timeframe) { }
     async detectPatterns() { }      // Unsupervised learning
     async getTeamPerformance() { }
     async getEfficiencyMetrics() { }
   }
   ```

2. **Implement Trend Detection**
   - Problem category trends over time
   - Geographic hotspots
   - Time-of-day patterns
   - Seasonal patterns

3. **Implement Team Analytics**
   - Response time leaderboard
   - Resolution rate
   - Citizen satisfaction scores
   - Workload distribution

### Phase 4: Advanced AI Features (Week 4-5)
**Goal:** Make AI more powerful

1. **Pattern Recognition (Unsupervised Learning)**
   - Cluster similar reports
   - Detect anomalies (unusual spike in reports)
   - Identify recurring issues

2. **Predictive Analytics**
   - Predict busy periods
   - Estimate resolution time
   - Resource allocation suggestions

3. **Enhanced Photo Analysis**
   - Multi-image comparison
   - Progress tracking (before/after)
   - Damage severity scoring

4. **Automated News Aggregation**
   - Scrape relevant city news
   - Summarize with AI
   - Filter by relevance

### Phase 5: Dashboard Upgrade (Week 5-6)
**Goal:** Professional analytics dashboard

1. **Real-time Updates**
   - Firestore real-time subscriptions
   - Live counters and charts

2. **Team Leaderboards**
   - Weekly/monthly rankings
   - Performance metrics
   - Gamification elements

3. **AI Insights Panel**
   - Trend visualizations
   - Pattern alerts
   - Efficiency recommendations

---

## Part 4: Technical Specifications

### 4.1 Recommended New File Structure

```
city-reporter-line-bot/
├── src/
│   ├── index.js                    # Express setup only
│   ├── config/
│   │   ├── index.js                # Environment config
│   │   └── constants.js            # App constants
│   ├── handlers/
│   │   ├── line.handler.js         # LINE webhook (slim)
│   │   ├── telegram.handler.js     # Telegram webhook (slim)
│   │   └── api.handler.js          # REST API routes
│   ├── services/
│   │   ├── report.service.js       # Report CRUD & business logic
│   │   ├── ai.service.js           # All AI operations
│   │   ├── vision.service.js       # Image analysis
│   │   ├── analytics.service.js    # Trends, patterns, metrics
│   │   ├── notification.service.js # Push notifications
│   │   ├── team.service.js         # Team management
│   │   ├── firestore.service.js    # Database operations
│   │   └── news.service.js         # News aggregation
│   ├── ml/
│   │   ├── clustering.js           # Report clustering
│   │   ├── anomaly.js              # Anomaly detection
│   │   └── prediction.js           # Predictive models
│   ├── utils/
│   │   ├── logger.js               # Structured logging
│   │   ├── validators.js           # Input validation
│   │   └── helpers.js              # Utility functions
│   └── middleware/
│       ├── auth.js                 # Authentication
│       ├── rateLimit.js            # Rate limiting
│       └── errorHandler.js         # Global error handler
├── public/
│   ├── dashboard/
│   │   ├── index.html              # Main dashboard
│   │   ├── analytics.html          # Analytics page
│   │   └── leaderboard.html        # Team leaderboard
│   └── staff/
│       └── index.html              # Staff command center
├── tests/
│   ├── unit/
│   └── integration/
├── scripts/
│   ├── migrate-to-firestore.js
│   └── seed-data.js
└── docs/
    └── API.md
```

### 4.2 New Database Schema (Firestore)

```javascript
// Collection: reports
{
  id: "uuid",
  ticketNumber: "SCTH-20260204-1234",
  timestamp: Timestamp,
  userId: "U123...",
  platform: "line" | "telegram",

  // Problem details
  problemType: "หลุมบนถนน",
  description: "...",
  urgency: "high" | "medium" | "low",

  // Location
  location: {
    text: "ซอยสุขุมวิท 55",
    coordinates: GeoPoint,
    geocoded: { ... }
  },

  // Media
  images: [{
    url: "https://...",
    analysis: { ... }  // AI analysis result
  }],

  // AI Analysis
  ai: {
    summary: "...",
    ocrText: "...",
    expertAnalysis: [...],
    patterns: ["recurring_issue", "same_location"],
    predictedResolutionTime: 120  // minutes
  },

  // Workflow
  status: "received" | "assigned" | "in_progress" | "completed",
  assignedTeam: "team_id",
  assignedStaff: "staff_id",

  // Timestamps
  createdAt: Timestamp,
  acknowledgedAt: Timestamp,
  startedAt: Timestamp,
  completedAt: Timestamp,

  // Citizen feedback
  rating: 4,
  feedback: "..."
}

// Collection: teams
{
  id: "team_id",
  name: "ทีมซ่อมถนน",
  members: ["staff_1", "staff_2"],

  // Performance metrics (computed)
  metrics: {
    totalResolved: 150,
    avgResolutionTime: 45,  // minutes
    avgRating: 4.2,
    currentWorkload: 5
  },

  // Weekly scores for leaderboard
  weeklyScores: [{
    week: "2026-W05",
    resolved: 23,
    avgTime: 42,
    score: 850
  }]
}

// Collection: analytics (time-series data)
{
  id: "daily_2026-02-04",
  date: Timestamp,

  // Aggregates
  totalReports: 45,
  byCategory: {
    "หลุมบนถนน": 12,
    "ไฟฟ้า": 8,
    ...
  },
  byUrgency: {
    "high": 5,
    "medium": 25,
    "low": 15
  },
  byHour: [0, 0, 1, 2, 5, 8, ...],  // 24 hours

  // Patterns detected
  patterns: [{
    type: "spike",
    category: "คลองระบายน้ำ",
    deviation: 2.5  // standard deviations
  }],

  // Geographic clusters
  hotspots: [{
    center: GeoPoint,
    radius: 500,  // meters
    count: 12
  }]
}

// Collection: news (AI-curated)
{
  id: "news_uuid",
  title: "...",
  summary: "...",
  source: "...",
  url: "...",
  relevanceScore: 0.85,
  categories: ["infrastructure", "traffic"],
  publishedAt: Timestamp,
  fetchedAt: Timestamp
}
```

### 4.3 Analytics Service Implementation

```javascript
// src/services/analytics.service.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from './firestore.service.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export class AnalyticsService {

  /**
   * Analyze trends over a time period
   */
  async analyzeTrends(days = 30) {
    const reports = await this.getReportsForPeriod(days);

    // Use Gemini to analyze patterns
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `Analyze these ${reports.length} city problem reports and identify:
    1. Category trends (which problems are increasing/decreasing)
    2. Geographic patterns (any clustering)
    3. Temporal patterns (time of day, day of week)
    4. Unusual patterns or anomalies

    Data: ${JSON.stringify(reports.map(r => ({
      type: r.problemType,
      location: r.location?.coordinates,
      timestamp: r.timestamp,
      urgency: r.urgency
    })))}

    Return JSON: {
      "categoryTrends": [...],
      "geographicClusters": [...],
      "temporalPatterns": {...},
      "anomalies": [...],
      "insights": ["...", "..."]
    }`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  }

  /**
   * Detect patterns using unsupervised learning
   * Uses Gemini to cluster similar reports
   */
  async detectPatterns() {
    const recentReports = await this.getReportsForPeriod(7);

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `Perform unsupervised clustering on these city problem reports.
    Group similar problems together and identify:
    1. Recurring issues (same problem, same location)
    2. Related issues (might have same root cause)
    3. Potential systemic problems

    Reports: ${JSON.stringify(recentReports.map(r => ({
      id: r.id,
      type: r.problemType,
      description: r.description,
      location: r.location?.text,
      aiSummary: r.ai?.summary
    })))}

    Return JSON: {
      "clusters": [{
        "name": "cluster name",
        "reportIds": [...],
        "commonPattern": "description",
        "rootCause": "hypothesis",
        "recommendation": "action to take"
      }],
      "recurringIssues": [...],
      "systemicProblems": [...]
    }`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  }

  /**
   * Calculate team performance metrics
   */
  async getTeamPerformance(teamId = null) {
    const query = teamId
      ? db.collection('reports').where('assignedTeam', '==', teamId)
      : db.collection('reports');

    const snapshot = await query
      .where('status', '==', 'completed')
      .orderBy('completedAt', 'desc')
      .limit(1000)
      .get();

    // Group by team and calculate metrics
    const teamStats = {};

    snapshot.forEach(doc => {
      const report = doc.data();
      const team = report.assignedTeam || 'unassigned';

      if (!teamStats[team]) {
        teamStats[team] = {
          resolved: 0,
          totalTime: 0,
          totalRating: 0,
          ratedCount: 0
        };
      }

      teamStats[team].resolved++;

      if (report.acknowledgedAt && report.completedAt) {
        const time = report.completedAt.toMillis() - report.acknowledgedAt.toMillis();
        teamStats[team].totalTime += time;
      }

      if (report.rating) {
        teamStats[team].totalRating += report.rating;
        teamStats[team].ratedCount++;
      }
    });

    // Calculate averages and rank
    const leaderboard = Object.entries(teamStats)
      .map(([teamId, stats]) => ({
        teamId,
        resolved: stats.resolved,
        avgResolutionTime: Math.round(stats.totalTime / stats.resolved / 60000),  // minutes
        avgRating: stats.ratedCount > 0
          ? (stats.totalRating / stats.ratedCount).toFixed(1)
          : 'N/A',
        score: this.calculateScore(stats)
      }))
      .sort((a, b) => b.score - a.score);

    return leaderboard;
  }

  /**
   * Calculate efficiency metrics
   */
  async getEfficiencyMetrics() {
    const today = new Date();
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [todayReports, weekReports] = await Promise.all([
      this.getReportsForDate(today),
      this.getReportsForPeriod(7)
    ]);

    const completed = weekReports.filter(r => r.status === 'completed');
    const avgTime = completed.length > 0
      ? completed.reduce((sum, r) => {
          if (r.acknowledgedAt && r.completedAt) {
            return sum + (r.completedAt.toMillis() - r.acknowledgedAt.toMillis());
          }
          return sum;
        }, 0) / completed.length / 60000
      : 0;

    return {
      todayTotal: todayReports.length,
      todayPending: todayReports.filter(r => r.status === 'received').length,
      weekTotal: weekReports.length,
      weekCompleted: completed.length,
      resolutionRate: ((completed.length / weekReports.length) * 100).toFixed(1),
      avgResolutionTime: Math.round(avgTime),
      efficiency: this.calculateEfficiencyScore(weekReports)
    };
  }

  // Helper methods
  calculateScore(stats) {
    // Weighted scoring: resolved (40%), speed (30%), rating (30%)
    const resolvedScore = Math.min(stats.resolved * 10, 400);
    const speedScore = stats.resolved > 0
      ? Math.max(0, 300 - (stats.totalTime / stats.resolved / 60000))
      : 0;
    const ratingScore = stats.ratedCount > 0
      ? (stats.totalRating / stats.ratedCount) * 60
      : 150;

    return Math.round(resolvedScore + speedScore + ratingScore);
  }

  calculateEfficiencyScore(reports) {
    // 100 = perfect, 0 = terrible
    const completed = reports.filter(r => r.status === 'completed').length;
    const total = reports.length;
    const rate = total > 0 ? completed / total : 0;

    // Factor in speed
    const avgSpeed = this.calculateAvgSpeed(reports);
    const speedFactor = Math.min(1, 60 / avgSpeed);  // 60 min target

    return Math.round((rate * 0.6 + speedFactor * 0.4) * 100);
  }
}
```

### 4.4 News Aggregation Service

```javascript
// src/services/news.service.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export class NewsService {

  /**
   * Fetch and curate relevant city news
   */
  async fetchAndCurateNews() {
    // Fetch from multiple sources
    const rawNews = await this.fetchFromSources([
      'https://api.gdeltproject.org/api/v2/doc/doc?query=thailand+city+infrastructure&mode=artlist&format=json',
      // Add more sources
    ]);

    // Use Gemini to filter and summarize
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `You are a Smart City news curator. Filter these news items and keep only those relevant to:
    - Urban infrastructure (roads, drainage, electricity, water)
    - City services and management
    - Technology in city operations
    - Public safety
    - Environmental issues in cities

    For each relevant item, provide a 2-sentence Thai summary.

    News items: ${JSON.stringify(rawNews)}

    Return JSON array:
    [{
      "title": "original title",
      "summary": "Thai summary (2 sentences)",
      "relevanceScore": 0.0-1.0,
      "categories": ["infrastructure", "safety", etc],
      "source": "source name",
      "url": "link"
    }]

    Only include items with relevanceScore > 0.6`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  }
}
```

---

## Part 5: Priority Action Items

### Immediate (This Week)
1. ✅ Create this audit document
2. 🔄 Refactor `lineWebhook.js` and `telegramBot.js` to extract shared logic
3. 🔄 Add error handling wrapper
4. 🔄 Set up Firestore project

### Short-term (Next 2 Weeks)
1. Migrate from Google Sheets to Firestore
2. Implement Analytics Service (basic version)
3. Add team leaderboard to dashboard

### Medium-term (Month 1)
1. Implement pattern detection (unsupervised learning)
2. Automated news aggregation
3. Enhanced AI photo analysis
4. Add comprehensive tests

### Long-term (Month 2+)
1. Predictive analytics
2. Mobile app consideration
3. API for third-party integrations
4. Multi-language support

---

## Conclusion

Your platform has solid bones. The main work is:
1. **Database migration** (Google Sheets → Firestore) - enables everything else
2. **Code refactoring** (extract services) - makes future development easier
3. **Analytics pipeline** (new feature) - delivers your AI vision

The AI capabilities you want (trend analysis, unsupervised learning, efficiency metrics) are achievable using Gemini's analytical abilities combined with proper data infrastructure.

Want me to start implementing any of these phases?
