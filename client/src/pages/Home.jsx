import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Hero from '../components/Hero'
import Marquee from '../components/Marquee'
import About from '../components/About'
import Contact from '../components/Contact'
import ProjectCard from '../components/platform/ProjectCard'
import ConfirmModal from '../components/platform/ConfirmModal'
import { useAuth } from '../context/AuthContext'
import { getWork, deleteWork } from '../api'
import {
  itemTagsList,
  matchesSearch,
  sortWorkItems,
  thumbUrl,
  videoThumbUrl,
} from '../components/platform/utils'
import useScrollReveal from '../hooks/useScrollReveal'
import './Home.css'

const ITEMS_PER_PAGE = 6

const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'latest', label: 'Latest' },
  { value: 'views', label: 'Most Viewed' },
]

/* ─── Section Title — clean centered text only ─── */
function SectionTitle({ label }) {
  return (
    <div className="glass-section-title">
      <span className="glass-section-label">{label}</span>
    </div>
  )
}

/* ─── Search + Filter Bar ─── */
function SectionFilterBar({ searchQuery, onSearchChange, sort, onSortChange, category, onCategoryChange, categories, placeholder }) {
  return (
    <div className="section-filter-bar">
      <div className="section-filter-search">
        <svg className="section-filter-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder || 'Search by title, tag...'}
          className="section-filter-input"
        />
      </div>
      <div className="section-filter-selects">
        <div className="section-filter-select-wrap">
          <span className="section-filter-select-label">Sort</span>
          <select value={sort} onChange={(e) => onSortChange(e.target.value)} className="section-filter-select">
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="section-filter-select-wrap">
          <span className="section-filter-select-label">Category</span>
          <select value={category} onChange={(e) => onCategoryChange(e.target.value)} className="section-filter-select">
            {(categories || []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}

/* ─── Toggle Button ─── */
function ToggleButton({ expanded, onToggle, totalCount }) {
  if (totalCount <= ITEMS_PER_PAGE) return null
  return (
    <div className="toggle-btn-wrap">
      <button className="toggle-btn" onClick={onToggle}>
        {expanded ? 'View Less' : 'View More'}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </div>
  )
}

export default function Home({ data }) {
  useScrollReveal([data])
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [workData, setWorkData] = useState([])
  const [modalImage, setModalImage] = useState(null)

  // Confirm modal state
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  // Per-section state
  const [thumbSearch, setThumbSearch] = useState('')
  const [thumbSort, setThumbSort] = useState('featured')
  const [thumbCategory, setThumbCategory] = useState('All')
  const [thumbExpanded, setThumbExpanded] = useState(false)

  const [videoSearch, setVideoSearch] = useState('')
  const [videoSort, setVideoSort] = useState('featured')
  const [videoCategory, setVideoCategory] = useState('All')
  const [videoExpanded, setVideoExpanded] = useState(false)

  const [shortSearch, setShortSearch] = useState('')
  const [shortSort, setShortSort] = useState('featured')
  const [shortCategory, setShortCategory] = useState('All')
  const [shortExpanded, setShortExpanded] = useState(false)

  const loadWork = useCallback(async () => {
    try {
      const res = await getWork('all')
      const raw = res?.data?.data ?? res?.data
      const list = Array.isArray(raw) ? raw : []
      setWorkData(list)
    } catch (e) {
      console.error('Failed to load work', e)
      setWorkData([])
    }
  }, [])

  useEffect(() => {
    loadWork()
  }, [loadWork])

  useEffect(() => { setThumbExpanded(false) }, [thumbSearch, thumbSort, thumbCategory])
  useEffect(() => { setVideoExpanded(false) }, [videoSearch, videoSort, videoCategory])
  useEffect(() => { setShortExpanded(false) }, [shortSearch, shortSort, shortCategory])

  const categories = useMemo(() => {
    const tags = new Set()
    workData.forEach(item => itemTagsList(item).forEach(t => tags.add(String(t).trim().toLowerCase())))
    return ['All', ...Array.from(tags)]
  }, [workData])

  const filterItems = (items, search, sort, category) => {
    let filtered = items.filter(item => {
      if (!matchesSearch(item, search)) return false
      if (category !== 'All') {
        const tags = itemTagsList(item)
        if (!tags.some(t => String(t).trim().toLowerCase() === category.toLowerCase())) return false
      }
      return true
    })
    return sortWorkItems(filtered, sort)
  }

  const allThumbnails = useMemo(() => workData.filter(i => {
    const t = String(i.type || 'thumbnail').toLowerCase()
    return t === 'thumbnail' || t === 'slider'
  }), [workData])
  const allVideos = useMemo(() => workData.filter(i => String(i.type || '').toLowerCase() === 'video'), [workData])
  const allShorts = useMemo(() => workData.filter(i => String(i.type || '').toLowerCase() === 'short'), [workData])

  const filteredThumbnails = useMemo(() => filterItems(allThumbnails, thumbSearch, thumbSort, thumbCategory), [allThumbnails, thumbSearch, thumbSort, thumbCategory])
  const filteredVideos = useMemo(() => filterItems(allVideos, videoSearch, videoSort, videoCategory), [allVideos, videoSearch, videoSort, videoCategory])
  const filteredShorts = useMemo(() => filterItems(allShorts, shortSearch, shortSort, shortCategory), [allShorts, shortSearch, shortSort, shortCategory])

  const thumbsDisplay = thumbExpanded ? filteredThumbnails : filteredThumbnails.slice(0, ITEMS_PER_PAGE)
  const videosDisplay = videoExpanded ? filteredVideos : filteredVideos.slice(0, ITEMS_PER_PAGE)
  const shortsDisplay = shortExpanded ? filteredShorts : filteredShorts.slice(0, ITEMS_PER_PAGE)

  // Admin actions
  const handleEdit = (item) => {
    const itemId = item.id || item._id
    window.location.href = `/admin/edit/${itemId}`
  }

  const handleDeleteRequest = (item) => {
    setDeleteTarget(item)
    setConfirmOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      await deleteWork(deleteTarget.id)
      setConfirmOpen(false)
      setDeleteTarget(null)
      loadWork() // Refresh the data
    } catch (e) {
      console.error('Failed to delete', e)
      alert('Failed to delete item. Try again.')
    }
  }

  const handleDeleteCancel = useCallback(() => {
    setConfirmOpen(false)
    setDeleteTarget(null)
  }, [])

  // Modal
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') setModalImage(null) }
    if (modalImage) {
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', handleKey)
    } else {
      document.body.style.overflow = 'auto'
    }
    return () => document.removeEventListener('keydown', handleKey)
  }, [modalImage])

  return (
    <div className="relative w-full h-full">
      <Hero data={data} />
      <Marquee items={data.marqueeText} />

      {/* ═══ SECTION 1: THUMBNAILS ═══ */}
      <section id="thumbnails" className="content-section">
        <div className="content-section-inner">
          <SectionTitle label="Thumbnails" />
          <SectionFilterBar
            searchQuery={thumbSearch} onSearchChange={setThumbSearch}
            sort={thumbSort} onSortChange={setThumbSort}
            category={thumbCategory} onCategoryChange={setThumbCategory}
            categories={categories} placeholder="Search thumbnails..."
          />
          {filteredThumbnails.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">🖼️</div><p>No thumbnails match your filters.</p></div>
          ) : (
            <>
              <div className="content-grid">
                {thumbsDisplay.map(item => (
                  <ProjectCard
                    key={item.id || item._id}
                    title={item.title}
                    image={thumbUrl(item)}
                    tags={itemTagsList(item)}
                    views={item.views || ''}
                    client={item.client || ''}
                    link={item.link || ''}
                    type={item.type || 'thumbnail'}
                    beforeImage={item.beforeImage}
                    afterImage={item.afterImage}
                    onClick={thumbUrl(item) ? () => setModalImage(thumbUrl(item)) : undefined}
                    isAdmin={isAdmin}
                    onEdit={() => handleEdit(item)}
                    onDelete={() => handleDeleteRequest(item)}
                  />
                ))}
              </div>
              <ToggleButton expanded={thumbExpanded} onToggle={() => setThumbExpanded(!thumbExpanded)} totalCount={filteredThumbnails.length} />
            </>
          )}
        </div>
      </section>

      {/* ═══ SECTION 2: VIDEOS ═══ */}
      <section id="videos" className="content-section">
        <div className="content-section-inner">
          <SectionTitle label="Videos" />
          <SectionFilterBar
            searchQuery={videoSearch} onSearchChange={setVideoSearch}
            sort={videoSort} onSortChange={setVideoSort}
            category={videoCategory} onCategoryChange={setVideoCategory}
            categories={categories} placeholder="Search videos..."
          />
          {filteredVideos.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">🎬</div><p>No videos match your filters.</p></div>
          ) : (
            <>
              <div className="content-grid">
                {videosDisplay.map(video => (
                  <ProjectCard
                    key={video.id || video._id}
                    title={video.title}
                    image={videoThumbUrl(video)}
                    tags={itemTagsList(video)}
                    views={video.views || ''}
                    client={video.client || ''}
                    link={video.link || ''}
                    type="video"
                    isAdmin={isAdmin}
                    onEdit={() => handleEdit(video)}
                    onDelete={() => handleDeleteRequest(video)}
                  />
                ))}
              </div>
              <ToggleButton expanded={videoExpanded} onToggle={() => setVideoExpanded(!videoExpanded)} totalCount={filteredVideos.length} />
            </>
          )}
        </div>
      </section>

      {/* ═══ SECTION 3: SHORTS ═══ */}
      <section id="shorts" className="content-section">
        <div className="content-section-inner">
          <SectionTitle label="Shorts" />
          <SectionFilterBar
            searchQuery={shortSearch} onSearchChange={setShortSearch}
            sort={shortSort} onSortChange={setShortSort}
            category={shortCategory} onCategoryChange={setShortCategory}
            categories={categories} placeholder="Search shorts..."
          />
          {filteredShorts.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">📱</div><p>No shorts match your filters.</p></div>
          ) : (
            <>
              <div className="content-grid">
                {shortsDisplay.map(short => (
                  <ProjectCard
                    key={short.id || short._id}
                    title={short.title}
                    image={videoThumbUrl(short)}
                    tags={itemTagsList(short)}
                    views={short.views || ''}
                    client={short.client || ''}
                    link={short.link || ''}
                    type="short"
                    isAdmin={isAdmin}
                    onEdit={() => handleEdit(short)}
                    onDelete={() => handleDeleteRequest(short)}
                  />
                ))}
              </div>
              <ToggleButton expanded={shortExpanded} onToggle={() => setShortExpanded(!shortExpanded)} totalCount={filteredShorts.length} />
            </>
          )}
        </div>
      </section>

      <About data={data?.profile || {}} />
      <Contact />

      {/* ─── IMAGE MODAL ─── */}
      {modalImage && (
        <div className="image-modal-overlay" onClick={() => setModalImage(null)} role="presentation">
          <div className="image-modal-content" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Image preview">
            <button type="button" className="image-modal-close" onClick={() => setModalImage(null)} aria-label="Close">×</button>
            <div className="image-modal-img-wrap">
              <img src={modalImage} alt="Preview" className="image-modal-img" />
            </div>
          </div>
        </div>
      )}

      {/* ─── DELETE CONFIRMATION MODAL ─── */}
      <ConfirmModal
        isOpen={confirmOpen}
        title={`Delete "${deleteTarget?.title || 'Item'}"?`}
        message="This action cannot be undone. The item will be permanently removed from your portfolio."
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  )
}
