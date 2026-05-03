# Deployment Guide

The bot runs as a long-lived Express server. The supported topology is:

```
LINE / Telegram  →  https://bot.<your-domain>  →  Cloudflare Tunnel  →  localhost:3000  →  Node (PM2)
```

A Cloudflare Tunnel gives you a stable HTTPS URL for LINE webhooks without exposing the machine to the public internet, and PM2 keeps the Node process alive across crashes and reboots.

> The legacy [render.yaml](render.yaml) and [Procfile](Procfile) are kept in the repo as a fallback only. The active deployment target is the local machine + Cloudflare Tunnel.

## 1. Prerequisites

- Node 20+ (`node --version`)
- `cloudflared` (`brew install cloudflared`)
- A domain on Cloudflare with an active zone (free plan is fine)
- LINE channel + Google service credentials populated in `.env` (copy from [.env.example](.env.example))

## 2. Required environment variables

Required:

- `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_SPREADSHEET_ID`, `GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_DRIVE_KB_FOLDER_ID`
- `GOOGLE_MAPS_API_KEY`, `GEMINI_API_KEY`
- `EXTERNAL_BASE_URL=https://bot.<your-domain>` — used for OAuth callback and Telegram webhook registration
- `DASHBOARD_API_KEY` — random string; required in production for dashboard write endpoints

Optional:

- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (enables dual-write)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_TOKEN_2`
- `LOG_LEVEL=info` (default; use `debug` for verbose startup output)

## 3. Run the bot under PM2

```bash
npm install -g pm2
cd /path/to/city-reporter-line-bot
npm install
pm2 start npm --name city-reporter-bot -- start
pm2 save
pm2 startup        # follow the printed launchctl command (one-time, requires sudo)
```

Verify:

```bash
pm2 status
curl -s http://localhost:3000/health | jq
```

Expected `/health` response:

```json
{
  "status": "ok",
  "supabase": true,
  "reportsBackend": "supabase",
  "queue": { "backend": "memory", "workerRunning": true }
}
```

If `supabase` is `false`, `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` is missing — Sheets-only mode.

## 4. Set up a Cloudflare Tunnel

One-time auth (opens a browser; pick the zone for your domain):

```bash
cloudflared tunnel login
```

Create a named tunnel and route DNS:

```bash
cloudflared tunnel create city-reporter-bot
cloudflared tunnel route dns city-reporter-bot bot.<your-domain>
```

Note the tunnel UUID printed by `tunnel create` — it's the basename of the credentials file at `~/.cloudflared/<UUID>.json`.

Write `~/.cloudflared/config.yml`:

```yaml
tunnel: city-reporter-bot
credentials-file: /Users/<you>/.cloudflared/<UUID>.json

ingress:
  - hostname: bot.<your-domain>
    service: http://localhost:3000
    originRequest:
      connectTimeout: 30s
      keepAliveTimeout: 90s   # webhook handler runs up to 55s in background
  - service: http_status:404
```

Validate and run as a system service:

```bash
cloudflared tunnel ingress validate
sudo cloudflared service install
sudo launchctl print system/com.cloudflare.cloudflared | grep state
```

Verify end-to-end:

```bash
curl -s https://bot.<your-domain>/health | jq
cloudflared tunnel info city-reporter-bot   # should show 1+ active connections
```

## 5. Point external services at the new URL

- **LINE:** Messaging API console → Webhook URL = `https://bot.<your-domain>/webhook` → Verify → Use webhook = ON.
- **Telegram:** the bot calls `setWebhook` automatically at startup using `EXTERNAL_BASE_URL`. After deploy, send `/start` to confirm.
- **Google OAuth (one-time):** add `https://bot.<your-domain>/oauth2callback` as an authorized redirect URI in Google Cloud Console, then visit `https://bot.<your-domain>/auth/google` in a browser to get a fresh `GOOGLE_REFRESH_TOKEN`. The token is written to `.oauth-refresh-token.txt` (mode 0600, gitignored) on the server. Copy it into `.env`, restart with `pm2 restart city-reporter-bot`, and delete the file.

## 6. Operations

| Task | Command |
|------|---------|
| App logs | `pm2 logs city-reporter-bot` |
| App restart | `pm2 restart city-reporter-bot` |
| Tunnel logs | `tail -f /Library/Logs/com.cloudflare.cloudflared.{out,err}.log` |
| Tunnel restart | `sudo launchctl kickstart -k system/com.cloudflare.cloudflared` |
| Stop everything | `pm2 stop city-reporter-bot && sudo launchctl stop system/com.cloudflare.cloudflared` |
| Uninstall tunnel | `sudo cloudflared service uninstall && cloudflared tunnel delete city-reporter-bot` |

## 7. Notes & gotchas

- Don't set `PORT` away from `3000` unless you also update `~/.cloudflared/config.yml`.
- The bot's `requireApiKey` middleware blocks every dashboard write endpoint in production unless `DASHBOARD_API_KEY` is set — this is by design.
- Mutating dashboard endpoints (`/api/reports/:id/{status,category,lock}`, `/api/intelligence/generate`) are now rate-limited to 30 req/min/IP; `/api/upload` to 10 req/min/IP.
- LINE webhook signature validation runs on the raw body before any logging, so a missing `LINE_CHANNEL_SECRET` will produce 500s on real traffic. Always populate it.
- Cold start: services initialize ~5s after the listener binds (Sheets, KB index). `/health` responds immediately, but report ingestion may briefly fall back to Sheets-only until init completes.
