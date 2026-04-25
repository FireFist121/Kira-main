import { useState, useEffect } from 'react'
import { getOverview, updateStats, updateContent, refreshYouTube, getYouTubeStatus } from '../../api'

const DASH_QUICK_LINKS = [
  { tab: 'thumbnails', label: 'Thumbnails' },
  { tab: 'videos', label: 'Videos' },
  { tab: 'shorts', label: 'Shorts' },
  { tab: 'settings', label: 'Settings' },
]

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

    // Connect to Socket.IO for real-time logs
    let socket;
    import('socket.io-client').then(({ io }) => {
      socket = io(window.location.origin);
      
      socket.on('youtube_log', (log) => {
        setYtLogs(prev => [log, ...prev].slice(0, 50));
      });

      socket.on('youtube_status_update', (status) => {
        setYtStatus(status);
      });
    });

    return () => {
      if (socket) socket.disconnect();
    };
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

  // To fetch bio and tagline, we can just use the public getPortfolio which we have to define if not imported
  const getPortfolioData = async () => {
     try {
       const { getPortfolio } = await import('../../api')
       const res = await getPortfolio()
       if(res.data.data) {
           setContent({
               tagline: res.data.data.tagline || '',
               bio1: res.data.data.bio1 || '',
               bio2: res.data.data.bio2 || '',
               skills: (res.data.data.skills || []).join(', '),
               marqueeText: res.data.data.marqueeText || ''
           })
       }
     } catch(e) {}
  }

  const handleStatsSave = async () => {
    try {
      await updateStats(stats)
      setStatusMsg('Stats updated!')
      setTimeout(() => setStatusMsg(''), 3000)
    } catch(e) {
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
    } catch(e) {
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

  if (!data) return <div>Loading...</div>

  return (
    <div className="admin-section">
      {isDashboard && (
      <>
      <header className="dash-dashboard-header">
        <span className="dash-dashboard-eyebrow">YouTube Refresh Engine</span>
        <h1 className="dash-page-title dash-dashboard-title">Live Stats & Refresh Control</h1>
        <div className="dash-dashboard-title-line" aria-hidden />
        <p className="dash-dashboard-sub">
          Automatic 1-min active refresh · Daily archive rotation · <strong>Mode: {ytStatus?.engineMode || 'Loading...'}</strong>
        </p>
        <div className="yt-status-panel">
          <div className="yt-status-card yt-status-card--highlight">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="yt-status-label">Global Quota Usage (Daily)</div>
              <button 
                onClick={handleSyncQuota} 
                className="btn-sync-small"
                title="Sync with Google Cloud Console"
              >
                Sync with Console
              </button>
            </div>
            <div className="yt-status-bar-wrap">
              <div className="yt-status-bar" style={{ width: ytStatus ? `${Math.min(100, (ytStatus.dailyQuotaUsage / ytStatus.dailyQuotaLimit) * 100)}%` : '0%' }} />
            </div>
            <div className="yt-status-meter">
              <span><strong>{ytStatus?.dailyQuotaUsage || 0}</strong> / {ytStatus?.dailyQuotaLimit || 10000} units used</span>
              <span>Throttle Active at {ytStatus?.throttleAt || 8000}u</span>
            </div>
          </div>
          
          <div className="yt-status-grid">
            <div className="yt-status-tile">
              <span className="yt-tile-label">Active Pool</span>
              <div className="yt-tile-value">{ytStatus?.activePoolSize || 0} <small>/ {ytStatus?.activePoolLimit || 15}</small></div>
              <div className="yt-status-subline">Refresh: every {ytStatus ? (ytStatus.refreshIntervalMs / 60000).toFixed(0) : '1'}m</div>
            </div>
            <div className="yt-status-tile">
              <span className="yt-tile-label">Archive Batches</span>
              <div className="yt-tile-value">{ytStatus?.currentArchiveBatch || 1} <small>/ {ytStatus?.archiveBatches || 1}</small></div>
              <div className="yt-status-subline">Daily rotation @ 3 AM</div>
            </div>
            <div className="yt-status-tile">
              <span className="yt-tile-label">Next Refresh</span>
              <div className="yt-tile-value">{ytStatus ? new Date(ytStatus.nextActiveRefreshAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</div>
              <div className="yt-status-subline">{ytStatus?.noChangeStreak > 0 ? `Backoff: ${ytStatus.noChangeStreak}x idle` : 'Normal tracking'}</div>
            </div>
          </div>

          <div className="yt-status-meta-grid">
            <div className="yt-meta-item">
              <span>Last Active Refresh</span>
              <strong>{ytStatus?.lastActiveRefreshAt ? new Date(ytStatus.lastActiveRefreshAt).toLocaleTimeString() : 'N/A'}</strong>
            </div>
            <div className="yt-meta-item">
              <span>Last Archive Refresh</span>
              <strong>{ytStatus?.lastArchiveRefreshAt ? new Date(ytStatus.lastArchiveRefreshAt).toLocaleTimeString() : 'N/A'}</strong>
            </div>
            <div className="yt-meta-item">
              <span>Pool Rebuild</span>
              <strong>{ytStatus?.lastPoolRebuildAt ? new Date(ytStatus.lastPoolRebuildAt).toLocaleTimeString() : 'N/A'}</strong>
            </div>
          </div>

          <div className="yt-status-action-row">
            <button className="btn btn-primary" onClick={handleRefreshYouTube} disabled={refreshing || statusLoading}>
              {refreshing ? 'Refreshing...' : 'Refresh All Videos Now'}
            </button>
            <div className="yt-status-note">Uses 1 API unit per 50 videos — only admins can trigger this.</div>
          </div>
        </div>

        {/* ─── SYSTEM LOGS ─── */}
        <div className="yt-logs-panel">
           <div className="yt-status-label" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
             <span>Live System Logs</span>
             <button onClick={loadYouTubeLogs} className="btn-sync-small">Refresh Logs</button>
           </div>
           <div className="yt-logs-container">
             {ytLogs.length === 0 ? (
               <div className="yt-log-item">No logs available.</div>
             ) : (
               ytLogs.map((log, i) => (
                 <div key={i} className={`yt-log-item yt-log-${log.type}`}>
                   <span className="yt-log-ts">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                   <span className="yt-log-msg">{log.message}</span>
                   {log.responseTime !== undefined && (
                     <span className="yt-log-meta">
                       {log.responseTime}ms · {log.units}u {log.statusCode && `· ${log.statusCode}`}
                     </span>
                   )}
                 </div>
               ))
             )}
           </div>
        </div>
      </header>

      {/* Content count cards only — no message boxes */}
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
            <input className="admin-input" value={stats.projects} onChange={e => setStats({...stats, projects: e.target.value})} />
        </div>
        <div className="admin-form-group">
            <label className="admin-label">Clients</label>
            <input className="admin-input" value={stats.clients} onChange={e => setStats({...stats, clients: e.target.value})} />
        </div>
        <div className="admin-form-group">
            <label className="admin-label">Years</label>
            <input className="admin-input" value={stats.years} onChange={e => setStats({...stats, years: e.target.value})} />
        </div>
        <button className="btn btn-primary" onClick={handleStatsSave}>Save Stats</button>
      </div>

      </>
      )}
      
      {statusMsg && <div style={{ marginTop: '20px', color: '#4ade80' }}>{statusMsg}</div>}
    </div>
  )
}
