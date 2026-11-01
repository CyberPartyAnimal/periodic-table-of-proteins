import { useEffect, useMemo, useRef, useState } from 'react'
import SegmentBar from './SegmentBar'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

// Standard Jmol/CPK element colours (C and H lightened for the dark background).
export const ELEMENT_COLORS = {
  C: '#c8c8c8', H: '#f3f4f6', N: '#3050f8', O: '#ff0d0d', S: '#ffff30', Se: '#ffa100', Fe: '#e06633',
  Zn: '#7d80b0', Cu: '#c88033', Mg: '#8aff00', Ca: '#3dff00', Mn: '#9c7ac7', Na: '#ab5cf2', K: '#8f40d4',
  Ni: '#50d050', Co: '#f090a0', Mo: '#54b5b5',
}
const ELEMENT_NAMES = {
  C: 'carbon', H: 'hydrogen', N: 'nitrogen', O: 'oxygen', S: 'sulfur', Se: 'selenium', Fe: 'iron', Zn: 'zinc',
  Cu: 'copper', Mg: 'magnesium', Ca: 'calcium', Mn: 'manganese', Na: 'sodium', K: 'potassium', Ni: 'nickel',
  Co: 'cobalt', Mo: 'molybdenum',
}
const GROUPS = {
  hydrophobic: { label: 'Oily (hydrophobic)', color: '#fb923c', members: 'A V L I M F W P' },
  polar: { label: 'Water-loving, uncharged', color: '#5eead4', members: 'S T N Q Y C G' },
  positive: { label: 'Positive charge', color: '#60a5fa', members: 'K R H' },
  negative: { label: 'Negative charge', color: '#f87171', members: 'D E' },
}
const AA = {
  A: ['Ala', 'Alanine', '–CH₃'], R: ['Arg', 'Arginine', '–(CH₂)₃NHC(=NH)NH₂'], N: ['Asn', 'Asparagine', '–CH₂CONH₂'],
  D: ['Asp', 'Aspartate', '–CH₂COOH'], C: ['Cys', 'Cysteine', '–CH₂SH'], E: ['Glu', 'Glutamate', '–(CH₂)₂COOH'],
  Q: ['Gln', 'Glutamine', '–(CH₂)₂CONH₂'], G: ['Gly', 'Glycine', '–H'], H: ['His', 'Histidine', '–CH₂-imidazole'],
  I: ['Ile', 'Isoleucine', '–CH(CH₃)CH₂CH₃'], L: ['Leu', 'Leucine', '–CH₂CH(CH₃)₂'], K: ['Lys', 'Lysine', '–(CH₂)₄NH₂'],
  M: ['Met', 'Methionine', '–(CH₂)₂SCH₃'], F: ['Phe', 'Phenylalanine', '–CH₂C₆H₅'], P: ['Pro', 'Proline', 'ring to N'],
  S: ['Ser', 'Serine', '–CH₂OH'], T: ['Thr', 'Threonine', '–CH(OH)CH₃'], W: ['Trp', 'Tryptophan', '–CH₂-indole'],
  Y: ['Tyr', 'Tyrosine', '–CH₂C₆H₄OH'], V: ['Val', 'Valine', '–CH(CH₃)₂'], U: ['Sec', 'Selenocysteine', '–CH₂SeH'],
}
const residueName = (seq, pos) => `${AA[seq[pos - 1]]?.[0] ?? '?'}${pos}`

function Section({ title, children, hint }) {
  return (
    <section className="mt-6 first:mt-0">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{title}</h3>
      {hint && <p className="-mt-1 mb-2 text-xs text-gray-500">{hint}</p>}
      {children}
    </section>
  )
}

export default function AnatomyTab({ protein: p }) {
  const q = useQuery({ queryKey: ['anatomy', p.id], queryFn: () => api.anatomy(p.id) })
  if (q.isLoading) return <p className="text-gray-500">Loading…</p>
  if (q.isError) return <p className="text-red-300">{q.error.message}</p>
  const a = q.data
  return (
    <>
      <Recipe a={a} seq={p.sequence} />
      <BondLadder a={a} seq={p.sequence} />
      <Composition a={a} />
      <Section title="See it in 3D" hint="Colour the predicted structure by what holds it together. Click any amino acid to see its atoms.">
        {a.alphafold_url
          ? <AnatomyViewer url={a.alphafold_url} anatomy={a} seq={p.sequence} />
          : <p className="text-gray-500">No AlphaFold model for a protein this large.</p>}
      </Section>
      <Section title="How amino acids join" hint={`The first three amino acids of ${p.symbol}, drawn atom by atom.`}>
        <PeptideBondDiagram seq={p.sequence} symbol={p.symbol} />
      </Section>
    </>
  )
}

function Recipe({ a, seq }) {
  const total = a.total_atoms
  return (
    <Section title="Chemical recipe">
      <div className="rounded-lg bg-white/[.03] p-3">
        <div className="text-xl font-bold tracking-tight text-white" aria-label={`Formula ${Object.entries(a.formula).map(([el, n]) => `${el}${n}`).join(' ')}`}>
          {Object.entries(a.formula).map(([el, n]) => (
            <span key={el} className="mr-1"><span style={{ color: ELEMENT_COLORS[el] }}>{el}</span><sub className="ml-px text-[0.6em] font-semibold text-gray-300">{n}</sub></span>
          ))}
        </div>
        <SegmentBar className="mt-3" segments={Object.entries(a.formula).map(([el, n]) => ({
          key: el, value: n, color: ELEMENT_COLORS[el], label: ELEMENT_NAMES[el],
        }))} />
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {Object.entries(a.formula).map(([el, n]) => (
            <span key={el} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: ELEMENT_COLORS[el] }} />
              <span className="text-gray-200">{ELEMENT_NAMES[el]}</span>
              <span className="font-mono text-gray-400">{n.toLocaleString()} ({((n / total) * 100).toFixed(1)}%)</span>
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {total.toLocaleString()} atoms in the full chain the gene encodes ({a.length} amino acids), before any cutting or
          chemical tags. Each disulfide bridge removes 2 hydrogens.
        </p>
      </div>
      <p className="mt-2 text-xs text-gray-400">
        <span style={{ color: ELEMENT_COLORS.S }}>Sulfur</span> comes from only two amino acids:
        {' '}{a.sulfur_sources.Cys} cysteine{a.sulfur_sources.Cys === 1 ? '' : 's'} + {a.sulfur_sources.Met} methionine{a.sulfur_sources.Met === 1 ? '' : 's'}.
      </p>

      <div className="mt-3 space-y-2">
        {a.metals.length === 0 && <p className="text-xs text-gray-500">Needs no metal ions to work (according to UniProt).</p>}
        {a.metals.map((m) => (
          <div key={m.element} className="flex gap-3 rounded-lg border border-white/10 p-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md font-mono text-sm font-bold text-gray-950"
              style={{ background: ELEMENT_COLORS[m.element] }}>{m.element}</span>
            <div className="text-xs">
              <div className="text-gray-100">Also needs <b>{ELEMENT_NAMES[m.element]}</b>
                {m.ligands.length > 0 && <span className="text-gray-400"> ({m.ligands.join(', ')})</span>}
              </div>
              <div className="mt-0.5 text-gray-400">
                {m.residues.length
                  ? <>Held by {m.residues.map((r) => residueName(seq, r)).join(', ')}</>
                  : 'Listed as a cofactor; binding residues not mapped'}
              </div>
            </div>
          </div>
        ))}
        {a.other_ligands.length > 0 && (
          <p className="text-xs text-gray-500">
            Other molecules it binds: {a.other_ligands.map((l) => l.name).join(', ')}.
          </p>
        )}
      </div>
    </Section>
  )
}

function BondLadder({ a, seq }) {
  const b = a.bonds
  const pct = (n) => `${Math.round((n / a.length) * 100)}%`
  const metalSites = a.metals.reduce((n, m) => n + (m.residues.length ? 1 : 0), 0)
  const rows = [
    {
      name: 'Peptide bonds', kind: 'covalent', strength: 5, value: b.peptide.toLocaleString(),
      text: 'Link each amino acid to the next, forming the backbone. Each one releases a water molecule.',
    },
    {
      name: 'Disulfide bridges', kind: 'covalent', strength: 5, value: b.disulfides.length,
      text: b.disulfides.length
        ? <>Covalent S–S links between cysteines: {b.disulfides.map((d) => `${residueName(seq, d.from)}–${residueName(seq, d.to)}${d.note ? ` (${d.note.toLowerCase()})` : ''}`).join(', ')}.</>
        : 'None. They are common in proteins that work outside the cell and rare inside, where conditions break them.',
    },
    {
      name: 'Metal coordination', kind: 'fairly strong', strength: 4, value: metalSites ? a.metals.map((m) => m.element).join(', ') : 0,
      text: metalSites ? 'Side chains (often Cys and His) grip a metal ion and lock part of the fold in place.' : 'No metal sites mapped.',
    },
    {
      name: 'Hydrogen bonds', kind: 'weak, but many', strength: 2,
      value: b.helices + b.strands ? `${b.helices} helices · ${b.strands} strands` : '—',
      text: b.helices + b.strands
        ? <>Backbone N–H···O=C hydrogen bonds hold α-helices ({pct(b.helix_residues)} of residues) and pair β-strands into sheets ({pct(b.strand_residues)}). Counted from experimental structures (UniProt).</>
        : 'Present in every folded protein, but no experimental structure maps them for this one.',
    },
    {
      name: 'Ionic attractions', kind: 'weak', strength: 2, value: `+${a.groups.positive} / −${a.groups.negative}`,
      text: 'Positively charged (Lys, Arg, His) and negatively charged (Asp, Glu) side chains can pair up as salt bridges.',
    },
    {
      name: 'Hydrophobic effect', kind: 'weak, but drives folding', strength: 3, value: pct(a.groups.hydrophobic),
      text: 'Oily side chains hide from water by packing into the core. This is the main force that makes a chain fold.',
    },
  ]
  return (
    <Section title="What holds it together" hint="From strongest (top) to weakest. Weak bonds win by sheer numbers.">
      <ol className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.name} className="rounded-lg bg-white/[.03] p-2.5">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-gray-100">{r.name}</span>
              <span className="text-[10px] uppercase tracking-wider text-gray-500">{r.kind}</span>
              <span className="ml-auto flex gap-0.5" aria-label={`strength ${r.strength} of 5`}>
                {[1, 2, 3, 4, 5].map((i) => <span key={i} className={`h-1.5 w-3 rounded-sm ${i <= r.strength ? 'bg-amber-300' : 'bg-white/10'}`} />)}
              </span>
              <span className="w-28 shrink-0 text-right font-mono text-sm text-white">{r.value}</span>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-400">{r.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}

function Composition({ a }) {
  return (
    <Section title="Amino-acid building blocks" hint={`${a.length} amino acids, from ${a.composition.length} of the 20 kinds.`}>
      <SegmentBar segments={Object.entries(GROUPS).map(([g, info]) => ({
        key: g, value: a.groups[g], color: info.color, label: info.label,
      }))} />
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {Object.entries(GROUPS).map(([g, info]) => (
          <span key={g} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: info.color }} />
            <span className="text-gray-300">{info.label}</span>
            <span className="ml-auto font-mono text-gray-500">{a.groups[g]}</span>
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {a.composition.map((c) => (
          <span key={c.code} title={`${c.name}: ${c.count}`}
            className="rounded px-1.5 py-0.5 font-mono text-[11px]"
            style={{ background: `${GROUPS[c.group].color}22`, color: GROUPS[c.group].color }}>
            {c.abbr} {c.count}
          </span>
        ))}
      </div>
    </Section>
  )
}

const MODES = [
  ['secondary', 'Helices & sheets'],
  ['hydro', 'Oily vs water-loving'],
  ['links', 'Disulfides & metal sites'],
]

function inRanges(ranges, resi) {
  return ranges.some(([s, e]) => resi >= s && resi <= e)
}

function AnatomyViewer({ url, anatomy: a, seq }) {
  const el = useRef(null)
  const viewer = useRef(null)
  const [mode, setMode] = useState('secondary')
  const [status, setStatus] = useState('loading')
  const [picked, setPicked] = useState(null)

  const groupOf = useMemo(() => {
    const map = {}
    for (const c of a.composition) map[c.code] = c.group
    return map
  }, [a])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const mod = await import('3dmol')
        const $3Dmol = mod.createViewer ? mod : mod.default
        const text = await (await fetch(url)).text()
        if (cancelled) return
        viewer.current = $3Dmol.createViewer(el.current, { backgroundColor: '#0b0f17', antialias: true })
        viewer.current.addModel(text, 'pdb')
        viewer.current.zoomTo()
        setStatus('ready')
      } catch (e) {
        if (!cancelled) setStatus(`error: ${e.message}`)
      }
    })()
    return () => { cancelled = true; viewer.current?.clear() }
  }, [url])

  // Re-style whenever the mode or the picked residue changes.
  useEffect(() => {
    const v = viewer.current
    if (status !== 'ready' || !v) return
    v.removeAllShapes()
    v.removeAllLabels()
    const resiColor = (resi) => {
      if (mode === 'secondary') {
        if (inRanges(a.secondary.helix, resi)) return '#e879f9'
        if (inRanges(a.secondary.strand, resi)) return '#facc15'
        if (inRanges(a.secondary.turn, resi)) return '#38bdf8'
        return '#4b5563'
      }
      if (mode === 'hydro') return GROUPS[groupOf[seq[resi - 1]]]?.color ?? '#4b5563'
      return '#374151'
    }
    v.setStyle({}, { cartoon: { colorfunc: (atom) => resiColor(atom.resi), opacity: mode === 'links' ? 0.75 : 1 } })

    if (mode === 'links') {
      for (const d of a.bonds.disulfides) {
        v.addStyle({ resi: [d.from, d.to] }, { stick: { colorscheme: 'Jmol', radius: 0.25 } })
        const [s1] = v.selectedAtoms({ resi: d.from, atom: 'SG' })
        const [s2] = v.selectedAtoms({ resi: d.to, atom: 'SG' })
        if (s1 && s2) v.addCylinder({ start: s1, end: s2, radius: 0.3, color: ELEMENT_COLORS.S })
      }
      for (const m of a.metals) {
        if (!m.residues.length) continue
        v.addStyle({ resi: m.residues }, { stick: { colorscheme: 'Jmol', radius: 0.22 } })
        // AlphaFold models contain no metal ions, so mark the site at the centre of its side-chain tips.
        const tips = m.residues.flatMap((r) => v.selectedAtoms({ resi: r, atom: ['SG', 'NE2', 'ND1', 'OD1', 'OE1', 'OG'] }))
        if (tips.length) {
          const c = tips.reduce((acc, t) => ({ x: acc.x + t.x / tips.length, y: acc.y + t.y / tips.length, z: acc.z + t.z / tips.length }), { x: 0, y: 0, z: 0 })
          v.addSphere({ center: c, radius: 1.3, color: ELEMENT_COLORS[m.element], opacity: 0.85 })
          v.addLabel(`${m.element} site`, { position: c, fontSize: 11, backgroundColor: '#111827', backgroundOpacity: 0.8, fontColor: '#fff' })
        }
      }
    }

    if (picked) {
      v.addStyle({ resi: picked }, { stick: { colorscheme: 'Jmol', radius: 0.2 }, sphere: { colorscheme: 'Jmol', scale: 0.25 } })
      const [ca] = v.selectedAtoms({ resi: picked, atom: 'CA' })
      if (ca) v.addLabel(residueName(seq, picked), { position: ca, fontSize: 12, backgroundColor: '#111827', backgroundOpacity: 0.85, fontColor: '#fde68a' })
    }
    v.setClickable({}, true, (atom) => setPicked((cur) => (cur === atom.resi ? null : atom.resi)))
    v.render()
  }, [mode, picked, status, a, seq, groupOf])

  const pickedAtoms = useMemo(() => {
    if (!picked || !viewer.current) return null
    const counts = {}
    for (const at of viewer.current.selectedAtoms({ resi: picked })) counts[at.elem] = (counts[at.elem] || 0) + 1
    return counts
  }, [picked])

  const legend = mode === 'secondary'
    ? [['#e879f9', 'α-helix'], ['#facc15', 'β-strand'], ['#38bdf8', 'turn'], ['#4b5563', 'loop / not mapped']]
    : mode === 'hydro'
      ? Object.values(GROUPS).map((g) => [g.color, g.label])
      : [[ELEMENT_COLORS.S, 'disulfide (S–S)'], ...a.metals.map((m) => [ELEMENT_COLORS[m.element], `${ELEMENT_NAMES[m.element]} site (approx.)`])]

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {MODES.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setMode(key)}
            className={`rounded-md px-2 py-1 text-xs ${mode === key ? 'bg-white text-gray-950' : 'border border-white/10 text-gray-300 hover:bg-white/5'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="relative h-[300px] overflow-hidden rounded-lg border border-white/10">
        <div ref={el} className="absolute inset-0" />
        {status !== 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
            {status === 'loading' ? 'Loading structure…' : `Couldn't load structure (${status.slice(7)})`}
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-400">
        {legend.map(([c, l]) => <span key={l} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: c }} />{l}</span>)}
      </div>
      {mode === 'links' && !a.bonds.disulfides.length && !a.metals.some((m) => m.residues.length) && (
        <p className="mt-1 text-xs text-gray-500">This protein has no disulfide bridges or mapped metal sites.</p>
      )}
      {picked ? (
        <p className="mt-2 rounded-md bg-amber-300/10 px-2.5 py-1.5 text-xs text-amber-100">
          <b>{AA[seq[picked - 1]]?.[1]} {picked}</b>: {pickedAtoms && Object.entries(pickedAtoms).map(([el, n]) => `${n} ${el}`).join(', ')}
          {' '}atoms shown (C grey, N blue, O red, S yellow). Hydrogens aren't included in the model.
        </p>
      ) : (
        <p className="mt-2 text-xs text-gray-500">Click any part of the chain to show that amino acid's atoms and bonds.</p>
      )}
    </div>
  )
}

/** Atom-by-atom drawing of the first three amino acids, before and after they join. */
function PeptideBondDiagram({ seq, symbol }) {
  const [joined, setJoined] = useState(false)
  const residues = seq.slice(0, 3).split('')
  const SEP = 172
  const JOIN = 104
  const width = 40 + (residues.length - 1) * SEP + 150
  const C = { N: ELEMENT_COLORS.N, O: '#ff5b5b', C: '#d1d5db', H: '#9ca3af' }

  const Atom = ({ x, y, el, label, sizeFactor = 1 }) => (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={14 * sizeFactor} fontWeight="700" fill={C[el]}>{label ?? el}</text>
  )
  const Line = ({ x1, y1, x2, y2, gold, double }) => (
    <g stroke={gold ? '#fbbf24' : '#6b7280'} strokeWidth={gold ? 3 : 1.6}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      {double && <line x1={x1 + 5} y1={y1} x2={x2 + 5} y2={y2} />}
    </g>
  )

  return (
    <div>
      <div className="mb-2 flex gap-1">
        {[[false, 'Separate amino acids'], [true, 'Joined by peptide bonds']].map(([v, label]) => (
          <button key={label} type="button" onClick={() => setJoined(v)}
            className={`rounded-md px-2 py-1 text-xs ${joined === v ? 'bg-white text-gray-950' : 'border border-white/10 text-gray-300 hover:bg-white/5'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-white/10 bg-white/[.02]">
        <svg viewBox={`0 0 ${width} 210`} className="min-w-[520px]" role="img"
          aria-label={`${residues.map((r) => AA[r][1]).join(', ')} ${joined ? 'joined by peptide bonds' : 'as separate amino acids'}`}>
          {residues.map((r, i) => {
            const flip = i % 2 ? -1 : 1 // zig-zag: odd residues are mirrored
            const x0 = 40 + i * (joined ? JOIN : SEP)
            const y0 = 95
            const first = i === 0
            const last = i === residues.length - 1
            const losesH = joined && !first // amine H leaves to make water
            const losesOH = joined && !last // carboxyl OH leaves to make water
            const yy = (dy) => y0 + dy * flip
            return (
              <g key={i} style={{ transition: 'transform .6s ease' }}>
                {/* amine N with its hydrogens */}
                <Atom x={x0} y={yy(0)} el="N" />
                <Line x1={x0} y1={yy(-9)} x2={x0} y2={yy(-20)} />
                <Atom x={x0} y={yy(-28)} el="H" />
                <g style={{ opacity: losesH ? 0 : 1, transition: 'opacity .5s' }}>
                  <Line x1={x0 - 8} y1={yy(4)} x2={x0 - 17} y2={yy(10)} />
                  <Atom x={x0 - 24} y={yy(14)} el="H" />
                </g>
                {/* alpha carbon, its H and the side chain R */}
                <Line x1={x0 + 8} y1={yy(4)} x2={x0 + 28} y2={yy(13)} />
                <Atom x={x0 + 36} y={yy(16)} el="C" label="Cα" sizeFactor={0.9} />
                <Line x1={x0 + 36} y1={yy(8)} x2={x0 + 36} y2={yy(-6)} />
                <Atom x={x0 + 36} y={yy(-14)} el="H" />
                <Line x1={x0 + 36} y1={yy(26)} x2={x0 + 36} y2={yy(44)} />
                <g transform={`translate(${x0 + 36}, ${yy(58)})`}>
                  <rect x={-46} y={-12} width={92} height={24} rx={6} fill="#1f2937" stroke="#4b5563" />
                  <text textAnchor="middle" dominantBaseline="central" fontSize="10" fill="#e5e7eb">{AA[r][2]}</text>
                </g>
                <text x={x0 + 36} y={yy(82)} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="700" fill="#fde68a">
                  {AA[r][0]} {i + 1}
                </text>
                {/* carbonyl carbon, =O and the –OH that leaves */}
                <Line x1={x0 + 44} y1={yy(13)} x2={x0 + 64} y2={yy(4)} />
                <Atom x={x0 + 72} y={yy(0)} el="C" />
                <Line x1={x0 + 70} y1={yy(-9)} x2={x0 + 70} y2={yy(-20)} double />
                <Atom x={x0 + 74} y={yy(-30)} el="O" />
                <g style={{ opacity: losesOH ? 0 : 1, transition: 'opacity .5s' }}>
                  <Line x1={x0 + 80} y1={yy(4)} x2={x0 + 96} y2={yy(12)} />
                  <Atom x={x0 + 104} y={yy(16)} el="O" />
                  <Atom x={x0 + 120} y={yy(16)} el="H" />
                </g>
                {/* the new peptide bond and the water it releases */}
                {joined && !last && (
                  <>
                    <Line x1={x0 + 80} y1={yy(0)} x2={x0 + JOIN - 8} y2={yy(0)} gold />
                    <text x={x0 + 88} y={20} textAnchor="middle" fontSize="11" fontWeight="700" fill="#38bdf8">+ H₂O</text>
                  </>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-gray-400">
        {joined
          ? <>The <span className="font-semibold text-amber-300">gold</span> lines are peptide bonds. Each forms when the –OH of one amino acid and an H from the next leave together as one water molecule (H₂O). Building all of {symbol} releases {(seq.length - 1).toLocaleString()} water molecules.</>
          : <>Every amino acid has the same backbone (N, Cα, C) and differs only in its side chain (the grey box). Switch to <i>Joined</i> to see the peptide bonds form.</>}
      </p>
    </div>
  )
}
