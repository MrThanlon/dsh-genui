/**
 * Lazy mermaid renderer. Imported only when a spec contains a `mermaid` node,
 * so the mermaid bundle (heavy) never enters the main chat bundle.
 *
 * Whitelist: only a fixed set of diagram kinds render; anything else throws
 * so the caller shows its fallback. mermaid runs client-side with its own
 * sanitizer; we additionally refuse `securityLevel: 'loose'`-style inputs by
 * only initializing with the strict default.
 */
let mermaidPromise = null;
function loadMermaid() {
    mermaidPromise ??= import('mermaid').then(async (m) => {
        const api = m.default;
        api.initialize({
            startOnLoad: false,
            // Strict default: mermaid escapes/sanitizes; we never enable htmlLabels.
            securityLevel: 'strict',
            theme: 'dark',
        });
        return m;
    });
    return mermaidPromise;
}
/** Diagram kinds allowed through to the renderer. */
const ALLOWED_KINDS = [
    'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram',
    'gantt', 'pie', 'erDiagram', 'journey', 'gitGraph',
];
/**
 * Render mermaid source to an SVG string.
 * @param code - the mermaid diagram source.
 * @returns the rendered SVG markup.
 * @throws when the kind is not whitelisted or rendering fails.
 */
export async function renderMermaid(code) {
    const trimmed = code.trim();
    const firstLine = trimmed.split('\n', 1)[0] ?? '';
    const kind = /^([A-Za-z]+)/.exec(firstLine)?.[1] ?? '';
    if (!ALLOWED_KINDS.includes(kind)) {
        throw new Error(`mermaid kind '${kind}' is not allowed`);
    }
    const m = await loadMermaid();
    const { svg } = await m.default.render(`genui-mermaid-${Math.random().toString(36).slice(2)}`, trimmed);
    return svg;
}
//# sourceMappingURL=mermaid-lazy.js.map