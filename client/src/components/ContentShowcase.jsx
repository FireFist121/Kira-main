import { useState, useEffect, useMemo } from 'react'
import { getWork } from '../api'
import ThumbnailCard from './platform/ThumbnailCard'
import VideoCard from './platform/VideoCard'
import ShortsCard from './platform/ShortsCard'
import PlatformFilterBar from './platform/PlatformFilterBar'
import {
  itemTagsList,
  matchesSearch,
  sortWorkItems,
  thumbUrl,
  videoThumbUrl,
} from './platform/utils'

const THUMB_PAGE = 12
const VIDEO_PAGE = 9
const SHORT_PAGE = 9

function SectionHeading({ eyebrow, title, subtitle }) {
  return (
    <div className="mb-8 text-center">
      {eyebrow ? (
        <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[#e5173f] sm:text-[11px]">{eyebrow}</p>
      ) : null}
      <h2 className="mt-3 text-4xl font-bold uppercase tracking-tight text-white sm:text-5xl md:text-6xl" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
        {title}
      </h2>
      {subtitle ? (
        <p className="mx-auto mt-3 max-w-2xl text-sm text-neutral-400 sm:text-base">{subtitle}</p>
      ) : null}
    </div>
  )
}

function LoadMoreButton({ onClick, visible, total }) {
  if (visible >= total) return null
  return (
    <div className="mt-10 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        className="group relative rounded-full border border-white/15 bg-white/5 px-8 py-3 text-sm font-semibold uppercase tracking-wider text-white overflow-hidden
          transition-all duration-500 hover:border-[#e5173f]/60 hover:bg-[#e5173f]/10 hover:scale-[1.05] hover:-translate-y-1
          hover:shadow-[0_10px_30px_-10px_rgba(229,23,63,0.4)]"
      >
        <span className="relative z-10">Load More</span>
        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/8 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
      </button>
    </div>
  )
}

function displayCategoryLabel(category) {
  return String(category || '')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function expandForShowcase(items, minCount, prefix) {
  if (!Array.isArray(items) || items.length === 0 || items.length >= minCount) return items
  const out = []
  for (let i = 0; i < minCount; i += 1) {
    const base = items[i % items.length]
    out.push({ ...base, id: `${prefix}-${base.id}-${i}` })
  }
  return out
}

const TABS = [
  {
    id: 'thumbnails',
    label: 'Thumbnails',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 9h6M9 13h6M9 17h4" />
      </svg>
    ),
  },
  {
    id: 'videos',
    label: 'Videos',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
  },
  {
    id: 'shorts',
    label: 'Shorts',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="7" y="2" width="10" height="20" rx="2" />
      </svg>
    ),
  },
]

export default function ContentShowcase({ id, title = 'Explore Content', subtitle }) {
  const [data, setData] = useState([])
  const [activeCategory, setActiveCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [sort, setSort] = useState('featured')
  const [modalImage, setModalImage] = useState(null)
  const [activeTab, setActiveTab] = useState('thumbnails') // 'thumbnails' | 'videos' | 'shorts'

  const [thumbLimit, setThumbLimit] = useState(THUMB_PAGE)
  const [videoLimit, setVideoLimit] = useState(VIDEO_PAGE)
  const [shortLimit, setShortLimit] = useState(SHORT_PAGE)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await getWork('all')
        const raw = res?.data?.data ?? res?.data
        const list = Array.isArray(raw) ? raw : []
        if (!cancelled) setData(list)
      } catch (e) {
        console.error('ContentShowcase: failed to load work', e)
        if (!cancelled) setData([])
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    setThumbLimit(THUMB_PAGE)
    setVideoLimit(VIDEO_PAGE)
    setShortLimit(SHORT_PAGE)
  }, [searchQuery, sort, activeCategory])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setModalImage(null)
    }
    if (modalImage) {
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', handleKeyDown)
    } else {
      document.body.style.overflow = 'auto'
      document.removeEventListener('keydown', handleKeyDown)
    }
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [modalImage])

  const categories = useMemo(() => {
    const tags = new Set()
    data.forEach((item) => {
      itemTagsList(item).forEach((t) => tags.add(String(t).trim().toLowerCase()))
    })
    return ['All', ...Array.from(tags)]
  }, [data])

  useEffect(() => {
    setActiveCategory((prev) => (prev === 'All' || categories.includes(prev) ? prev : 'All'))
  }, [categories])

  const baseFiltered = useMemo(() => {
    return data.filter((item) => {
      if (!matchesSearch(item, searchQuery)) return false
      if (activeCategory !== 'All') {
        const tags = itemTagsList(item)
        if (!tags.some((t) => String(t).trim().toLowerCase() === activeCategory.toLowerCase())) return false
      }
      return true
    })
  }, [data, searchQuery, activeCategory])

  const filteredThumbnails = useMemo(() => {
    const list = baseFiltered.filter((item) => String(item.type || 'thumbnail').toLowerCase() === 'thumbnail')
    return sortWorkItems(list, sort)
  }, [baseFiltered, sort])

  const filteredVideos = useMemo(() => {
    const list = baseFiltered.filter((item) => String(item.type || '').toLowerCase() === 'video')
    return sortWorkItems(list, sort)
  }, [baseFiltered, sort])

  const filteredShorts = useMemo(() => {
    const list = baseFiltered.filter((item) => String(item.type || '').toLowerCase() === 'short')
    return sortWorkItems(list, sort)
  }, [baseFiltered, sort])

  const thumbnailsDisplay = useMemo(() => expandForShowcase(filteredThumbnails, 8, 'thumb'), [filteredThumbnails])
  const videosDisplay = useMemo(() => expandForShowcase(filteredVideos, 6, 'video'), [filteredVideos])
  const shortsDisplay = useMemo(() => expandForShowcase(filteredShorts, 6, 'short'), [filteredShorts])

  const thumbsSlice = thumbnailsDisplay.slice(0, thumbLimit)
  const videosSlice = videosDisplay.slice(0, videoLimit)
  const shortsSlice = shortsDisplay.slice(0, shortLimit)

  const goToLink = (link) => {
    if (link) window.open(link, '_blank', 'noopener,noreferrer')
  }

  const tabCounts = {
    thumbnails: filteredThumbnails.length,
    videos: filteredVideos.length,
    shorts: filteredShorts.length,
  }

  return (
    <section id={id} className="bg-[#0d0d0d] py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16">
        {/* ── HEADING ── */}
        <div className="mb-12 text-center">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.35em] text-[#e5173f] sm:text-[11px]">02 — Platform</p>
          <h2 className="text-5xl font-bold uppercase tracking-tight text-white sm:text-6xl md:text-7xl" style={{ fontFamily: "'Bebas Neue', sans-serif", lineHeight: 0.9 }}>
            {title}
          </h2>
          {subtitle ? (
            <p className="mx-auto mt-4 max-w-xl text-sm text-neutral-500 sm:text-base">{subtitle}</p>
          ) : null}
        </div>

        <PlatformFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sort={sort}
          onSortChange={setSort}
          category={activeCategory}
          onCategoryChange={setActiveCategory}
          categories={categories}
          formatCategoryLabel={displayCategoryLabel}
        />

        {/* ─── TABS UI ─── */}
        <div className="mt-8 mb-14 flex justify-center">
          <div className="inline-flex gap-1.5 rounded-2xl bg-white/[0.03] p-1.5 border border-white/8 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 rounded-xl px-5 py-2.5 text-[12px] font-bold uppercase tracking-widest transition-all duration-300 overflow-hidden
                  ${activeTab === tab.id
                    ? 'bg-[#e5173f] text-white shadow-[0_4px_20px_rgba(229,23,63,0.45)] scale-105'
                    : 'text-neutral-400 hover:text-white hover:bg-white/6 hover:scale-[1.02]'
                  }`}
              >
                {/* Shimmer on hover */}
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] hover:translate-x-[200%] transition-transform duration-600" />
                <span className="relative z-10 flex items-center gap-2">
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label.slice(0, 3)}</span>
                  {tabCounts[tab.id] > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black leading-none
                      ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-white/10 text-neutral-400'}`}>
                      {tabCounts[tab.id]}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ─── CONTENT AREA ─── */}
        <div className="min-h-[400px]">

          {/* Thumbnails */}
          {activeTab === 'thumbnails' && (
            <div className="tab-content-enter">
              {filteredThumbnails.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <div className="text-5xl opacity-20">🖼️</div>
                  <p className="text-sm text-neutral-500">No thumbnails match your filters.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 xl:grid-cols-4">
                    {thumbsSlice.map((item) => {
                      const img = thumbUrl(item)
                      return (
                        <ThumbnailCard
                          key={item.id}
                          title={item.title}
                          image={img}
                          showTitleOverlay={Boolean(item.title)}
                          onClick={() => goToLink(item.link)}
                        />
                      )
                    })}
                  </div>
                  <LoadMoreButton
                    onClick={() => setThumbLimit((n) => n + THUMB_PAGE)}
                    visible={thumbLimit}
                    total={thumbnailsDisplay.length}
                  />
                </>
              )}
            </div>
          )}

          {/* Videos */}
          {activeTab === 'videos' && (
            <div className="tab-content-enter">
              {filteredVideos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <div className="text-5xl opacity-20">🎬</div>
                  <p className="text-sm text-neutral-500">No videos match your filters.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3 xl:grid-cols-4">
                    {videosSlice.map((video) => {
                      const tags = itemTagsList(video)
                      const category = tags[0] || 'Video'
                      return (
                        <VideoCard
                          key={video.id}
                          title={video.title}
                          image={videoThumbUrl(video)}
                          views={video.views ?? ''}
                          category={category}
                          tags={tags}
                          author={video.client || ''}
                          duration={video.duration || ''}
                          onClick={() => goToLink(video.link)}
                        />
                      )
                    })}
                  </div>
                  <LoadMoreButton
                    onClick={() => setVideoLimit((n) => n + VIDEO_PAGE)}
                    visible={videoLimit}
                    total={videosDisplay.length}
                  />
                </>
              )}
            </div>
          )}

          {/* Shorts */}
          {activeTab === 'shorts' && (
            <div className="tab-content-enter">
              {filteredShorts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <div className="text-5xl opacity-20">📱</div>
                  <p className="text-sm text-neutral-500">No shorts match your filters.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 sm:gap-7 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5">
                    {shortsSlice.map((short) => (
                      <ShortsCard
                        key={short.id}
                        title={short.title}
                        image={videoThumbUrl(short)}
                        views={short.views ?? ''}
                        tags={itemTagsList(short)}
                        onClick={() => goToLink(short.link)}
                      />
                    ))}
                  </div>
                  <LoadMoreButton
                    onClick={() => setShortLimit((n) => n + SHORT_PAGE)}
                    visible={shortLimit}
                    total={shortsDisplay.length}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── MODAL ─── */}
      {modalImage && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 p-4 backdrop-blur-md"
          onClick={() => setModalImage(null)}
          role="presentation"
        >
          <div
            className="relative w-full max-w-[min(1920px,100vw)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
          >
            <button
              type="button"
              className="absolute -top-12 right-0 h-10 w-10 flex items-center justify-center rounded-full bg-white/10 text-xl leading-none text-white/80 transition-all hover:text-white hover:bg-white/20 hover:scale-110"
              onClick={() => setModalImage(null)}
              aria-label="Close"
            >
              ×
            </button>
            <div className="aspect-video max-h-[min(1080px,90vh)] w-full overflow-hidden rounded-2xl bg-neutral-950 shadow-2xl ring-1 ring-white/10">
              <img src={modalImage} alt="Preview" className="h-full w-full object-contain" />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
