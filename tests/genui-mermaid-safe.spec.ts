/**
 * mermaid sanitization gate: the rendered SVG is the only GenUI output that
 * reaches the DOM via dangerouslySetInnerHTML, so the last line of defense is
 * assertSafeSvg, not mermaid's own sanitizer. These cases pin that gate:
 * legitimate strict-mode mermaid output must pass; anything with script tags,
 * event-handler attributes, or javascript: URIs must throw.
 */
import { describe, expect, it } from 'vitest'
import { assertSafeSvg, repairMermaidSource } from '../src/client/mermaid-lazy.ts'

const LEGIT = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><style>#a{fill:red}</style><path d="M0 0L1 1" fill="none" stroke="#333"/><text>graph TD</text></svg>`

describe('assertSafeSvg', () => {
  it('passes legitimate strict-mode mermaid output (style, path, text)', () => {
    expect(() => assertSafeSvg(LEGIT)).not.toThrow()
  })

  it('rejects an inline <script> tag', () => {
    expect(() => assertSafeSvg('<svg><script>alert(1)</script></svg>')).toThrow(/sanitization/)
  })

  it('rejects a case-variant <SCRIPT> tag', () => {
    expect(() => assertSafeSvg('<svg><SCRIPT>alert(1)</SCRIPT></svg>')).toThrow(/sanitization/)
  })

  it('rejects event-handler attributes (onload, onerror, onClick)', () => {
    expect(() => assertSafeSvg('<svg onload="alert(1)"></svg>')).toThrow(/sanitization/)
    expect(() => assertSafeSvg('<svg><path onerror="alert(1)"/></svg>')).toThrow(/sanitization/)
    expect(() => assertSafeSvg('<svg onclick="alert(1)"></svg>')).toThrow(/sanitization/)
  })

  it('rejects javascript: URIs', () => {
    expect(() => assertSafeSvg('<svg><a href="javascript:alert(1)">x</a></svg>')).toThrow(/sanitization/)
  })
})

describe('repairMermaidSource', () => {
  it('quotes unquoted CJK and space labels in graph sources', () => {
    const repaired = repairMermaidSource('graph LR\nA[模型生成 spec] --> B[fence 通道]\nB --> C[plain]')
    expect(repaired).toContain('A["模型生成 spec"]')
    expect(repaired).toContain('B["fence 通道"]')
    expect(repaired).toContain('C[plain]') // ASCII, no space: untouched
  })

  it('leaves already-quoted labels alone', () => {
    const src = 'graph LR\nA["模型生成 spec"] --> B["x"]'
    expect(repairMermaidSource(src)).toBe(src)
  })

  it('strips <br/> tags', () => {
    const repaired = repairMermaidSource('graph LR\nA[面板<br/>dock] --> B[x]')
    expect(repaired).not.toContain('<br')
    expect(repaired).toContain('A["面板 dock"]')
  })

  it('drops backticks even inside quoted labels (the live fence failure)', () => {
    const repaired = repairMermaidSource('graph LR\nA["```dsh-ui fence 通道"] --> B[x]')
    expect(repaired).toContain('A["dsh-ui fence 通道"]')
  })

  it('leaves non-flowchart kinds untouched', () => {
    const src = 'sequenceDiagram\nAlice->>Bob: 你好'
    expect(repairMermaidSource(src)).toBe(src)
  })
})
