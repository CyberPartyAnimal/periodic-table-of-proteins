// Decides how each protein looks under the current controls.
// 'hidden' = not yet discovered (timeline), 'dim' = filtered out, 'on' = shown.

export const MISFOLD_KINDS = {
  prion: { label: 'True prion', color: '#ef4444', note: 'Infectious: spreads between individuals' },
  'prion-like': { label: 'Prion-like', color: '#f97316', note: 'Seeds spread from cell to cell' },
  amyloid: { label: 'Amyloid', color: '#eab308', note: 'Deposits as amyloid fibrils in tissues' },
  polymer: { label: 'Polymer', color: '#a855f7', note: 'Forms chains without amyloid' },
}

export function matchesSearch(p, q) {
  if (!q) return true
  const s = q.trim().toLowerCase()
  return (
    p.symbol.toLowerCase().includes(s) ||
    p.name.toLowerCase().includes(s) ||
    p.gene.toLowerCase().includes(s) ||
    String(p.number) === s ||
    (p.misfolded && p.misfolded.symbol.toLowerCase().includes(s))
  )
}

/** Does the protein pass every active filter? (The timeline is separate: it hides, it doesn't fade.) */
export function matchesFilters(p, f) {
  if (f.organism !== 'human' && !p.orthologs?.[f.organism]) return false
  if (f.pathway && !p.pathways.includes(f.pathway)) return false
  if (f.drugOnly && p.drugs.length === 0) return false
  if (f.misfoldMode && !p.misfolded) return false
  if (f.search && !matchesSearch(p, f.search)) return false
  return true
}

export function proteinState(p, f) {
  if (f.year != null && p.discovery_year > f.year) return 'hidden'
  return scopeRole(p, f) === 'outside' ? 'dim' : 'on'
}

export function anyFilterActive(f) {
  return f.organism !== 'human' || !!f.pathway || f.drugOnly || f.misfoldMode || !!f.search
}

/**
 * The focus whenever any filter is on: proteins that match it ("members") plus their direct interaction
 * partners. One step out only; a partner's own other partners are not included. Everything else fades and
 * becomes inert. Proteins not yet discovered (timeline) are left out entirely.
 */
export function focusScope(proteins, interactions, f) {
  if (!anyFilterActive(f)) return null
  const known = new Set(proteins.filter((p) => f.year == null || p.discovery_year <= f.year).map((p) => p.id))
  const members = new Set(proteins.filter((p) => known.has(p.id) && matchesFilters(p, f)).map((p) => p.id))
  const partners = new Set()
  for (const { a, b } of interactions) {
    if (!known.has(a) || !known.has(b)) continue
    if (members.has(a) && !members.has(b)) partners.add(b)
    if (members.has(b) && !members.has(a)) partners.add(a)
  }
  return { members, partners }
}

// 'member' | 'partner' | 'outside' (null when no filter is on).
export function scopeRole(p, f) {
  if (!anyFilterActive(f)) return null
  if (!f.scope) return matchesFilters(p, f) ? 'member' : 'outside'
  return f.scope.members.has(p.id) ? 'member' : f.scope.partners.has(p.id) ? 'partner' : 'outside'
}

// Outside the focus: faded and inert (no hover, highlight or click).
export const isInert = (p, f) => scopeRole(p, f) === 'outside'

// With a filter on, an interaction counts only if a matching protein is at one end; partner-to-partner
// and partner-to-outsider interactions stay faded and inert.
export const isLinkInert = (aId, bId, f) =>
  !!f.scope && !(f.scope.members.has(aId) || f.scope.members.has(bId))

// One fade for everything inert or filtered out (proteins and the interactions touching them).
export const FADED_COLOR = 'rgba(75,85,99,0.12)'
