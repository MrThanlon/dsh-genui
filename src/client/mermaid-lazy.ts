/**
 * Lazy mermaid renderer. Imported only when a spec contains a `mermaid` node,
 * so the mermaid bundle (heavy) never enters the main chat bundle.
 *
 * Whitelist: only a fixed set of diagram kinds render; anything else throws
 * so the caller shows its fallback. mermaid runs client-side with its own
 * sanitizer; we additionally refuse `securityLevel: 'loose'`-style inputs by
 * only initializing with the strict default, AND we re-check the rendered SVG
 * before it is injected (see `sanitizeSvgOutput`): the injection point is the
 * only place in GenUI that uses `dangerouslySetInnerHTML`, so the last line
 * of defense lives here, not inside mermaid.
 */
let mermaidPromise: Promise<typeof import('mermaid')> | null = null

/** Monotonic render id (replaces Math.random): no collisions, no entropy. */
let renderSeq = 0

function loadMermaid(): Promise<typeof import('mermaid')> {
  mermaidPromise ??= import('mermaid').then(async m => {
    const api = m.default
    api.initialize({
      startOnLoad: false,
      // Strict default: mermaid escapes/sanitizes; we never enable htmlLabels.
      securityLevel: 'strict',
      theme: 'dark',
    })
    return m
  })
  return mermaidPromise
}

/** Diagram kinds allowed through to the renderer. */
const ALLOWED_KINDS = [
  'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram',
  'gantt', 'pie', 'erDiagram', 'journey', 'gitGraph',
]

/**
 * Reject any rendered SVG that carries script, event-handler attributes, or
 * `javascript:` URIs. Under mermaid's strict security level a legitimate
 * diagram never contains these, so a hit means the sanitizer failed (a
 * mermaid regression or a bypass): throw and let the caller show the plain
 * source fallback instead of injecting the markup. Cheap linear scan over
 * the SVG string; happens once per diagram.
 */
const SVG_INJECTION = /<script|[\s"']on[a-z]+\s*=|javascript:/i

/** Throws when `svg` carries script, event-handler attributes, or
 * `javascript:` URIs. Exported for tests; `renderMermaid` is the only caller
 * in production. */
export function assertSafeSvg(svg: string): void {
  if (SVG_INJECTION.test(svg)) {
    throw new Error('mermaid output failed the sanitization check; refusing to render')
  }
}

/**
 * Render mermaid source to an SVG string.
 * @param code - the mermaid diagram source.
 * @returns the rendered SVG markup (verified free of script/event handlers).
 * @throws when the kind is not whitelisted, rendering fails, or the output
 *   fails the sanitization check.
 */
export async function renderMermaid(code: string): Promise<string> {
  const trimmed = code.trim()
  const firstLine = trimmed.split('\n', 1)[0] ?? ''
  const kind = /^([A-Za-z]+)/.exec(firstLine)?.[1] ?? ''
  if (!ALLOWED_KINDS.includes(kind)) {
    throw new Error(`mermaid kind '${kind}' is not allowed`)
  }
  const m = await loadMermaid()
  const { svg } = await m.default.render(`genui-mermaid-${renderSeq++}`, trimmed)
  assertSafeSvg(svg)
  return svg
}
