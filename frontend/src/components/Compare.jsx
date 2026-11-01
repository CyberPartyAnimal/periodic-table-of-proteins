import { useEffect } from 'react'
import FitText from './FitText'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { MISFOLD_KINDS } from '../lib/filters'
import { EFFECTS } from '../lib/effects'
import { EffectSwatch } from './Legend'

export function CompareTray({ data, ids, onRemove, onCompare, shiftedBy = 0 }) {
  const items = ids.map((id) => data.proteins.find((p) => p.id === id))
  return (
    <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-white/10 bg-gray-900/95 p-2 shadow-2xl backdrop-blur"
      style={shiftedBy ? { left: `calc((100% - ${shiftedBy}px) / 2)` } : undefined}>
      <span className="pl-1 text-xs text-gray-400">Compare</span>
      {items.map((p) => (
        <span key={p.id} className="flex items-center gap-1 rounded-md bg-white/10 py-1 pl-2 pr-1 text-xs font-bold text-white">
          {p.symbol}
          <button type="button" onClick={() => onRemove(p.id)} aria-label={`Remove ${p.symbol}`} className="rounded px-1 text-gray-400 hover:bg-white/10 hover:text-white">×</button>
        </span>
      ))}
      {items.length < 2 && <span className="text-xs italic text-gray-500">pick one more…</span>}
      <button type="button" disabled={items.length < 2} onClick={onCompare}
        className="rounded-md bg-sky-400 px-3 py-1 text-xs font-semibold text-gray-950 disabled:opacity-30">
        Compare
      </button>
    </div>
  )
}

export function CompareModal({ data, ids, onClose, onSelect }) {
  const [a, b] = ids
  const q = useQuery({ queryKey: ['compare', a, b], queryFn: () => api.compare(a, b) })

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const fam = (code) => data.families.find((f) => f.code === code)
  const loc = (code) => data.locations.find((l) => l.code === code)?.name
  const pw = (code) => data.pathways.find((x) => x.code === code)

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="my-8 w-full max-w-3xl rounded-2xl border border-white/10 bg-[#0e131d] p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}
        role="dialog" aria-label="Compare proteins">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Side-by-side comparison</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-md text-xl text-gray-400 hover:bg-white/10 hover:text-white">×</button>
        </div>
        {q.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {q.isError && <p className="text-sm text-red-300">{q.error.message}</p>}
        {q.data && (() => {
          const { a: A, b: B } = q.data
          const maxMass = Math.max(A.mass_kda, B.mass_kda)
          const rows = [
            ['Family', (p) => fam(p.family).name],
            ['Main location', (p) => loc(p.location)],
            ['Mass', (p) => (
              <div className="flex items-center gap-2">
                <span className="h-2 rounded-full" style={{ width: `${Math.max(4, (p.mass_kda / maxMass) * 100)}%`, background: fam(p.family).color }} />
                <span className="shrink-0 font-mono text-xs">{p.mass_kda} kDa</span>
              </div>
            )],
            ['Length', (p) => `${p.length_aa.toLocaleString()} aa`],
            ['Identified', (p) => p.discovery_year],
            ['Medicines', (p) => p.drugs.length ? p.drugs.slice(0, 3).join(', ') + (p.drugs.length > 3 ? '…' : '') : '—'],
            ['Disease variants', (p) => p.variants.length || '—'],
            ['Misfolded form', (p) => p.misfolded ? `${p.misfolded.symbol} (${MISFOLD_KINDS[p.misfolded.kind].label})` : '—'],
            ['Interaction partners', (p) => p.partners.length],
            ['Found in', (p) => data.organisms.filter((o) => p.orthologs[o.code]).map((o) => o.name).join(', ')],
          ]
          return (
            <>
              <div className="grid grid-cols-[120px_1fr_1fr] gap-x-4 text-sm">
                <div />
                {[A, B].map((p) => (
                  <button key={p.id} type="button" onClick={() => onSelect(p.id)} className="mb-3 flex items-center gap-3 rounded-lg p-1 text-left hover:bg-white/5">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border-2 px-1"
                      style={{ borderColor: fam(p.family).color, background: `${fam(p.family).color}33` }}>
                      <FitText max={16} className="font-extrabold text-white">{p.symbol}</FitText>
                    </span>
                    <span className="text-sm font-semibold leading-snug text-white">{p.name}</span>
                  </button>
                ))}
                {rows.map(([label, fn]) => (
                  <div key={label} className="contents">
                    <div className="border-t border-white/5 py-2 text-[11px] uppercase tracking-wider text-gray-500">{label}</div>
                    <div className="border-t border-white/5 py-2 text-gray-200">{fn(A)}</div>
                    <div className="border-t border-white/5 py-2 text-gray-200">{fn(B)}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-white/[.03] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">Direct interaction</div>
                  <div className="mt-1 text-white">
                    {q.data.interaction_score ? <>Yes · STRING <span className="font-mono">{q.data.interaction_score.toFixed(3)}</span></> : <span className="text-gray-400">No direct physical contact</span>}
                  </div>
                  {(() => {
                    const link = A.partners.find((x) => x.id === B.id)
                    if (!link) return null
                    const lines = [
                      link.effect_out && [link.effect_out, `${A.symbol} ${EFFECTS[link.effect_out].verb} ${B.symbol}`],
                      link.effect_in && [link.effect_in, `${B.symbol} ${EFFECTS[link.effect_in].verb} ${A.symbol}`],
                    ].filter(Boolean)
                    return lines.map(([e, text]) => (
                      <div key={text} className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: EFFECTS[e].color }}>
                        <EffectSwatch effect={e} width={22} />{text}
                      </div>
                    ))
                  })()}
                </div>
                <div className="rounded-lg bg-white/[.03] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">Shared pathways</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {q.data.shared_pathways.length ? q.data.shared_pathways.map((c) => (
                      <span key={c} className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: pw(c).color, color: pw(c).color }}>{pw(c).name}</span>
                    )) : <span className="text-sm text-gray-400">None</span>}
                  </div>
                </div>
                <div className="rounded-lg bg-white/[.03] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">Shared partners</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {q.data.shared_partners.length ? q.data.shared_partners.map((p) => (
                      <button key={p.id} type="button" onClick={() => onSelect(p.id)} className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-bold text-white hover:bg-white/20">{p.symbol}</button>
                    )) : <span className="text-sm text-gray-400">None</span>}
                  </div>
                </div>
              </div>
            </>
          )
        })()}
      </div>
    </div>
  )
}
