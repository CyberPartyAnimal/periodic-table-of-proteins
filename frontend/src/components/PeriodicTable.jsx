import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Tile from './Tile'
import MisfoldBlock from './MisfoldBlock'
import { FADED_COLOR, anyFilterActive, isInert, isLinkInert, proteinState, scopeRole } from '../lib/filters'
import { EFFECTS, effectBetween } from '../lib/effects'

const cellKey = (p) => `${p.family}|${p.location}`

// Grid geometry. The table's minimum width is computed from these so the tiles can never spill past it.
const LABEL_COL = 96
const GAP = 5

/**
 * Curved line between two points, bowed sideways so overlapping lines stay readable.
 * `trim` pulls the end back to the tile edge so arrowheads aren't hidden under the symbol.
 */
function curve(a, b, trim = 0) {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  const k = 0.18
  const c = { x: mx - dy * k, y: my + dx * k }
  const len = Math.hypot(c.x - b.x, c.y - b.y) || 1
  const end = { x: b.x + ((c.x - b.x) / len) * trim, y: b.y + ((c.y - b.y) / len) * trim }
  return `M${a.x},${a.y} Q${c.x},${c.y} ${end.x},${end.y}`
}

// Which partner represents a cell when several share it: curated effects first, then score.
const EFFECT_RANK = { activates: 0, inhibits: 0, both: 1, regulates: 2, binds: 3 }

/** Narrowest the table can be before its tiles would spill past its edges. */
export const tableMinWidth = (families, narrow = false) => LABEL_COL + families * ((narrow ? 52 : 64) + GAP) + 2 * 12

export default function PeriodicTable({ data, filters, selectedId, partners, showInteractions, narrow = false, pageScrolls = false, onSelect, onPrefetch }) {
  const wrapRef = useRef(null)
  const cellEls = useRef({})
  const misEls = useRef({})
  const [openCell, setOpenCell] = useState(null)
  const [hoverMis, setHoverMis] = useState(null)
  const [layout, setLayout] = useState({ w: 0, h: 0, tick: 0 })
  const [lines, setLines] = useState([])

  const colors = useMemo(() => Object.fromEntries(data.families.map((f) => [f.code, f.color])), [data])
  const byId = useMemo(() => Object.fromEntries(data.proteins.map((p) => [p.id, p])), [data])
  const cells = useMemo(() => {
    const out = {}
    for (const p of data.proteins) (out[cellKey(p)] ??= []).push(p)
    for (const list of Object.values(out)) list.sort((a, b) => a.cell_rank - b.cell_rank)
    return out
  }, [data])

  const partnerEffect = useMemo(() => new Map((partners || []).map((p) => [p.id, effectBetween(p).effect])), [partners])
  const selected = selectedId ? byId[selectedId] : null

  // Pick which member of a crowded cell is shown on top.
  function arrange(members) {
    const rank = (p) => {
      if (p.id === selectedId || p.id === hoverMis) return 0
      if (showInteractions && partnerEffect.has(p.id)) return 1 + EFFECT_RANK[partnerEffect.get(p.id)] / 10
      const s = proteinState(p, filters)
      return s === 'on' ? 2 : s === 'dim' ? 3 : 4
    }
    return [...members].sort((a, b) => rank(a) - rank(b) || a.cell_rank - b.cell_rank)
  }

  // Track size changes so interaction lines stay attached to tiles.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setLayout((l) => ({ w: el.scrollWidth, h: el.scrollHeight, tick: l.tick + 1 })))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const base = wrap.getBoundingClientRect()
    const center = (el) => {
      const r = el.getBoundingClientRect()
      return { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 }
    }
    const next = []
    if (selected && showInteractions) {
      const from = cellEls.current[cellKey(selected)]
      const best = new Map() // cell -> representative partner
      for (const pt of partners || []) {
        const target = byId[pt.id]
        if (!target || proteinState(target, filters) === 'hidden') continue
        const key = cellKey(target)
        if (key === cellKey(selected)) continue
        const { effect, outward } = effectBetween(pt)
        // A line fades with its proteins: if either end is faded by a filter or outside the chosen pathway.
        const inert = isInert(target, filters) || isInert(selected, filters) || isLinkInert(selected.id, target.id, filters) ||
          proteinState(target, filters) === 'dim' || proteinState(selected, filters) === 'dim'
        const cand = { score: pt.score, effect, outward, inert }
        const prev = best.get(key)
        const rank = (c) => (c.inert ? 10 : 0) + EFFECT_RANK[c.effect]
        if (!prev || rank(cand) < rank(prev) || (rank(cand) === rank(prev) && pt.score > prev.score)) best.set(key, cand)
      }
      if (from) {
        for (const [key, { score, effect, outward, inert }] of best) {
          const to = cellEls.current[key]
          if (!to) continue
          const [a, b] = outward ? [center(from), center(to)] : [center(to), center(from)]
          if (inert) {
            next.push({ id: `i-${key}`, d: curve(a, b), color: FADED_COLOR, opacity: 1, width: 1.5, effect: null })
            continue
          }
          const directed = EFFECTS[effect].marker
          next.push({
            id: `i-${key}`, d: curve(a, b, directed ? 30 : 0), color: EFFECTS[effect].color, effect,
            opacity: effect === 'binds' ? 0.25 + score * 0.4 : 0.95, width: effect === 'binds' ? 1 + score : 2.2,
          })
        }
      }
    }
    if (hoverMis) {
      const p = byId[hoverMis]
      const a = misEls.current[hoverMis]
      const b = cellEls.current[cellKey(p)]
      if (a && b) next.push({ id: 'mis', d: curve(center(a), center(b)), color: '#f87171', opacity: 0.9, width: 2, dashed: true })
    }
    setLines(next)
  }, [selected, partners, showInteractions, hoverMis, layout, filters, byId])

  // Close the cell list on outside click / Escape.
  useEffect(() => {
    if (!openCell) return
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return
      if (e.type === 'mousedown' && e.target.closest?.('[data-cell-popover]')) return
      setOpenCell(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
    }
  }, [openCell])

  const ringFor = (p) => {
    if (isInert(p, filters) || proteinState(p, filters) === 'dim') return null
    if (showInteractions && partnerEffect.has(p.id) && !isLinkInert(selectedId, p.id, filters)) return EFFECTS[partnerEffect.get(p.id)].color
    if (filters.pathway && p.pathways.includes(filters.pathway)) return data.pathways.find((x) => x.code === filters.pathway)?.color
    if (filters.search && scopeRole(p, filters) === 'member') return '#fde047'
    return null
  }

  return (
    // Full screen: the table narrows (smaller minimum tile width) to sit beside the panel. Windowed: the whole
    // page scrolls sideways instead, so the table is not a scroll box of its own.
    <div className={pageScrolls ? 'pb-2' : 'overflow-x-auto pb-2'}>
      <div ref={wrapRef} className="relative mx-auto max-w-[1500px] px-3"
        style={{ minWidth: tableMinWidth(data.families.length, narrow) }}>
        <div className="grid" style={{ gap: GAP, gridTemplateColumns: `${LABEL_COL}px repeat(${data.families.length}, minmax(${narrow ? 52 : 64}px, 1fr))` }}>
          {/* Column headers: function families ("groups") */}
          {/* Solid backdrop for the pinned label column: one continuous piece, so nothing scrolling
              underneath (tiles, glows, interaction lines) shows through the gaps between rows. */}
          <div aria-hidden className="pointer-events-none sticky left-0 z-[25] -ml-3 border-r border-white/10 bg-[#0b0f17] shadow-[8px_0_12px_-6px_rgba(0,0,0,0.7)]"
            style={{ gridColumn: 1, gridRow: `1 / span ${data.locations.length + 1}` }} />
          <div className="sticky left-0 z-30 -ml-3 flex items-end pb-1 pl-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500"
            style={{ gridColumn: 1, gridRow: 1 }}>
            Family →<br />Location ↓
          </div>
          {data.families.map((f) => (
            <div key={f.code} title={f.description} className="flex flex-col items-center justify-end gap-1 pb-1 text-center">
              <span className="font-mono text-[10px] text-gray-500">{f.column_index}</span>
              <span className="text-[10px] font-semibold leading-tight text-gray-200">{f.name}</span>
              <span className="h-1 w-full rounded-full" style={{ background: f.color }} />
            </div>
          ))}

          {/* Rows: cell locations ("periods"), inside → outside */}
          {data.locations.map((loc) => (
            <Row key={loc.code} loc={loc} data={data} cells={cells} cellEls={cellEls} arrange={arrange} onPrefetch={onPrefetch}
              filters={filters} colors={colors} selectedId={selectedId} ringFor={ringFor} onSelect={onSelect}
              openCell={openCell} setOpenCell={setOpenCell} />
          ))}
        </div>

        <MisfoldBlock data={data} filters={filters} selectedId={selectedId} onSelect={onSelect}
          register={(id, el) => { misEls.current[id] = el }} onHover={setHoverMis} />

        {/* Sized by CSS to the table itself: a measured pixel width would keep the table from shrinking. */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          <defs>
            {Object.entries(EFFECTS).map(([key, e]) => e.marker && (
              <marker key={key} id={`end-${key}`} viewBox="0 0 10 10" refX={e.marker === 'bar' ? 5 : 8} refY="5"
                markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
                {e.marker === 'arrow'
                  ? <path d="M0,0 L10,5 L0,10 z" fill={e.color} />
                  : <rect x="3.5" y="0" width="3" height="10" fill={e.color} />}
              </marker>
            ))}
          </defs>
          {lines.map((l) => (
            <path key={l.id} d={l.d} fill="none" stroke={l.color} strokeOpacity={l.opacity} strokeWidth={l.width}
              strokeDasharray={l.dashed ? '5 4' : undefined} strokeLinecap="round"
              markerEnd={l.effect && EFFECTS[l.effect].marker ? `url(#end-${l.effect})` : undefined}
              pathLength={1} className="interaction-line" />
          ))}
        </svg>
      </div>
    </div>
  )
}

function Row({ loc, data, cells, cellEls, arrange, filters, colors, selectedId, ringFor, onSelect, onPrefetch, openCell, setOpenCell }) {
  return (
    <>
      <div title={loc.description} className="sticky left-0 z-30 -ml-3 flex items-center gap-2 pl-3 pr-1"
        style={{ gridColumn: 1, gridRow: loc.row_index + 1 }}>
        <span className="font-mono text-lg font-bold text-gray-600">{loc.row_index}</span>
        <span className="text-[11px] font-medium leading-tight text-gray-300">{loc.name}</span>
      </div>
      {data.families.map((f) => {
        const key = `${f.code}|${loc.code}`
        const members = cells[key] || []
        const visible = members.filter((p) => proteinState(p, filters) !== 'hidden')
        const ordered = arrange(visible)
        const face = ordered[0]
        const extra = visible.length - 1
        // Under a filter, the badge counts only the other members that match it.
        const filtering = anyFilterActive(filters)
        const extraOn = ordered.slice(1).filter((p) => proteinState(p, filters) === 'on').length
        return (
          <div key={key} ref={(el) => { cellEls.current[key] = el }} className="relative aspect-[5/6] min-h-[72px]">
            {!face ? (
              <div className={`h-full w-full rounded-md ${members.length ? 'border border-dashed border-gray-700/70' : 'bg-white/[.015]'}`} />
            ) : (
              <>
                {extra > 0 && (
                  <span aria-hidden className="absolute inset-0 translate-x-[3px] translate-y-[3px] rounded-md border opacity-40"
                    style={{ borderColor: colors[f.code], background: `${colors[f.code]}22` }} />
                )}
                <Tile protein={face} color={colors[f.code]} state={proteinState(face, filters)}
                  flipped={filters.misfoldMode} organism={filters.organism} inert={isInert(face, filters)} subdued={scopeRole(face, filters) === 'partner'} selected={face.id === selectedId}
                  ring={ringFor(face)} onClick={() => onSelect(face.id)} onMouseEnter={() => onPrefetch?.(face.id)} />
                {extra > 0 && (
                  <button type="button" onClick={() => setOpenCell(openCell === key ? null : key)}
                    data-cell-popover
                    className={`absolute right-0.5 top-0.5 z-20 rounded-full border px-1 text-[9px] font-bold leading-[14px] shadow hover:bg-gray-700 ${
                      filtering && extraOn > 0 ? 'border-amber-300 bg-amber-300 text-gray-950'
                        : filtering ? 'border-white/10 bg-gray-950/80 text-white/40' : 'border-white/25 bg-gray-950/80 text-white'}`}
                    aria-label={`Show all ${visible.length} proteins in ${f.name}, ${loc.name}`}>
                    +{filtering && extraOn > 0 ? extraOn : extra}
                  </button>
                )}
                {openCell === key && (
                  <CellPopover members={ordered} family={f} loc={loc} color={colors[f.code]} filters={filters}
                    selectedId={selectedId} ringFor={ringFor}
                    onSelect={(id) => { onSelect(id); setOpenCell(null) }}
                    alignRight={f.column_index > data.families.length - 4} />
                )}
              </>
            )}
          </div>
        )
      })}
    </>
  )
}

function CellPopover({ members, family, loc, color, filters, selectedId, ringFor, onSelect, alignRight }) {
  return (
    <div data-cell-popover
      className={`absolute top-full z-40 mt-2 w-[300px] rounded-xl border border-white/10 bg-gray-900/95 p-3 shadow-2xl backdrop-blur ${alignRight ? 'right-0' : 'left-0'}`}>
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="font-semibold text-gray-100">{family.name}</span>
        <span className="text-gray-500">in</span>
        <span className="font-semibold text-gray-100">{loc.name}</span>
        <span className="ml-auto text-gray-500">{members.length}</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {members.map((p) => (
          <div key={p.id} className="h-[58px]">
            <Tile protein={p} color={color} compact state={proteinState(p, filters)} flipped={filters.misfoldMode}
              organism={filters.organism} inert={isInert(p, filters)} subdued={scopeRole(p, filters) === 'partner'} selected={p.id === selectedId} ring={ringFor(p)} onClick={() => onSelect(p.id)} />
          </div>
        ))}
      </div>
    </div>
  )
}
