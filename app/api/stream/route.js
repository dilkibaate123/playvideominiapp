import { NextResponse } from 'next/server';

export async function GET(request) {
     try {
          const { searchParams } = new URL(request.url);
          const targetUrl = searchParams.get('url');

          if (!targetUrl) {
               return NextResponse.json({ error: 'Missing url parameter.' }, { status: 400 });
          }

          console.log(`[Stream Scraper] Live scraping mp4 source for: ${targetUrl}`);

          const res = await fetch(targetUrl, {
               headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
               }
          });

          if (!res.ok) {
               throw new Error(`Failed to load target page. HTTP Status ${res.status}`);
          }

          const html = await res.text();

          // ─── Extract Video URL using multiple regex strategies ───
          let mp4Url = '';

          // Strategy 1: Look for <source src="URL" type="video/mp4"> or similar
          const sourceMatch = html.match(/<source\s+[^>]*?src="([^"]+)"/i);
          if (sourceMatch && sourceMatch[1]) {
               mp4Url = sourceMatch[1];
          }

          // Strategy 2: Look for <video src="URL">
          if (!mp4Url) {
               const videoMatch = html.match(/<video\s+[^>]*?src="([^"]+)"/i);
               if (videoMatch && videoMatch[1]) {
                    mp4Url = videoMatch[1];
               }
          }

          // Strategy 3: Look for any direct links matching S3 presigned structures or maalcdn
          if (!mp4Url) {
               const rawUrlMatch = html.match(/(https:\/\/[^\s"'`<>]+?\.mp4\?[^\s"'`<>]+)/i) || 
                                   html.match(/(https:\/\/[^\s"'`<>]+?maalcdn[^\s"'`<>]+)/i);
               if (rawUrlMatch && rawUrlMatch[1]) {
                    mp4Url = rawUrlMatch[1];
               }
          }

          // HTML Entity Decode (e.g. &amp; -> &)
          if (mp4Url) {
               mp4Url = mp4Url.replace(/&amp;/g, '&');
          }

          console.log(`[Stream Scraper] Extracted MP4 Url:`, mp4Url || 'NONE');

          if (!mp4Url) {
               return NextResponse.json({
                    ok: false,
                    error: 'Could not find video stream URL in page HTML. Structure might have changed.'
               }, { status: 404 });
          }

          return NextResponse.json({
               ok: true,
               streamUrl: mp4Url
          });

     } catch (error) {
          console.error('Stream extraction crash:', error);
          return NextResponse.json({ error: error.message }, { status: 500 });
     }
}
