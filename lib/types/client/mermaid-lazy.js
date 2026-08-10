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
let mermaidPromise = null;
/** Monotonic render id (replaces Math.random): no collisions, no entropy. */
let renderSeq = 0;
function loadMermaid() {
    mermaidPromise ??= import('mermaid').then(async (m) => {
        const api = m.default;
        api.initialize({
            startOnLoad: false,
            // Strict default: mermaid escapes/sanitizes; we never enable htmlLabels.
            securityLevel: 'strict',
            theme: 'dark',
            // Fail loudly: with suppressErrorRendering false (the default) mermaid
            // renders an "error" diagram on parse/draw failure — the caller then
            // receives a normal-looking SVG whose text is the raw engine error
            // ("Syntax error in text / mermaid version …"), which lands on the page
            // with no exception ever thrown. Suppressing the error diagram makes
            // every failure throw so the caller shows its own fallback instead.
            suppressErrorRendering: true,
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
 * Reject any rendered SVG that carries script, event-handler attributes, or
 * `javascript:` URIs. Under mermaid's strict security level a legitimate
 * diagram never contains these, so a hit means the sanitizer failed (a
 * mermaid regression or a bypass): throw and let the caller show the plain
 * source fallback instead of injecting the markup. Cheap linear scan over
 * the SVG string; happens once per diagram.
 */
const SVG_INJECTION = /<script|[\s"']on[a-z]+\s*=|javascript:/i;
/** Throws when `svg` carries script, event-handler attributes, or
 * `javascript:` URIs. Exported for tests; `renderMermaid` is the only caller
 * in production. */
export function assertSafeSvg(svg) {
    if (SVG_INJECTION.test(svg)) {
        throw new Error('mermaid output failed the sanitization check; refusing to render');
    }
}
/**
 * Best-effort repair of common model-authored label mistakes in graph /
 * flowchart sources, used only when the original fails to render:
 * - drop backticks — lexically illegal in mermaid labels (models embed
 *   ```dsh-ui style fences, which break the parser with "Lexical error");
 * - strip `<br/>` tags, which require htmlLabels (never enabled here);
 * - quote unquoted node labels containing CJK, spaces, or other characters
 *   mermaid's bare-label grammar rejects (observed live: `A[模型生成 spec]`).
 * Conservative by design: already-quoted labels, plain ASCII labels without
 * spaces, and non-flowchart kinds are left untouched (apart from the
 * backtick/`<br/>` sanitation above, which is harmless everywhere in a
 * flowchart).
 */
export function repairMermaidSource(code) {
    const kind = /^([A-Za-z]+)/.exec(code.trim())?.[1] ?? '';
    if (kind !== 'graph' && kind !== 'flowchart')
        return code;
    const cleaned = code.replace(/`/g, '').replace(/<br\s*\/?>/gi, ' ');
    return cleaned.replace(/([\[\(])([^\[\]\(\)\{\}"'\n]*)([\]\)])/g, (whole, open, label, close) => {
        const trimmed = label.trim();
        if (trimmed === '')
            return whole;
        if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(trimmed) || /\s/.test(trimmed)) {
            return `${open}"${trimmed}"${close}`;
        }
        return whole;
    });
}
/** One render attempt into a private container (keeps mermaid's temp DOM out
 * of `document.body`). The container is removed by the caller. */
async function renderInto(m, id, code, container) {
    const { svg } = await m.default.render(id, code, container);
    assertSafeSvg(svg);
    return svg;
}
/**
 * Render mermaid source to an SVG string.
 * @param code - the mermaid diagram source.
 * @returns the rendered SVG markup (verified free of script/event handlers).
 * @throws when the kind is not whitelisted, rendering fails, or the output
 *   fails the sanitization check.
 */
export async function renderMermaid(code) {
    const trimmed = code.trim();
    const firstLine = trimmed.split('\n', 1)[0] ?? '';
    const kind = /^([A-Za-z]+)/.exec(firstLine)?.[1] ?? '';
    if (!ALLOWED_KINDS.includes(kind)) {
        throw new Error(`mermaid kind '${kind}' is not allowed`);
    }
    const m = await loadMermaid();
    const container = document.createElement('div');
    try {
        try {
            return await renderInto(m, `genui-mermaid-${renderSeq++}`, trimmed, container);
        }
        catch (error) {
            // Retry once with the label-repair pass; a repaired source rendering
            // successfully beats a syntax-error fallback for the same content.
            const repaired = repairMermaidSource(trimmed);
            if (repaired !== trimmed) {
                return await renderInto(m, `genui-mermaid-${renderSeq++}`, repaired, container);
            }
            throw error;
        }
    }
    finally {
        container.remove();
    }
}
//# sourceMappingURL=mermaid-lazy.js.map