import { useEffect, useRef, useState } from 'react'

// AlphaFold confidence (pLDDT, stored in the B-factor column) → official colours.
const plddtColor = (b) => (b >= 90 ? '#0053d6' : b >= 70 ? '#65cbf3' : b >= 50 ? '#ffdb13' : '#ff7d45')

/** Interactive 3D cartoon via 3Dmol.js. `sources`: [{ label, url, format, kind: 'alphafold' | 'pdb' }] */
export default function StructureViewer({ sources, height = 340 }) {
  const el = useRef(null)
  const viewer = useRef(null)
  const [index, setIndex] = useState(0)
  const [status, setStatus] = useState('loading')
  const [spin, setSpin] = useState(true)
  const source = sources[index]

  useEffect(() => {
    if (!source) return
    let cancelled = false
    setStatus('loading')
    ;(async () => {
      try {
        const mod = await import('3dmol')
        const $3Dmol = mod.createViewer ? mod : mod.default
        const res = await fetch(source.url)
        if (!res.ok) throw new Error(res.statusText)
        const text = await res.text()
        if (cancelled) return
        if (!viewer.current) {
          viewer.current = $3Dmol.createViewer(el.current, { backgroundColor: '#0b0f17', antialias: true })
        }
        const v = viewer.current
        v.clear()
        v.addModel(text, source.format)
        v.setStyle({}, source.kind === 'alphafold'
          ? { cartoon: { colorfunc: (atom) => plddtColor(atom.b) } }
          : source.kind === 'complex'
            ? { cartoon: { colorscheme: 'chain' } }
            : { cartoon: { color: 'spectrum' } })
        if (source.kind === 'complex') {
          // Show bound small molecules (e.g. heme) as sticks, but not water.
          v.addStyle({ hetflag: true, not: { resn: ['HOH', 'DOD'] } }, { stick: { colorscheme: 'Jmol', radius: 0.25 } })
        }
        v.zoomTo()
        v.render()
        setStatus('ready')
      } catch (e) {
        if (!cancelled) setStatus(`error: ${e.message}`)
      }
    })()
    return () => { cancelled = true }
  }, [source])

  useEffect(() => {
    if (status === 'ready') viewer.current?.spin(spin ? 'y' : false, 0.6)
  }, [spin, status])

  useEffect(() => () => viewer.current?.clear(), [])

  if (!sources.length) return <p className="text-sm text-gray-400">No 3D structure available.</p>

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select value={index} onChange={(e) => setIndex(Number(e.target.value))}
          className="rounded-md border border-white/10 bg-gray-900 px-2 py-1 text-xs text-gray-200">
          {sources.map((s, i) => <option key={s.url} value={i}>{s.label}</option>)}
        </select>
        <button type="button" onClick={() => setSpin(!spin)} className="rounded-md border border-white/10 px-2 py-1 text-xs text-gray-300 hover:bg-white/5">
          {spin ? 'Stop spinning' : 'Spin'}
        </button>
        <span className="text-[11px] text-gray-500">Drag to rotate · scroll to zoom</span>
      </div>
      <div className="relative overflow-hidden rounded-lg border border-white/10" style={{ height }}>
        <div ref={el} className="absolute inset-0" />
        {status !== 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
            {status === 'loading' ? 'Loading structure…' : `Couldn't load structure (${status.slice(7)})`}
          </div>
        )}
      </div>
      {source?.kind === 'alphafold' && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-gray-400">
          AlphaFold confidence:
          {[['#0053d6', 'Very high'], ['#65cbf3', 'Confident'], ['#ffdb13', 'Low'], ['#ff7d45', 'Very low']].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: c }} />{l}</span>
          ))}
        </div>
      )}
    </div>
  )
}
