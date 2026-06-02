'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

const HISTORY_KEY = 'broadcast_history_auto_approve';
const MAX_HISTORY = 7;

// ─── Default message templates ───
const TEMPLATES = {
     webseries: {
          text: '🚀 New Video Added!\n\n🎥 Ready to watch?\n🔥 Click below and enjoy the latest upload in HD quality.',
          buttonText: '🚀 Watch in HD',
          buttonUrl: 'https://webseriesmini.adulttg.com/',
     },
     hd_content: {
          text: '🚀 New Video Added!\n\n🎥 Ready to watch?\n🔥 Click below and enjoy the latest upload in HD quality.',
          buttonText: '🚀 Watch in HD',
          buttonUrl: 'https://playvideominiapp.vercel.app/?hd-content',
     },
};

export default function AdminBroadcast() {
     // ─── Auth ───
     const [secret, setSecret] = useState('');
     const [unlocked, setUnlocked] = useState(false);

     // ─── Message config ───
     const [msgType, setMsgType] = useState('webseries'); // webseries | hd_content | custom
     const [customText, setCustomText] = useState('');
     const [customBtnText, setCustomBtnText] = useState('');
     const [customBtnUrl, setCustomBtnUrl] = useState('');

     // ─── Target config ───
     const [targetMode, setTargetMode] = useState('all'); // all | range | test
     const [rangeStart, setRangeStart] = useState(0);
     const [rangeMax, setRangeMax] = useState(10000);
     const [testIds, setTestIds] = useState('');
     const [batchSize, setBatchSize] = useState(20);

     // ─── Progress ───
     const [totalUsers, setTotalUsers] = useState(null);
     const [running, setRunning] = useState(false);
     const [progress, setProgress] = useState({ sent: 0, failed: 0, processed: 0, total: 0 });
     const [logs, setLogs] = useState([]);
     const [done, setDone] = useState(false);
     const abortRef = useRef(false);
     const [history, setHistory] = useState([]);

     // ─── Load broadcast history from localStorage ───
     useEffect(() => {
          try {
               const saved = localStorage.getItem(HISTORY_KEY);
               if (saved) setHistory(JSON.parse(saved));
          } catch (e) { /* ignore */ }
     }, []);

     const saveHistory = useCallback((entry) => {
          setHistory((prev) => {
               const updated = [entry, ...prev].slice(0, MAX_HISTORY);
               try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch (e) { /* ignore */ }
               return updated;
          });
     }, []);

     // ─── Helpers ───
     const addLog = useCallback((msg, type = 'info') => {
          const ts = new Date().toLocaleTimeString();
          setLogs((prev) => [...prev, { ts, msg, type }]);
     }, []);

     const buildPayload = useCallback(() => {
          let messageText, replyMarkup;

          if (msgType === 'custom') {
               messageText = customText;
               if (customBtnText && customBtnUrl) {
                    // Check if it's a web_app URL (t.me links or webapp links)
                    const isWebApp = customBtnUrl.includes('.vercel.app') || customBtnUrl.startsWith('https://');
                    replyMarkup = {
                         inline_keyboard: [
                              [
                                   isWebApp
                                        ? { text: customBtnText, web_app: { url: customBtnUrl } }
                                        : { text: customBtnText, url: customBtnUrl },
                              ],
                         ],
                    };
               }
          } else {
               const tmpl = TEMPLATES[msgType];
               messageText = tmpl.text;
               replyMarkup = {
                    inline_keyboard: [
                         [{ text: tmpl.buttonText, web_app: { url: tmpl.buttonUrl } }],
                    ],
               };
          }

          return { messageText, parseMode: 'HTML', replyMarkup };
     }, [msgType, customText, customBtnText, customBtnUrl]);

     // ─── Fetch stats ───
     const fetchStats = useCallback(async () => {
          try {
               const res = await fetch('/api/admin/broadcast', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'stats', secret }),
               });
               const data = await res.json();
               if (data.ok) {
                    setTotalUsers(data.total);
                    addLog(`📊 Total active approved users: ${data.total}`, 'success');
               } else {
                    addLog(`❌ Failed to fetch stats: ${data.error}`, 'error');
               }
          } catch (e) {
               addLog(`❌ Network error: ${e.message}`, 'error');
          }
     }, [secret, addLog]);

     // ─── Send test ───
     const sendTest = useCallback(async () => {
          const ids = testIds
               .split(',')
               .map((s) => s.trim())
               .filter(Boolean)
               .map(Number);
          if (!ids.length) return addLog('⚠️ Enter at least one chat ID', 'error');

          const { messageText, parseMode, replyMarkup } = buildPayload();
          if (!messageText) return addLog('⚠️ Message text is empty', 'error');

          addLog(`🧪 Sending test to ${ids.length} user(s)...`);
          setRunning(true);

          try {
               const res = await fetch('/api/admin/broadcast', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                         action: 'send_test',
                         secret,
                         chatIds: ids,
                         messageText,
                         parseMode,
                         replyMarkup,
                    }),
               });
               const data = await res.json();
               if (data.ok) {
                    addLog(`✅ Test done — Sent: ${data.sent}, Failed: ${data.failed}`, 'success');
                    if (data.errors?.length) {
                         data.errors.forEach((e) => addLog(`  ❌ ${e.chat_id}: ${e.error}`, 'error'));
                    }
               } else {
                    addLog(`❌ Test failed: ${data.error}`, 'error');
               }
          } catch (e) {
               addLog(`❌ Network error: ${e.message}`, 'error');
          }

          setRunning(false);
     }, [testIds, secret, buildPayload, addLog]);

     // ─── Start mass broadcast ───
     const startBroadcast = useCallback(async () => {
          const { messageText, parseMode, replyMarkup } = buildPayload();
          if (!messageText) return addLog('⚠️ Message text is empty', 'error');

          abortRef.current = false;
          setRunning(true);
          setDone(false);
          setProgress({ sent: 0, failed: 0, processed: 0, total: totalUsers || 0 });
          setLogs([]);

          const maxUsers = targetMode === 'range' ? rangeMax : (totalUsers || 99999);
          let currentCursor = targetMode === 'range' ? rangeStart : 0;
          let totalSent = 0;
          let totalFailed = 0;
          let totalProcessed = 0;
          let currentBatchSize = batchSize; // Dynamic batch sizing for flow control

          addLog(`🚀 Starting broadcast — Max Batch: ${batchSize}, Target: ${targetMode === 'all' ? 'ALL' : `cursor ${currentCursor} → max ${maxUsers}`}`);

          let status = 'completed';
          let reachedEnd = false;

          while (!reachedEnd) {
               if (abortRef.current) {
                    addLog('⛔ Broadcast aborted by user', 'error');
                    status = 'aborted';
                    break;
               }

               try {
                    const actualBatchLimit = currentBatchSize;
                    const res = await fetch('/api/admin/broadcast', {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({
                              action: 'send_batch',
                              secret,
                              cursor: currentCursor,
                              limit: actualBatchLimit,
                              messageText,
                              parseMode,
                              replyMarkup,
                         }),
                    });

                    const data = await res.json();

                    if (!data.ok) {
                         addLog(`❌ Batch error: ${data.error}`, 'error');
                         status = 'error';
                         break;
                    }

                    // On success, slowly recover batch size speed if it was scaled down
                    if (currentBatchSize < batchSize) {
                         currentBatchSize = Math.min(batchSize, currentBatchSize + 1);
                    }

                    totalSent += data.sent;
                    totalFailed += data.failed;
                    totalProcessed += data.processed;
                    currentCursor = data.nextCursor || currentCursor;

                    // Progress is based on cursor position relative to max
                    const progressPercent = maxUsers > 0 ? Math.min(100, Math.round((currentCursor / maxUsers) * 100)) : 0;

                    setProgress({
                         sent: totalSent,
                         failed: totalFailed,
                         processed: totalProcessed,
                         total: maxUsers,
                         percent: progressPercent,
                    });

                    addLog(`📤 Batch (${actualBatchLimit}) done — Sent: ${data.sent} | Failed: ${data.failed} | Cursor: ${currentCursor} | Active processed: ${totalProcessed}`);

                    if (data.errors?.length) {
                         data.errors.forEach((e) => addLog(`  ⚠️ ${e.chat_id}: ${e.error}`, 'warn'));
                    }

                    if (data.done || data.processed === 0) {
                         reachedEnd = true;
                         addLog(`🎉 Broadcast complete! Sent: ${totalSent}, Failed: ${totalFailed}, Active users reached: ${totalProcessed}`, 'success');
                         if (totalProcessed < maxUsers) {
                              addLog(`ℹ️ Processed ${totalProcessed} active users out of ${maxUsers} total rows (remaining rows were already inactive)`, 'info');
                         }
                         break;
                    }

                    // Safety: if cursor exceeded maxUsers in range mode, stop
                    if (targetMode === 'range' && currentCursor >= maxUsers) {
                         reachedEnd = true;
                         addLog(`🎉 Broadcast complete! Reached cursor limit ${maxUsers}. Sent: ${totalSent}, Failed: ${totalFailed}`, 'success');
                         break;
                    }
               } catch (e) {
                    addLog(`❌ Network error: ${e.message}`, 'error');
                    
                    // Auto-decrement batch size on network failures (TCP-like slow start)
                    if (currentBatchSize > 5) currentBatchSize = 5;
                    else if (currentBatchSize > 3) currentBatchSize = 3;
                    else if (currentBatchSize > 2) currentBatchSize = 2;
                    else currentBatchSize = 1;

                    addLog(`🔄 Scaling down batch size to ${currentBatchSize}. Retrying in 3 seconds...`, 'warn');
                    await new Promise((r) => setTimeout(r, 3000));
               }
          }

          // Save to persistent history
          saveHistory({
               time: new Date().toLocaleString(),
               msgPreview: messageText.substring(0, 60) + (messageText.length > 60 ? '...' : ''),
               sent: totalSent,
               failed: totalFailed,
               processed: totalProcessed,
               lastCursor: currentCursor,
               status,
          });

          setDone(true);
          setRunning(false);
     }, [buildPayload, totalUsers, targetMode, rangeStart, rangeMax, batchSize, secret, addLog, saveHistory]);

     // ─── Abort ───
     const abortBroadcast = useCallback(() => {
          abortRef.current = true;
          addLog('🛑 Abort requested — finishing current batch...', 'warn');
     }, [addLog]);

     // ─── Progress percentage ───
     const pct = progress.percent != null ? progress.percent : (progress.total > 0 ? Math.min(100, Math.round((progress.processed / progress.total) * 100)) : 0);

     // ══════════════════════════════════════════════════
     // RENDER
     // ══════════════════════════════════════════════════

     // ─── Login gate ───
     if (!unlocked) {
          return (
               <main style={styles.loginPage}>
                    <div style={styles.loginCard}>
                         <div style={styles.loginIcon}>🔐</div>
                         <h1 style={styles.loginTitle}>Broadcast Dashboard</h1>
                         <p style={styles.loginSub}>Enter your secret key to continue</p>
                         <input
                              type="password"
                              placeholder="Secret key..."
                              value={secret}
                              onChange={(e) => setSecret(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && secret.length > 3 && setUnlocked(true)}
                              style={styles.loginInput}
                         />
                         <button
                              onClick={() => secret.length > 3 && setUnlocked(true)}
                              style={styles.loginBtn}
                         >
                              Unlock Dashboard
                         </button>
                    </div>
               </main>
          );
     }

     // ─── Dashboard ───
     return (
          <main style={styles.page}>
               <header style={styles.header}>
                    <h1 style={styles.headerTitle}>📡 Auto-Approve Bot Broadcast Dashboard</h1>
                    <button onClick={fetchStats} style={styles.statsBtn}>
                         📊 {totalUsers !== null ? `${totalUsers.toLocaleString()} approved users` : 'Fetch Stats'}
                    </button>
               </header>

               <div style={styles.grid}>
                    {/* ── LEFT: Configuration ── */}
                    <div style={styles.configPanel}>
                         {/* Message Type */}
                         <div style={styles.section}>
                              <h3 style={styles.sectionTitle}>📝 Message Type</h3>
                              <div style={styles.radioGroup}>
                                   {['webseries', 'hd_content', 'custom'].map((t) => (
                                        <label key={t} style={{
                                             ...styles.radioLabel,
                                             ...(msgType === t ? styles.radioActive : {}),
                                        }}>
                                             <input
                                                  type="radio"
                                                  name="msgType"
                                                  value={t}
                                                  checked={msgType === t}
                                                  onChange={() => setMsgType(t)}
                                                  style={{ display: 'none' }}
                                             />
                                             {t === 'webseries' && '🎬 Web Series Preset'}
                                             {t === 'hd_content' && '🎬 HD Content Preset'}
                                             {t === 'custom' && '✏️ Custom Message'}
                                        </label>
                                   ))}
                              </div>

                              {/* Preview for presets */}
                              {msgType !== 'custom' && (
                                   <div style={styles.preview}>
                                        <p style={styles.previewText}>{TEMPLATES[msgType].text}</p>
                                        <div style={styles.previewBtn}>
                                             {TEMPLATES[msgType].buttonText}
                                        </div>
                                   </div>
                              )}

                              {/* Custom message fields */}
                              {msgType === 'custom' && (
                                   <div style={styles.customFields}>
                                        <label style={styles.fieldLabel}>
                                             Message (HTML supported)
                                        </label>
                                        <textarea
                                             value={customText}
                                             onChange={(e) => setCustomText(e.target.value)}
                                             placeholder={'<b>Bold text</b>\n<i>Italic</i>\n<a href="https://example.com">Link</a>'}
                                             rows={5}
                                             style={styles.textarea}
                                        />
                                        <label style={styles.fieldLabel}>Button Text (optional)</label>
                                        <input
                                             value={customBtnText}
                                             onChange={(e) => setCustomBtnText(e.target.value)}
                                             placeholder="🚀 Open App"
                                             style={styles.input}
                                        />
                                        <label style={styles.fieldLabel}>Button URL (optional)</label>
                                        <input
                                             value={customBtnUrl}
                                             onChange={(e) => setCustomBtnUrl(e.target.value)}
                                             placeholder="https://webseriesmini.adulttg.com/"
                                             style={styles.input}
                                        />
                                   </div>
                              )}
                         </div>

                         {/* Target Selection */}
                         <div style={styles.section}>
                              <h3 style={styles.sectionTitle}>🎯 Target Users</h3>
                              <div style={styles.radioGroup}>
                                   {[
                                        { value: 'all', label: '🌍 All Approved' },
                                        { value: 'range', label: '📊 ID Range' },
                                        { value: 'test', label: '🧪 Test IDs' },
                                   ].map((t) => (
                                        <label key={t.value} style={{
                                             ...styles.radioLabel,
                                             ...(targetMode === t.value ? styles.radioActive : {}),
                                        }}>
                                             <input
                                                  type="radio"
                                                  name="target"
                                                  value={t.value}
                                                  checked={targetMode === t.value}
                                                  onChange={() => setTargetMode(t.value)}
                                                  style={{ display: 'none' }}
                                             />
                                             {t.label}
                                        </label>
                                   ))}
                              </div>

                              {targetMode === 'range' && (
                                   <div style={styles.rangeFields}>
                                        <div style={styles.rangeRow}>
                                             <div style={styles.rangeField}>
                                                  <label style={styles.fieldLabel}>Start from DB ID #</label>
                                                  <input
                                                       type="number"
                                                       value={rangeStart}
                                                       onChange={(e) => setRangeStart(Number(e.target.value))}
                                                       style={styles.input}
                                                  />
                                             </div>
                                             <div style={styles.rangeField}>
                                                  <label style={styles.fieldLabel}>Max Row ID</label>
                                                  <input
                                                       type="number"
                                                       value={rangeMax}
                                                       onChange={(e) => setRangeMax(Number(e.target.value))}
                                                       style={styles.input}
                                                  />
                                             </div>
                                        </div>
                                   </div>
                              )}

                              {targetMode === 'test' && (
                                   <div style={styles.customFields}>
                                        <label style={styles.fieldLabel}>Chat IDs (comma separated)</label>
                                        <input
                                             value={testIds}
                                             onChange={(e) => setTestIds(e.target.value)}
                                             placeholder="915318009, 123456789"
                                             style={styles.input}
                                        />
                                   </div>
                              )}

                              {/* Batch size */}
                              {targetMode !== 'test' && (
                                   <div style={{ marginTop: 12 }}>
                                        <label style={styles.fieldLabel}>Batch size (per request)</label>
                                        <select
                                             value={batchSize}
                                             onChange={(e) => setBatchSize(Number(e.target.value))}
                                             style={styles.select}
                                        >
                                             <option value={10}>10 (safest)</option>
                                             <option value={20}>20 (default)</option>
                                             <option value={25}>25</option>
                                             <option value={30}>30 (max safe)</option>
                                        </select>
                                   </div>
                              )}
                         </div>

                         {/* Action buttons */}
                         <div style={styles.actions}>
                              {targetMode === 'test' ? (
                                   <button
                                        onClick={sendTest}
                                        disabled={running}
                                        style={{
                                             ...styles.sendBtn,
                                             ...(running ? styles.disabled : {}),
                                             background: '#f59e0b',
                                        }}
                                   >
                                        🧪 Send Test Message
                                   </button>
                              ) : (
                                   <>
                                        <button
                                             onClick={startBroadcast}
                                             disabled={running}
                                             style={{
                                                  ...styles.sendBtn,
                                                  ...(running ? styles.disabled : {}),
                                             }}
                                        >
                                             {running ? '⏳ Broadcasting...' : '🚀 Start Mass Broadcast'}
                                        </button>
                                        {running && (
                                             <button onClick={abortBroadcast} style={styles.abortBtn}>
                                                  ⛔ Abort
                                             </button>
                                        )}
                                   </>
                              )}
                         </div>
                    </div>

                    {/* ── RIGHT: Progress + Logs ── */}
                    <div style={styles.progressPanel}>
                         {/* Progress bar */}
                         {(running || done) && (
                              <div style={styles.section}>
                                   <h3 style={styles.sectionTitle}>📊 Progress</h3>
                                   <div style={styles.progressBar}>
                                        <div
                                             style={{
                                                  ...styles.progressFill,
                                                  width: `${pct}%`,
                                                  background: done
                                                       ? (progress.failed > 0 ? '#f59e0b' : '#10b981')
                                                       : '#6366f1',
                                             }}
                                        />
                                   </div>
                                   <div style={styles.progressStats}>
                                        <span style={styles.statItem}>
                                             <span style={{ color: '#10b981', fontWeight: 700 }}>{progress.sent}</span> sent
                                        </span>
                                        <span style={styles.statItem}>
                                             <span style={{ color: '#ef4444', fontWeight: 700 }}>{progress.failed}</span> failed
                                        </span>
                                        <span style={styles.statItem}>
                                             <span style={{ color: '#a78bfa', fontWeight: 700 }}>{progress.processed}</span> processed
                                        </span>
                                        <span style={styles.statItem}>
                                             <span style={{ color: '#6366f1', fontWeight: 700 }}>{pct}%</span> done
                                        </span>
                                   </div>
                              </div>
                         )}

                         {/* Live log */}
                         <div style={styles.section}>
                              <h3 style={styles.sectionTitle}>📋 Live Log</h3>
                              <div style={styles.logBox}>
                                   {logs.length === 0 && (
                                        <p style={styles.logEmpty}>Waiting for action...</p>
                                   )}
                                   {logs.map((l, i) => (
                                        <div key={i} style={{
                                             ...styles.logLine,
                                             color: l.type === 'error' ? '#ef4444'
                                                  : l.type === 'success' ? '#10b981'
                                                       : l.type === 'warn' ? '#f59e0b'
                                                            : '#94a3b8',
                                        }}>
                                             <span style={styles.logTs}>{l.ts}</span> {l.msg}
                                        </div>
                                   ))}
                              </div>
                         </div>

                         {/* Broadcast History */}
                         <div style={styles.section}>
                              <h3 style={styles.sectionTitle}>📜 Broadcast History</h3>
                              <div style={styles.logBox}>
                                   {history.length === 0 && (
                                        <p style={styles.logEmpty}>No broadcast history yet</p>
                                   )}
                                   {history.map((h, i) => (
                                        <div key={i} style={{ ...styles.historyEntry, borderLeft: `3px solid ${h.status === 'completed' ? '#10b981' : h.status === 'aborted' ? '#f59e0b' : '#ef4444'}` }}>
                                             <div style={styles.historyHeader}>
                                                  <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 12 }}>
                                                       {h.status === 'completed' ? '✅' : h.status === 'aborted' ? '⛔' : '❌'} {h.time}
                                                  </span>
                                                  <span style={{ color: '#64748b', fontSize: 11 }}>Cursor: {h.lastCursor || h.lastOffset || 0}</span>
                                             </div>
                                             <div style={{ color: '#94a3b8', fontSize: 11, margin: '4px 0' }}>{h.msgPreview}</div>
                                             <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
                                                  <span><span style={{ color: '#10b981', fontWeight: 700 }}>{h.sent}</span> sent</span>
                                                  <span><span style={{ color: '#ef4444', fontWeight: 700 }}>{h.failed}</span> failed</span>
                                                  <span><span style={{ color: '#6366f1', fontWeight: 700 }}>{h.processed}</span> processed</span>
                                             </div>
                                        </div>
                                   ))}
                              </div>
                         </div>
                    </div>
               </div>
          </main>
     );
}

// ══════════════════════════════════════════════════
// STYLES (Inline React styling for guaranteed look)
// ══════════════════════════════════════════════════
const styles = {
     // Login Page
     loginPage: {
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 9999,
          background: '#07070a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
     },
     loginCard: {
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 24,
          padding: '48px 40px',
          textAlign: 'center',
          maxWidth: 400,
          width: '90%',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
     },
     loginIcon: { fontSize: 52, marginBottom: 16 },
     loginTitle: { color: '#fff', fontSize: 24, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.5px' },
     loginSub: { color: '#64748b', fontSize: 14, margin: '0 0 24px' },
     loginInput: {
          width: '100%',
          padding: '16px',
          borderRadius: 14,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          background: 'rgba(0, 0, 0, 0.2)',
          color: '#fff',
          fontSize: 15,
          marginBottom: 16,
          outline: 'none',
          boxSizing: 'border-box',
          textAlign: 'center',
          transition: 'all 0.2s',
     },
     loginBtn: {
          width: '100%',
          padding: '16px',
          borderRadius: 14,
          border: 'none',
          background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
          color: '#fff',
          fontSize: 15,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
          transition: 'transform 0.15s, opacity 0.15s',
     },

     // Dashboard Page
     page: {
          minHeight: '100vh',
          width: '100%',
          maxWidth: '1300px',
          margin: '0 auto',
          background: '#07070a',
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          color: '#e2e8f0',
          padding: '32px 24px',
          boxSizing: 'border-box',
          alignSelf: 'flex-start',
     },
     header: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 32,
          flexWrap: 'wrap',
          gap: 16,
     },
     headerTitle: { fontSize: 26, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.5px' },
     statsBtn: {
          padding: '12px 24px',
          borderRadius: 12,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(255, 255, 255, 0.04)',
          color: '#e2e8f0',
          fontSize: 14,
          cursor: 'pointer',
          fontWeight: 600,
          transition: 'background 0.2s',
     },
     grid: {
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: 24,
     },

     // Panels
     configPanel: { display: 'flex', flexDirection: 'column', gap: 20 },
     progressPanel: { display: 'flex', flexDirection: 'column', gap: 20 },

     section: {
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: 20,
          padding: '24px',
          boxShadow: '0 4px 30px rgba(0, 0, 0, 0.2)',
     },
     sectionTitle: { fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 16px', letterSpacing: '-0.2px' },

     // Radio group
     radioGroup: { display: 'flex', gap: 10, flexWrap: 'wrap' },
     radioLabel: {
          padding: '12px 20px',
          borderRadius: 12,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(255, 255, 255, 0.02)',
          color: '#94a3b8',
          fontSize: 13,
          cursor: 'pointer',
          fontWeight: 600,
          transition: 'all 0.2s',
     },
     radioActive: {
          background: 'rgba(99, 102, 241, 0.15)',
          borderColor: '#6366f1',
          color: '#a5b4fc',
          boxShadow: '0 0 15px rgba(99, 102, 241, 0.1)',
     },

     // Preview card
     preview: {
          marginTop: 18,
          padding: 20,
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: 14,
          border: '1px dashed rgba(255, 255, 255, 0.08)',
     },
     previewText: { color: '#e2e8f0', fontSize: 14.5, margin: '0 0 16px', lineHeight: 1.6 },
     previewBtn: {
          display: 'inline-block',
          padding: '10px 24px',
          borderRadius: 10,
          background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
          color: '#fff',
          fontSize: 13,
          fontWeight: 700,
     },

     // Form Fields
     customFields: { marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 },
     fieldLabel: { color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' },
     input: {
          padding: '14px',
          borderRadius: 12,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(0, 0, 0, 0.2)',
          color: '#fff',
          fontSize: 14,
          outline: 'none',
          width: '100%',
          boxSizing: 'border-box',
     },
     textarea: {
          padding: '14px',
          borderRadius: 12,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(0, 0, 0, 0.2)',
          color: '#fff',
          fontSize: 14,
          outline: 'none',
          resize: 'vertical',
          fontFamily: "'JetBrains Mono', Fira Code, monospace",
          width: '100%',
          boxSizing: 'border-box',
     },
     select: {
          padding: '14px',
          borderRadius: 12,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          background: '#0c0c12',
          color: '#fff',
          fontSize: 14,
          outline: 'none',
          width: '100%',
          boxSizing: 'border-box',
     },

     // Range row
     rangeFields: { marginTop: 16 },
     rangeRow: { display: 'flex', gap: 14 },
     rangeField: { flex: 1 },

     // Action buttons
     actions: { display: 'flex', gap: 14, marginTop: 8 },
     sendBtn: {
          flex: 1,
          padding: '18px',
          borderRadius: 16,
          border: 'none',
          background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
          color: '#fff',
          fontSize: 16,
          fontWeight: 800,
          cursor: 'pointer',
          transition: 'all 0.2s',
          boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)',
     },
     abortBtn: {
          padding: '18px 28px',
          borderRadius: 16,
          border: '1px solid #ef4444',
          background: 'rgba(239, 68, 68, 0.08)',
          color: '#ef4444',
          fontSize: 15,
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'all 0.2s',
     },
     disabled: { opacity: 0.5, cursor: 'not-allowed', boxShadow: 'none' },

     // Progress Fill
     progressBar: {
          height: 12,
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: 20,
          overflow: 'hidden',
          marginBottom: 16,
     },
     progressFill: {
          height: '100%',
          borderRadius: 20,
          transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
     },
     progressStats: { display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
     statItem: { fontSize: 13, color: '#94a3b8', fontWeight: 500 },

     // Logging console
     logBox: {
          maxHeight: 380,
          overflowY: 'auto',
          background: 'rgba(0, 0, 0, 0.25)',
          border: '1px solid rgba(255, 255, 255, 0.03)',
          borderRadius: 14,
          padding: '16px',
          fontFamily: "'JetBrains Mono', Fira Code, monospace",
          fontSize: 12,
          lineHeight: 1.6,
     },
     logEmpty: { color: '#475569', fontStyle: 'italic', margin: 0 },
     logLine: { marginBottom: 6, wordBreak: 'break-all' },
     logTs: { color: '#475569', marginRight: 8 },

     // History Cards
     historyEntry: {
          padding: '12px 16px',
          marginBottom: 10,
          background: 'rgba(255, 255, 255, 0.01)',
          border: '1px solid rgba(255, 255, 255, 0.03)',
          borderRadius: 12,
     },
     historyHeader: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
     },
};
