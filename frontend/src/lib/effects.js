// How one protein affects another (OmniPath literature-curated consensus).
export const EFFECTS = {
  activates: { label: 'Activates', verb: 'activates', color: '#4ade80', marker: 'arrow', note: 'switches the target on or increases it' },
  inhibits: { label: 'Inhibits', verb: 'inhibits', color: '#f87171', marker: 'bar', note: 'switches the target off or decreases it' },
  both: { label: 'Both (depends on context)', verb: 'activates or inhibits', color: '#fbbf24', marker: 'arrow', note: 'sources report both effects' },
  regulates: { label: 'Regulates (sign unclear)', verb: 'regulates', color: '#93c5fd', marker: 'arrow', note: 'direction known, effect not agreed' },
  binds: { label: 'Binds (no curated effect)', verb: 'binds', color: '#cbd5e1', marker: null, note: 'physical contact only (STRING)' },
}

/** The effect to draw for a selected protein and one partner, with its direction. */
export function effectBetween(partner) {
  if (partner.effect_out) return { effect: partner.effect_out, outward: true }
  if (partner.effect_in) return { effect: partner.effect_in, outward: false }
  return { effect: 'binds', outward: true }
}
