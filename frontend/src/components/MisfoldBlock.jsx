import { MISFOLD_KINDS, isInert, proteinState } from '../lib/filters'
import FitText from './FitText'

/**
 * The block below the main table (like the lanthanides): disease conformers.
 * Each tile is a different fold of a protein that also sits in the main grid.
 */
export default function MisfoldBlock({ data, filters, selectedId, onSelect, register, onHover }) {
  const forms = data.proteins
    .filter((p) => p.misfolded)
    .sort((a, b) => a.misfolded.block_order - b.misfolded.block_order)
  const groups = Object.keys(MISFOLD_KINDS).map((kind) => ({
    kind, ...MISFOLD_KINDS[kind], items: forms.filter((p) => p.misfolded.kind === kind),
  }))

  return (
    <section className="mt-6 rounded-xl border border-red-500/20 bg-red-950/10 p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sm font-bold text-red-200">Misfolding & amyloid block</h2>
        <p className="text-[11px] text-gray-400">
          Same amino-acid sequence, different 3D fold, like diamond and graphite are both carbon.
          Hover a tile to see where its normal form sits.
        </p>
      </div>
      <div className="flex flex-wrap gap-4">
        {groups.map((g) => (
          <div key={g.kind}>
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: g.color }}>
              <span className="h-2 w-2 rounded-sm" style={{ background: g.color }} />
              {g.label}
              <span className="font-normal normal-case tracking-normal text-gray-500">· {g.note}</span>
            </div>
            <div className="flex flex-wrap gap-[5px]">
              {g.items.map((p) => {
                const m = p.misfolded
                const state = proteinState(p, { ...filters, misfoldMode: false })
                if (state === 'hidden') {
                  return <div key={p.id} className="h-[78px] w-[68px] rounded-md border border-dashed border-gray-700/70" />
                }
                return (
                  <button key={p.id} type="button" ref={(el) => register(p.id, el)}
                    disabled={isInert(p, filters)} tabIndex={isInert(p, filters) ? -1 : undefined}
                    onMouseEnter={() => onHover(p.id)} onMouseLeave={() => onHover(null)}
                    onFocus={() => onHover(p.id)} onBlur={() => onHover(null)}
                    onClick={() => onSelect(p.id, 'misfold')}
                    title={`${m.name}\nFrom: ${p.name}\n${m.diseases.join(', ')}`}
                    className={`flex h-[78px] w-[68px] flex-col justify-between rounded-md border px-1.5 py-1 text-left transition-all hover:-translate-y-0.5 hover:brightness-125 ${
                      state === 'dim' ? 'opacity-25 saturate-0' : ''} ${isInert(p, filters) ? 'pointer-events-none' : ''} ${p.id === selectedId ? 'ring-2 ring-white' : ''}`}
                    style={{ borderColor: g.color, background: `repeating-linear-gradient(135deg, ${g.color}40 0 5px, ${g.color}14 5px 10px)` }}>
                    <span className="font-mono text-[9px] leading-none text-white/70">{p.number}</span>
                    <FitText max={17} className="font-extrabold leading-none text-white">{m.symbol}</FitText>
                    <span className="truncate text-[8.5px] leading-tight text-white/80">from {p.symbol}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
