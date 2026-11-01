import { MISFOLD_KINDS } from '../lib/filters'
import FitText from './FitText'

export const formatMass = (kda) => (kda >= 100 ? Math.round(kda) : kda.toFixed(1))

export function PillIcon({ className = 'h-3 w-3', style }) {
  return (
    <svg viewBox="0 0 16 16" className={className} style={style} aria-hidden="true">
      <g transform="rotate(-40 8 8)">
        <rect x="1" y="5" width="14" height="6" rx="3" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M4 5h4v6H4a3 3 0 0 1 0-6z" fill="currentColor" />
      </g>
    </svg>
  )
}

export function WarnIcon({ className = 'h-3 w-3', style }) {
  return (
    <svg viewBox="0 0 16 16" className={className} style={style} aria-hidden="true">
      <path d="M8 1.5 15 14H1z" fill="currentColor" />
      <path d="M8 6v4M8 11.6v.6" stroke="#0b0f17" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/**
 * One element-style tile. In misfold mode, proteins with a disease conformer
 * flip to show it (same sequence, different fold, like an allotrope).
 */
export default function Tile({ protein: p, color, state = 'on', flipped = false, organism = 'human',
  selected = false, ring = null, compact = false, inert = false, subdued = false, onClick, onMouseEnter, onMouseLeave }) {
  const m = p.misfolded
  const showMisfold = flipped && m
  const kind = m && MISFOLD_KINDS[m.kind]
  const missing = organism !== 'human' && !p.orthologs?.[organism]
  const subtitle = organism === 'human' ? p.name : p.orthologs?.[organism] || 'no ortholog'
  const tone = showMisfold ? kind.color : color
  const label = showMisfold ? m.symbol : p.symbol

  return (
    <button
      type="button"
      disabled={inert}
      tabIndex={inert ? -1 : undefined}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      aria-label={`${p.symbol}, ${p.name}`}
      title={`#${p.number} ${p.name} (${p.gene})${m ? `\nMisfolds into ${m.symbol}: ${m.diseases[0]}` : ''}`}
      className={[
        'relative flex h-full w-full flex-col justify-between rounded-md border px-1.5 py-1 text-left',
        'transition-all duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
        inert ? 'pointer-events-none opacity-[.18] saturate-0'
          : state === 'dim' ? 'opacity-[.18] saturate-0 hover:opacity-60' : 'hover:-translate-y-0.5 hover:brightness-125',
        // Direct partner of a pathway: shown, but quieter than the pathway's own members.
        subdued && !selected ? 'opacity-55 hover:opacity-100' : '',
        selected ? 'z-10 scale-[1.06] ring-2 ring-white' : '',
        showMisfold ? 'animate-[flip_.5s_ease-out]' : '',
      ].join(' ')}
      style={{
        borderColor: tone,
        background: showMisfold
          ? `repeating-linear-gradient(135deg, ${tone}40 0 5px, ${tone}1a 5px 10px)`
          : `linear-gradient(160deg, ${tone}40, ${tone}12)`,
        boxShadow: ring ? `0 0 0 2px ${ring}, 0 0 16px ${ring}99` : undefined,
      }}
    >
      <div className="font-mono text-[9px] leading-none text-white/70">{p.number}</div>
      <div className="flex items-center justify-center">
        <FitText max={compact ? 15 : 19} className="font-extrabold leading-none tracking-tight text-white">{label}</FitText>
      </div>
      {!compact && (
        <div className="min-w-0">
          <div className={`truncate text-[8.5px] leading-tight ${missing ? 'italic text-white/50' : 'text-white/80'}`}>
            {showMisfold ? m.name : subtitle}
          </div>
          <div className="mt-px flex items-center justify-between font-mono text-[8.5px] leading-none text-white/60">
            <span className="truncate whitespace-nowrap">{showMisfold ? m.kind : formatMass(p.mass_kda)}</span>
            <span className="flex shrink-0 gap-0.5">
              {p.drugs.length > 0 && <PillIcon className="h-2.5 w-2.5 text-emerald-300" />}
              {m && !showMisfold && <WarnIcon className="h-2.5 w-2.5" style={{ color: kind.color }} />}
            </span>
          </div>
        </div>
      )}
    </button>
  )
}
