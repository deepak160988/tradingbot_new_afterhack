# TradingView → Telegram Alert Bot

Relays TradingView webhook alerts to a Telegram group, hosted free on Vercel.

## 1. Deploy to Vercel

```bash
npm i -g vercel
cd tv-telegram-bot
vercel login
vercel --prod
```

Or: push this folder to a GitHub repo, then import it at vercel.com/new.

## 2. Set Environment Variables

In Vercel dashboard → your project → **Settings → Environment Variables**, add:

| Key | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather |
| `TELEGRAM_CHAT_ID` | Your group's chat ID (negative number) |
| `WEBHOOK_SECRET` | Any random string you make up, e.g. `mySecret123` |

Redeploy after adding env vars (`vercel --prod` again) so they take effect.

## 3. Configure TradingView Alert

- **Webhook URL**: `https://<your-project>.vercel.app/api/webhook?secret=mySecret123`
- **Message** (plain text — no JSON needed):
  ```
  {{ticker}} Alert: {{strategy.order.action}} at {{close}} on {{interval}} ({{time}})
  ```
  Whatever you type here (with TradingView's `{{placeholders}}` already substituted)
  gets forwarded to Telegram exactly as-is. The bot auto-adds 🟢 if the text contains
  "BUY" or 🔴 if it contains "SELL" (cosmetic only, safe to ignore/remove).

## 4. Test

```bash
curl -X POST "https://<your-project>.vercel.app/api/webhook?secret=mySecret123" \
  -H "Content-Type: text/plain" \
  --data-raw "NIFTY Alert: BUY at 24500 on 15 (2026-07-14T10:00:00Z)"
```

You should see that exact text appear in your Telegram group within seconds.

## Getting your Telegram Chat ID

1. Add your bot to the group.
2. Send any message in the group.
3. Visit: `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
4. Copy the negative `chat.id` value.
