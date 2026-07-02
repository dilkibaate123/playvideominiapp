import { NextResponse } from 'next/server';

function extractFileCode(url) {
  const patterns = [
    /filesadda\.site\/file\/([a-zA-Z0-9]+)/,
    /filesadda\.site\/([a-zA-Z0-9]+)/,
    /file_code=([a-zA-Z0-9]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }
  // If it's just the raw file code
  if (/^[a-zA-Z0-9]+$/.test(url)) return url;
  return null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'Missing url param' }, { status: 400 });
    }

    const fileCode = extractFileCode(url);
    if (!fileCode) {
      return NextResponse.json({ error: 'Could not extract file code from URL' }, { status: 400 });
    }

    const initialUrl = `https://filesadda.site/${fileCode}`;
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    // Step 1: Get first redirect location
    let res = await fetch(initialUrl, {
      method: 'GET',
      headers: { 'User-Agent': userAgent },
      redirect: 'manual',
      signal: AbortSignal.timeout(6000)
    });

    const location1 = res.headers.get('location');
    if (!location1) {
      return NextResponse.json({ error: 'Failed to follow initial filesadda redirect' }, { status: 500 });
    }

    // Step 2: Fetch location1 to get the article page redirect and cookie
    res = await fetch(location1, {
      method: 'GET',
      headers: { 'User-Agent': userAgent },
      redirect: 'manual',
      signal: AbortSignal.timeout(6000)
    });

    const location2 = res.headers.get('location');
    const setCookieHeader = res.headers.get('set-cookie');
    if (!location2) {
      return NextResponse.json({ error: 'Failed to follow second filesadda redirect' }, { status: 500 });
    }

    // Extract cookie
    let cookie = '';
    if (setCookieHeader) {
      cookie = setCookieHeader.split(';')[0];
    }

    // Step 3: POST to the article page (location2) with the cookie to generate download links
    const bodyParams = new URLSearchParams();
    bodyParams.append('op', 'download2');
    bodyParams.append('id', fileCode);
    bodyParams.append('rand', '');
    bodyParams.append('referer', '');
    bodyParams.append('method_free', '');
    bodyParams.append('method_premium', '');

    res = await fetch(location2, {
      method: 'POST',
      headers: {
        'User-Agent': userAgent,
        'Cookie': cookie,
        'Referer': location1,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: bodyParams.toString(),
      signal: AbortSignal.timeout(8000)
    });

    const html = await res.text();
    let videoUrl = null;

    // Search for anchor links containing download
    const anchorRegex = /<a\s+[^>]*href=["'](https?:\/\/[a-zA-Z0-9.-]*?filesadda\.site[^\s"'`<>]*?\/d\/[^\s"'`<>]+?)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = anchorRegex.exec(html)) !== null) {
      const href = match[1];
      const text = match[2].toLowerCase();
      if (text.includes('click here') || text.includes('download')) {
        videoUrl = href;
        break;
      }
    }

    // Fallback if not found in anchors
    if (!videoUrl) {
      const fallbackRegex = /https?:\/\/[a-zA-Z0-9.-]*?filesadda\.site[^\s"'`<>]*?\/d\/[^\s"'`<>]+?\.(mp4|mkv|avi|mov)/i;
      const fallbackMatch = html.match(fallbackRegex);
      if (fallbackMatch) {
        videoUrl = fallbackMatch[0];
      }
    }

    if (videoUrl) {
      return NextResponse.json({ ok: true, videoUrl });
    }

    return NextResponse.json({ error: 'Direct link could not be parsed from FilesAdda' }, { status: 400 });
  } catch (err) {
    console.error('FilesAdda proxy error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
