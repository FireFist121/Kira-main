import './Marquee.css'

const ITEMS = [
  'THUMBNAIL DESIGN', 'VIDEO EDITING', 'COLOR GRADING',
  'MOTION GRAPHICS', 'BRAND IDENTITY', 'SOCIAL MEDIA',
]

export default function Marquee({ items }) {
  const displayItems = items 
    ? items.split(',').map(s => s.trim()).filter(Boolean)
    : ITEMS

  // Ensure we have enough items to fill the track and loop seamlessly
  let list = [...displayItems]
  if (list.length > 0) {
    while (list.length < 10) {
      list = [...list, ...displayItems]
    }
  }
  
  const doubled = [...list, ...list]
  return (
    <div className="marquee-strip">
      <div className="marquee-track">
        {doubled.map((item, i) => (
          <span key={i} className="marquee-item">
            {item}
            <span className="marquee-dot">✦</span>
          </span>
        ))}
      </div>
    </div>
  )
}
