import { useState, useEffect } from 'react'
import { getOverview, updateStats, updateContent, refreshYouTube, getYouTubeStatus } from '../../api'

const DASH_QUICK_LINKS = [
  { tab: 'thumbnails', label: 'Thumbnails' },
  { tab: 'videos', label: 'Videos' },
  { tab: 'shorts', label: 'Shorts' },
  { tab: 'settings', label: 'Settings' },
]

function timeAgo(isoStr) {
  if (!isoStr) return 'N/A'
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function AdminOverview({ mode = 'dashboard', onNavigate }) {
  const isDashboard = mode === 'dashboard'
  const isSettings = mode === 'settings'
  const [data, setData] = useState(null)
  const [stats, setStats] = useState({ projects: '', clients: '', years: '' })
  const [content, setContent] = useState({ tagline: '', bio1: '', bio2: '', skills: '', marqueeText: '' })
  const [statusMsg, setStatusMsg] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [ytStatus, setYtStatus] = useState(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [ytLogs, setYtLogs] = useState([])

  useEffect(() => {
    load()

    let socket
    import('socket.io-client').then(({ io }) => {
      socket = io(window.location.origin)

      socket.on('youtube_log', (log) => {
        setYtLogs(prev => [log, ...prev].slice(0, 50))
      })

      socket.on('youtube_status_update', (status) => {
        setYtStatus(status)
      })
    })

    // Poll status every 30s so dashboard stays fresh even without socket events
    const poll = setInterval(() => loadYouTubeStatus(), 30000)

    return () => {
      if (socket) socket.disconnect()
      clearInterval(poll)
    }
  }, [])

  const load = async () => {
    try {
      const res = await getOverview()
      const d = res.data.data
      setData(d)
      if (d.stats) setStats(d.stats)
      getPortfolioData()
      loadYouTubeStatus()
      loadYouTubeLogs()
    } catch (e) {
      console.error(e)
    }
  }

  const loadYouTubeLogs = async () => {
    try {
      const { getYoutubeLogs } = await import('../../api')
      const res = await getYoutubeLogs()
      if (res.data?.success) {
        setYtLogs(res.data.data)
      }
    } catch (e) {
      console.error('Failed to load logs', e)
    }
  }

  const loadYouTubeStatus = async () => {
    setStatusLoading(true)
    try {
      const res = await getYouTubeStatus()
      if (res.data?.success) {
        setYtStatus(res.data.data)
      }
    } catch (e) {
      console.error('Failed to load YouTube status', e)
    } finally {
      setStatusLoading(false)
    }
  }

  const getPortfolioData = async () => {
    try {
      const { getPortfolio } = await import('../../api')
      const res = await getPortfolio()
      if (res.data.data) {
        setContent({
          tagline: res.data.data.tagline || '',
          bio1: res.data.data.bio1 || '',
          bio2: res.data.data.bio2 || '',
          skills: (res.data.data.skills || []).join(', '),
          marqueeText: res.data.data.marqueeText || ''
        })
      }
    } catch (e) {}
  }

  const handleStatsSave = async () => {
    try {
      await updateStats(stats)
      setStatusMsg('Stats updated!')
      setTimeout(() => setStatusMsg(''), 3000)
    } catch (e) {
      console.error(e)
    }
  }

  const handleContentSave = async () => {
    try {
      await updateContent({
        tagline: content.tagline,
        bio1: content.bio1,
        bio2: content.bio2,
        skills: content.skills.split(',').map(s => s.trim()).filter(Boolean),
        marqueeText: content.marqueeText
      })
      setStatusMsg('Content updated!')
      setTimeout(() => setStatusMsg(''), 3000)
    } catch (e) {
      console.error(e)
    }
  }

  const handleRefreshYouTube = async () => {
    setRefreshing(true)
    try {
      const res = await refreshYouTube()
      if (res.data?.success) {
        setStatusMsg('YouTube refresh triggered successfully.')
        loadYouTubeStatus()
      } else {
        setStatusMsg('YouTube refresh failed.')
      }
    } catch (e) {
      console.error('Refresh error', e)
      setStatusMsg('YouTube refresh failed.')
    } finally {
      setRefreshing(false)
      setTimeout(() => setStatusMsg(''), 5000)
    }
  }

  const handleSyncQuota = async () => {
    const val = prompt('Enter current usage units from Google Cloud Console:', ytStatus?.dailyQuotaUsage || '0')
    if (val === null) return
    const num = parseInt(val, 10)
    if (isNaN(num)) return alert('Please enter a valid number')

    try {
      const { updateYoutubeQuota } = await import('../../api')
      await updateYoutubeQuota(num)
      setStatusMsg('Quota usage synced!')
      loadYouTubeStatus()
    } catch (e) {
      console.error(e)
      setStatusMsg('Failed to sync quota')
    } finally {
      setTimeout(() => setStatusMsg(''), 3000)
    }
  }

  // Compute next refresh display
  const getNextRefreshDisplay = () => {
    if (!ytStatus?.nextActiveRefreshAt) return '--:--'
    const next = new Date(ytStatus.nextActiveRefreshAt)
    if (isNaN(next.getTime())) return '--:--'
    return next.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Compute refresh interval label
  const getRefreshIntervalLabel = () => {
    if (!ytStatus) return '1m'
    const ms = ytStatus.refreshIntervalMs
    if (!ms) return '1m'
    const mins = Math.round(ms / 60000)
    return `${mins}m`
  }

  // Quota bar color
  const getQuotaBarColor = () => {
    if (!ytStatus) return 'linear-gradient(90deg, #e5173f, #ff6b8a)'
    const pct = ytStatus.dailyQuotaUsage / ytStatus.dailyQuotaLimit
    if (pct >= 0.8) return 'linear-gradient(90deg, #ff4500, #ff6b00)'
    if (pct >= 0.5) return 'linear-gradient(90deg, #f59e0b, #fbbf24)'
    return 'linear-gradient(90deg, #e5173f, #ff6b8a)'
  }

  if (!data) return <div style={{ color: '#888', padding: '40px' }}>Loading...</div>

  return (
    <div className="admin-section">
      {isDashboard && (
        <>
          <header className="dash-dashboard-header" style={{ maxWidth: '100%' }}>
            <span className="dash-dashboard-eyebrow">YouTube Refresh Engine</span>
            <h1 className="dash-page-title dash-dashboard-title">Live Stats &amp; Refresh Control</h1>
            <div className="dash-dashboard-title-line" aria-hidden />
            <p className="dash-dashboard-sub">
              Automatic 1-min active refresh · Daily archive rotation · <strong>Mode: {ytStatus?.engineMode || 'Loading...'}</strong>
            </p>

            {/* ─── YOUTUBE ENGINE PANEL ─── */}
            <div className="yt-status-panel">

              {/* Quota bar */}
              <div className="yt-status-card yt-status-card--highlight">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="yt-status-label">Global Quota Usage (Daily)</div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', color: '#555' }}>
                      Resets: {new Date().toLocaleDateString('en-CA')}
                    </span>
                    <button
                      onClick={handleSyncQuota}
                      className="btn-sync-small"
                      title="Sync with Google Cloud Console"
                    >
                      ↺ Sync with Console
                    </button>
                  </div>
                </div>
                <div className="yt-status-bar-wrap">
                  <div
                    className="yt-status-bar"
                    style={{
                      width: ytStatus ? `${Math.min(100, (ytStatus.dailyQuotaUsage / ytStatus.dailyQuotaLimit) * 100)}%` : '0%',
                      background: getQuotaBarColor(),
                    }}
                  />
                </div>
                <div className="yt-status-meter">
                  <span>
                    <strong style={{ color: '#fff', fontSize: '16px' }}>{ytStatus?.dailyQuotaUsage || 0}</strong>
                    <span style={{ color: '#555' }}> / {ytStatus?.dailyQuotaLimit || 10000} units used</span>
                  </span>
                  <span style={{ color: ytStatus?.isThrottled ? '#ff6b00' : '#555' }}>
                    Throttle {ytStatus?.isThrottled ? '⚠ Active' : 'Active'} at {ytStatus?.throttleAt || 8000}u
                  </span>
                </div>
              </div>

              {/* Stats tiles — 6 tiles matching screenshot */}
              <div className="yt-status-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                <div className="yt-status-tile">
                  <span className="yt-tile-label">Active Pool</span>
                  <div className="yt-tile-value">
                    <span style={{ color: '#a78bfa' }}>{ytStatus?.activePoolSize || 0}</span>
                    <small> / {ytStatus?.activePoolLimit || 15}</small>
                  </div>
                  <div className="yt-status-subline">Refresh: every {getRefreshIntervalLabel()}</div>
                </div>

                <div className="yt-status-tile">
                  <span className="yt-tile-label">Refresh Interval</span>
                  <div className="yt-tile-value" style={{ color: '#fbbf24' }}>{getRefreshIntervalLabel()}</div>
                  <div className="yt-status-subline">
                    {ytStatus?.noChangeStreak > 0 ? `Backoff: ${ytStatus.noChangeStreak}x idle` : 'Normal'}
                  </div>
                </div>

                <div className="yt-status-tile">
                  <span className="yt-tile-label">No-Change Streak</span>
                  <div className="yt-tile-value">{ytStatus?.noChangeStreak || 0}<small>×</small></div>
                  <div className="yt-status-subline">
                    {ytStatus?.noChangeStreak >= 10 ? '10 min backoff' :
                     ytStatus?.noChangeStreak >= 5 ? '5 min backoff' :
                     ytStatus?.noChangeStreak >= 2 ? '2 min backoff' : '1 min refresh'}
                  </div>
                </div>

                <div className="yt-status-tile">
                  <span className="yt-tile-label">Archive Batches</span>
                  <div className="yt-tile-value">{ytStatus?.archiveBatches || 1} <small>batch{ytStatus?.archiveBatches !== 1 ? 'es' : ''}</small></div>
                  <div className="yt-status-subline">Daily rotation @ 3 AM</div>
                </div>

                <div className="yt-status-tile">
                  <span className="yt-tile-label">Current Batch</span>
                  <div className="yt-tile-value">#{ytStatus?.currentArchiveBatch || 1}</div>
                  <div className="yt-status-subline">{ytStatus?.batchSize || 50} videos / batch</div>
                </div>

                <div className="yt-status-tile">
                  <span className="yt-tile-label">Next Refresh</span>
                  <div className="yt-tile-value" style={{ fontSize: '20px' }}>{getNextRefreshDisplay()}</div>
                  <div className="yt-status-subline">
                    {ytStatus?.noChangeStreak > 0 ? `Backoff active` : 'Normal tracking'}
                  </div>
                </div>
              </div>

              {/* Meta row — last refresh times */}
              <div className="yt-status-meta-grid">
                <div className="yt-meta-item">
                  <span>⚡ Last Active Refresh</span>
                  <strong>{timeAgo(ytStatus?.lastActiveRefreshAt)}</strong>
                </div>
                <div className="yt-meta-item">
                  <span>▦ Last Archive Refresh</span>
                  <strong>{timeAgo(ytStatus?.lastArchiveRefreshAt)}</strong>
                </div>
                <div className="yt-meta-item">
                  <span>⟳ Last Pool Rebuild</span>
                  <strong>{timeAgo(ytStatus?.lastPoolRebuildAt)}</strong>
                </div>
                <div className="yt-meta-item">
                  <span>✦ Last Manual Refresh</span>
                  <strong>
                    {ytStatus?.lastManualRefreshAt
                      ? new Date(ytStatus.lastManualRefreshAt).toLocaleString()
                      : 'N/A'}
                  </strong>
                </div>
              </div>

              {/* Backoff legend */}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '11px', color: '#555', alignItems: 'center' }}>
                <span style={{ color: '#444', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Backoff schedule:</span>
                <span>● 0-1× → 1 min</span>
                <span>● 2× → 2 min</span>
                <span>● 3-4× → 5 min</span>
                <span>● 5×+ → 10 min</span>
              </div>

              {/* Action row */}
              <div className="yt-status-action-row">
                <button
                  className="btn btn-primary"
                  onClick={handleRefreshYouTube}
                  disabled={refreshing || statusLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <span>{refreshing ? '⟳' : '⟳'}</span>
                  {refreshing ? 'Refreshing...' : 'Refresh All Videos Now'}
                </button>
                <div>
                  <div style={{ color: '#f59e0b', fontSize: '12px', marginBottom: '4px' }}>
                    ⚠ Uses 1 API unit(s) per 50 videos — use sparingly
                  </div>
                  <div className="yt-status-note">
                    Only you (admin) can trigger this. Not exposed to public.
                  </div>
                </div>
              </div>
            </div>

            {/* ─── SYSTEM LOGS ─── */}
            <div className="yt-logs-panel">
              <div className="yt-status-label" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Live System Logs</span>
                <button onClick={loadYouTubeLogs} className="btn-sync-small">↺ Refresh Logs</button>
              </div>
              <div className="yt-logs-container">
                {ytLogs.length === 0 ? (
                  <div className="yt-log-item" style={{ color: '#555' }}>No logs available.</div>
                ) : (
                  ytLogs.map((log, i) => (
                    <div key={i} className={`yt-log-item yt-log-${log.type}`}>
                      <span className="yt-log-ts">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span className="yt-log-msg">{log.message}</span>
                      {log.responseTime !== undefined && (
                        <span className="yt-log-meta">
                          {log.responseTime}ms · {log.units}u{log.statusCode ? ` · ${log.statusCode}` : ''}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </header>

          {/* Stat cards */}
          <div className="admin-grid dash-stat-grid">
            <div className="admin-stat-card dash-stat-card">
              <div className="admin-stat-num">{data.totalWork}</div>
              <div className="admin-stat-label">Total Portfolio Items</div>
            </div>
            <div className="admin-stat-card dash-stat-card" style={{ borderLeft: '2px solid #e5173f' }}>
              <div className="admin-stat-num" style={{ fontSize: '28px' }}>{data.totalThumbnails || 0}</div>
              <div className="admin-stat-label">Thumbnails</div>
            </div>
            <div className="admin-stat-card dash-stat-card" style={{ borderLeft: '2px solid #e5173f' }}>
              <div className="admin-stat-num" style={{ fontSize: '28px' }}>{data.totalVideos || 0}</div>
              <div className="admin-stat-label">Videos</div>
            </div>
            <div className="admin-stat-card dash-stat-card" style={{ borderLeft: '2px solid #e5173f' }}>
              <div className="admin-stat-num" style={{ fontSize: '28px' }}>{data.totalShorts || 0}</div>
              <div className="admin-stat-label">Shorts</div>
            </div>
          </div>

          {onNavigate && (
            <div className="dash-quick-actions dash-quick-actions--animated">
              <div className="dash-quick-label">Quick links</div>
              <div className="dash-quick-grid">
                {DASH_QUICK_LINKS.map(({ tab, label }) => (
                  <button
                    key={tab}
                    type="button"
                    className="dash-quick-btn"
                    onClick={() => onNavigate(tab)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {isSettings && (
        <>
          <div className="admin-glass-form-card">
            <h3 className="admin-glass-form-title">Update Stats</h3>
            <div className="admin-form-group">
              <label className="admin-label">Projects</label>
              <input className="admin-input" value={stats.projects} onChange={e => setStats({ ...stats, projects: e.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-label">Clients</label>
              <input className="admin-input" value={stats.clients} onChange={e => setStats({ ...stats, clients: e.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-label">Years</label>
              <input className="admin-input" value={stats.years} onChange={e => setStats({ ...stats, years: e.target.value })} />
            </div>
            <button className="btn btn-primary" onClick={handleStatsSave}>Save Stats</button>
          </div>
        </>
      )}

      {statusMsg && <div style={{ marginTop: '20px', color: '#4ade80' }}>{statusMsg}</div>}
    </div>
  )
}
