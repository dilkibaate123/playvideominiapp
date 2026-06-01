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
  const [activeTab, setActiveTab] = useState('filesadda'); // filesadda | hd_content

  // ─── FilesAdda States ───
  const [link, setLink] = useState('');
  const [status, setStatus] = useState('idle'); // idle | fetching | playing | error
  const [videoUrl, setVideoUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const filesAddaVideoRef = useRef(null);

  // ─── WebSeries (HD Content) States ───
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Latest');
  
  const [activeVideo, setActiveVideo] = useState(null);
  const [streamUrl, setStreamUrl] = useState('');
  const [fetchingStream, setFetchingStream] = useState(false);
  const [streamError, setStreamError] = useState('');
  const webseriesVideoRef = useRef(null);

  const [midRollAdShown, setMidRollAdShown] = useState(false);

  // ─── AdsGram Ad Refs ───
  const rewardedAdRef = useRef(null);

  // ─── 1. Expand WebApp and Pre-init AdsGram on Mount ───
  useEffect(() => {
    // Expand Telegram WebApp if running inside Telegram
    if (typeof window !== 'undefined') {
      try {
        const tg = window.Telegram?.WebApp;
        if (tg) {
          tg.expand();
          tg.ready();
        }
      } catch (e) {
        console.log('[Telegram WebApp] Init skipped:', e);
      }
    }

    // Initialize AdsGram controllers
    try {
      if (typeof window !== 'undefined' && window.Adsgram) {
        rewardedAdRef.current = window.Adsgram.init({ blockId: '30183' });
        console.log('[AdsGram] Controller initialized with blockId 30183');

        // ── 1st Ad (Mandatory on opening) ──
        setTimeout(async () => {
          try {
            if (rewardedAdRef.current) {
              await rewardedAdRef.current.show();
              console.log('[AdsGram] Opening ad completed.');
            }
          } catch (err) {
            console.log('[AdsGram] Opening ad skipped/failed:', err);
          }
        }, 1000);

        // ── 2nd Ad (Randomly after 30 to 60 seconds) ──
        const randomDelay = 30000 + Math.random() * 30000;
        console.log(`[AdsGram] Scheduled periodic ad in ${Math.round(randomDelay / 1000)}s`);
        setTimeout(async () => {
          try {
            if (rewardedAdRef.current) {
              await rewardedAdRef.current.show();
              console.log('[AdsGram] Periodic ad completed.');
            }
          } catch (err) {
            console.log('[AdsGram] Periodic ad skipped/failed:', err);
          }
        }, randomDelay);
      }
    } catch (e) {
      console.log('[AdsGram] Init skipped:', e);
    }
  }, []);

  // ─── 2. Fetch WebSeries Videos ───
  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/videos?category=${selectedCategory}&q=${searchQuery}`);
      const data = await res.json();
      if (data.ok) {
        setVideos(data.videos || []);
      }
    } catch (err) {
      console.error('Failed to load videos:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchQuery]);

  useEffect(() => {
    if (activeTab === 'hd_content') {
      fetchVideos();
    }
  }, [fetchVideos, activeTab]);

  // ─── 3. Play WebSeries (HD Content) Trigger ───
  const handlePlayWebseries = useCallback(async (video) => {
    setActiveVideo(video);
    setFetchingStream(true);
    setStreamUrl('');
    setStreamError('');
    setMidRollAdShown(false);

    // Pre-roll ad using rewarded ad controller (30183)
    try {
      if (rewardedAdRef.current) {
        await rewardedAdRef.current.show();
        console.log('[AdsGram] WebSeries pre-roll ad completed.');
      }
    } catch (adErr) {
      console.log('[AdsGram] WebSeries pre-roll ad skipped/failed:', adErr);
    }

    // Fetch the live stream link
    try {
      const res = await fetch(`/api/stream?url=${encodeURIComponent(video.url)}`);
      const data = await res.json();
      if (data.ok && data.streamUrl) {
        setStreamUrl(data.streamUrl);

        setTimeout(() => {
          if (webseriesVideoRef.current) {
            webseriesVideoRef.current.play().catch(e => console.log('Autoplay blocked:', e));
          }
        }, 500);
      } else {
        setStreamError(data.error || 'Failed to fetch playable stream URL.');
      }
    } catch (err) {
      setStreamError('Network error. Could not retrieve stream source.');
    } finally {
      setFetchingStream(false);
    }
  }, []);

  // ─── 4. Play FilesAdda Trigger ───
  const handleDownload = useCallback(async () => {
    if (!link.trim()) return;
    setStatus('fetching');

    // Pre-roll ad using rewarded ad controller (30183)
    try {
      if (rewardedAdRef.current) await rewardedAdRef.current.show();
    } catch (e) {
      console.log('[AdsGram] FilesAdda pre-roll ad skipped:', e);
    }

    // Fetch FilesAdda video source
    try {
      const res = await fetch(`/api/filesadda?url=${encodeURIComponent(link)}`);
      const data = await res.json();
      if (data.ok && data.videoUrl) {
        setVideoUrl(data.videoUrl);
        setStatus('playing');

        // Show FilesAdda post-roll ad randomly after 5-15 seconds
        const delay = 5000 + Math.random() * 10000;
        setTimeout(async () => {
          try {
            if (rewardedAdRef.current) await rewardedAdRef.current.show();
          } catch (e) {
            console.log('[AdsGram] FilesAdda post-roll ad skipped:', e);
          }
        }, delay);

        // Auto-play
        setTimeout(() => {
          filesAddaVideoRef.current?.play();
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

  // ─── 5. WebSeries Mid-roll Ad Handler ───
  const handleWebseriesTimeUpdate = useCallback((e) => {
    const video = e.target;
    if (!video) return;

    // Trigger after 150 seconds (2.5 minutes) of playback
    if (video.currentTime >= 150 && !midRollAdShown) {
      setMidRollAdShown(true);
      video.pause();
      console.log('[AdsGram] Webseries mid-roll ad triggered...');

      if (rewardedAdRef.current) {
        rewardedAdRef.current.show()
          .then((result) => {
            console.log('[AdsGram] Webseries mid-roll ad completed:', result);
            video.play().catch(err => console.log('Resume failed:', err));
          })
          .catch((err) => {
            console.log('[AdsGram] Webseries mid-roll ad skipped/failed:', err);
            video.play().catch(err2 => console.log('Resume failed:', err2));
          });
      } else {
        video.play().catch(err => console.log('Resume failed:', err));
      }
    }
  }, [midRollAdShown]);

  // ─── 6. Handle Telegram Start Param (Deep Linking) ───
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const tg = window.Telegram?.WebApp;
      const startParam = tg?.initDataUnsafe?.start_param;
      if (startParam) {
        const decoded = decodeStartParam(startParam);
        if (decoded) {
          // Check if decoded start param is a full webseries URL
          if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
            setActiveTab('hd_content');
            const slug = decoded.split('/').filter(Boolean).pop() || 'Web Series';
            const displayTitle = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            setTimeout(() => {
              handlePlayWebseries({
                url: decoded,
                title: displayTitle
              });
            }, 1200);
          } else {
            // Otherwise, it's a FilesAdda code
            setActiveTab('filesadda');
            setLink(buildFilesAddaUrl(decoded));
          }
        }
      }
    } catch (e) {
      console.error('[Telegram StartParam Error]', e);
    }
  }, [handlePlayWebseries]);

  const handleRetryFilesAdda = useCallback(() => {
    setStatus('idle');
    setVideoUrl(null);
    setErrorMsg('');
  }, []);

  return (
    <main className="container">
      {/* Tab Switcher at the very top */}
      <div className="tab-switcher">
        <button 
          className={`tab-btn ${activeTab === 'filesadda' ? 'active' : ''}`}
          onClick={() => setActiveTab('filesadda')}
        >
          🔗 FilesAdda Downloader
        </button>
        <button 
          className={`tab-btn ${activeTab === 'hd_content' ? 'active' : ''}`}
          onClick={() => setActiveTab('hd_content')}
        >
          🎬 HD Content
        </button>
      </div>

      {/* ────────────────────────────────────────────────────────────
          TAB 1: FILESADDA DOWNLOADER
          ──────────────────────────────────────────────────────────── */}
      {activeTab === 'filesadda' && (
        <>
          {/* Header */}
          <header className="header" style={{ padding: '16px 0 8px' }}>
            <div className="logo-icon">▶</div>
            <h1 className="title">FilesAdda Player</h1>
            <p className="subtitle">Paste a FilesAdda link to watch or download</p>
          </header>

          {/* Input Section */}
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

          {/* Fetching status */}
          {status === 'fetching' && (
            <div className="status-card loading-card">
              <div className="spinner" />
              <p className="status-text">Fetching video...</p>
              <p className="status-sub">Getting your direct download link</p>
            </div>
          )}

          {/* FilesAdda Video Player */}
          {status === 'playing' && videoUrl && (
            <div className="status-card" style={{ padding: '0', overflow: 'hidden', borderRadius: '16px' }}>
              <video
                ref={filesAddaVideoRef}
                src={videoUrl}
                controls
                autoPlay
                playsInline
                style={{ width: '100%', display: 'block', borderRadius: '16px' }}
              />
              <div style={{ padding: '12px', display: 'flex', gap: '8px', width: '100%' }}>
                <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="btn btn-download" style={{ flex: 1, textAlign: 'center' }}>
                  📥 Download
                </a>
                <button className="btn btn-retry" onClick={handleRetryFilesAdda} style={{ flex: 1, marginTop: '0' }}>
                  🔄 New Link
                </button>
              </div>
            </div>
          )}

          {/* FilesAdda Error */}
          {status === 'error' && (
            <div className="status-card error-card">
              <div className="error-icon">⚠</div>
              <p className="status-text error-text">Error</p>
              <p className="status-sub">{errorMsg}</p>
              <button className="btn btn-retry" onClick={handleRetryFilesAdda} style={{ marginTop: '4px' }}>
                🔄 Try Again
              </button>
            </div>
          )}

          {/* Footer */}
          <footer className="footer">
            <p>Powered by FilesAdda · Fast &amp; Free</p>
          </footer>
        </>
      )}

      {/* ────────────────────────────────────────────────────────────
          TAB 2: HD CONTENT (WEBSERIES INDEX)
          ──────────────────────────────────────────────────────────── */}
      {activeTab === 'hd_content' && (
        <div className="w-full flex flex-col" style={{ width: '100%' }}>
          {/* Header */}
          <header className="header" style={{ padding: '16px 0 8px', textAlign: 'center', marginBottom: '16px' }}>
            <h1 className="title" style={{ fontSize: '22px' }}>🎬 ORION PREMIUM CINEMA</h1>
            <p className="subtitle">Stream full length web series in HD quality</p>
          </header>

          {/* Search bar */}
          <div className="mb-4" style={{ marginBottom: '16px', position: 'relative', width: '100%' }}>
            <input 
              type="text" 
              placeholder="Search episodes, web series..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full glass-input"
              style={{
                width: '100%',
                padding: '12px 16px 12px 36px',
                borderRadius: '12px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
            <span style={{ position: 'absolute', left: '12px', top: '14px', color: '#666' }}>
              <svg className="w-4 h-4" style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
          </div>

          {/* Category Tabs */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', width: '100%', scrollbarWidth: 'none' }}>
            {['Latest', 'ULLU', 'Feel', 'Prime Shots', 'VOOVI'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`category-pill ${selectedCategory === cat ? 'active' : ''}`}
                style={{
                  padding: '8px 16px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '600',
                  border: '1px solid var(--border-color)',
                  background: selectedCategory === cat ? '#e040fb' : 'rgba(255,255,255,0.02)',
                  color: '#fff',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Video Grid */}
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', width: '100%', marginTop: '8px' }}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="glass-card" style={{ borderRadius: '16px', overflow: 'hidden', padding: '8px' }}>
                  <div className="shimmer-bg" style={{ width: '100%', aspectRatio: '16/9', borderRadius: '12px', marginBottom: '8px' }} />
                  <div className="shimmer-bg" style={{ height: '14px', width: '80%', borderRadius: '4px', marginBottom: '4px' }} />
                  <div className="shimmer-bg" style={{ height: '10px', width: '50%', borderRadius: '4px' }} />
                </div>
              ))}
            </div>
          ) : videos.length === 0 ? (
            <div className="glass-card" style={{ borderRadius: '16px', padding: '32px 16px', textAlign: 'center', marginTop: '16px', width: '100%' }}>
              <svg style={{ width: '48px', height: '48px', margin: '0 auto 12px', color: '#444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
              <p style={{ fontWeight: '700', fontSize: '14px', color: '#ddd' }}>No Web Series Found</p>
              <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>Try checking another category or search term.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', width: '100%', marginTop: '8px' }}>
              {videos.map((video) => (
                <div 
                  key={video.url}
                  onClick={() => handlePlayWebseries(video)}
                  className="glass-card"
                  style={{
                    borderRadius: '16px',
                    overflow: 'hidden',
                    padding: '8px',
                    cursor: 'pointer',
                    position: 'relative'
                  }}
                >
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: '12px', overflow: 'hidden', background: '#000' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={video.thumbnail} 
                      alt={video.title} 
                      style={{ width: '100%', height: '100%', objectCover: 'cover' }}
                      onError={(e) => {
                        e.target.src = 'https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?q=80&w=300';
                      }}
                    />
                    
                    {/* Play hover effect */}
                    <div style={{ position: 'absolute', inset: '0', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#ff4757', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 10px rgba(255, 71, 87, 0.4)' }}>
                        <svg style={{ width: '14px', height: '14px', fill: '#fff', marginLeft: '2px' }} viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                    </div>

                    {/* Badges */}
                    <span style={{ position: 'absolute', bottom: '6px', right: '6px', padding: '2px 6px', background: 'rgba(0,0,0,0.7)', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>
                      {video.duration || 'N/A'}
                    </span>
                    <span style={{ position: 'absolute', top: '6px', left: '6px', padding: '2px 6px', background: 'rgba(0,0,0,0.7)', borderRadius: '4px', fontSize: '8px', fontWeight: 'bold', color: '#ccc' }}>
                      {video.uploaded || 'Recently'}
                    </span>
                  </div>

                  <div style={{ padding: '4px 0 0' }}>
                    <h3 style={{ fontSize: '11px', fontWeight: 'bold', lineHeight: '1.3', color: '#eee', height: '28px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', marginTop: '4px' }}>
                      {video.title}
                    </h3>
                    <span style={{ display: 'inline-block', fontSize: '8px', fontWeight: 'bold', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', padding: '2px 6px', marginTop: '4px', color: '#999' }}>
                      {video.category}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <footer className="footer" style={{ marginTop: '24px' }}>
            <p>Powered by Orion Cinema · HD Player</p>
          </footer>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────
          CINEMATIC OVERLAY VIDEO PLAYER MODAL (FOR WEBSERIES)
          ──────────────────────────────────────────────────────────── */}
      {activeVideo && (
        <div style={{
          position: 'fixed',
          inset: '0',
          zIndex: '9999',
          background: 'rgba(0,0,0,0.92)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          fontFamily: "'Inter', sans-serif"
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderBottom: '1px solid #111' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '4px', height: '20px', background: '#ff4757', borderRadius: '2px' }} />
              <div>
                <p style={{ fontSize: '9px', color: '#ff4757', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>Streaming Now</p>
                <h2 style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff', margin: '2px 0 0', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeVideo.title}</h2>
              </div>
            </div>
            <button 
              onClick={() => {
                setActiveVideo(null);
                setStreamUrl('');
                setMidRollAdShown(false);
              }}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#aaa',
                cursor: 'pointer'
              }}
            >
              <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* Player Display Container */}
          <div style={{ flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
            {fetchingStream ? (
              <div style={{ textAlign: 'center', padding: '24px' }}>
                <div className="spinner" style={{ margin: '0 auto 12px' }} />
                <p style={{ fontSize: '14px', color: '#ddd', fontWeight: 'bold' }}>Decrypting Stream Source...</p>
                <p style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>Generating secure temporary play URL</p>
              </div>
            ) : streamError ? (
              <div style={{ textAlign: 'center', padding: '24px', maxWidth: '280px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', margin: '0 auto 12px' }}>
                  <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                </div>
                <p style={{ fontSize: '14px', color: '#ef4444', fontWeight: 'bold' }}>Connection Error</p>
                <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>{streamError}</p>
                <button 
                  onClick={() => handlePlayWebseries(activeVideo)}
                  style={{
                    marginTop: '16px',
                    padding: '8px 16px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    color: '#ccc',
                    cursor: 'pointer'
                  }}
                >
                  🔄 Retry connection
                </button>
              </div>
            ) : streamUrl ? (
              <div style={{ width: '100%', aspectRatio: '16/9', background: '#000' }}>
                <video 
                  ref={webseriesVideoRef}
                  src={streamUrl} 
                  controls 
                  autoPlay 
                  playsInline
                  onTimeUpdate={handleWebseriesTimeUpdate}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
            ) : null}
          </div>

          {/* Action Footer */}
          {streamUrl && (
            <div style={{ padding: '16px', background: '#030305', borderTop: '1px solid #111', display: 'flex', gap: '12px' }}>
              <a 
                href={streamUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-download"
                style={{ flex: '1', textAlign: 'center', padding: '14px 0', fontSize: '13px' }}
              >
                📥 Download Video
              </a>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
