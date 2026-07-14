// api/webhook.js
// TradingView -> Telegram relay, deployed as a Vercel Serverless Function
//
// ENV VARS (set in Vercel dashboard -> Settings -> Environment Variables):
//   TELEGRAM_BOT_TOKEN   - from @BotFather
//   TELEGRAM_CHAT_ID     - your group chat id (negative number, e.g. -1001234567890)
//   WEBHOOK_SECRET       - a random string you choose, used to validate incoming requests

export default async function handler(req, res) {
  try {
    // Only accept POST (TradingView always sends POST)
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    // --- 1. Validate secret (optional but recommended) ---
    // TradingView doesn't support custom headers on free/essential plans, so we
    // pass the secret as a query param instead: ?secret=YOUR_SECRET
    const { secret } = req.query;
    if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Invalid or missing secret' });
    }

    // --- 2. Check env vars exist BEFORE doing any work ---
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return res.status(500).json({
        error: 'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID env vars',
        hint: 'Set them in Vercel dashboard -> Settings -> Environment Variables, then redeploy.',
      });
    }

    // --- 3. Parse the incoming alert ---
    // TradingView sends whatever you typed in the alert's "Message" box.
    // It can be plain text or JSON, depending on how you configured the alert.
    let payload = req.body;

    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = { text: payload };
      }
    }

    // Guard against null/undefined body entirely
    if (!payload || typeof payload !== 'object') {
      payload = { text: String(payload || 'Empty alert body') };
    }

    // --- 4. Build the Telegram message ---
    const ticker = payload.ticker || payload.symbol || 'N/A';
    const action = (payload.action || payload.side || '').toUpperCase();
    const price = payload.price || payload.close || 'N/A';
    const time = payload.time || new Date().toISOString();
    const rawText = payload.text;

    const emoji = action === 'BUY' ? '🟢' : action === 'SELL' ? '🔴' : '⚪';

    const message = rawText
      ? rawText
      : `${emoji} *${ticker}* Alert\n` +
        `Action: *${action || 'N/A'}*\n` +
        `Price: \`${price}\`\n` +
        `Time: ${time}`;

    // --- 5. Check fetch is available (diagnostic for old Node runtimes) ---
    if (typeof fetch !== 'function') {
      return res.status(500).json({
        error: 'Global fetch is not available in this runtime.',
        hint: 'Set "engines": {"node": "20.x"} in package.json and redeploy.',
      });
    }

    // --- 6. Send to Telegram ---
    const tgResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    const tgData = await tgResponse.json();

    if (!tgData.ok) {
      console.error('Telegram API error:', tgData);
      return res.status(502).json({ error: 'Telegram API rejected the message', details: tgData });
    }

    return res.status(200).json({ success: true, telegram_message_id: tgData.result.message_id });
  } catch (err) {
    // Catch-all so the function NEVER crashes with FUNCTION_INVOCATION_FAILED —
    // it always returns a readable JSON error instead.
    console.error('Unhandled error in webhook handler:', err);
    return res.status(500).json({ error: 'Unhandled server error', details: err.message, stack: err.stack });
  }
}
