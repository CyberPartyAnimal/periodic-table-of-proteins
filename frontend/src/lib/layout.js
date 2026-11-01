import { useEffect, useState } from 'react'

export const PANEL_DEFAULT = 500
export const PANEL_MIN = 360
const PANEL_MAX_SHARE = 0.85 // of the window width

export const clampPanelWidth = (w) => Math.round(Math.min(Math.max(w, PANEL_MIN), window.innerWidth * PANEL_MAX_SHARE))

/**
 * How the details panel shares the screen:
 *  'push'    – the page (nearly) fills the screen: content moves aside to make room for the panel.
 *  'overlay' – a windowed browser: the panel floats over the content and the whole page can slide
 *              sideways (swipe / scroll) to bring anything underneath into view.
 *  'cover'   – phone width: the panel takes the whole screen.
 */
function currentMode() {
  const w = window.innerWidth
  if (w < 640) return 'cover'
  return w >= 1024 && w >= window.screen.availWidth * 0.9 ? 'push' : 'overlay'
}

export function useLayoutMode() {
  const [mode, setMode] = useState(currentMode)
  useEffect(() => {
    const update = () => setMode(currentMode())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return mode
}

/** The details panel's width: resizable by dragging, remembered in this browser. */
export function usePanelWidth() {
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('panelWidth'))
      return saved >= PANEL_MIN ? clampPanelWidth(saved) : PANEL_DEFAULT
    } catch { return PANEL_DEFAULT }
  })
  useEffect(() => { try { localStorage.setItem('panelWidth', String(width)) } catch { /* storage unavailable */ } }, [width])
  return [width, setWidth]
}
