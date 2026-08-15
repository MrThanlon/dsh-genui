/**
 * Editorial diagram renderer: `diagram` node → inline SVG. The browser-side
 * port of the diagram-design editorial design system — semantic tokens,
 * orthogonal connectors, 4px grid, complexity budget — as a white-listed
 * dsh-genui component.
 *
 * Layout is resolved by `resolveLayout`, routing by `routeEdge`, and every
 * value is sanitized by the guard before this component ever sees it.
 * @module @omdsh-dev/dsh-genui/client/blocks/diagram
 */
import { useMemo } from 'react'
import type { GenuiDiagram } from '../../spec.ts'
import { GENUI_LIMITS } from '../../guard.ts'
import { resolveLayout } from './layout.ts'
import { routeEdge, labelGeometry, type Box } from './geometry.ts'
import { resolvePalette, nodeTreatment, edgeStroke, inkAt } from './theme.ts'

const FONT_SANS = "'Geist', -apple-system, 'Segoe UI', sans-serif"
const FONT_MONO = "'Geist Mono', ui-monospace, 'SF Mono', monospace"

/**
 * Compute a deterministic parent map for tree-like kinds: the first edge
 * into each node is its parent (a stable convention the model can rely on).
 */
function buildParentMap(edges: Array<{ from: string; to: string }>): (id: string) => string | undefined {
  const parents = new Map<string, string>()
  for (const e of edges) {
    if (!parents.has(e.to)) parents.set(e.to, e.from)
  }
  return id => parents.get(id)
}

/** Render one node box + its text content. */
function renderNodeBox(box: Box, label: string, sub: string | undefined, type: string | undefined, tag: string | undefined, palette: ReturnType<typeof resolvePalette>): React.ReactNode {
  const treatment = nodeTreatment(type, palette)
  const cx = box.x + box.w / 2
  const textY = box.y + box.h / 2 + (sub !== undefined ? -2 : 4)
  const subY = box.y + box.h / 2 + 14
  return (
    <g>
      {/* opaque paper mask: arrows must not bleed through transparent fills */}
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={6} fill={palette.paper} />
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        rx={6}
        fill={treatment.fill}
        stroke={treatment.stroke}
        strokeWidth={1}
        strokeDasharray={treatment.dashed === true ? '5,4' : undefined}
      />
      {tag !== undefined && (
        <>
          <rect x={box.x + 8} y={box.y + 6} width={Math.min(44, Math.max(24, tag.length * 7 + 8))} height={12} rx={2} fill="transparent" stroke={inkAt(treatment.stroke, 0.4)} strokeWidth={0.8} />
          <text x={box.x + 8 + Math.min(44, Math.max(24, tag.length * 7 + 8)) / 2} y={box.y + 15} fill={inkAt(treatment.stroke, 0.8)} fontSize={7} fontFamily={FONT_MONO} textAnchor="middle" letterSpacing={0.8}>{tag}</text>
        </>
      )}
      <text x={cx} y={textY} fill={palette.ink} fontSize={12} fontWeight={600} fontFamily={FONT_SANS} textAnchor="middle">{label}</text>
      {sub !== undefined && (
        <text x={cx} y={subY} fill={palette.soft} fontSize={9} fontFamily={FONT_MONO} textAnchor="middle">{sub}</text>
      )}
    </g>
  )
}

/** Render one routed edge: path, optional label mask + text. */
function renderEdge(edge: { from: Box; to: Box; label?: string | undefined; kind?: string | undefined }, key: number, palette: ReturnType<typeof resolvePalette>, markerId: string): React.ReactNode {
  const routed = routeEdge(edge.from, edge.to)
  const stroke = edgeStroke(edge.kind, palette)
  const dashed = edge.kind === 'dashed'
  const lg = labelGeometry(routed.a, routed.b)
  return (
    <g key={key}>
      <path
        d={routed.d}
        fill="none"
        stroke={stroke}
        strokeWidth={1.2}
        strokeDasharray={dashed ? '5,4' : undefined}
        markerEnd={`url(#${markerId})`}
      />
      {edge.label !== undefined && (
        <g>
          <rect
            x={lg.cx - (edge.label.length * 5 + 8) / 2}
            y={lg.maskY}
            width={edge.label.length * 5 + 8}
            height={12}
            rx={2}
            fill={palette.paper}
          />
          <text x={lg.cx} y={lg.maskY + 9} fill={palette.soft} fontSize={8} fontFamily={FONT_MONO} textAnchor="middle" letterSpacing={0.5}>{edge.label}</text>
        </g>
      )}
    </g>
  )
}

/** Arrow marker defs (default / accent / link), per-diagram unique ids. */
function renderMarkers(uid: string, palette: ReturnType<typeof resolvePalette>): React.ReactNode {
  return (
    <defs>
      <marker id={`${uid}-arrow`} markerWidth={8} markerHeight={6} refX={7} refY={3} orient="auto">
        <polygon points="0 0, 8 3, 0 6" fill={palette.muted} />
      </marker>
      <marker id={`${uid}-arrow-accent`} markerWidth={8} markerHeight={6} refX={7} refY={3} orient="auto">
        <polygon points="0 0, 8 3, 0 6" fill={palette.accent} />
      </marker>
      <marker id={`${uid}-arrow-link`} markerWidth={8} markerHeight={6} refX={7} refY={3} orient="auto">
        <polygon points="0 0, 8 3, 0 6" fill={palette.link} />
      </marker>
    </defs>
  )
}

function markerFor(kind: string | undefined, uid: string): string {
  if (kind === 'accent') return `${uid}-arrow-accent`
  if (kind === 'link') return `${uid}-arrow-link`
  return `${uid}-arrow`
}

/** Stable per-render uid (avoid id collisions across diagrams on one page). */
let uidCounter = 0
function nextUid(): string {
  uidCounter += 1
  return `genui-diagram-${uidCounter}`
}

/** The `diagram` node renderer. */
export function DiagramNode({ node }: { node: GenuiDiagram }) {
  const uid = useMemo(nextUid, [])
  const palette = useMemo(() => resolvePalette(node.variant, node.theme), [node.variant, node.theme])
  const layout = useMemo(() => resolveLayout(node, buildParentMap(node.edges ?? [])), [node])

  const byId = useMemo(() => new Map(layout.nodes.map(l => [l.node.id, l.box])), [layout])
  const titleId = `${uid}-title`
  const descId = `${uid}-desc`

  // Complexity budget is enforced by the guard; belt-and-suspenders here.
  const nodes = layout.nodes.slice(0, GENUI_LIMITS.maxDiagramNodes)
  const edges = layout.edges.slice(0, GENUI_LIMITS.maxDiagramEdges)

  // Focal budget: accent on 1–2 nodes max; extra focal nodes downgrade to backend.
  let focalSeen = 0
  const focalBudget = GENUI_LIMITS.maxDiagramFocal

  return (
    <figure className="genui-diagram" data-genui-diagram>
      {node.title !== undefined && (
        <figcaption id={titleId} style={{ fontFamily: "Instrument Serif, 'Times New Roman', serif", fontSize: 20, marginBottom: 8, color: palette.ink }}>
          {node.title}
        </figcaption>
      )}
      <svg
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        style={{ maxWidth: '100%', height: 'auto', background: palette.paper }}
      >
        <title id={titleId}>{node.title ?? node.kind}</title>
        <desc id={descId}>{`${node.kind} diagram with ${nodes.length} nodes and ${edges.length} connectors`}</desc>
        {renderMarkers(uid, palette)}
        {/* edges first (z-order: bg → arrows → labels → nodes) */}
        <g>
          {edges.map((e, i) => {
            const from = byId.get(e.fromId)
            const to = byId.get(e.toId)
            if (from === undefined || to === undefined) return null
            return renderEdge({ from, to, label: e.edge.label, kind: e.edge.kind }, i, palette, markerFor(e.edge.kind, uid))
          })}
        </g>
        {/* nodes after edges */}
        <g>
          {nodes.map((l) => {
            const effectiveType = l.node.type === 'focal' && focalSeen >= focalBudget ? undefined : l.node.type
            if (l.node.type === 'focal') focalSeen += 1
            return (
              <g key={l.node.id}>
                {renderNodeBox(l.box, l.node.label, l.node.sub, effectiveType, l.node.tag, palette)}
              </g>
            )
          })}
        </g>
      </svg>
    </figure>
  )
}
