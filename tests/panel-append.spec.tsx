// Panel incremental append: mergePanelSpecs rules (tab-label merge / tail
// append) and the fence-level append behavior (complete bodies merge once,
// incomplete/partial bodies never merge, non-append replaces).
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderGenuiFence } from '../src/client/index.tsx'
import { setActiveSessionId } from '../src/client/active-session.ts'
import { getPanelSpec, mergePanelSpecs, publishPanelSpec } from '../src/client/panel-store.ts'

afterEach(() => {
  cleanup()
  publishPanelSpec('p1', null)
  setActiveSessionId(null)
})

const text = (content: string) => ({ type: 'text', content })

const tabsSpec = (tabs: Array<{ label: string; items: unknown[] }>) => ({
  title: 'T',
  items: [{ type: 'tabs', tabs }],
})

describe('mergePanelSpecs', () => {
  it('merges tabs by label, appending items to same-labelled tabs', () => {
    const prev = tabsSpec([{ label: 'A', items: [text('a1')] }, { label: 'B', items: [text('b1')] }])
    const next = tabsSpec([{ label: 'B', items: [text('b2')] }, { label: 'C', items: [text('c1')] }])
    const merged = mergePanelSpecs(prev as never, next as never)
    const tabs = (merged.items[0] as { tabs: Array<{ label: string; items: unknown[] }> }).tabs
    expect(tabs.map(t => t.label)).toEqual(['A', 'B', 'C'])
    expect(tabs[0]!.items).toEqual([text('a1')])
    expect(tabs[1]!.items).toEqual([text('b1'), text('b2')])
    expect(tabs[2]!.items).toEqual([text('c1')])
  })

  it('appends plain item lists to the tail', () => {
    const prev = { title: 'P', items: [text('x')] }
    const merged = mergePanelSpecs(prev, { title: 'Q', items: [text('y'), text('z')] })
    expect(merged.title).toBe('P') // previous title wins
    expect(merged.items).toEqual([text('x'), text('y'), text('z')])
  })

  it('returns next as-is when there is no previous panel', () => {
    const next = { title: 'N', items: [text('n')] }
    expect(mergePanelSpecs(null, next)).toBe(next)
  })
})

describe('panel append fence', () => {
  it('merges a complete append fence into the existing panel', () => {
    setActiveSessionId('p1')
    publishPanelSpec('p1', tabsSpec([{ label: 'A', items: [text('a1')] }]))
    render(renderGenuiFence(JSON.stringify({ panel: true, append: true, title: 'X', items: [{ type: 'tabs', tabs: [{ label: 'A', items: [text('a2')] }, { label: 'B', items: [text('b1')] }] }] }), 'k1') as never)
    const spec = getPanelSpec('p1')!
    const tabs = (spec.items[0] as { tabs: Array<{ label: string; items: unknown[] }> }).tabs
    expect(tabs.map(t => t.label)).toEqual(['A', 'B'])
    expect(tabs[0]!.items).toHaveLength(2)
    expect(tabs[1]!.items).toHaveLength(1)
  })

  it('never merges an incomplete append body (streaming partial)', () => {
    setActiveSessionId('p1')
    publishPanelSpec('p1', tabsSpec([{ label: 'A', items: [text('a1')] }]))
    // Truncated JSON: parse-partial yields a partial spec, but the append
    // gate (complete JSON) must reject it — no partial merge.
    const partial = JSON.stringify({ panel: true, append: true, items: [{ type: 'tabs', tabs: [{ label: 'B', items: [{ type: 'text', content: 'b' }] }] }] }).slice(0, -5)
    render(renderGenuiFence(partial, 'k2') as never)
    const spec = getPanelSpec('p1')!
    const tabs = (spec.items[0] as { tabs: Array<{ label: string }> }).tabs
    expect(tabs.map(t => t.label)).toEqual(['A'])
  })

  it('merges a completed append fence exactly once per fence key (renderer re-invokes)', () => {
    setActiveSessionId('p1')
    publishPanelSpec('p1', tabsSpec([{ label: 'A', items: [text('a1')] }]))
    const body = JSON.stringify({ panel: true, append: true, items: [{ type: 'tabs', tabs: [{ label: 'B', items: [text('b1')] }] }] })
    // The same fence (same key) is re-invoked on settle/re-render passes.
    render(renderGenuiFence(body, 'same-key') as never)
    render(renderGenuiFence(body, 'same-key') as never)
    render(renderGenuiFence(body, 'same-key') as never)
    const spec = getPanelSpec('p1')!
    const tabs = (spec.items[0] as { tabs: Array<{ label: string; items: unknown[] }> }).tabs
    expect(tabs.map(t => t.label)).toEqual(['A', 'B'])
    expect(tabs[1]!.items).toHaveLength(1) // merged once, not three times
    // A DIFFERENT fence (new key) with new content merges again.
    render(renderGenuiFence(JSON.stringify({ panel: true, append: true, items: [{ type: 'tabs', tabs: [{ label: 'B', items: [text('b2')] }, { label: 'C', items: [text('c1')] }] }] }), 'new-key') as never)
    const spec2 = getPanelSpec('p1')!
    const tabs2 = (spec2.items[0] as { tabs: Array<{ label: string; items: unknown[] }> }).tabs
    expect(tabs2.map(t => t.label)).toEqual(['A', 'B', 'C'])
    expect(tabs2[1]!.items).toHaveLength(2) // b1 + b2
  })

  it('non-append panel fence still replaces the whole panel', () => {
    setActiveSessionId('p1')
    publishPanelSpec('p1', tabsSpec([{ label: 'A', items: [text('a1')] }]))
    render(renderGenuiFence(JSON.stringify({ panel: true, title: 'R', items: [text('fresh')] }), 'k3') as never)
    const spec = getPanelSpec('p1')!
    expect(spec.title).toBe('R')
    expect(spec.items).toEqual([text('fresh')])
  })
})
