import { useState, useEffect } from 'react'
import { FiGrid, FiImage, FiPlay, FiSmartphone, FiSettings, FiLogOut, FiUsers } from 'react-icons/fi'
import AdminOverview from './AdminOverview'
import AdminProjects from './AdminProjects'
import AdminCreators from './AdminCreators'
import './AdminDashboard.css'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: <FiGrid size={18} /> },
]

const CONTENT_ITEMS = [
  { id: 'thumbnails', label: 'Thumbnails', icon: <FiImage size={18} /> },
  { id: 'videos', label: 'Videos', icon: <FiPlay size={18} /> },
  { id: 'shorts', label: 'Shorts', icon: <FiSmartphone size={18} /> },
  { id: 'creators', label: 'Creators', icon: <FiUsers size={18} /> },
]

const SETTING_ITEMS = [
  { id: 'settings', label: 'Settings', icon: <FiSettings size={18} /> },
]

export default function AdminDashboard({ onLogout }) {
  const [tab, setTab] = useState('dashboard')
  const [editId, setEditId] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Parse hash on mount: #edit-thumbnails-<id>, #edit-videos-<id>, #edit-shorts-<id>
  useEffect(() => {
    const hash = window.location.hash.replace('#', '')
    if (hash.startsWith('edit-')) {
      const parts = hash.split('-')
      // edit-thumbnails-abc123 or edit-videos-abc123
      const section = parts[1] // thumbnails, videos, shorts
      const id = parts.slice(2).join('-') // handle ids with dashes
      if (section && id) {
        setTab(section)
        setEditId(id)
        // Clear hash so it doesn't re-trigger
        window.history.replaceState(null, '', window.location.pathname)
      }
    }
  }, [])

  const handleTabChange = (id) => {
    setTab(id)
    setEditId(null)
    setSidebarOpen(false)
  }

  return (
    <div className="dash-root">

      {/* ── MOBILE TOP BAR ── */}
      <div className="dash-mobile-header">
        <a href="/" className="dash-logo-link">
          <span className="dash-logo">KIR<span className="dash-logo-accent">4</span></span>
        </a>
        <button className="dash-hamburger" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar">
          <span />
          <span />
          <span />
        </button>
      </div>

      {/* ── OVERLAY ── */}
      <div
        className={`dash-overlay${sidebarOpen ? ' open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* ── SIDEBAR ── */}
      <aside className={`dash-sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="dash-logo-container">
          <a href="/" className="dash-logo-link">
            <span className="dash-logo">KIR<span className="dash-logo-accent">4</span></span>
          </a>
        </div>

        <nav className="dash-nav">
          {/* Main */}
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`dash-nav-btn${tab === item.id ? ' active' : ''}`}
              onClick={() => handleTabChange(item.id)}
            >
              <span className="dash-nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}

          {/* Content section */}
          <div className="dash-nav-section-label">Content</div>
          {CONTENT_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`dash-nav-btn${tab === item.id ? ' active' : ''}`}
              onClick={() => handleTabChange(item.id)}
            >
              <span className="dash-nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}

          <div className="dash-nav-spacer" />

          {/* Settings */}
          {SETTING_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`dash-nav-btn${tab === item.id ? ' active' : ''}`}
              onClick={() => handleTabChange(item.id)}
            >
              <span className="dash-nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="dash-sidebar-footer">
          <button className="dash-logout-btn" onClick={onLogout}>
            <FiLogOut size={14} />
            Logout
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="dash-main">
        <div className="dash-content">
          {tab === 'dashboard'  && <AdminOverview mode="dashboard" onNavigate={handleTabChange} />}
          {tab === 'thumbnails' && <AdminProjects category="thumbnail" editId={editId} onEditClear={() => setEditId(null)} />}
          {tab === 'videos'     && <AdminProjects category="video" editId={editId} onEditClear={() => setEditId(null)} />}
          {tab === 'shorts'     && <AdminProjects category="short" editId={editId} onEditClear={() => setEditId(null)} />}
          {tab === 'creators'   && <AdminCreators />}
          {tab === 'settings'   && <AdminOverview mode="settings" />}
        </div>
      </main>

    </div>
  )
}
