'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Decode base64url startapp param ───
function decodeStartParam(param) {
  if (!param) return null;
  try {
    // Re-add removed padding, convert back from base64url
    let b64 = param.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    return atob(b64);
  } catch {
    return null;
  }
}

function buildFilesAddaUrl(fileCode) {
  return `https://filesadda.site/${fileCode}`;
}

// States: idle → need-ad-1 → watching-ad-1 → fetching → ready-to-watch → need-ad-2 → watching-ad-2 → playing | error
export default function Home() {
  const [link, setLink] = useState('');
  const [status, setStatus] = useState('idle');
  const [videoUrl, setVideoUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const videoRef = useRef(null);

  // ── On mount: read startapp param from Telegram ──
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const tg = window.Telegram?.WebApp;
      if (tg) tg.expand();
      const startParam = tg?.initDataUnsafe?.start_param;
      if (startParam) {
        const fileCode = decodeStartParam(startParam);
        if (fileCode) {
          setLink(buildFilesAddaUrl(fileCode));
        }
      }
    } catch (e) {
      // not in Telegram, ignore
    }
  }, []);

  // ── Step 1: User clicks Download → show first ad ──
  const handleDownload = useCallback(() => {
    if (!link.trim()) return;
    setStatus('need-ad-1');
  }, [link]);

  // ── Watch Ad helper ──
  const showAd = useCallback(() => {
    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && typeof window.show_10765305 === 'function') {
        window.show_10765305().then(resolve).catch(resolve);
      } else {
        setTimeout(resolve, 2000);
      }
    });
  }, []);

  // ── Ad 1: watch, then fetch FilesAdda API ──
  const handleWatchAd1 = useCallback(async () => {
    setStatus('watching-ad-1');
    await showAd();

    // Now fetch the direct video URL
    setStatus('fetching');
    try {
      const res = await fetch(`/api/filesadda?url=${encodeURIComponent(link)}`);
      const data = await res.json();
      if (data.ok && data.videoUrl) {
        setVideoUrl(data.videoUrl);
        setStatus('ready-to-watch');
      } else {
        setErrorMsg(data.error || 'Could not get video link. Try again.');
        setStatus('error');
      }
    } catch (err) {
      setErrorMsg('Network error. Please try again.');
      setStatus('error');
    }
  }, [link, showAd]);

  // ── Ad 2: watch, then play video ──
  const handleWatchAd2 = useCallback(async () => {
    setStatus('watching-ad-2');
    await showAd();
    setStatus('playing');
    setTimeout(() => {
      videoRef.current?.play();
    }, 300);
  }, [showAd]);

  // ── Reset everything ──
  const handleRetry = useCallback(() => {
    setStatus('idle');
    setVideoUrl(null);
    setErrorMsg('');
  }, []);

  return (
    <main className="container">
      {/* ── Header ── */}
      <header className="header">
        <div className="logo-icon">▶</div>
        <h1 className="title">FilesAdda Player</h1>
        <p className="subtitle">Paste a FilesAdda link to watch or download</p>
      </header>

      {/* ── Input Section ── */}
      <section className="input-section">
        <div className="input-wrapper">
          <input
            type="text"
            className="link-input"
            placeholder="https://filesadda.site/..."
            value={link}
            onChange={(e) => setLink(e.target.value)}
            disabled={status !== 'idle'}
          />
          <button
            className="btn btn-download"
            onClick={handleDownload}
            disabled={status !== 'idle' || !link.trim()}
          >
            ⬇ Fetch
          </button>
        </div>
      </section>

      {/* ── Step 1: First Ad prompt ── */}
      {status === 'need-ad-1' && (
        <div className="status-card credits-card">
          <div className="credits-header">
            <div className="credits-icon">🎟</div>
            <h3 className="credits-title">Step 1 of 2</h3>
          </div>
          <p className="credits-desc">
            Watch a short ad to fetch the video link.
          </p>
          <div className="progress-row">
            <span className="progress-dot active" />
            <span className="progress-dot" />
          </div>
          <button className="btn btn-watch-ad" onClick={handleWatchAd1}>
            🎬 Watch Ad & Fetch Link
          </button>
        </div>
      )}

      {/* ── Watching Ad 1 ── */}
      {status === 'watching-ad-1' && (
        <div className="status-card loading-card">
          <div className="spinner" />
          <p className="status-text">Loading ad...</p>
          <p className="status-sub">Please wait, fetching your link after this</p>
        </div>
      )}

      {/* ── Fetching video URL ── */}
      {status === 'fetching' && (
        <div className="status-card loading-card">
          <div className="spinner" />
          <p className="status-text">Fetching video...</p>
          <p className="status-sub">Getting your direct download link</p>
        </div>
      )}

      {/* ── Step 2: Ready to watch, second ad prompt ── */}
      {status === 'ready-to-watch' && (
        <div className="status-card credits-card">
          <div className="credits-header">
            <div className="credits-icon">✅</div>
            <h3 className="credits-title">Step 2 of 2</h3>
          </div>
          <p className="credits-desc">
            Link found! Watch one more short ad to play the video.
          </p>
          <div className="progress-row">
            <span className="progress-dot done" />
            <span className="progress-dot active" />
          </div>
          <button className="btn btn-watch-ad" onClick={handleWatchAd2}>
            🎬 Watch Ad & Play Video
          </button>
          <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="btn btn-download" style={{ marginTop: '10px', textAlign: 'center', display: 'block' }}>
            📥 Download Instead
          </a>
        </div>
      )}

      {/* ── Watching Ad 2 ── */}
      {status === 'watching-ad-2' && (
        <div className="status-card loading-card">
          <div className="spinner" />
          <p className="status-text">Loading ad...</p>
          <p className="status-sub">Video will play right after</p>
        </div>
      )}

      {/* ── Video Player ── */}
      {status === 'playing' && videoUrl && (
        <div className="status-card" style={{ padding: '0', overflow: 'hidden', borderRadius: '16px' }}>
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            autoPlay
            playsInline
            style={{ width: '100%', display: 'block', borderRadius: '16px' }}
          />
          <div style={{ padding: '12px', display: 'flex', gap: '8px' }}>
            <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="btn btn-download" style={{ flex: 1, textAlign: 'center' }}>
              📥 Download
            </a>
            <button className="btn btn-retry" onClick={handleRetry} style={{ flex: 1 }}>
              🔄 New Link
            </button>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {status === 'error' && (
        <div className="status-card error-card">
          <div className="error-icon">⚠</div>
          <p className="status-text error-text">Error</p>
          <p className="status-sub">{errorMsg}</p>
          <button className="btn btn-retry" onClick={handleRetry}>
            🔄 Try Again
          </button>
        </div>
      )}

      {/* ── Ad Container ── */}
      <div id="ad-container" className="ad-container" />

      {/* ── Footer ── */}
      <footer className="footer">
        <p>Powered by FilesAdda · Fast &amp; Free</p>
      </footer>
    </main>
  );
}
