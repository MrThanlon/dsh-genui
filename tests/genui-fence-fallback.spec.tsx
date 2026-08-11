// @vitest-environment jsdom
// Fence fallback diagnostics: a malformed ```dsh-ui body must never fail
// silently. While the host marks the message as streaming ([data-streaming])
// a partial body is expected and renders as a plain code block; once the
// message settles, a body that still does not parse as JSON shows a visible
// diagnostic (role=alert) with the parse position, keeping the raw code
// block below so no content is lost.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderGenuiFence } from '../src/client/index.tsx'

afterEach(cleanup)

// A body that neither parses as whole JSON nor yields any partial spec:
// the string value is cut mid-way and there is no closing `}` anywhere, so
// the partial parser has nothing to recover → the renderer falls back to
// the plain code block (the settled-defect path).
const BROKEN = '{"title":"演示","items":[{"type":"text","content":"半截'

// A body that fails whole-JSON parsing but yields a usable partial prefix:
// `{"items":[{"type":"text","content":"好了"}]}` is a complete spec, so the
// partial parser renders it; the trailing `,` + unclosed `{` never reaches
// the fallback. This documents the design boundary: partial UI renders, no
// error banner (the banner is only for the no-usable-content path).
const TRAILING = '{"title":"演示","items":[{"type":"text","content":"好了"}]},{"type":"text","content":"尾巴"}'

describe('fence fallback diagnostics', () => {
  it('shows no diagnostic while the message is streaming', () => {
    render(<div data-streaming="true">{renderGenuiFence(BROKEN, 'k1')}</div>)
    expect(screen.queryByRole('alert')).toBeNull()
    // The raw body stays visible as a code block during streaming.
    expect(document.body.textContent).toContain('半截')
  })

  it('surfaces the parse failure once the message settles', () => {
    const { rerender } = render(<div data-streaming="true">{renderGenuiFence(BROKEN, 'k2')}</div>)
    expect(screen.queryByRole('alert')).toBeNull()
    rerender(<div>{renderGenuiFence(BROKEN, 'k2')}</div>)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('解析失败')
    // Raw content preserved below the diagnostic.
    expect(document.body.textContent).toContain('半截')
  })

  it('treats hosts without the streaming marker as settled on first mount', () => {
    render(<div>{renderGenuiFence(BROKEN, 'k3')}</div>)
    expect(screen.getByRole('alert').textContent).toContain('解析失败')
  })

  it('stays silent for a valid settled body', () => {
    render(<div>{renderGenuiFence('{"title":"好","items":[{"type":"text","content":"正常"}]}', 'k4')}</div>)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.body.textContent).toContain('正常')
  })

  it('renders partial UI for trailing junk without the diagnostic', () => {
    const { rerender } = render(<div data-streaming="true">{renderGenuiFence(TRAILING, 'k5')}</div>)
    rerender(<div>{renderGenuiFence(TRAILING, 'k5')}</div>)
    expect(screen.queryByRole('alert')).toBeNull()
    // The finished prefix renders as real UI.
    expect(document.body.textContent).toContain('好了')
  })

  it('keeps the raw body visible alongside the diagnostic', () => {
    render(<div>{renderGenuiFence(BROKEN, 'k6')}</div>)
    expect(screen.getByRole('alert').textContent).toContain('解析失败')
    expect(document.body.textContent).toContain('半截')
  })
})

describe('spec issue notes (parseable but structurally invalid)', () => {
  it('shows an amber note listing healed defects', () => {
    render(<div>{renderGenuiFence(
      '{"title":"x","items":[{"type":"table","columns":["a"],"rows":[["1"]]},[],["callout","info","已排除","x"],{"type":"button","label":"ok","action":"a"}]}',
      's1',
    )}</div>)
    const note = screen.getByRole('note')
    expect(note.textContent).toContain('items[1]')
    expect(note.textContent).toContain('items[2]')
    // The repaired UI still renders.
    expect(document.body.textContent).toContain('ok')
  })

  it('stays silent for a clean spec', () => {
    render(<div>{renderGenuiFence('{"title":"x","items":[{"type":"text","content":"干净"}]}', 's2')}</div>)
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('ignores unknown-type entries (plugin custom components are valid)', () => {
    render(<div>{renderGenuiFence('{"items":[{"type":"custom-thing","x":1}]}', 's3')}</div>)
    expect(screen.queryByRole('note')).toBeNull()
  })
})
