import { useEffect, useMemo, useState } from 'react'
import { PillIcon, WarnIcon } from './Tile'

function Toggle({ on, onClick, children, color = '#ffffff', title }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={on}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        on ? 'border-transparent text-gray-950' : 'border-white/10 bg-white/[.03] text-gray-300 hover:bg-white/[.08]'}`}
      style={on ? { background: color } : undefined}>
      {children}
    </button>
  )
}

export default function Controls({ data, filters, setFilters, showInteractions, setShowInteractions, view }) {
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }))
  const pathway = data.pathways.find((p) => p.code === filters.pathway)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Toggle on={filters.misfoldMode} onClick={() => set({ misfoldMode: !filters.misfoldMode })} color="#f87171"
          title="Flip proteins that have a disease-causing misfolded form">
          <WarnIcon className="h-3.5 w-3.5" />
          {filters.misfoldMode ? 'Misfolded' : 'Native'} ⇄ {filters.misfoldMode ? 'Native' : 'Misfolded'}
        </Toggle>

        {view === 'table' && <Toggle on={showInteractions} onClick={() => setShowInteractions(!showInteractions)} color="#e5e7eb"
          title="When a protein is selected, draw lines to the proteins it interacts with (coloured by effect)">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden><circle cx="3.5" cy="12" r="2.2" fill="currentColor" /><circle cx="12.5" cy="4" r="2.2" fill="currentColor" /><path d="M5 10.5 11 5.5" stroke="currentColor" strokeWidth="1.6" /></svg>
          Interactions
        </Toggle>}

        <Toggle on={filters.drugOnly} onClick={() => set({ drugOnly: !filters.drugOnly })} color="#6ee7b7"
          title="Show only proteins targeted by approved drugs">
          <PillIcon className="h-3.5 w-3.5" /> Drug targets
        </Toggle>

        <div className="flex overflow-hidden rounded-lg border border-white/10" role="radiogroup" aria-label="Organism">
          {data.organisms.map((o) => (
            <button key={o.code} type="button" role="radio" aria-checked={filters.organism === o.code}
              onClick={() => set({ organism: o.code })} title={`${o.latin}: dim proteins with no ortholog`}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                filters.organism === o.code ? 'bg-sky-400 text-gray-950' : 'bg-white/[.03] text-gray-300 hover:bg-white/[.08]'} ${
                o.code === 'ecoli' ? 'italic' : ''}`}>
              {o.name}
            </button>
          ))}
        </div>

        <label className="relative flex items-center">
          <span className="sr-only">Pathway</span>
          <select value={filters.pathway || ''} onChange={(e) => set({ pathway: e.target.value || null })}
            className="appearance-none rounded-lg border border-white/10 bg-white/[.03] py-1.5 pl-7 pr-7 text-xs font-medium text-gray-200 hover:bg-white/[.08] focus:outline-none focus:ring-2 focus:ring-white/30"
            style={pathway ? { borderColor: pathway.color, boxShadow: `inset 0 0 0 1px ${pathway.color}` } : undefined}>
            <option value="">All pathways</option>
            {data.pathways.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
          <span className="pointer-events-none absolute left-2.5 h-2.5 w-2.5 rounded-full" style={{ background: pathway?.color || '#6b7280' }} />
          <span className="pointer-events-none absolute right-2.5 text-[10px] text-gray-400">▼</span>
        </label>
      </div>

      {pathway && (
        <p className="text-xs text-gray-400">
          <span className="font-semibold" style={{ color: pathway.color }}>{pathway.name}:</span> {pathway.description}{' '}
          <span className="text-gray-500">
            ({filters.scope?.members.size ?? 0} proteins, ringed · plus {filters.scope?.partners.size ?? 0} direct partners, shown dimmer)
          </span>
        </p>
      )}

      <Timeline data={data} year={filters.year}
        setYear={(v) => setFilters((f) => ({ ...f, year: typeof v === 'function' ? v(f.year) : v }))} />
    </div>
  )
}

// Timeline playback pace (ms per year). From 1960 most tiles are on screen, so each step costs more to draw.
const SLOW_FROM = 1960
const FAST_MS = 70
const SLOW_MS = 240

function Timeline({ data, year, setYear }) {
  const years = useMemo(() => data.proteins.map((p) => p.discovery_year), [data])
  const min = Math.min(...years)
  const max = new Date().getFullYear()
  const [playing, setPlaying] = useState(false)
  const current = year ?? max

  // One step per render: the next year is scheduled only after the previous one has been drawn, so steps
  // can't pile up and stutter. Quick through the sparse early years, slower once the table fills up.
  useEffect(() => {
    if (!playing || year == null) return
    const t = setTimeout(() => setYear((y) => {
      const next = (y ?? min) + 1
      return next >= max ? null : next
    }), year < SLOW_FROM ? FAST_MS : SLOW_MS)
    return () => clearTimeout(t)
  }, [playing, year, min, max, setYear])

  // Stop once the timeline has reached the present.
  useEffect(() => {
    if (playing && year == null) setPlaying(false)
  }, [playing, year])

  const known = data.proteins.filter((p) => p.discovery_year <= current)
  const latest = [...known].sort((a, b) => b.discovery_year - a.discovery_year || b.number - a.number)[0]

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/10 bg-white/[.02] px-3 py-2">
      <button type="button" onClick={() => { if (!playing && year == null) setYear(min); setPlaying(!playing) }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-300 text-gray-950 hover:bg-amber-200"
        aria-label={playing ? 'Pause discovery timeline' : 'Play discovery timeline'}>
        {playing
          ? <svg viewBox="0 0 16 16" className="h-3 w-3"><rect x="3" y="2" width="3.5" height="12" fill="currentColor" /><rect x="9.5" y="2" width="3.5" height="12" fill="currentColor" /></svg>
          : <svg viewBox="0 0 16 16" className="h-3 w-3"><path d="M4 2l10 6-10 6z" fill="currentColor" /></svg>}
      </button>
      <span className="w-12 font-mono text-lg font-bold text-amber-200">{current}</span>
      <input type="range" min={min} max={max} value={current} aria-label="Discovery year"
        onChange={(e) => { setPlaying(false); const v = Number(e.target.value); setYear(v >= max ? null : v) }}
        className="timeline h-1.5 min-w-[160px] flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-amber-300" />
      <span className="text-xs text-gray-400">
        <span className="font-semibold text-gray-200">{known.length}</span> of {data.proteins.length} identified
      </span>
      {year != null && (
        <button type="button" onClick={() => { setPlaying(false); setYear(null) }} className="text-xs text-amber-300 hover:underline">
          Reset
        </button>
      )}
      {year != null && latest && (
        <p className="basis-full text-xs text-gray-400">
          <span className="font-semibold text-amber-200">{latest.discovery_year} · {latest.symbol}</span>: {latest.milestone}
        </p>
      )}
    </div>
  )
}
