// Two data sources:
//  - development (`npm run dev`): the live FastAPI backend under /api, proxied by Vite
//  - published site (`npm run build`): static JSON exported by `seed.export_static` into public/data
// The static site needs no server or database, because the data is read-only.
const STATIC = import.meta.env.VITE_STATIC_DATA === 'true'

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

const live = (path) => getJson(`/api${path}`)
const file = (path) => getJson(`${import.meta.env.BASE_URL}data/${path}.json`)

/** Same answer as the API's /compare, worked out in the browser from the two proteins' details. */
async function compareLocally(a, b) {
  const [A, B, table] = await Promise.all([api.protein(a), api.protein(b), api.table()])
  const bPartners = new Set(B.partners.map((p) => p.id))
  return {
    a: A,
    b: B,
    interaction_score: A.partners.find((p) => p.id === B.id)?.score ?? null,
    shared_pathways: A.pathways.filter((code) => B.pathways.includes(code)).sort(),
    shared_partners: A.partners.filter((p) => bPartners.has(p.id)),
    shared_organisms: table.organisms.map((o) => o.code).filter((o) => A.orthologs[o] && B.orthologs[o]),
  }
}

export const api = {
  table: () => (STATIC ? file('table') : live('/table')),
  protein: (id) => (STATIC ? file(`proteins/${id}`) : live(`/proteins/${encodeURIComponent(id)}`)),
  anatomy: (id) => (STATIC ? file(`anatomy/${id}`) : live(`/proteins/${encodeURIComponent(id)}/anatomy`)),
  assembly: (id) => (STATIC ? file(`assembly/${id}`) : live(`/proteins/${encodeURIComponent(id)}/assembly`)),
  compare: (a, b) => (STATIC ? compareLocally(a, b) : live(`/compare?a=${a}&b=${b}`)),
}
