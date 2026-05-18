'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Decode base64url startapp param ───
function decodeStartParam(param) {
  if (!param) return null;
  try {
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

export default function Home() {
  const [link, setLink] = useState('');
  const [status, setStatus] = useState('idle');
  // idle | fetching | playing | error
  const [videoUrl, setVideoUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const videoRef = useRef(null);

  // ── AdsGram controllers (pre-initialized once) ──
  const rewardedAdRef = useRef(null);
  const rewardedAd2Ref = useRef(null);

  // Pre-init AdsGram on mount
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.Adsgram) {
        rewardedAdRef.current = window.Adsgram.init({ blockId: '30183' });
        rewardedAd2Ref.current = window.Adsgram.init({ blockId: '30183' });
        console.log('[AdsGram] Both rewarded ad controllers initialized');
      }
    } catch (e) {
      console.log('[AdsGram] Init skipped:', e);
    }
  }, []);

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

  // ── User clicks Play → show rewarded ad → fetch video → 2nd rewarded ad after ──
  const handleDownload = useCallback(async () => {
    if (!link.trim()) return;
    setStatus('fetching');

    // Step 1: Show rewarded ad (30183)
    try {
      if (rewardedAdRef.current) await rewardedAdRef.current.show();
    } catch (e) {
      console.log('[AdsGram] Rewarded ad skipped:', e);
    }

    // Step 2: Fetch the video URL
    try {
      const res = await fetch(`/api/filesadda?url=${encodeURIComponent(link)}`);
      const data = await res.json();
      if (data.ok && data.videoUrl) {
        setVideoUrl(data.videoUrl);
        setStatus('playing');

        // Step 3: Show 2nd rewarded ad randomly after 5-15 seconds
        const delay = 5000 + Math.random() * 10000;
        setTimeout(async () => {
          try {
            if (rewardedAd2Ref.current) await rewardedAd2Ref.current.show();
          } catch (e) {
            console.log('[AdsGram] 2nd rewarded ad skipped:', e);
          }
        }, delay);

        // Auto-play video
        setTimeout(() => {
          videoRef.current?.play();
        }, 300);
      } else {
        setErrorMsg(data.error || 'Could not get video link. Try again.');
        setStatus('error');
      }
    } catch (err) {
      setErrorMsg('Network error. Please try again.');
      setStatus('error');
    }
  }, [link]);

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
            ▶ Play
          </button>
        </div>
      </section>

      {/* ── Fetching ── */}
      {status === 'fetching' && (
        <div className="status-card loading-card">
          <div className="spinner" />
          <p className="status-text">Fetching video...</p>
          <p className="status-sub">Getting your direct download link</p>
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

      {/* ── Footer ── */}
      <footer className="footer">
        <p>Powered by FilesAdda · Fast &amp; Free</p>
      </footer>
    </main>
  );
}
