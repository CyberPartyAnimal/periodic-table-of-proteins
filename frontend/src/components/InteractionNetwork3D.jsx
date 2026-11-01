import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph3D from '3d-force-graph'
import SpriteText from 'three-spritetext'
import { forceX, forceY, forceZ } from 'd3-force-3d'
import { FADED_COLOR, MISFOLD_KINDS, isInert, isLinkInert, pathwayRole, pathwayScope, proteinState } from '../lib/filters'
import { EFFECTS } from '../lib/effects'
import { escapeHtml, safeColor } from '../lib/html'
import { EffectSwatch } from './Legend'

const ARRANGEMENTS = [
  ['free', 'By interactions', 'Proteins that bind each other pull together'],
  ['location', 'Cell layers', 'Stacked from the nucleus (top) to outside the cell (bottom)'],
  ['family', 'Family clusters', 'Each function family gathers around its own anchor'],
]
const NODE_REL_SIZE = 4
const LAYER_GAP = 45
const CLUSTER_RADIUS = 170

const familyAnchor = (index, count) => {
  const angle = (index / count) * Math.PI * 2
  return { x: Math.cos(angle) * CLUSTER_RADIUS, z: Math.sin(angle) * CLUSTER_RADIUS }
}
const layerY = (row, rows) => ((rows + 1) / 2 - row) * LAYER_GAP

// Pointer hit-testing. Only spheres should catch the mouse, and only when they're actually visible:
//  'on'   – normal hit target
//  'back' – faded: still clickable, but only if nothing visible is behind it on the same ray
//  'off'  – inert (outside the chosen pathway): never hit
const NO_HIT = () => {}
function setHitMode(mesh, mode) {
  if (mode === 'on') { delete mesh.raycast; return }
  if (mode === 'off') { mesh.raycast = NO_HIT; return }
  const raycastMesh = Object.getPrototypeOf(mesh).raycast
  mesh.raycast = function (raycaster, hits) {
    const from = hits.length
    raycastMesh.call(this, raycaster, hits)
    for (let i = from; i < hits.length; i++) hits[i].distance += 1e6 // sorts after every visible hit
  }
}

const withAlpha = (hex, a) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}

/**
 * 3D force-directed network of physical interactions (STRING) between proteins,
 * with curated effects (OmniPath) shown as coloured, arrowed links.
 * Shares filters and selection with the table view.
 */
export default function InteractionNetwork3D({ data, filters, selectedId, onSelect }) {
  const el = useRef(null)
  const graph = useRef(null)
  const nodeCache = useRef(new Map()) // keeps positions stable when the node set changes
  const guides = useRef([])
  const needsFit = useRef(true)
  const filtersRef = useRef(filters) // filters + this view's pathway scope, read by hover/click handlers
  const [hoverId, setHoverId] = useState(null)
  const [minScore, setMinScore] = useState(0.7)
  const [hideIsolated, setHideIsolated] = useState(true)
  const [effectsOnly, setEffectsOnly] = useState(false)
  const [labels, setLabels] = useState(true)
  const [arrange, setArrange] = useState('free')
  const [panelOpen, setPanelOpen] = useState(true)

  const families = useMemo(() => Object.fromEntries(data.families.map((f) => [f.code, f])), [data])
  const locations = useMemo(() => Object.fromEntries(data.locations.map((l) => [l.code, l])), [data])

  // Visible graph: drop proteins not yet discovered (timeline) and interactions below the cut-off.
  // An interaction with a curated effect becomes one arrowed link per direction.
  const graphData = useMemo(() => {
    const visible = new Map()
    for (const p of data.proteins) if (proteinState(p, filters) !== 'hidden') visible.set(p.id, p)
    const links = []
    let count = 0
    const degree = new Map()
    for (const i of data.interactions) {
      if (i.score < minScore || !visible.has(i.a) || !visible.has(i.b)) continue
      if (effectsOnly && !i.a_to_b && !i.b_to_a) continue
      count++
      degree.set(i.a, (degree.get(i.a) || 0) + 1)
      degree.set(i.b, (degree.get(i.b) || 0) + 1)
      const twoWay = !!(i.a_to_b && i.b_to_a)
      if (i.a_to_b) links.push({ source: i.a, target: i.b, score: i.score, effect: i.a_to_b, curved: twoWay })
      if (i.b_to_a) links.push({ source: i.b, target: i.a, score: i.score, effect: i.b_to_a, curved: twoWay })
      if (!i.a_to_b && !i.b_to_a) links.push({ source: i.a, target: i.b, score: i.score, effect: 'binds' })
    }
    const nodes = []
    let isolatedHidden = 0
    for (const p of visible.values()) {
      if (hideIsolated && !degree.get(p.id)) { isolatedHidden++; continue }
      const node = nodeCache.current.get(p.id) || { id: p.id }
      Object.assign(node, { protein: p, degree: degree.get(p.id) || 0 })
      nodeCache.current.set(p.id, node)
      nodes.push(node)
    }
    return { nodes, links, count, identified: visible.size, isolatedHidden }
  }, [data, filters.year, minScore, hideIsolated, effectsOnly]) // eslint-disable-line react-hooks/exhaustive-deps

  const neighbors = useMemo(() => {
    const map = new Map()
    for (const l of graphData.links) {
      const a = l.source.id ?? l.source
      const b = l.target.id ?? l.target
      ;(map.get(a) || map.set(a, new Set()).get(a)).add(b)
      ;(map.get(b) || map.set(b, new Set()).get(b)).add(a)
    }
    return map
  }, [graphData])

  // Create the 3D scene once.
  useEffect(() => {
    const container = el.current
    const g = new ForceGraph3D(container, { controlType: 'orbit' })
      .backgroundColor('#0b0f17')
      .nodeRelSize(NODE_REL_SIZE)
      .nodeOpacity(0.95)
      .nodeResolution(16)
      .linkOpacity(1)
      .linkDirectionalArrowRelPos(1)
      .linkDirectionalParticleWidth(2)
      .linkDirectionalParticleSpeed(0.006)
      .showNavInfo(false)
      // Dragging single spheres crashes the library's orbit controls when a gesture is cancelled,
      // and competes with clicking; rotate / zoom / pan / swipe cover moving around.
      .enableNodeDrag(false)
      .cooldownTime(6000)
      .onEngineStop(() => {
        if (needsFit.current) g.zoomToFit(800, 30)
        needsFit.current = false
      })
    graph.current = g
    const ro = new ResizeObserver(() => g.width(container.clientWidth).height(container.clientHeight))
    ro.observe(container)

    // A sideways swipe (or shift+scroll) belongs to the page, not the 3D camera: keep it away from the
    // orbit controls, which would swallow it, so the page can slide out from under the details panel.
    const onWheel = (e) => {
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.stopPropagation()
    }
    container.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => {
      container.removeEventListener('wheel', onWheel, { capture: true })
      ro.disconnect()
      g._destructor()
      container.innerHTML = ''
      graph.current = null
    }
  }, [])

  // Feed data and interactions.
  useEffect(() => {
    graph.current
      ?.graphData(graphData)
      .onNodeHover((n) => {
        const live = n && !isInert(n.protein, filtersRef.current)
        setHoverId(live ? n.id : null)
        el.current.style.cursor = live ? 'pointer' : 'grab'
      })
      .onNodeClick((n) => { if (!isInert(n.protein, filtersRef.current)) onSelect(n.id) })
      .onBackgroundClick(() => onSelect(null))
  }, [graphData, onSelect])

  // Layout forces: free, stacked by cell location, or clustered by family.
  useEffect(() => {
    const g = graph.current
    if (!g) return
    const rows = data.locations.length
    const fam = (n) => families[n.protein.family]
    const strength = 0.12
    // A gentle pull to the centre stops small separate groups drifting off into space.
    const gravity = 0.05
    g.d3Force('x', forceX(0).strength(gravity))
      .d3Force('y', forceY(0).strength(gravity))
      .d3Force('z', forceZ(0).strength(gravity))
    if (arrange === 'location') {
      g.d3Force('y', forceY((n) => layerY(locations[n.protein.location].row_index, rows)).strength(0.6))
    } else if (arrange === 'family') {
      const count = data.families.length
      g.d3Force('x', forceX((n) => familyAnchor(fam(n).column_index - 1, count).x).strength(strength))
      g.d3Force('z', forceZ((n) => familyAnchor(fam(n).column_index - 1, count).z).strength(strength))
    }
    // Re-frame once the new arrangement has settled (see onEngineStop).
    needsFit.current = true
    g.d3ReheatSimulation()

    // Floating guide labels for the layers or family anchors.
    const scene = g.scene()
    for (const obj of guides.current) scene.remove(obj)
    guides.current = []
    if (arrange === 'location') {
      for (const loc of data.locations) {
        const s = new SpriteText(`${loc.row_index} ${loc.name}`, 5, '#9ca3af')
        s.position.set(-170, layerY(loc.row_index, rows), 0)
        guides.current.push(s)
      }
    } else if (arrange === 'family') {
      for (const f of data.families) {
        const s = new SpriteText(f.name, 6, f.color)
        const a = familyAnchor(f.column_index - 1, data.families.length)
        s.position.set(a.x * 1.45, 34, a.z * 1.45)
        guides.current.push(s)
      }
    }
    for (const obj of guides.current) scene.add(obj)
  }, [arrange, data, families, locations])

  // Colours, labels and highlighting react to hover, selection and filters.
  useEffect(() => {
    const g = graph.current
    if (!g) return
    const focus = hoverId ?? selectedId
    const near = focus ? neighbors.get(focus) || new Set() : null
    const pathwayColor = filters.pathway && data.pathways.find((p) => p.code === filters.pathway)?.color
    const endId = (x) => x.id ?? x
    // Pathway scope from the links actually drawn (respects the confidence slider): members + direct partners.
    const f = {
      ...filters,
      scope: pathwayScope(graphData.nodes.map((n) => n.protein),
        graphData.links.map((l) => ({ a: endId(l.source), b: endId(l.target) })), filters.pathway),
    }
    filtersRef.current = f
    const inertIds = new Set(graphData.nodes.filter((n) => isInert(n.protein, f)).map((n) => n.id))
    // Proteins faded by any filter (misfolded mode, drug targets, organism, search, pathway).
    const fadedIds = new Set(graphData.nodes.filter((n) => proteinState(n.protein, f) === 'dim').map((n) => n.id))
    const isLit = (n) => !inertIds.has(n.id) && (!near || n.id === focus || near.has(n.id))
    // A link fades with its proteins: if either end is faded or inert, or (in a pathway view) neither
    // end is a pathway member.
    const linkInert = (l) => {
      const a = endId(l.source)
      const b = endId(l.target)
      return inertIds.has(a) || inertIds.has(b) || fadedIds.has(a) || fadedIds.has(b) || isLinkInert(a, b, f)
    }
    const touches = (l) => focus && !linkInert(l) && (endId(l.source) === focus || endId(l.target) === focus)

    const nodeColor = (n) => {
      const p = n.protein
      if (proteinState(p, f) === 'dim' || !isLit(n)) return FADED_COLOR
      if (filters.misfoldMode && p.misfolded) return MISFOLD_KINDS[p.misfolded.kind].color
      // Pathway view: members in the pathway colour, direct partners in their family colour but dimmer.
      if (pathwayColor) return pathwayRole(p, f) === 'member' ? pathwayColor : withAlpha(families[p.family].color, 0.5)
      return families[p.family].color
    }

    g.nodeVal((n) => 1 + n.degree * 0.45)
      .nodeColor(nodeColor)
      .nodeLabel((n) => {
        if (inertIds.has(n.id)) return ''
        const p = n.protein
        const m = filters.misfoldMode && p.misfolded
        // 3d-force-graph inserts this as HTML, so every data value is escaped.
        return `<div style="background:#111827ee;border:1px solid ${safeColor(families[p.family].color)};border-radius:8px;padding:6px 9px;font:12px Inter,sans-serif;color:#e5e7eb;max-width:240px">
          <b style="font-size:14px;color:#fff">${escapeHtml(m ? m.symbol : p.symbol)}</b> <span style="color:#9ca3af">#${escapeHtml(p.number)}</span><br/>
          ${escapeHtml(m ? m.name : p.name)}<br/>
          <span style="color:#9ca3af">${escapeHtml(families[p.family].name)} · ${escapeHtml(locations[p.location].name)}<br/>${n.degree} interaction${n.degree === 1 ? '' : 's'} shown</span></div>`
      })
      .nodeThreeObjectExtend(true)
      .nodeThreeObject((n) => {
        if (!labels) return null
        const p = n.protein
        const lit = proteinState(p, f) !== 'dim' && isLit(n)
        const text = filters.misfoldMode && p.misfolded ? p.misfolded.symbol : p.symbol
        const s = new SpriteText(text, n.id === focus ? 7 : 4.2, lit ? '#ffffff' : 'rgba(156,163,175,0.25)')
        s.fontWeight = '700'
        s.raycast = NO_HIT // labels never steal the mouse from spheres (their box includes transparent margins)
        s.position.y = Math.cbrt(1 + n.degree * 0.45) * NODE_REL_SIZE + 4
        return s
      })
    const linkColor = (l) => {
      const e = EFFECTS[l.effect]
      if (linkInert(l)) return FADED_COLOR
      if (touches(l)) return e.color
      if (focus) return 'rgba(148,163,184,0.04)'
      return l.effect === 'binds'
        ? `rgba(203,213,225,${0.08 + ((l.score - 0.7) / 0.3) * 0.25})`
        : withAlpha(e.color, 0.55)
    }
    g.linkColor(linkColor)
      .linkWidth((l) => (touches(l) ? (l.effect === 'binds' ? 0.5 + l.score * 0.6 : 1.4) : 0))
      .linkCurvature((l) => (l.curved ? 0.25 : 0))
      .linkDirectionalArrowLength((l) => (EFFECTS[l.effect].marker && !linkInert(l) && (!focus || touches(l)) ? (touches(l) ? 6 : 3.5) : 0))
      .linkDirectionalArrowColor(linkColor)
      .linkDirectionalParticles((l) => (touches(l) ? 3 : 0))
      .linkDirectionalParticleColor((l) => EFFECTS[l.effect].color)

    // Match each sphere's hit-testing to how it looks. The graph rebuilds objects asynchronously,
    // so apply once it has caught up.
    const hitMode = (n) => (inertIds.has(n.id) ? 'off'
      : proteinState(n.protein, f) === 'dim' || !isLit(n) ? 'back' : 'on')
    const t = setTimeout(() => {
      for (const n of graphData.nodes) {
        const obj = n.__threeObj
        const mesh = obj && (obj.isMesh ? obj : obj.children.find((c) => c.isMesh))
        if (mesh) setHitMode(mesh, hitMode(n))
      }
    }, 30)
    return () => clearTimeout(t)
  }, [graphData, hoverId, selectedId, neighbors, filters, labels, families, locations, data.pathways])

  // Fly the camera to the selected protein.
  useEffect(() => {
    const g = graph.current
    const node = selectedId && graphData.nodes.find((n) => n.id === selectedId)
    if (!g || !node) return
    const fly = () => {
      if (node.x == null) return
      const dist = 140
      const ratio = 1 + dist / Math.max(1, Math.hypot(node.x, node.y, node.z))
      g.cameraPosition({ x: node.x * ratio, y: node.y * ratio, z: node.z * ratio }, node, 1200)
    }
    const t = setTimeout(fly, node.x == null ? 1500 : 0)
    return () => clearTimeout(t)
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const selected = selectedId && data.proteins.find((p) => p.id === selectedId)
  const selectedNode = selectedId && graphData.nodes.find((n) => n.id === selectedId)

  return (
    <div className="relative mx-4 overflow-hidden rounded-xl border border-white/10" style={{ height: 'max(560px, calc(100vh - 300px))' }}>
      <div ref={el} className="absolute inset-0" />

      {/* Top-left: what's on screen */}
      <div className="pointer-events-none absolute left-3 top-3 max-w-[60%] text-xs text-gray-400">
        <div className="font-semibold text-gray-200">
          {graphData.nodes.length} of {graphData.identified} proteins · {graphData.count} interactions
        </div>
        {graphData.isolatedHidden > 0 && (
          <div>
            {graphData.isolatedHidden} without {effectsOnly ? 'a curated effect' : 'interactions'} hidden ·{' '}
            <button type="button" onClick={() => setHideIsolated(false)}
              className="pointer-events-auto text-sky-300 underline-offset-2 hover:underline">show them</button>
          </div>
        )}
        <div>Drag to rotate · scroll to zoom · right-drag to pan · click a protein</div>
        {selected && (
          <div className="mt-1 text-amber-200">
            {selected.symbol}: {selectedNode ? `${selectedNode.degree} interactions highlighted` : 'not in the current network (no interactions at this cut-off)'}
          </div>
        )}
      </div>

      {/* Top-right: network controls */}
      {!panelOpen && (
        <button type="button" onClick={() => setPanelOpen(true)}
          className="absolute right-3 top-3 rounded-lg border border-white/10 bg-gray-950/80 px-3 py-1.5 text-xs text-gray-200 backdrop-blur hover:bg-white/10">
          Network controls ▾
        </button>
      )}
      {panelOpen && (
      <div className="absolute right-3 top-3 flex w-[230px] flex-col gap-2 rounded-xl border border-white/10 bg-gray-950/80 p-3 text-xs text-gray-300 backdrop-blur">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Arrange</span>
          <button type="button" onClick={() => setPanelOpen(false)} aria-label="Hide network controls"
            className="rounded px-1.5 text-gray-400 hover:bg-white/10 hover:text-white">▴ hide</button>
        </div>
        <div className="flex flex-col gap-1">
          {ARRANGEMENTS.map(([key, label, hint]) => (
            <button key={key} type="button" onClick={() => setArrange(key)} title={hint}
              className={`rounded-md px-2 py-1 text-left ${arrange === key ? 'bg-white text-gray-950' : 'hover:bg-white/10'}`}>
              {label}
            </button>
          ))}
        </div>
        <label className="mt-1 flex flex-col gap-1">
          <span className="flex justify-between">
            <span>Min. confidence (STRING)</span>
            <span className="font-mono text-gray-100">{minScore.toFixed(2)}</span>
          </span>
          <input type="range" min={0.7} max={0.99} step={0.01} value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="timeline h-1.5 cursor-pointer appearance-none rounded-full bg-white/10" />
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={effectsOnly} onChange={(e) => setEffectsOnly(e.target.checked)} className="accent-amber-300" />
          Only curated effects (→ ⊣)
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={hideIsolated} onChange={(e) => setHideIsolated(e.target.checked)} className="accent-amber-300" />
          Hide proteins with no interactions
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} className="accent-amber-300" />
          Show labels
        </label>
        <button type="button" onClick={() => graph.current?.zoomToFit(800, 40)}
          className="rounded-md border border-white/15 px-2 py-1 hover:bg-white/10">
          Fit to view
        </button>
      </div>
      )}

      {/* Bottom-left: family colour key */}
      <div className="pointer-events-none absolute bottom-3 left-3 hidden max-w-[70%] flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-400 md:flex">
        {data.families.map((f) => (
          <span key={f.code} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: f.color }} />{f.name}
          </span>
        ))}
        <span className="basis-full" />
        {Object.entries(EFFECTS).map(([key, e]) => (
          <span key={key} className="flex items-center gap-1"><EffectSwatch effect={key} width={22} />{e.label}</span>
        ))}
      </div>
    </div>
  )
}
