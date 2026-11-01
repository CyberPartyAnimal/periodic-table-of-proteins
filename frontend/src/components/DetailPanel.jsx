import { useRef, useState } from 'react'
import { PANEL_DEFAULT, clampPanelWidth } from '../lib/layout'
import ExpandableText from './ExpandableText'
import FitText from './FitText'
import StructureViewer from './StructureViewer'
import { PillIcon, WarnIcon } from './Tile'
import { MISFOLD_KINDS } from '../lib/filters'
import { EFFECTS, effectBetween } from '../lib/effects'
import { EffectSwatch } from './Legend'
import AnatomyTab from './AnatomyTab'
import AssemblyTab from './AssemblyTab'

const rcsb = (id) => ({ label: `Experimental · PDB ${id}`, url: `https://files.rcsb.org/download/${id}.cif`, format: 'cif', kind: 'pdb' })

export default function DetailPanel({ floating = false, width = PANEL_DEFAULT, onResize, id, initialTab, data, query, onClose, onSelect, onPathway, inCompare, onToggleCompare }) {
  const [tab, setTab] = useState(initialTab)
  const summary = data.proteins.find((p) => p.id === id)
  const p = query.data?.id === id ? query.data : null
  const family = data.families.find((f) => f.code === summary.family)
  const loc = data.locations.find((l) => l.code === summary.location)
  const m = summary.misfolded

  const tabs = [
    ['overview', 'Overview'],
    ['structure', '3D structure'],
    ['anatomy', 'What holds it together'],
    ['assembly', 'Assembly'],
    ['interactions', `Interactions${p ? ` · ${p.partners.length}` : ''}`],
    ['variants', `Variants${summary.variant_count ? ` · ${summary.variant_count}` : ''}`],
    ...(m ? [['misfold', 'Misfolded']] : []),
  ]

  return (
    <aside style={{ '--panel-w': `${width}px` }}
      className={`panel-in fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-white/10 bg-[#0e131d]/97 backdrop-blur sm:w-[var(--panel-w)] ${
      floating ? 'shadow-[-28px_0_56px_rgba(0,0,0,0.65)]' : 'shadow-2xl'}`}
      aria-label={`${summary.name} details`}>
      <ResizeHandle width={width} onResize={onResize} />
      <div className="flex gap-4 border-b border-white/10 p-4">
        <div className="flex h-[92px] w-[80px] shrink-0 flex-col justify-between rounded-lg border-2 px-2 py-1.5"
          style={{ borderColor: family.color, background: `linear-gradient(160deg, ${family.color}55, ${family.color}15)` }}>
          <div className="flex justify-between font-mono text-[10px] text-white/80"><span>{summary.number}</span><span>{summary.mass_kda}</span></div>
          <FitText max={24} className="font-extrabold text-white">{summary.symbol}</FitText>
          <span className="truncate text-center text-[9px] text-white/80">{summary.gene}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold leading-snug text-white">{summary.name}</h2>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-full px-2 py-0.5 font-medium text-gray-950" style={{ background: family.color }}>{family.name}</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-gray-200">{loc.name}</span>
            <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-gray-400">{summary.gene}</span>
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={onToggleCompare}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${inCompare ? 'bg-sky-400 text-gray-950' : 'border border-white/15 text-gray-200 hover:bg-white/5'}`}>
              {inCompare ? '✓ In comparison' : '+ Compare'}
            </button>
            {p && (
              <a href={`https://www.uniprot.org/uniprotkb/${p.uniprot_id}`} target="_blank" rel="noreferrer"
                className="rounded-md border border-white/15 px-2.5 py-1 text-xs text-gray-200 hover:bg-white/5">UniProt {p.uniprot_id} ↗</a>
            )}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="h-8 w-8 shrink-0 rounded-md text-xl leading-none text-gray-400 hover:bg-white/10 hover:text-white">×</button>
      </div>

      <nav className="flex flex-wrap gap-x-1 border-b border-white/10 px-3" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`whitespace-nowrap border-b-2 px-2.5 py-2 text-xs font-medium ${tab === key
              ? key === 'misfold' ? 'border-red-400 text-red-200' : 'border-white text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200'}`}>
            {label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto p-4 text-sm text-gray-300">
        {!p && query.isError && <p className="text-red-300">Couldn't load details: {query.error.message}</p>}
        {!p && !query.isError && <p className="text-gray-500">Loading…</p>}
        {p && tab === 'overview' && <Overview p={p} data={data} onPathway={onPathway} />}
        {p && tab === 'structure' && (
          <StructureViewer sources={[
            ...(p.alphafold_url ? [{ label: 'Predicted · AlphaFold', url: p.alphafold_url, format: 'pdb', kind: 'alphafold' }] : []),
            ...p.pdb_ids.slice(0, 6).map(rcsb),
          ]} />
        )}
        {p && tab === 'variants' && <Variants p={p} />}
        {p && tab === 'anatomy' && <AnatomyTab protein={p} />}
        {p && tab === 'assembly' && <AssemblyTab protein={p} data={data} onSelect={onSelect} />}
        {p && tab === 'interactions' && <Interactions p={p} data={data} onSelect={onSelect} />}
        {p && tab === 'misfold' && m && <Misfold p={p} />}
      </div>
    </aside>
  )
}

function Fact({ label, children }) {
  return (
    <div className="rounded-lg bg-white/[.03] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-0.5 text-gray-100">{children}</div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{title}</h3>
      {children}
    </section>
  )
}

function Overview({ p, data, onPathway }) {
  const locName = (code) => data.locations.find((l) => l.code === code)?.name
  return (
    <>
      <p className="text-[15px] leading-relaxed text-gray-100">{p.blurb}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Fact label="Mass">{p.mass_kda} kDa</Fact>
        <Fact label="Length">{p.length_aa.toLocaleString()} amino acids</Fact>
        <Fact label="Main location">{locName(p.location)}</Fact>
        <Fact label="Also found in">{p.other_locations.map(locName).join(', ') || '—'}</Fact>
      </div>
      <div className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-amber-300/80">Identified · {p.discovery_year}</div>
        <div className="mt-0.5 text-gray-100">{p.milestone}</div>
      </div>

      {p.function && (
        <Section title="Function (UniProt)">
          <ExpandableText text={p.function} lines={6} className="leading-relaxed text-gray-300" />
        </Section>
      )}

      {p.pathways.length > 0 && (
        <Section title="Pathways">
          <div className="flex flex-wrap gap-1.5">
            {p.pathways.map((code) => {
              const pw = data.pathways.find((x) => x.code === code)
              return (
                <button key={code} type="button" onClick={() => onPathway(code)} title="Highlight this pathway on the table"
                  className="rounded-full border px-2.5 py-1 text-xs hover:bg-white/5" style={{ borderColor: pw.color, color: pw.color }}>
                  {pw.name}
                </button>
              )
            })}
          </div>
        </Section>
      )}

      <Section title="Medicines">
        {p.drugs.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {p.drugs.map((d) => (
              <span key={d} className="flex items-center gap-1 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-200">
                <PillIcon className="h-3 w-3" /> {d}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No approved drug targets this protein directly.</p>
        )}
        {p.therapeutic && <p className="mt-2 text-xs text-gray-400">Used as a medicine itself: <span className="text-gray-200">{p.therapeutic}</span></p>}
      </Section>

      <Section title="Across species">
        <div className="grid grid-cols-2 gap-2">
          {data.organisms.map((o) => {
            const ortholog = p.orthologs[o.code]
            return (
              <div key={o.code} className={`rounded-lg px-3 py-2 ${ortholog ? 'bg-sky-400/10' : 'bg-white/[.02]'}`}>
                <div className="text-[10px] uppercase tracking-wider text-gray-500">{o.name} <i className="normal-case">({o.latin.split(' ').slice(0, 2).join(' ')})</i></div>
                <div className={ortholog ? 'font-mono text-sky-200' : 'text-gray-600'}>{ortholog || 'none'}</div>
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="Links">
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            ['UniProt', `https://www.uniprot.org/uniprotkb/${p.uniprot_id}`],
            ['AlphaFold', `https://alphafold.ebi.ac.uk/entry/${p.uniprot_id}`],
            ['STRING', `https://string-db.org/network/9606/${p.gene}`],
            ...(p.pdb_ids[0] ? [[`PDB ${p.pdb_ids[0]}`, `https://www.rcsb.org/structure/${p.pdb_ids[0]}`]] : []),
          ].map(([label, href]) => (
            <a key={label} href={href} target="_blank" rel="noreferrer" className="rounded-md border border-white/10 px-2 py-1 text-gray-300 hover:bg-white/5">{label} ↗</a>
          ))}
        </div>
      </Section>
    </>
  )
}

function Variants({ p }) {
  if (!p.variants.length) return <p className="text-gray-500">No headline disease variants recorded here.</p>
  return (
    <>
      <p className="mb-3 text-xs text-gray-400">
        Like isotopes of an element, these are the same protein with a small change, often a single amino acid,
        that shifts how it behaves.
      </p>
      <ul className="space-y-2">
        {p.variants.map((v) => (
          <li key={v.change} className="rounded-lg border border-white/10 bg-white/[.02] p-3">
            <div className="font-mono text-sm font-bold text-white">{v.change}</div>
            <div className="text-gray-300">{v.disease}</div>
            {v.note && <div className="mt-1 text-xs text-gray-500">{v.note}</div>}
          </li>
        ))}
      </ul>
    </>
  )
}

function Interactions({ p, data, onSelect }) {
  const [effectsOnly, setEffectsOnly] = useState(false)
  if (!p.partners.length) {
    return <p className="text-gray-500">No high-confidence physical partners among the proteins on this table.</p>
  }
  const colorOf = (id) => {
    const fam = data.proteins.find((x) => x.id === id)?.family
    return data.families.find((f) => f.code === fam)?.color
  }
  const curated = p.partners.filter((pt) => pt.effect_out || pt.effect_in).length
  const shown = effectsOnly ? p.partners.filter((pt) => pt.effect_out || pt.effect_in) : p.partners
  const sentence = (pt) => {
    const parts = []
    if (pt.effect_out) parts.push([pt.effect_out, `${p.symbol} ${EFFECTS[pt.effect_out].verb} ${pt.symbol}`])
    if (pt.effect_in) parts.push([pt.effect_in, `${pt.symbol} ${EFFECTS[pt.effect_in].verb} ${p.symbol}`])
    return parts
  }
  return (
    <>
      <p className="mb-2 text-xs text-gray-400">
        Proteins on this table that physically touch {p.symbol} (STRING, score ≥ 0.7). For {curated} of them, curated
        literature (OmniPath) also says what the contact <i>does</i>.
      </p>
      <label className="mb-3 flex w-fit cursor-pointer items-center gap-2 text-xs text-gray-300">
        <input type="checkbox" checked={effectsOnly} onChange={(e) => setEffectsOnly(e.target.checked)} className="accent-amber-300" />
        Only show ones with a known effect
      </label>
      <ul className="space-y-1">
        {shown.map((pt) => {
          const { effect } = effectBetween(pt)
          return (
            <li key={pt.id}>
              <button type="button" onClick={() => onSelect(pt.id)} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-white/5">
                <span className="flex w-12 shrink-0 justify-center rounded border px-1" style={{ borderColor: colorOf(pt.id) }}>
                  <FitText max={12} className="font-bold leading-5 text-white">{pt.symbol}</FitText>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs leading-snug text-gray-300">{pt.name}</span>
                  {sentence(pt).map(([e, text]) => (
                    <span key={text} className="mt-0.5 flex items-center gap-1.5 text-[11px]" style={{ color: EFFECTS[e].color }}>
                      <EffectSwatch effect={e} width={22} /> {text}
                    </span>
                  ))}
                </span>
                {effect === 'binds' && <EffectSwatch effect="binds" width={22} />}
                <span className="w-9 shrink-0 text-right font-mono text-[11px] text-gray-400" title="STRING confidence">{pt.score.toFixed(2)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function Misfold({ p }) {
  const m = p.misfolded
  const kind = MISFOLD_KINDS[m.kind]
  return (
    <>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border-2 px-1"
          style={{ borderColor: kind.color, background: `repeating-linear-gradient(135deg, ${kind.color}55 0 5px, ${kind.color}1a 5px 10px)` }}>
          <FitText max={18} className="font-extrabold text-white">{m.symbol}</FitText>
        </div>
        <div>
          <div className="font-semibold text-white">{m.name}</div>
          <div className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: kind.color }}>
            <WarnIcon className="h-3 w-3" /> {kind.label}: {kind.note}
          </div>
        </div>
      </div>
      <p className="mt-4 leading-relaxed text-gray-200">{m.description}</p>
      <Section title="Diseases">
        <ul className="list-inside list-disc space-y-0.5 text-gray-300">{m.diseases.map((d) => <li key={d}>{d}</li>)}</ul>
      </Section>
      {m.drugs.length > 0 && (
        <Section title="Medicines aimed at the misfolded form">
          <div className="flex flex-wrap gap-1.5">
            {m.drugs.map((d) => <span key={d} className="flex items-center gap-1 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-200"><PillIcon className="h-3 w-3" />{d}</span>)}
          </div>
        </Section>
      )}
      <Section title="Native vs misfolded structure">
        <StructureViewer height={300} sources={[
          ...(m.pdb_id ? [{ ...rcsb(m.pdb_id), label: `Misfolded fibril · PDB ${m.pdb_id}` }] : []),
          ...(p.alphafold_url ? [{ label: 'Native fold · AlphaFold', url: p.alphafold_url, format: 'pdb', kind: 'alphafold' }] : []),
        ]} />
        {!m.pdb_id && <p className="mt-2 text-xs text-gray-500">No high-resolution structure of this misfolded form exists yet; showing the native fold.</p>}
      </Section>
    </>
  )
}

/** Drag the panel's left edge to resize it (double-click resets; arrow keys nudge). Hidden on phones. */
function ResizeHandle({ width, onResize }) {
  const [dragging, setDragging] = useState(false)
  const active = useRef(false) // read by move events that arrive before React re-renders
  if (!onResize) return null
  const start = (e) => {
    e.preventDefault()
    active.current = true
    setDragging(true)
    document.body.style.userSelect = 'none'
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* pointer already released */ }
  }
  const move = (e) => { if (active.current) onResize(clampPanelWidth(window.innerWidth - e.clientX)) }
  const stop = () => { active.current = false; setDragging(false); document.body.style.userSelect = '' }
  return (
    <div role="separator" aria-orientation="vertical" aria-label="Resize details panel" aria-valuenow={width}
      tabIndex={0} title="Drag to resize · double-click to reset"
      onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}
      onDoubleClick={() => onResize(PANEL_DEFAULT)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onResize(clampPanelWidth(width + 24))
        if (e.key === 'ArrowRight') onResize(clampPanelWidth(width - 24))
      }}
      className="group absolute inset-y-0 -left-1.5 z-10 hidden w-3 cursor-col-resize touch-none focus:outline-none sm:block">
      <span className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors ${
        dragging ? 'bg-sky-400' : 'bg-transparent group-hover:bg-white/30 group-focus-visible:bg-sky-400'}`} />
      <span className={`absolute left-1/2 top-1/2 h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors ${
        dragging ? 'bg-sky-400' : 'bg-white/25 group-hover:bg-white/60'}`} />
    </div>
  )
}
