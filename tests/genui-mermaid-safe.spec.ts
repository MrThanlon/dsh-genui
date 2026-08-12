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

  it('never quotes labeled-edge spans (-- label -->)', () => {
    const src = 'graph TD\nH -- 否(流式中) --> J'
    expect(repairMermaidSource(src)).toBe(src)
  })

  it('quotes unquoted CJK node labels but not the edge label on the same line', () => {
    const src = 'graph TD\nA[模型生成 spec] -- 否(流式中) --> B[修复完成]'
    const repaired = repairMermaidSource(src)
    expect(repaired).toContain('A["模型生成 spec"]')
    expect(repaired).toContain('B["修复完成"]')
    expect(repaired).toContain('-- 否(流式中) -->')
    expect(repaired).not.toContain('("流式中")')
  })

  it('leaves thick and dotted edge labels alone', () => {
    const src = 'graph LR\nA == 重连(已恢复) ==> B\nA -. 斜线(带括号) .-> C'
    expect(repairMermaidSource(src)).toBe(src)
  })

  it('does not swallow the destination node of an unlabeled edge', () => {
    const src = 'graph LR\nA --> B[模型] -- 下一步(确认) --> C'
    const repaired = repairMermaidSource(src)
    expect(repaired).toContain('B["模型"]')
    expect(repaired).toContain('-- 下一步(确认) -->')
  })

  it('preserves edge labels when nothing else needs repair', () => {
    const src = 'graph TD\nA -- 能 --> B -- 不能 --> C'
    expect(repairMermaidSource(src)).toBe(src)
  })
})
