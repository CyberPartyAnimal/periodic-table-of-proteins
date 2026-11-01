import { useState } from 'react'
import ExpandableText from './ExpandableText'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import StructureViewer from './StructureViewer'

const MAX_DRAWN = 28
const CHAIN_STYLES = {
  Signal: { color: '#6b7280', label: 'Signal peptide', note: 'address label, cut off after delivery' },
  'Transit peptide': { color: '#6b7280', label: 'Transit peptide', note: 'address label for an organelle, cut off' },
  Propeptide: { color: '#a8a29e', label: 'Propeptide', note: 'cut out and discarded' },
  Chain: { color: '#38bdf8', label: 'Chain', note: 'kept in the working protein' },
  Peptide: { color: '#34d399', label: 'Peptide', note: 'kept in the working protein' },
}

/** Which proteins come together to form the working unit, and whether one chain is cut into several. */
export default function AssemblyTab({ protein: p, data, onSelect }) {
  const q = useQuery({ queryKey: ['assembly', p.id], queryFn: () => api.assembly(p.id) })
  const [viewing, setViewing] = useState(null) // { ac, pdb }
  if (q.isLoading) return <p className="text-gray-500">Loading…</p>
  if (q.isError) return <p className="text-red-300">{q.error.message}</p>
  const a = q.data
  const byId = Object.fromEntries(data.proteins.map((x) => [x.id, x]))
  const famColor = (proteinId) => data.families.find((f) => f.code === byId[proteinId]?.family)?.color
  // Peptides that sit inside a chain are fragments released later (e.g. spinorphin from hemoglobin), not cuts
  // that make the working protein, so leave them out.
  const pieces = a.chains.filter((c) => !(c.type === 'Peptide' &&
    a.chains.some((o) => o !== c && o.type === 'Chain' && o.start <= c.start && o.end >= c.end)))
  const kept = pieces.filter((c) => c.type === 'Chain' || c.type === 'Peptide')
  const cut = kept.length > 1 || pieces.some((c) => c.type === 'Propeptide')

  return (
    <>
      <p className="text-xs leading-relaxed text-gray-400">
        Many proteins only work as part of a team that stays together, like hemoglobin's four chains. These assemblies
        come from the <a className="text-sky-300 hover:underline" href="https://www.ebi.ac.uk/complexportal" target="_blank" rel="noreferrer">EBI Complex Portal</a>,
        where experts check each one. Short-lived contacts are under <i>Interactions</i>.
      </p>

      {cut && <ChainMap chains={pieces} length={p.sequence.length} />}

      {a.subunit && (
        <div className="mt-4 rounded-lg border border-white/10 bg-white/[.02] p-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">UniProt describes its assembly as</div>
          <ExpandableText text={a.subunit} lines={6} className="mt-1 text-sm leading-relaxed text-gray-200" />
        </div>
      )}

      <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        Assemblies it is part of {a.complexes.length > 0 && `· ${a.complexes.length}`}
      </h3>
      {a.complexes.length === 0 && (
        <p className="text-gray-500">
          {cut
            ? `No multi-protein assembly is curated. ${p.symbol}'s working form is the ${kept.length} pieces above, held together after cutting.`
            : `No curated assembly. ${p.symbol} mostly works as a single chain, or its partnerships are short-lived (see Interactions).`}
        </p>
      )}
      <div className="space-y-3">
        {a.complexes.map((c) => (
          <article key={c.ac} className="rounded-xl border border-white/10 bg-white/[.02] p-3">
            <div className="flex items-start gap-2">
              <h4 className="flex-1 font-semibold leading-snug text-white">{c.name}</h4>
              <a href={`https://www.ebi.ac.uk/complexportal/complex/${c.ac}`} target="_blank" rel="noreferrer"
                className="shrink-0 font-mono text-[11px] text-sky-300 hover:underline">{c.ac} ↗</a>
            </div>
            <SubunitDiagram complex={c} selfId={p.id} famColor={famColor} />
            <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {c.participants.map((x) => {
                const onTable = x.protein_id != null
                const isSelf = x.protein_id === p.id
                const label = `${x.stoichiometry ? `${x.stoichiometry} × ` : ''}${x.name ?? x.id}`
                return (
                  <li key={x.id}>
                    {onTable && !isSelf ? (
                      <button type="button" onClick={() => onSelect(x.protein_id)} title={x.description}
                        className="rounded-full border px-2 py-0.5 font-medium text-white hover:bg-white/10"
                        style={{ borderColor: famColor(x.protein_id) }}>
                        {label} <span className="text-gray-400">→ {byId[x.protein_id].symbol}</span>
                      </button>
                    ) : (
                      <span title={x.description}
                        className={`inline-block rounded-full border px-2 py-0.5 ${isSelf ? 'font-bold text-white' : 'text-gray-300'}`}
                        style={{ borderColor: isSelf ? famColor(x.protein_id) : x.type === 'small molecule' ? '#f59e0b66' : '#ffffff22' }}>
                        {label}{isSelf && ' (this protein)'}{x.type === 'small molecule' && ' · molecule'}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
            {c.participants.some((x) => x.type === 'protein' && !x.stoichiometry) && (
              <p className="mt-1.5 text-[11px] text-gray-500">Copy numbers aren't recorded for some members, so they're drawn once with a dashed outline.</p>
            )}
            <ExpandableText text={c.function} lines={4} className="mt-2 text-xs leading-relaxed text-gray-300" />
            {c.properties && c.properties !== c.function && (
              <ExpandableText text={c.properties} lines={3} className="mt-1.5 text-xs leading-relaxed text-gray-500" />
            )}
            {c.pdb_ids.length > 0 && (
              <div className="mt-2">
                {viewing?.ac === c.ac ? (
                  <StructureViewer height={280} sources={c.pdb_ids.slice(0, 4).map((id) => ({
                    label: `Assembly · PDB ${id} (one colour per chain)`, url: `https://files.rcsb.org/download/${id}.cif`, format: 'cif', kind: 'complex',
                  }))} />
                ) : (
                  <button type="button" onClick={() => setViewing({ ac: c.ac })}
                    className="rounded-md border border-white/15 px-2.5 py-1 text-xs text-gray-200 hover:bg-white/5">
                    Show the assembled structure in 3D
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  )
}

/** Circles = protein copies (coloured by family when on the table), diamonds = small molecules. */
function SubunitDiagram({ complex, selfId, famColor }) {
  const items = []
  for (const x of complex.participants) {
    const copies = Math.max(1, x.stoichiometry || 1)
    for (let i = 0; i < copies; i++) items.push({ ...x, unknown: !x.stoichiometry })
  }
  const drawn = items.slice(0, MAX_DRAWN)
  const n = drawn.length
  const R = n <= 1 ? 0 : Math.min(70, 18 + n * 4.5)
  const size = n > 12 ? 9 : 13
  return (
    <svg viewBox="-110 -95 220 190" className="mx-auto mt-2 h-[150px] w-full max-w-[260px]" role="img"
      aria-label={`${complex.name}: ${items.length} parts`}>
      <circle r={R + size + 6} fill="none" stroke="#ffffff10" strokeDasharray="3 4" />
      {drawn.map((x, i) => {
        const angle = (i / n) * Math.PI * 2 - Math.PI / 2
        const cx = Math.cos(angle) * R
        const cy = Math.sin(angle) * R
        const color = x.protein_id != null ? famColor(x.protein_id) : x.type === 'small molecule' ? '#f59e0b' : '#4b5563'
        const self = x.protein_id === selfId
        if (x.type === 'small molecule') {
          return <rect key={i} x={cx - size * 0.55} y={cy - size * 0.55} width={size * 1.1} height={size * 1.1} fill={color}
            transform={`rotate(45 ${cx} ${cy})`}><title>{x.name}</title></rect>
        }
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={size} fill={color} fillOpacity={self ? 1 : 0.75}
              stroke={self ? '#fff' : '#0b0f17'} strokeWidth={self ? 2.5 : 1} strokeDasharray={x.unknown ? '3 2' : undefined} />
            {n <= 12 && <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize="7" fontWeight="700" fill="#0b0f17">
              {(x.name || '').slice(0, 5)}</text>}
            <title>{x.name}: {x.description}</title>
          </g>
        )
      })}
      {items.length > MAX_DRAWN && <text y="4" textAnchor="middle" fontSize="11" fill="#9ca3af">+{items.length - MAX_DRAWN} more</text>}
    </svg>
  )
}

/** One gene, several pieces: where the chain is cut (e.g. insulin's B and A chains). */
function ChainMap({ chains, length }) {
  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-white/[.02] p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">Made as one chain, then cut</div>
      <div className="relative mt-3 h-5 rounded bg-white/5">
        {chains.map((c, i) => {
          const s = CHAIN_STYLES[c.type] || CHAIN_STYLES.Chain
          return (
            <span key={i} title={`${c.name || s.label}: ${c.start}–${c.end}`}
              className="absolute top-0 h-full rounded-sm border border-black/40"
              style={{
                left: `${((c.start - 1) / length) * 100}%`, width: `${Math.max(1, ((c.end - c.start + 1) / length) * 100)}%`,
                background: c.type === 'Propeptide' ? `repeating-linear-gradient(135deg, ${s.color} 0 4px, transparent 4px 8px)` : s.color,
              }} />
          )
        })}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-gray-500"><span>1</span><span>{length}</span></div>
      <ul className="mt-2 space-y-0.5 text-xs">
        {chains.map((c, i) => {
          const s = CHAIN_STYLES[c.type] || CHAIN_STYLES.Chain
          return (
            <li key={i} className="flex items-center gap-2">
              <span className="h-2 w-3 rounded-sm" style={{ background: s.color }} />
              <span className="text-gray-200">{c.name || s.label}</span>
              <span className="font-mono text-gray-500">{c.start}–{c.end} ({c.end - c.start + 1} aa)</span>
              <span className="text-gray-500">· {s.note}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
