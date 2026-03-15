# 🔐 How to Fix "0%" Dashboard (Invalid Token)

The dashboard is showing 0% because your **Google Refresh Token** has expired or is invalid (`invalid_grant` error).

## ⚠️ Important: Why did this happen?
Your Google Cloud App is in **"Testing"** mode, which forces all Refresh Tokens to expire every 7 days.
To **FIX THIS PERMANENTLY**, do this first:
1. Go to your [Google Cloud OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent).
2. Click the **PUBLISH APP** button under Publishing Status.
3. Confirm the dialog. The status will change to "In production".

*Note: Your app will say "Unverified", which is perfectly fine for personal bots.*

---

## 🛠️ Step 1: Generate New Token (One Last Time)

1.  Make sure your local server is running:
    ```bash
    npm start
    ```
2.  **Click this link** to authorize:
    👉 [http://localhost:3000/auth/google](http://localhost:3000/auth/google)
3.  Login with the Google Account that owns the Sheets/Drive.
4.  **Allow** all services.
5.  **COPY** the long text starting with `1//...` (This is your Refresh Token).

## 🚀 Step 2: Update Railway

1.  Go to your [Railway Dashboard](https://railway.app).
2.  Select `city-reporter-bot` > **Variables**.
3.  Find `GOOGLE_REFRESH_TOKEN`.
4.  Click the **Pencil Icon** (Edit) and paste the **new token**.
5.  Click **checkmark** to save.
6.  Railway will **automatically redeploy**.

## ✅ Step 3: Verify

Wait 2 minutes for the deployment to finish, then refresh your [Production Dashboard](https://city-reporter-line-bot.onrender.com). The numbers should be back!
