# 🤖 Channel Mini App Bot — Client Setup Guide

This bot automatically adds a "Play Video In Mini APP" button to every post in your Telegram channel. If the post contains a FilesAdda link, the button will pre-fill that URL automatically.

---

## Step 1: Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Give it a name (e.g. `My Channel Player`)
4. Give it a username (e.g. `mychannel_player_bot`)
5. **Copy the Bot Token** — you'll need it in Step 3

---

## Step 2: Create the Mini App in BotFather

1. In the same @BotFather chat, send: `/newapp`
2. Select your bot (e.g. `@mychannel_player_bot`)
3. **Title:** `Play Video`
4. **Description:** `Watch and download videos`
5. **Photo:** Send any photo (required by Telegram)
6. **GIF:** Send `/empty` to skip
7. **Web App URL:** Send your Vercel URL (you'll get this in Step 4, come back here after)
8. **Short name:** `play`

> ⚠ **Write down the short name.** The button URL will be: `https://t.me/YOUR_BOT_USERNAME/play`

---

## Step 3: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up / log in
2. Click **"Add New Project"** → Import the GitHub repository
3. Go to **Settings → Environment Variables** and add:

| Variable | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | The token from Step 1 |
| `BROADCAST_SECRET` | Any password you choose (e.g. `mysecret123`) |

4. Click **Deploy**
5. Once deployed, copy your Vercel URL (e.g. `https://myproject.vercel.app`)

---

## Step 4: Set the Mini App URL (back in BotFather)

1. Go to @BotFather → `/myapps`
2. Select your bot → select the `play` app
3. Click **"Edit Web App URL"**
4. Send your Vercel URL: `https://YOUR-PROJECT.vercel.app/`

---

## Step 5: Register the Webhook

Open this URL in your browser:

```
https://YOUR-PROJECT.vercel.app/api/setup
```

You should see: `✅ Webhook successfully set`

---

## Step 6: Add Bot to Channel

1. Go to your Telegram Channel → **Manage Channel** → **Administrators**
2. Click **"Add Administrator"** → search for your bot (e.g. `@mychannel_player_bot`)
3. Enable these permissions:
   - ✅ **Edit Messages of Others** (required!)
   - ✅ Post Messages
4. Click **Save**

---

## Step 7: Test It!

Post a message in your channel. The bot will instantly add the **"Play Video In Mini APP"** button!

If the post contains a FilesAdda link (e.g. `https://filesadda.site/abc123`), the button will automatically pre-fill that URL in the Mini App.

---

## (Optional) Step 8: Add Buttons to Old Posts

To add the button to existing posts that were made before the bot was added:

1. Right-click your **oldest** post → Copy Post Link → note the message ID at the end
2. Right-click your **newest** post → Copy Post Link → note the message ID
3. Open this URL in your browser (replace the values):

```
https://YOUR-PROJECT.vercel.app/api/batch-update?chat_id=-100XXXXXXXXXX&start=FIRST_ID&end=LAST_ID&secret=YOUR_BROADCAST_SECRET
```

- `chat_id`: Your channel ID with `-100` prefix (e.g. `-1003769704138`)
- `start` / `end`: Message ID range
- `secret`: The `BROADCAST_SECRET` you set in Vercel
- Max 100 messages per request

---

## ⚠ Important Notes

- The bot must be an **Admin** with **"Edit Messages"** permission
- After changing your Vercel URL, always re-run `/api/setup` to update the webhook
- After changing the Vercel URL, also update it in BotFather (`/myapps → Edit Web App URL`)
- Only **one** environment variable is required: `TELEGRAM_BOT_TOKEN`
