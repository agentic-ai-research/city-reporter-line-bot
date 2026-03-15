# Deployment Guide

This app is set up for Render Blueprints via [render.yaml](/Users/non/Projects/city-reporter-line-bot/render.yaml). The Blueprint now prompts for the required secrets during service creation.

## Required Environment Variables

Render should set `NODE_ENV=production` and `RENDER_EXTERNAL_URL` automatically. You should add these secrets in the Blueprint or service `Environment` tab:

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_SPREADSHEET_ID`
- `GOOGLE_DRIVE_FOLDER_ID`
- `GOOGLE_DRIVE_KB_FOLDER_ID`
- `GOOGLE_MAPS_API_KEY`
- `GEMINI_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

Optional:

- `TELEGRAM_BOT_TOKEN_2`
- `GOOGLE_CALLBACK_URL`
- `BOT_QUEUE_MODE`

## Render Blueprint Flow

1. Push the repo to GitHub.
2. In Render, click `New +` -> `Blueprint`.
3. Select the repo and confirm Render detects [render.yaml](/Users/non/Projects/city-reporter-line-bot/render.yaml).
4. Create the Blueprint and fill in the secret prompts.
5. Wait for the deploy to finish.
6. Open `https://<your-service>.onrender.com/health`.

Expected health output:

```json
{
  "status": "ok",
  "supabase": true,
  "reportsBackend": "supabase",
  "queue": {
    "backend": "supabase"
  }
}
```

## Notes

- Do not set `PORT` manually on Render.
- Do not add the Supabase personal access token to Render. That token is only for one-time schema administration.
- If `supabase` is `false` in `/health`, the service is missing `SUPABASE_URL` or `SUPABASE_SERVICE_KEY`.
- If Telegram webhook registration fails, check that the service has a valid public Render URL and that the bot token is correct.
