import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/setup — Automatically registers the Telegram webhook.
 *
 * Visit this URL in your browser after deploying to Vercel:
 *   https://your-app.vercel.app/api/setup
 *
 * It uses the domain you visit from (request host header) to register the webhook.
 */
export async function GET(request) {
     try {
          const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

          if (!BOT_TOKEN) {
               return NextResponse.json(
                    { ok: false, error: 'TELEGRAM_BOT_TOKEN is not set in environment variables.' },
                    { status: 500 }
               );
          }

          // Use the host from the actual request URL (the stable production domain)
          const host = request.headers.get('host');

          if (!host) {
               return NextResponse.json(
                    { ok: false, error: 'Could not determine domain from request.' },
                    { status: 500 }
               );
          }

          const webhookUrl = `https://${host}/api/bot`;

          // Call Telegram setWebhook API
          const res = await fetch(
               `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
               {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                         url: webhookUrl,
                         allowed_updates: ['message', 'callback_query', 'chat_member', 'channel_post', 'edited_channel_post', 'chat_join_request'],
                    }),
               }
          );

          const data = await res.json();

          if (data.ok) {
               return NextResponse.json({
                    ok: true,
                    message: `✅ Webhook successfully set to: ${webhookUrl}`,
                    telegram_response: data,
               });
          } else {
               return NextResponse.json(
                    {
                         ok: false,
                         message: '❌ Failed to set webhook.',
                         telegram_response: data,
                    },
                    { status: 400 }
               );
          }
     } catch (error) {
          console.error('Setup error:', error);
          return NextResponse.json(
               { ok: false, error: error.message },
               { status: 500 }
          );
     }
}
