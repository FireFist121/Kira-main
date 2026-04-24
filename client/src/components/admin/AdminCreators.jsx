import { useState, useEffect } from 'react'
import { getPortfolio, updateContent } from '../../api'
import { FiPlus, FiTrash2 } from 'react-icons/fi'

export default function AdminCreators() {
  const [creators, setCreators] = useState([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    try {
      const res = await getPortfolio()
      if (res.data.success && res.data.data) {
        const text = res.data.data.marqueeText || ''
        const list = text.split(',').map(s => s.trim()).filter(Boolean)
        setCreators(list)
      }
    } catch (e) {
      console.error('Failed to load creators', e)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    if (creators.includes(newName.trim())) {
      setStatus('Name already exists')
      return
    }
    const updated = [...creators, newName.trim()]
    setCreators(updated)
    setNewName('')
    save(updated)
  }

  const handleRemove = (name) => {
    const updated = creators.filter(c => c !== name)
    setCreators(updated)
    save(updated)
  }

  const save = async (list) => {
    try {
      await updateContent({ marqueeText: list.join(', ') })
      setStatus('Updated successfully')
      setTimeout(() => setStatus(''), 3000)
    } catch (e) {
      console.error('Save error', e)
      setStatus('Failed to save')
    }
  }

  if (loading) return <div className="admin-loading-state">Loading...</div>

  return (
    <div className="admin-section">
      <header className="dash-dashboard-header">
        <span className="dash-dashboard-eyebrow">Marquee Content</span>
        <h1 className="dash-page-title dash-dashboard-title">Manage Creator Names</h1>
        <div className="dash-dashboard-title-line" aria-hidden />
        <p className="dash-dashboard-sub">
          These names will scroll in the motion line on your homepage.
        </p>
      </header>

      <div className="admin-glass-form-card">
        <form onSubmit={handleAdd} className="admin-creator-add-form">
          <div className="admin-form-group">
            <label className="admin-label">Add Creator Name</label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <input 
                className="admin-input" 
                placeholder="e.g. MrBeast" 
                value={newName} 
                onChange={e => setNewName(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '0 20px' }}>
                <FiPlus />
              </button>
            </div>
          </div>
        </form>

        <div className="admin-creators-list" style={{ marginTop: '32px' }}>
          <h4 className="admin-glass-form-title" style={{ fontSize: '14px', marginBottom: '16px', opacity: 0.7 }}>
            Active Creators ({creators.length})
          </h4>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {creators.length === 0 ? (
              <p style={{ opacity: 0.5, fontSize: '14px' }}>No creators added yet. Using default skills.</p>
            ) : (
              creators.map(name => (
                <div key={name} className="admin-creator-tag">
                  <span>{name}</span>
                  <button onClick={() => handleRemove(name)} className="admin-creator-remove">
                    <FiTrash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {status && <div style={{ marginTop: '20px', color: status.includes('Failed') ? '#ef4444' : '#4ade80', fontSize: '14px' }}>{status}</div>}
      </div>

      <style>{`
        .admin-creator-tag {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 14px;
          color: #fff;
          transition: all 0.2s;
        }
        .admin-creator-tag:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(229, 23, 63, 0.3);
        }
        .admin-creator-remove {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.4);
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 2px;
          transition: color 0.2s;
        }
        .admin-creator-remove:hover {
          color: #ef4444;
        }
        .admin-loading-state {
          padding: 40px;
          text-align: center;
          opacity: 0.6;
        }
      `}</style>
    </div>
  )
}
