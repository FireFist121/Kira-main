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

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    try {
      const res = await getOverview()
      const d = res.data.data
      setData(d)
      if (d.stats) setStats(d.stats)
      getPortfolioData()
      loadYouTubeStatus()
    } catch (e) {
      console.error(e)
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
          Automatic 1-min active refresh · Daily archive rotation · Smart backoff protection.
        </p>
        <div className="yt-status-panel">
          <div className="yt-status-card yt-status-card--highlight">
            <div className="yt-status-label">Daily quota usage</div>
            <div className="yt-status-bar-wrap">
              <div className="yt-status-bar" style={{ width: ytStatus ? `${Math.min(100, (ytStatus.dailyQuotaUsage / ytStatus.dailyQuotaLimit) * 100)}%` : '0%' }} />
            </div>
            <div className="yt-status-meter">
              <span>{ytStatus ? `${ytStatus.dailyQuotaUsage} / ${ytStatus.dailyQuotaLimit} units` : 'Loading...'}</span>
              <span>Throttle at {ytStatus ? ytStatus.throttleAt : '8000'}/day</span>
            </div>
          </div>

          <div className="yt-status-grid">
            <div className="yt-status-tile">Active pool<br /><strong>{ytStatus ? `${ytStatus.activePoolSize} / ${ytStatus.activePoolLimit}` : '—'}</strong></div>
            <div className="yt-status-tile">Refresh interval<br /><strong>{ytStatus ? `${Math.round(ytStatus.refreshIntervalMs / 60000)}m` : '—'}</strong></div>
            <div className="yt-status-tile">No-change streak<br /><strong>{ytStatus ? `${ytStatus.noChangeStreak}x` : '—'}</strong></div>
            <div className="yt-status-tile">Archive batches<br /><strong>{ytStatus ? `${ytStatus.archiveBatches} batch` : '—'}</strong></div>
            <div className="yt-status-tile">Current batch<br /><strong>{ytStatus ? `#${ytStatus.currentArchiveBatch}` : '—'}</strong></div>
            <div className="yt-status-tile">Batch size<br /><strong>{ytStatus ? `${ytStatus.batchSize} videos` : '—'}</strong></div>
          </div>

          <div className="yt-status-meta">
            <div>{ytStatus ? `Last active refresh: ${ytStatus.lastActiveRefreshAt || 'N/A'}` : 'Loading...'}</div>
            <div>{ytStatus ? `Last archive refresh: ${ytStatus.lastArchiveRefreshAt || 'N/A'}` : ''}</div>
            <div>{ytStatus ? `Last pool rebuild: ${ytStatus.lastPoolRebuildAt || 'N/A'}` : ''}</div>
            <div>{ytStatus ? `Last manual refresh: ${ytStatus.lastManualRefreshAt || 'N/A'}` : ''}</div>
          </div>

          <div className="yt-status-action-row">
            <button className="btn btn-primary" onClick={handleRefreshYouTube} disabled={refreshing || statusLoading}>
              {refreshing ? 'Refreshing...' : 'Refresh All Videos Now'}
            </button>
            <div className="yt-status-note">Uses 1 API unit per 50 videos — only admins can trigger this.</div>
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

      <div className="admin-glass-form-card" style={{ marginTop: '24px' }}>
        <h3 className="admin-glass-form-title">Update Content</h3>
        <div className="admin-form-group">
            <label className="admin-label">Tagline</label>
            <input className="admin-input" value={content.tagline} onChange={e => setContent({...content, tagline: e.target.value})} />
        </div>
        <div className="admin-form-group">
            <label className="admin-label">Bio (Paragraph 1)</label>
            <textarea className="admin-input admin-textarea" value={content.bio1} onChange={e => setContent({...content, bio1: e.target.value})} />
        </div>
        <div className="admin-form-group">
            <label className="admin-label">Bio (Paragraph 2)</label>
            <textarea className="admin-input admin-textarea" value={content.bio2} onChange={e => setContent({...content, bio2: e.target.value})} />
        </div>
        <div className="admin-form-group">
            <label className="admin-label">Skills (Comma separated)</label>
            <input className="admin-input" value={content.skills} onChange={e => setContent({...content, skills: e.target.value})} />
        </div>
        <button className="btn btn-primary" onClick={handleContentSave}>Save Content</button>
      </div>
      </>
      )}
      
      {statusMsg && <div style={{ marginTop: '20px', color: '#4ade80' }}>{statusMsg}</div>}
    </div>
  )
}
