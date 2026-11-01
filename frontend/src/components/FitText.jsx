import { useLayoutEffect, useRef } from 'react'

/**
 * Single-line text that shrinks to fit its parent's content box.
 *
 * Measures the real rendered width (letters differ: "Mdm2" is far wider than "Il6"), so no
 * per-symbol or per-length tuning is needed. Re-fits when the box resizes or web fonts load.
 * Font size is set imperatively, so pass it as `max`, never via `style`.
 */
export default function FitText({ children, max, min = 8, className = '', style }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    const box = el?.parentElement
    if (!el || !box) return
    const fit = () => {
      el.style.fontSize = `${max}px`
      const cs = getComputedStyle(box)
      const available = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 1
      const natural = el.offsetWidth
      if (available <= 0 || natural <= available) return
      el.style.fontSize = `${Math.max(min, Math.floor((max * available * 10) / natural) / 10)}px`
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(box)
    document.fonts?.ready.then(fit)
    return () => ro.disconnect()
  }, [children, max, min])

  return (
    <span ref={ref} data-fit-text="" className={`inline-block self-center whitespace-nowrap ${className}`} style={style}>
      {children}
    </span>
  )
}
