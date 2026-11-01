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

export function proteinState(p, f) {
  if (f.year != null && p.discovery_year > f.year) return 'hidden'
  if (f.organism !== 'human' && !p.orthologs?.[f.organism]) return 'dim'
  if (f.pathway && pathwayRole(p, f) === 'outside') return 'dim'
  if (f.drugOnly && p.drugs.length === 0) return 'dim'
  if (f.misfoldMode && !p.misfolded) return 'dim'
  if (f.search && !matchesSearch(p, f.search)) return 'dim'
  return 'on'
}

export function anyFilterActive(f) {
  return f.organism !== 'human' || !!f.pathway || f.drugOnly || f.misfoldMode || !!f.search
}

/**
 * Pathway focus = the pathway's members plus their direct interaction partners. One step out only:
 * a partner's own other partners are not included.
 */
export function pathwayScope(proteins, interactions, pathway) {
  if (!pathway) return null
  const members = new Set(proteins.filter((p) => p.pathways.includes(pathway)).map((p) => p.id))
  const partners = new Set()
  for (const { a, b } of interactions) {
    if (members.has(a) && !members.has(b)) partners.add(b)
    if (members.has(b) && !members.has(a)) partners.add(a)
  }
  return { members, partners }
}

// 'member' | 'partner' | 'outside' (null when no pathway is chosen).
export function pathwayRole(p, f) {
  if (!f.pathway) return null
  if (!f.scope) return p.pathways.includes(f.pathway) ? 'member' : 'outside'
  return f.scope.members.has(p.id) ? 'member' : f.scope.partners.has(p.id) ? 'partner' : 'outside'
}

// Outside the pathway focus: faded and inert (no hover, highlight or click).
export const isInert = (p, f) => pathwayRole(p, f) === 'outside'

// In a pathway view an interaction counts only if a pathway member is at one end; partner-to-partner
// and partner-to-outsider interactions stay faded and inert.
export const isLinkInert = (aId, bId, f) =>
  !!f.pathway && !!f.scope && !(f.scope.members.has(aId) || f.scope.members.has(bId))

// One fade for everything inert or filtered out (proteins and the interactions touching them).
export const FADED_COLOR = 'rgba(75,85,99,0.12)'
