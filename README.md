# Rafiki – Msaidizi wa AI wa Kiswahili

Rafiki is a Swahili AI chat website powered by Claude. Anyone with the link can use it on their phone or computer, with no Claude account needed. You pay for the messages through your own Claude API account.

## What's inside

| File | What it does |
|---|---|
| `server.js` | The server. Serves the website and sends messages to Claude. No extra packages needed. |
| `public/index.html` | The chat page people see. |
| `.env.example` | Settings template: your API key, daily limits, model. |

Built-in protections:
- Each person (by internet address) gets **20 messages a day** by default.
- The whole site stops at **1,000 messages a day** by default, so your bill can't run away.
- Long conversations are trimmed before sending to keep costs down.
- Your API key stays on the server. It is never sent to people's browsers.

---

## Step 1 – Get a Claude API key

1. Go to **https://console.anthropic.com** and create an account.
2. Open **Billing** and add credit (you can start with $5–10). A Visa/Mastercard debit card works.
3. Open **API Keys → Create Key**. Copy the key (it starts with `sk-ant-`). Keep it secret.
4. Recommended: under **Limits**, set a monthly spend limit so you never pay more than you planned.

## Step 2 – Try it on your computer (optional)

You need Node.js 18 or newer from https://nodejs.org.

```bash
cd rafiki-app
cp .env.example .env        # on Windows: copy .env.example .env
# open .env and paste your key after ANTHROPIC_API_KEY=
node server.js
```

Open **http://localhost:3000** in your browser and chat.

## Step 3 – Put it online (free) with Render

1. Create a free account at **https://github.com** and make a new repository called `rafiki`. Upload all the files from this folder **except `.env`** (the `.gitignore` file already keeps it out).
2. Create a free account at **https://render.com** and sign in with GitHub.
3. Click **New → Web Service**, choose your `rafiki` repository, and set:
   - **Runtime:** Node
   - **Build command:** leave empty (or `npm install`)
   - **Start command:** `node server.js`
   - **Instance type:** Free
4. Under **Environment Variables**, add:
   - `ANTHROPIC_API_KEY` = your key
   - `DAILY_LIMIT` = `20` (or whatever you like)
5. Click **Create Web Service**. After a minute or two you get a link like `https://rafiki-xxxx.onrender.com`. Share that link.

Note: on Render's free plan the site "sleeps" after 15 minutes without visitors, so the first visit afterwards takes about 30–50 seconds to load. The paid plan (about $7/month) keeps it awake. The daily message counters reset if the server restarts.

You can use any host that runs Node.js (Railway, Fly.io, a VPS) with the same start command.

## Step 4 – Install it on your phone

Rafiki is an installable web app. Once it's online (Step 3), open your link on your phone:

- **Android (Chrome):** tap the yellow **Pakua App** button, then **Install**. Or use the **⋮** menu → **Install app**.
- **iPhone (Safari):** tap **Pakua App** to see the steps: **Share** button → **Add to Home Screen** → **Add**.

Rafiki then gets its own icon on your home screen and opens full screen like a normal app. Updates you make to the website appear in the app automatically. The app needs internet to answer, but it still opens without a connection and shows a notice.

Installing needs the `https://` link from your host. It won't work from `http://` addresses, except `localhost` on the same computer.

**Want it in the Google Play Store?** Go to **https://www.pwabuilder.com**, paste your Render link, and it will package Rafiki as an Android app (.apk/.aab) for free. Publishing on Play Store needs a Google Play developer account (a one-time $25 fee).

## Costs (roughly)

You pay Anthropic per message. With the default Haiku model, a typical question and answer costs well under one US cent (a few to around 15 Tanzanian shillings), and longer conversations cost more because the earlier messages are sent again each time. Check current prices at https://www.anthropic.com/pricing and watch your real spending in the Console under **Usage**.

Example: 100 people × 10 messages a day ≈ 1,000 messages ≈ a few US dollars a day. Use `DAILY_LIMIT` and `GLOBAL_DAILY_LIMIT` to control this.

## Changing things

- **Rafiki's personality or rules:** edit `SYSTEM_PROMPT` near the top of `server.js` (it's written in Swahili).
- **Smarter answers:** set `MODEL=claude-sonnet-5-5` (costs more per message).
- **Text and example questions on the page:** edit `public/index.html`.

## Ideas for later

- Charge for more messages with M-Pesa, Tigo Pesa or Airtel Money (for example through Selcom, AzamPay or ClickPesa).
- A WhatsApp version using the WhatsApp Business API.
- Login accounts so limits follow the person instead of their internet address.
