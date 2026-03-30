import { NextResponse } from 'next/server';

const BUTTON_TEXT = '👉 Play Online Free 👅💦';
const MINI_APP_SHORTNAME = 'play';

// ─── Telegram helper ───
async function tg(botToken, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ─── Get bot username (auto-detected from token) ───
async function getBotUsername(botToken) {
  const data = await tg(botToken, 'getMe', {});
  if (data.ok) return data.result.username;
  return null;
}

function getMiniAppMarkup(botUsername) {
  return {
    inline_keyboard: [
      [{ text: BUTTON_TEXT, url: `https://t.me/${botUsername}/${MINI_APP_SHORTNAME}` }],
    ],
  };
}

export async function GET(request) {
  try {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) {
      return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('chat_id');
    const startId = parseInt(searchParams.get('start'), 10);
    const endId = parseInt(searchParams.get('end'), 10);
    const secret = searchParams.get('secret');

    // Optional auth — only checked if BROADCAST_SECRET is set in env
    const EXPECTED_SECRET = process.env.BROADCAST_SECRET;
    if (EXPECTED_SECRET && secret !== EXPECTED_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!chatId || isNaN(startId) || isNaN(endId)) {
      return NextResponse.json(
        { error: 'Missing chat_id, start, or end query params.' },
        { status: 400 }
      );
    }

    if (endId - startId > 100) {
      return NextResponse.json(
        { error: 'Batch size too large. Max 100 messages per request to avoid Vercel timeouts.' },
        { status: 400 }
      );
    }

    // Auto-detect bot username
    const botUsername = await getBotUsername(BOT_TOKEN);
    if (!botUsername) {
      return NextResponse.json({ error: 'Could not detect bot username. Check your BOT_TOKEN.' }, { status: 500 });
    }

    const markup = getMiniAppMarkup(botUsername);
    const results = { success: 0, failed: 0, errors: [] };

    for (let id = startId; id <= endId; id++) {
      const tgResponse = await tg(BOT_TOKEN, 'editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: id,
        reply_markup: markup,
      });

      if (tgResponse.ok) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push({ id, error: tgResponse.description });
      }

      // Delay to prevent Telegram rate limits
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    return NextResponse.json({
      ok: true,
      message: `Finished batch from ${startId} to ${endId}.`,
      botUsername,
      results,
    });

  } catch (error) {
    console.error('Batch update error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
