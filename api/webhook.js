// api/webhook.js
// TradingView -> Telegram relay, deployed as a Vercel Serverless Function
//
// This version forwards your TradingView alert message AS PLAIN TEXT —
// whatever you type in the alert's "Message" box is sent to Telegram as-is,
// with TradingView's {{placeholders}} already substituted by TradingView itself.
//
// ENV VARS (set in Vercel dashboard -> Settings -> Environment Variables):
//   TELEGRAM_BOT_TOKEN   - from @BotFather
//   TELEGRAM_CHAT_ID     - your group chat id (negative number, e.g. -1001234567890)
//   WEBHOOK_SECRET       - a random string you choose, used to validate incoming requests

export const config = {
  api: {
    bodyParser: false, // read the raw body ourselves so we don't care about Content-Type
  },
};

// Reads the raw request body as a plain string, regardless of Content-Type.
async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

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

    // --- 3. Read the alert as raw text ---
    let message = (await readRawBody(req)).trim();

    if (!message) {
      message = '⚠️ Empty alert received (no message body)';
    }

    // Optional: prefix with an emoji if the text obviously says BUY or SELL.
    // This is just cosmetic — remove this block if you don't want it.
    const upper = message.toUpperCase();
    if (upper.includes('BUY') && !upper.includes('SELL')) {
      message = `🟢 ${message}`;
    } else if (upper.includes('SELL') && !upper.includes('BUY')) {
      message = `🔴 ${message}`;
    }

    // --- 4. Check fetch is available (diagnostic for old Node runtimes) ---
    if (typeof fetch !== 'function') {
      return res.status(500).json({
        error: 'Global fetch is not available in this runtime.',
        hint: 'Set "engines": {"node": "24.x"} in package.json and redeploy.',
      });
    }

    // --- 5. Send to Telegram (plain text, no Markdown parsing so any
    //         TradingView special characters like * or _ don't break formatting) ---
    const tgResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
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
