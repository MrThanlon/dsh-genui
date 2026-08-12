/**
 * Pure mermaid source utilities — no mermaid import, so this module can ship
 * in the main client bundle while the heavy mermaid engine lives in a lazy
 * asset bundle (`lib/assets/mermaid.js`, loaded on demand by mermaid-lazy).
 * @module @deepseek-ai/dsh-genui/client/mermaid-safe
 */

/** Reject any rendered SVG that carries script, event-handler attributes, or
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
 *
 * Labeled-edge spans (`-- 文本 -->`, `== 文本 ==>`, `-. 文本 .->`) are free
 * text and must never be quoted: wrapping them breaks the parser
 * ("Expecting 'LINK' … got 'STR'"), observed live with
 * `H -- 否(流式中) --> J`. Each span is swapped for a bracket-free
 * placeholder before quoting and restored verbatim afterwards, so the quote
 * pass can neither corrupt it nor be thrown off by inserted quotes
 * elsewhere on the line.
 */
export function repairMermaidSource(code: string): string {
  const kind = /^([A-Za-z]+)/.exec(code.trim())?.[1] ?? ''
  if (kind !== 'graph' && kind !== 'flowchart') return code
  const cleaned = code.replace(/`/g, '').replace(/<br\s*\/?>/gi, ' ')
  // A labeled edge is `--`/`==`/`-.` (not immediately `-->`/`==>`), a label
  // made of non-dash chars or single dashes (never `--`, which would start a
  // new edge), then the arrow. `[ \t]*` — never newlines — keeps the span on
  // one line.
  const EDGE = /(--|==|-\.)(?!>)[ \t]*([^-\n]|-(?!--))*?[ \t]*(-->|==>|\.->)/g
  const spans: string[] = []
  const masked = cleaned.replace(EDGE, (span) => {
    spans.push(span)
    return `\uE000${spans.length - 1}\uE001`
  })
  const quoted = masked.replace(
    /([\[\(])([^\[\]\(\)\{\}"'\n]*)([\]\)])/g,
    (whole, open: string, label: string, close: string) => {
      const trimmed = label.trim()
      if (trimmed === '') return whole
      if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(trimmed) || /\s/.test(trimmed)) {
        return `${open}"${trimmed}"${close}`
      }
      return whole
    },
  )
  return quoted.replace(/\uE000(\d+)\uE001/g, (whole, i: string) => spans[Number(i)] ?? whole)
}
