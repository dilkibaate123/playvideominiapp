import { NextResponse } from 'next/server';

const BUTTON_TEXT = '👉 Play Online Free 👅💦';
const MINI_APP_SHORTNAME = 'play';
const CLEAN_MESSAGE = '🎬 Watch this video for FREE!\n\n▶️ Tap the button below to play instantly';

// Cache the bot username so we don't call getMe on every request
let cachedBotUsername = null;

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
  if (cachedBotUsername) return cachedBotUsername;
  const data = await tg(botToken, 'getMe', {});
  if (data.ok) {
    cachedBotUsername = data.result.username;
  }
  return cachedBotUsername;
}

// ─── Extract FilesAdda file code from text ───
function extractFilesAddaCode(text) {
  if (!text || !text.includes('filesadda')) return null;
  const patterns = [
    /filesadda\.site\/file\/([a-zA-Z0-9]+)/,
    /filesadda\.site\/([a-zA-Z0-9]+)/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

// ─── Remove FilesAdda URL from text ───
function stripFilesAddaUrl(text) {
  if (!text) return '';
  // Remove the full URL (with optional https://, www., trailing slashes/whitespace)
  let cleaned = text.replace(/https?:\/\/(www\.)?filesadda\.site\/[^\s]*/gi, '');
  // Clean up leftover blank lines and extra whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}

// ─── Base64url encode (safe for startapp param) ───
function toBase64Url(str) {
  const b64 = Buffer.from(str).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ─── Build the button markup ───
function getMiniAppMarkup(botUsername, fileCode) {
  let url = `https://t.me/${botUsername}/${MINI_APP_SHORTNAME}`;
  if (fileCode) {
    const encoded = toBase64Url(fileCode);
    url += `?startapp=${encoded}`;
  }
  return {
    inline_keyboard: [
      [{ text: BUTTON_TEXT, url }],
    ],
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

    if (!BOT_TOKEN) {
      return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 });
    }

    // Auto-detect the bot username from the token
    const botUsername = await getBotUsername(BOT_TOKEN);

    // ══════════════════════════════════════════════════
    // 1. New Channel Post — auto-detect FilesAdda link
    // ══════════════════════════════════════════════════
    if (body.channel_post) {
      const post = body.channel_post;
      const chatId = post.chat.id;
      const messageId = post.message_id;
      const isMediaPost = !!(post.photo || post.video || post.document || post.animation);
      const text = isMediaPost ? (post.caption || '') : (post.text || '');

      const fileCode = extractFilesAddaCode(text);
      const markup = getMiniAppMarkup(botUsername, fileCode);

      let result;
      if (fileCode) {
        if (isMediaPost) {
          // Media post → replace caption with clean message
          result = await tg(BOT_TOKEN, 'editMessageCaption', {
            chat_id: chatId,
            message_id: messageId,
            caption: CLEAN_MESSAGE,
            reply_markup: markup,
          });
        } else {
          // Text-only post → replace text with clean message
          result = await tg(BOT_TOKEN, 'editMessageText', {
            chat_id: chatId,
            message_id: messageId,
            text: CLEAN_MESSAGE,
            reply_markup: markup,
          });
        }
      } else {
        // No FilesAdda link found, just add the button
        result = await tg(BOT_TOKEN, 'editMessageReplyMarkup', {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: markup,
        });
      }
      console.log('New post result:', JSON.stringify(result));

      return NextResponse.json({ ok: true });
    }

    // ══════════════════════════════════════════════════
    // 2. Edited Channel Post — keep button in sync
    // ══════════════════════════════════════════════════
    if (body.edited_channel_post) {
      const post = body.edited_channel_post;
      const chatId = post.chat.id;
      const messageId = post.message_id;
      const isMediaPost = !!(post.photo || post.video || post.document || post.animation);
      const text = isMediaPost ? (post.caption || '') : (post.text || '');

      const fileCode = extractFilesAddaCode(text);
      const markup = getMiniAppMarkup(botUsername, fileCode);

      let result;
      if (fileCode) {
        if (isMediaPost) {
          result = await tg(BOT_TOKEN, 'editMessageCaption', {
            chat_id: chatId,
            message_id: messageId,
            caption: CLEAN_MESSAGE,
            reply_markup: markup,
          });
        } else {
          result = await tg(BOT_TOKEN, 'editMessageText', {
            chat_id: chatId,
            message_id: messageId,
            text: CLEAN_MESSAGE,
            reply_markup: markup,
          });
        }
      } else {
        result = await tg(BOT_TOKEN, 'editMessageReplyMarkup', {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: markup,
        });
      }
      console.log('Edited post result:', JSON.stringify(result));

      return NextResponse.json({ ok: true });
    }

    // ══════════════════════════════════════════════════
    // 3. /start message — show the bot button as demo
    // ══════════════════════════════════════════════════
    const message = body?.message;
    if (message) {
      const chatId = message.chat.id;
      await tg(BOT_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: 'Hello! I automatically add Mini App buttons to channel posts.\n\nHere is what the button looks like:',
        reply_markup: getMiniAppMarkup(botUsername, null),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Bot webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
