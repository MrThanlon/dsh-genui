/**
 * mermaid sanitization gate: the rendered SVG is the only GenUI output that
 * reaches the DOM via dangerouslySetInnerHTML, so the last line of defense is
 * assertSafeSvg, not mermaid's own sanitizer. These cases pin that gate:
 * legitimate strict-mode mermaid output must pass; anything with script tags,
 * event-handler attributes, or javascript: URIs must throw.
 */
import { describe, expect, it } from 'vitest'
import { assertSafeSvg } from '../src/client/mermaid-lazy.ts'

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
