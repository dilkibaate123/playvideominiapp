import { NextResponse } from 'next/server';

const PROXY_URL = 'https://raagmasti.in/filesaddadirectlink/api_proxy.php';

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

    const res = await fetch(`${PROXY_URL}?file_code=${fileCode}`);
    const data = await res.json();

    if (data.status === 200 && data.result?.url) {
      return NextResponse.json({ ok: true, videoUrl: data.result.url, size: data.result.size });
    }

    return NextResponse.json(
      { error: data.msg || 'Failed to get direct link from FilesAdda' },
      { status: 400 }
    );
  } catch (err) {
    console.error('FilesAdda proxy error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
