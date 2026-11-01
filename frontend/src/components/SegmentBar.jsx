/**
 * A proportional bar split into separate rounded pills, one per segment.
 * Each pill has a minimum width, so tiny shares (e.g. 0.4% sulfur) stay visible
 * as a clean segment instead of a sliver clipped by the bar's rounded end.
 * segments: [{ key, value, color, label }]
 */
export default function SegmentBar({ segments, height = 8, minWidth = 6, className = '' }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1
  return (
    <div className={`flex w-full gap-[3px] ${className}`} style={{ height }} role="img"
      aria-label={segments.map((s) => `${s.label}: ${((s.value / total) * 100).toFixed(1)}%`).join(', ')}>
      {segments.filter((s) => s.value > 0).map((s) => (
        <span key={s.key} title={`${s.label}: ${((s.value / total) * 100).toFixed(1)}%`} className="rounded-full"
          style={{ flex: `${s.value} 1 0`, minWidth, background: s.color }} />
      ))}
    </div>
  )
}
