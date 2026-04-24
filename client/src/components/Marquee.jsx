import './Marquee.css'

const ITEMS = [
  'THUMBNAIL DESIGN', 'VIDEO EDITING', 'COLOR GRADING',
  'MOTION GRAPHICS', 'BRAND IDENTITY', 'SOCIAL MEDIA',
]

export default function Marquee({ items }) {
  const displayItems = items 
    ? items.split(',').map(s => s.trim()).filter(Boolean)
    : ITEMS

  const doubled = [...displayItems, ...displayItems]
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
