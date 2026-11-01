import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './lib/api'
import { matchesSearch, pathwayScope } from './lib/filters'
import Controls from './components/Controls'
import PeriodicTable, { tableMinWidth } from './components/PeriodicTable'
import DetailPanel from './components/DetailPanel'
import { CompareModal, CompareTray } from './components/Compare'
import Legend from './components/Legend'
import { useLayoutMode, usePanelWidth } from './lib/layout'

// three.js is large, so the 3D view loads only when opened.
const InteractionNetwork3D = lazy(() => import('./components/InteractionNetwork3D'))

const INITIAL_FILTERS = { misfoldMode: false, organism: 'human', pathway: null, drugOnly: false, search: '', year: null }

export default function App() {
  const table = useQuery({ queryKey: ['table'], queryFn: api.table })
  const [filters, setFilters] = useState(INITIAL_FILTERS)
  const [selected, setSelected] = useState(null) // { id, tab }
  const [showInteractions, setShowInteractions] = useState(true)
  const [compareIds, setCompareIds] = useState([])
  const [comparing, setComparing] = useState(false)
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('view') === 'network' ? 'network' : 'table' } catch { return 'table' }
  })
  useEffect(() => { try { localStorage.setItem('view', view) } catch { /* storage unavailable */ } }, [view])

  const data = table.data
  const layoutMode = useLayoutMode()
  const [panelWidth, setPanelWidth] = usePanelWidth()
  const push = !!selected && layoutMode === 'push'
  // Windowed: the panel floats over the page, and the whole page can slide sideways from under it.
  const slide = !!selected && layoutMode === 'overlay'
  // Filters plus the current pathway's scope, shared by every view.
  const viewFilters = useMemo(() => ({
    ...filters, scope: data ? pathwayScope(data.proteins, data.interactions, filters.pathway) : null,
  }), [filters, data])
  const bySymbol = useMemo(
    () => Object.fromEntries((data?.proteins || []).map((p) => [p.symbol.toLowerCase(), p])), [data])

  const select = useCallback((id, tab = 'overview') => setSelected(id ? { id, tab } : null), [])

  // Shareable links: #p53 opens that protein.
  useEffect(() => {
    if (!data) return
    const fromHash = () => {
      const p = bySymbol[decodeURIComponent(location.hash.slice(1)).toLowerCase()]
      setSelected(p ? { id: p.id, tab: 'overview' } : null)
    }
    fromHash()
    window.addEventListener('hashchange', fromHash)
    return () => window.removeEventListener('hashchange', fromHash)
  }, [data, bySymbol])

  useEffect(() => {
    if (!data) return
    const symbol = selected && data.proteins.find((p) => p.id === selected.id)?.symbol
    const hash = symbol ? `#${symbol}` : ''
    if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname)
  }, [selected, data])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !comparing) setSelected(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [comparing])

  const detail = useQuery({
    queryKey: ['protein', selected?.id],
    queryFn: () => api.protein(selected.id),
    enabled: !!selected,
  })

  const toggleCompare = (id) =>
    setCompareIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(-2)))

  const matches = data && filters.search ? data.proteins.filter((p) => matchesSearch(p, filters.search)) : []

  return (
    <div className="min-h-full pb-24" style={push ? { paddingRight: panelWidth } : undefined}>
      {/* Page slider (windowed mode only): the page keeps its full width and an extra strip as wide as the
          panel is added on the right, so swiping/scrolling sideways brings any part out from under the panel. */}
      <div className={slide ? 'overflow-x-auto' : undefined}>
      <div className={slide ? 'flex' : undefined}>
      <div style={slide ? {
        flex: '0 0 auto',
        width: view === 'table' && data ? `max(100%, ${tableMinWidth(data.families.length) + 32}px)` : '100%',
      } : undefined}>
      <header className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-3 px-4 pb-3 pt-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-10 flex-col justify-between rounded-md border border-teal-400 bg-teal-400/20 px-1 py-0.5">
            <span className="font-mono text-[8px] leading-none text-teal-100">1</span>
            <span className="text-center text-base font-extrabold leading-none text-white">Pr</span>
            <span className="text-[6px] leading-none text-teal-100">protein</span>
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">Periodic Table of Proteins</h1>
            <p className="text-xs text-gray-400">
              {data ? `${data.proteins.length} human proteins` : 'Loading…'} · columns are function families · rows go from
              the nucleus out of the cell
            </p>
          </div>
        </div>

        <form className="relative ml-auto w-full sm:w-72" onSubmit={(e) => { e.preventDefault(); if (matches[0]) select(matches[0].id) }}>
          <input type="search" value={filters.search} placeholder="Search p53, insulin, KRAS, #81…"
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="w-full rounded-lg border border-white/10 bg-white/[.04] py-2 pl-8 pr-14 text-sm text-white placeholder:text-gray-500 focus:border-white/30 focus:outline-none" />
          <svg viewBox="0 0 16 16" className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" aria-hidden>
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m10.5 10.5 3.5 3.5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          {filters.search && (
            <span className="absolute right-2.5 top-2.5 text-xs text-gray-400">{matches.length} found</span>
          )}
        </form>
      </header>

      {table.isError && (
        <div className="mx-auto max-w-xl rounded-lg border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-200">
          Couldn't load the protein data ({table.error.message}).
          {import.meta.env.DEV && ' Is the backend running on port 8000?'}
        </div>
      )}

      {data && (
        <>
          <div className="mx-auto max-w-[1500px] px-4 pb-4">
            <div className="mb-3 flex w-fit overflow-hidden rounded-lg border border-white/10" role="tablist" aria-label="View">
              {[['table', 'Periodic table'], ['network', '3D Interaction Network']].map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)}
                  className={`px-3.5 py-1.5 text-sm font-semibold transition-colors ${view === key ? 'bg-white text-gray-950' : 'bg-white/[.03] text-gray-300 hover:bg-white/[.08]'}`}>
                  {label}
                </button>
              ))}
            </div>
            <Controls data={data} filters={viewFilters} setFilters={setFilters}
              showInteractions={showInteractions} setShowInteractions={setShowInteractions}
              view={view} />
          </div>
          {view === 'table' ? (
            <>
              <PeriodicTable data={data} filters={viewFilters} selectedId={selected?.id} narrow={push} pageScrolls={slide}
                partners={detail.data?.id === selected?.id ? detail.data?.partners : null}
                showInteractions={showInteractions} onSelect={select} />
            </>
          ) : (
            <div className="mx-auto max-w-[1500px]">
              <Suspense fallback={<p className="px-4 text-sm text-gray-500">Loading 3D view…</p>}>
                <InteractionNetwork3D data={data} filters={viewFilters} selectedId={selected?.id} onSelect={select} />
              </Suspense>
            </div>
          )}
          <Legend data={data} filters={filters} setFilters={setFilters} view={view} />
        </>
      )}
      </div>
      {slide && <div aria-hidden style={{ flex: `0 0 ${panelWidth}px` }} />}
      </div>
      </div>

      {selected && data && (
        <DetailPanel key={selected.id} floating={layoutMode === 'overlay'} width={panelWidth} onResize={setPanelWidth} id={selected.id} initialTab={selected.tab} data={data} query={detail}
          onClose={() => setSelected(null)} onSelect={select}
          onPathway={(code) => setFilters((f) => ({ ...f, pathway: code }))}
          inCompare={compareIds.includes(selected.id)} onToggleCompare={() => toggleCompare(selected.id)} />
      )}

      {data && compareIds.length > 0 && (
        <CompareTray data={data} ids={compareIds} onRemove={toggleCompare} onCompare={() => setComparing(true)}
          shiftedBy={selected && layoutMode !== 'cover' ? panelWidth : 0} />
      )}
      {comparing && compareIds.length === 2 && (
        <CompareModal data={data} ids={compareIds} onClose={() => setComparing(false)}
          onSelect={(id) => { setComparing(false); select(id) }} />
      )}
    </div>
  )
}
