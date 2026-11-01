import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Long text shown in full on demand: collapsed to `lines` lines with a "Show more" toggle,
 * which only appears when the text really is longer. Nothing is ever cut silently.
 */
export default function ExpandableText({ text, lines = 5, className = '' }) {
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || open) return
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, lines, open])

  if (!text) return null
  return (
    <div>
      <p ref={ref} className={className}
        style={open ? undefined : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, overflow: 'hidden' }}>
        {text}
      </p>
      {(overflows || open) && (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
          className="mt-1 text-xs font-medium text-sky-300 hover:underline">
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}
