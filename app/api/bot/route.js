import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const BUTTON_TEXT = '👉 Play Online Free 👅💦';
const MINI_APP_SHORTNAME = 'play';
const CLEAN_MESSAGE = '🎬 Watch this video for FREE!\n\n▶️ Tap the button below to play instantly';

// Partner channels check removed.

// Cache the bot username so we don't call getMe on every request
let cachedBotUsername = null;

// Initialize Supabase Client lazily to prevent Next.js build-time crashes
let supabaseClient = null;
function getSupabaseClient() {
     if (supabaseClient) return supabaseClient;
     const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
     const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
     if (!supabaseUrl || !supabaseServiceKey) return null;
     supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
     return supabaseClient;
}

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

    // Log incoming request for easier debugging
    console.log('Incoming Telegram Webhook:', JSON.stringify(body));

    // ══════════════════════════════════════════════════
    // 1. Handle Join Request Event: chat_join_request
    // ══════════════════════════════════════════════════
    if (body.chat_join_request) {
      const joinRequest = body.chat_join_request;
      const userId = joinRequest.from.id;
      const firstName = joinRequest.from.first_name || '';
      const username = joinRequest.from.username || '';
      const channelId = joinRequest.chat.id;
      const channelName = joinRequest.chat.title || '';

      console.log(`Received join request from User ID: ${userId} (${firstName}) for Channel ID: ${channelId}`);

      // Save the user and approval log in Supabase
      const supabase = getSupabaseClient();
      if (supabase) {
        const { error } = await supabase
          .from('approved_users')
          .upsert(
            {
              chat_id: userId,
              first_name: firstName,
              username: username || null,
              channel_id: channelId,
              channel_name: channelName,
              approved_at: new Date().toISOString()
            },
            { onConflict: 'chat_id' }
          );

        if (error) {
          console.error('Failed to save approved user to Supabase:', error.message);
        } else {
          console.log(`Saved approved user ${userId} to database.`);
        }
      } else {
        console.warn('Supabase is not configured or failed to initialize. Skipped saving user to database.');
      }

      // Approve the join request automatically
      const approveResult = await tg(BOT_TOKEN, 'approveChatJoinRequest', {
        chat_id: channelId,
        user_id: userId
      });

      if (!approveResult.ok) {
        console.error('Failed to approve join request on Telegram:', approveResult);
        return NextResponse.json({ ok: false, error: approveResult.description }, { status: 400 });
      }

      console.log(`Successfully approved join request for User ID: ${userId}`);
      return NextResponse.json({ ok: true });
    }

    // ══════════════════════════════════════════════════
    // 2. New Channel Post — auto-detect FilesAdda link
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
    // 3. Edited Channel Post — keep button in sync
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
    // 4. Handle direct Messages (e.g. /start)
    // ══════════════════════════════════════════════════
    const message = body?.message;
    if (message) {
      const chatId = message.chat.id;
      const text = message.text || '';
      const firstName = message.from?.first_name || '';
      const username = message.from?.username || '';

      if (text.startsWith('/start')) {
        // Save/Upsert the user in Supabase to track that they started the bot privately
        // Marking them as active = true ensures they will receive broadcast messages!
        const supabase = getSupabaseClient();
        if (supabase) {
          const { error } = await supabase
            .from('approved_users')
            .upsert(
              {
                chat_id: chatId,
                first_name: firstName,
                username: username || null,
                channel_id: 0, // 0 indicates registered via direct DM /start
                channel_name: 'Direct Message',
                is_active: true, // Marked as active since they just started/reactivated the bot
                approved_at: new Date().toISOString()
              },
              { onConflict: 'chat_id' }
            );

          if (error) {
            console.error('Failed to save /start user to Supabase:', error.message);
          } else {
            console.log(`Saved/reactivated /start user ${chatId} in Supabase.`);
          }
        }

        const startReply = `🎉 <b>Welcome ${firstName}!</b>\n\n` +
          `Your account has been successfully verified in our system. You will receive direct notifications, files, and update alerts here. 🚀`;

        const parts = text.split(' ');
        const startParam = parts.length > 1 ? parts[1] : null;
        let webAppUrl = 'https://playvideominiapp.vercel.app/?hd-content';
        if (startParam) {
          webAppUrl = `https://playvideominiapp.vercel.app/?tgWebAppStartParam=${startParam}`;
        }

        await tg(BOT_TOKEN, 'sendMessage', {
          chat_id: chatId,
          text: startReply,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Open Mini App', web_app: { url: webAppUrl } }]
            ]
          }
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Bot webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
