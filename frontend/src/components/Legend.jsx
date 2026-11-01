import { EFFECTS } from '../lib/effects'
import { PillIcon, WarnIcon } from './Tile'

export function EffectSwatch({ effect, width = 34 }) {
  const e = EFFECTS[effect]
  return (
    <svg width={width} height="10" viewBox={`0 0 ${width} 10`} aria-hidden className="shrink-0">
      <line x1="1" y1="5" x2={width - 4} y2="5" stroke={e.color} strokeWidth="2" strokeDasharray={effect === 'binds' ? '0' : undefined} />
      {e.marker === 'arrow' && <path d={`M${width - 8},1 L${width - 1},5 L${width - 8},9 z`} fill={e.color} />}
      {e.marker === 'bar' && <line x1={width - 2} y1="0" x2={width - 2} y2="10" stroke={e.color} strokeWidth="2.5" />}
    </svg>
  )
}

/** Bottom key: interaction types, every pathway (click to highlight) and, for the table, tile anatomy. */
export default function Legend({ data, filters, setFilters, view }) {
  const togglePathway = (code) => setFilters((f) => ({ ...f, pathway: f.pathway === code ? null : code }))
  return (
    <footer className="mx-auto mt-6 max-w-[1500px] space-y-4 px-4 text-[11px] text-gray-400">
      <div className="grid gap-4 rounded-xl border border-white/10 bg-white/[.02] p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Interaction types</h3>
          <ul className="space-y-1.5">
            {Object.entries(EFFECTS).map(([key, e]) => (
              <li key={key} className="flex items-center gap-2">
                <EffectSwatch effect={key} />
                <span className="font-medium text-gray-200">{e.label}</span>
                <span className="text-gray-500">· {e.note}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-gray-500">
            Lines show physical contact (STRING, score ≥ 0.7). Colour and arrowhead show the effect, where curated
            literature (OmniPath) agrees on one.
          </p>
        </section>
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Pathways <span className="font-normal normal-case tracking-normal text-gray-600">· click to highlight</span>
          </h3>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-3">
            {data.pathways.map((p) => {
              const active = filters.pathway === p.code
              const count = data.proteins.filter((x) => x.pathways.includes(p.code)).length
              return (
                <button key={p.code} type="button" onClick={() => togglePathway(p.code)} title={p.description}
                  aria-pressed={active}
                  className={`flex items-center gap-2 rounded-md px-2 py-1 text-left transition-colors ${active ? 'bg-white/10 ring-1' : 'hover:bg-white/5'}`}
                  style={active ? { '--tw-ring-color': p.color } : undefined}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                  <span className={`leading-snug ${active ? 'text-white' : 'text-gray-300'}`}>{p.name}</span>
                  <span className="ml-auto font-mono text-gray-600">{count}</span>
                </button>
              )
            })}
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {view === 'table' && (
          <div className="flex items-center gap-2">
            <div className="flex h-[70px] w-[56px] flex-col justify-between rounded-md border border-sky-400 bg-sky-400/15 px-1 py-0.5">
              <span className="font-mono text-[8px] text-white/70">81</span>
              <span className="text-center text-sm font-extrabold text-white">p53</span>
              <span className="truncate text-[7px] text-white/80">Cellular tumour…</span>
              <span className="font-mono text-[7px] text-white/60">43.7</span>
            </div>
            <div className="leading-relaxed">
              <div><span className="font-mono text-gray-200">81</span> protein number (order of discovery)</div>
              <div><span className="font-bold text-gray-200">p53</span> symbol · name · <span className="font-mono text-gray-200">43.7</span> mass in kDa</div>
              <div>+N badge: more proteins share this cell</div>
            </div>
          </div>
        )}
        <div className="flex items-center gap-1.5"><PillIcon className="h-3.5 w-3.5 text-emerald-300" /> targeted by an approved drug</div>
        <div className="flex items-center gap-1.5"><WarnIcon className="h-3.5 w-3.5 text-orange-400" /> has a disease-causing misfolded form</div>
        <div className="ml-auto text-gray-500">
          Data: UniProt · AlphaFold DB · RCSB PDB · STRING · OmniPath · EBI Complex Portal · Alliance of Genome Resources
        </div>
      </div>
    </footer>
  )
}
