/** Normalize tag field from API item */
export function itemTagsList(item) {
  if (Array.isArray(item.tag)) return item.tag.map(t => String(t).trim()).filter(Boolean)
  if (typeof item.tag === 'string') return item.tag.split(',').map(t => t.trim()).filter(Boolean)
  return []
}

/** Rough numeric views for sorting (handles "1.2M", "890K", plain numbers) */
export function parseViews(v) {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return v
  const s = String(v).trim().toUpperCase()
  const m = s.match(/^([\d.]+)\s*([KMB])?$/i)
  if (!m) return parseInt(s.replace(/,/g, ''), 10) || 0
  let n = parseFloat(m[1])
  const u = m[2]
  if (u === 'K') n *= 1e3
  else if (u === 'M') n *= 1e6
  else if (u === 'B') n *= 1e9
  return n
}

export function matchesSearch(item, q) {
  if (!q?.trim()) return true
  const t = q.trim().toLowerCase()
  const title = (item.title || '').toLowerCase()
  const client = (item.client || '').toLowerCase()
  const blob = itemTagsList(item).join(' ').toLowerCase()
  return title.includes(t) || client.includes(t) || blob.includes(t)
}

export function sortWorkItems(items, sort) {
  const copy = [...items]
  if (sort === 'featured') {
    copy.sort((a, b) => {
      const f = (b.featured === true ? 1 : 0) - (a.featured === true ? 1 : 0)
      if (f !== 0) return f
      return (b.id || 0) - (a.id || 0)
    })
  } else if (sort === 'latest') {
    copy.sort((a, b) => (b.id || 0) - (a.id || 0))
  } else if (sort === 'views') {
    copy.sort((a, b) => parseViews(b.views) - parseViews(a.views))
  }
  return copy
}

export function extractVideoId(url) {
  if (!url) return null
  const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/
  const match = url.match(regExp)
  return (match && match[2].length === 11) ? match[2] : null
}

export function thumbUrl(item) {
  // If a manual thumbnail is provided, use it
  if (item.thumbnail || item.imageUrl) return item.thumbnail || item.imageUrl
  
  // Otherwise, if it's a YouTube link, fetch the highest quality (maxresdefault)
  const vid = extractVideoId(item.link)
  if (vid) {
    // Using i.ytimg.com/vi/[id]/maxresdefault.jpg for highest quality
    return `https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`
  }
  
  return ''
}

export function videoThumbUrl(item) {
  return thumbUrl(item)
}
