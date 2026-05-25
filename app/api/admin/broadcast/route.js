import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Max allowed for Vercel Hobby tier

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

const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN;
const SECRET = () => process.env.BROADCAST_SECRET || 'diskwala2026';

// ─── Send one Telegram message (with retry) ───
async function sendTelegramMessage(chatId, text, parseMode, replyMarkup) {
     const payload = { chat_id: chatId, text, parse_mode: parseMode || 'HTML' };
     if (replyMarkup) payload.reply_markup = replyMarkup;

     for (let attempt = 0; attempt < 3; attempt++) {
          try {
               const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN()}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(15000), // Prevent timeouts on slow networks (increased to 15s)
               });
               return await res.json();
          } catch (err) {
               // Network error (ECONNRESET, etc.) — retry after 1s
               if (attempt < 2) {
                    await new Promise((r) => setTimeout(r, 1000));
               } else {
                    // All retries failed — return a fake error object
                    return { ok: false, error_code: 0, description: `Network error: ${err.message}` };
               }
          }
     }
}

// ─── POST handler ───
export async function POST(request) {
     try {
          const body = await request.json();
          const { action, secret } = body;

          // Auth check
          if (secret !== SECRET()) {
               return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
          }

          if (!BOT_TOKEN()) {
               return NextResponse.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' }, { status: 500 });
          }

          // ══════════════════════════════════════
          // ACTION: stats — get total active users
          // ══════════════════════════════════════
          if (action === 'stats') {
               const supabase = getSupabaseClient();
               if (!supabase) {
                    return NextResponse.json({ ok: false, error: 'Supabase credentials not configured' }, { status: 500 });
               }
               // Try querying active users with a safe fallback in case 'is_active' column doesn't exist yet
               const { count, error } = await supabase
                    .from('approved_users')
                    .select('*', { count: 'exact', head: true })
                    .eq('is_active', true);

               if (error) {
                    if (error.message.includes('column "is_active" does not exist')) {
                         // Fallback query: count all approved users
                         const { count: fallbackCount, error: fallbackError } = await supabase
                              .from('approved_users')
                              .select('*', { count: 'exact', head: true });
                         
                         if (fallbackError) {
                              return NextResponse.json({ ok: false, error: fallbackError.message }, { status: 500 });
                         }
                         return NextResponse.json({ ok: true, total: fallbackCount });
                    }
                    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
               }

               return NextResponse.json({ ok: true, total: count });
          }

          // ══════════════════════════════════════
          // ACTION: send_test — send to specific IDs
          // ══════════════════════════════════════
          if (action === 'send_test') {
               const { chatIds, messageText, parseMode, replyMarkup } = body;

               if (!chatIds || !chatIds.length || !messageText) {
                    return NextResponse.json(
                         { ok: false, error: 'chatIds[] and messageText required' },
                         { status: 400 }
                    );
               }

               let sent = 0;
               let failed = 0;
               const errors = [];

               for (const cid of chatIds) {
                    const result = await sendTelegramMessage(cid, messageText, parseMode, replyMarkup);
                    if (result.ok) {
                         sent++;
                    } else {
                         failed++;
                         errors.push({ chat_id: cid, error: result.description });
                    }
                    await new Promise((r) => setTimeout(r, 35));
               }

               return NextResponse.json({ ok: true, sent, failed, errors });
          }

          // ══════════════════════════════════════
          // ACTION: send_batch — send to a chunk
          // ══════════════════════════════════════
          if (action === 'send_batch') {
               const supabase = getSupabaseClient();
               if (!supabase) {
                    return NextResponse.json({ ok: false, error: 'Supabase credentials not configured' }, { status: 500 });
               }

               const { cursor = 0, limit = 20, messageText, parseMode, replyMarkup } = body;

               if (!messageText) {
                    return NextResponse.json(
                         { ok: false, error: 'messageText required' },
                         { status: 400 }
                    );
               }

               // Cursor-based pagination: fetch users with id > cursor
               let users = [];
               let dbError = null;
               let hasIsActiveColumn = true;

               const { data, error } = await supabase
                    .from('approved_users')
                    .select('id, chat_id')
                    .eq('is_active', true)
                    .gt('id', cursor)
                    .order('id', { ascending: true })
                    .limit(limit);

               users = data;
               dbError = error;

               if (dbError && dbError.message.includes('column "is_active" does not exist')) {
                    hasIsActiveColumn = false;
                    const fallbackRes = await supabase
                         .from('approved_users')
                         .select('id, chat_id')
                         .gt('id', cursor)
                         .order('id', { ascending: true })
                         .limit(limit);

                    users = fallbackRes.data;
                    dbError = fallbackRes.error;
               }

               if (dbError) {
                    return NextResponse.json({ ok: false, error: dbError.message }, { status: 500 });
               }

               if (!users || users.length === 0) {
                    return NextResponse.json({ ok: true, sent: 0, failed: 0, done: true, processed: 0, nextCursor: cursor });
               }

               let sent = 0;
               let failed = 0;
               const errors = [];
               const blockedIds = [];

               for (const user of users) {
                    const result = await sendTelegramMessage(
                         user.chat_id,
                         messageText,
                         parseMode,
                         replyMarkup
                    );

                    if (result.ok) {
                         sent++;
                    } else {
                         failed++;
                         if (result.error_code === 403) {
                              blockedIds.push(user.chat_id);
                         }
                         errors.push({ chat_id: user.chat_id, error: result.description });
                    }

                    // Telegram rate limit: ~30 msgs/sec
                    await new Promise((r) => setTimeout(r, 35));
               }

               // Batch-deactivate all blocked users in ONE query (only if the column is present)
               if (blockedIds.length > 0 && hasIsActiveColumn) {
                    await supabase
                         .from('approved_users')
                         .update({ is_active: false })
                         .in('chat_id', blockedIds);
               }

               // Return the last user's id as nextCursor
               const nextCursor = users[users.length - 1].id;

               return NextResponse.json({
                    ok: true,
                    sent,
                    failed,
                    processed: users.length,
                    done: users.length < limit,
                    nextCursor,
                    errors: errors.slice(0, 5),
               });
          }

          return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
     } catch (err) {
          console.error('Broadcast API error:', err);
          return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
     }
}
