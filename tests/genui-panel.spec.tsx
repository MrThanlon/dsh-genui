// The session panel: store publish/subscribe isolation, dock rendering, the
// action loop wiring, and the toolview→store publish path.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GENUI_ACTION_DEBOUNCE_MS } from '../src/client/GenuiBlock.tsx'
import { renderGenuiFence } from '../src/client/index.tsx'
import { setActiveSessionId } from '../src/client/active-session.ts'
import { repairGenuiSpec } from '../src/client/guard.ts'
import { GenuiPanel } from '../src/client/panel.tsx'
import { getPanelSpec, publishPanelSpec, subscribePanel } from '../src/client/panel-store.ts'
import { GenuiToolView } from '../src/client/toolview.tsx'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/src/client/contract/slots'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  publishPanelSpec('s1', null)
  publishPanelSpec('s2', null)
  setActiveSessionId(null)
})

const text = (content: string) => ({ type: 'text', content })

describe('panel store', () => {
  it('publishes and reads per session, isolated across sessions', () => {
    const a = { items: [text('A')] }
    const b = { items: [text('B')] }
    publishPanelSpec('s1', a)
    publishPanelSpec('s2', b)
    expect(getPanelSpec('s1')).toBe(a)
    expect(getPanelSpec('s2')).toBe(b)
  })

  it('notifies subscribers only on actual change', () => {
    const spec = { items: [text('x')] }
    const fn = vi.fn()
    const unsub = subscribePanel(fn)
    publishPanelSpec('s1', spec)
    expect(fn).toHaveBeenCalledTimes(1)
    publishPanelSpec('s1', spec) // same reference: no notification
    expect(fn).toHaveBeenCalledTimes(1)
    publishPanelSpec('s1', { items: [text('y')] })
    expect(fn).toHaveBeenCalledTimes(2)
    unsub()
    publishPanelSpec('s1', { items: [text('z')] })
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('clears the panel on null publish', () => {
    publishPanelSpec('s1', { items: [text('x')] })
    publishPanelSpec('s1', null)
    expect(getPanelSpec('s1')).toBeNull()
  })
})

describe('GenuiPanel dock', () => {
  function renderPanel(sessionId = 's1', sendGenuiAction = vi.fn()) {
    return render(<GenuiPanel sessionId={sessionId} sendGenuiAction={sendGenuiAction} /> as never)
  }

  it('renders nothing without a published spec', () => {
    const { container } = renderPanel()
    expect(container.querySelector('[data-genui-panel]')).toBeNull()
  })

  it('renders the published spec for its own session only', () => {
    publishPanelSpec('s1', { title: '面板 A', items: [text('内容 A')] })
    publishPanelSpec('s2', { title: '面板 B', items: [text('内容 B')] })
    const { container } = renderPanel('s1')
    expect(container.querySelector('[data-genui-panel]')).not.toBeNull()
    expect(screen.getByText('内容 A')).toBeTruthy()
    expect(screen.queryByText('内容 B')).toBeNull()
  })

  it('updates in place when a new spec is published', () => {
    const { container } = renderPanel()
    act(() => { publishPanelSpec('s1', { items: [text('第一版')] }) })
    expect(screen.getByText('第一版')).toBeTruthy()
    act(() => { publishPanelSpec('s1', { items: [text('第二版')] }) })
    expect(screen.queryByText('第一版')).toBeNull()
    expect(screen.getByText('第二版')).toBeTruthy()
    expect(container.querySelectorAll('[data-genui-panel]')).toHaveLength(1)
  })

  it('routes component actions through sendGenuiAction (debounced)', () => {
    vi.useFakeTimers()
    const sendGenuiAction = vi.fn()
    publishPanelSpec('s1', {
      items: [{ type: 'button', label: '刷新', action: 'refresh' }],
    })
    renderPanel('s1', sendGenuiAction)
    fireEvent.click(screen.getByText('刷新'))
    expect(sendGenuiAction).not.toHaveBeenCalled()
    vi.advanceTimersByTime(GENUI_ACTION_DEBOUNCE_MS)
    expect(sendGenuiAction).toHaveBeenCalledWith('refresh', expect.objectContaining({ type: 'button' }))
  })
})

describe('GenuiToolView publishes to the panel store', () => {
  const resultBlock = (meta: unknown): ToolCallBlock => ({
    kind: 'tool-result',
    seq: 1,
    time: 0,
    callId: 'call-1',
    call: { name: 'render_ui', argsRaw: '{}' },
    callTime: 1,
    content: [],
    isError: false,
    meta,
  } as ToolCallBlock)

  function props(block: ToolCallBlock, sessionId = 's1'): ToolCallViewProps {
    return {
      callId: 'call-1',
      toolName: 'render_ui',
      block,
      openFile: () => {},
      sessionId,
    } as unknown as ToolCallViewProps
  }

  it('publishes the repaired spec for the session on a settled result', () => {
    render(<GenuiToolView {...props(resultBlock({ items: [text('面板内容')] }))} />)
    const published = getPanelSpec('s1')
    expect(published).not.toBeNull()
    expect(published!.items.some(n => n.type === 'text' && 'content' in n && n.content === '面板内容')).toBe(true)
    // other sessions untouched
    expect(getPanelSpec('s2')).toBeNull()
  })

  it('does not publish while the call is running (no meta)', () => {
    render(<GenuiToolView {...props({ kind: 'tool-call', seq: 1, time: 0, callId: 'call-1', call: { name: 'render_ui', argsRaw: '{}' } } as ToolCallBlock)} />)
    expect(getPanelSpec('s1')).toBeNull()
  })
})

describe('panel-only fences', () => {
  it('publishes a panel:true fence to the active session and renders nothing', () => {
    setActiveSessionId('s1')
    const node = renderGenuiFence('{"panel":true,"title":"面板","items":[{"type":"text","content":"面板内容"}]}', 0)
    expect(node).toBeNull()
    const published = getPanelSpec('s1')
    expect(published).not.toBeNull()
    expect(published!.panel).toBe(true)
    expect(published!.items.some(n => n.type === 'text' && 'content' in n && n.content === '面板内容')).toBe(true)
  })

  it('keeps ordinary fences rendering inline without touching the panel', () => {
    setActiveSessionId('s1')
    publishPanelSpec('s1', null)
    const node = renderGenuiFence('{"title":"普通","items":[{"type":"text","content":"正文"}]}', 0)
    expect(node).not.toBeNull()
    expect(getPanelSpec('s1')).toBeNull()
  })

  it('skips publishing when no session is active', () => {
    setActiveSessionId(null)
    publishPanelSpec('s1', null)
    const node = renderGenuiFence('{"panel":true,"items":[{"type":"text","content":"x"}]}', 0)
    expect(node).toBeNull()
    expect(getPanelSpec('s1')).toBeNull()
  })

  it('repair keeps the panel flag', () => {
    const repaired = repairGenuiSpec({ panel: true, items: [] })
    expect(repaired?.panel).toBe(true)
    expect(repairGenuiSpec({ panel: 'yes', items: [] })?.panel).toBeUndefined()
  })
})

describe('panel publish ordering (seq gating)', () => {
  it('rejects an older seq publish after a newer one', () => {
    const newer = { items: [text('新')] }
    const older = { items: [text('旧')] }
    publishPanelSpec('s1', newer, 100)
    publishPanelSpec('s1', older, 50) // replay of an older tool result
    expect(getPanelSpec('s1')).toBe(newer)
  })

  it('accepts the same-seq overwrite and fence-latest publishes', () => {
    const a = { items: [text('A')] }
    const b = { items: [text('B')] }
    publishPanelSpec('s1', a, 10)
    publishPanelSpec('s1', b, 10) // same seq: later wins
    expect(getPanelSpec('s1')).toBe(b)
    const fence = { panel: true, items: [text('F')] }
    publishPanelSpec('s1', fence) // fence = Infinity: always wins
    expect(getPanelSpec('s1')).toBe(fence)
    publishPanelSpec('s1', a, 999) // any finite seq loses to the fence
    expect(getPanelSpec('s1')).toBe(fence)
  })

  it('clears unconditionally with null and lets later publishes rebuild', () => {
    publishPanelSpec('s1', { items: [text('x')] }, 5)
    publishPanelSpec('s1', null)
    expect(getPanelSpec('s1')).toBeNull()
    // after a clear, any publish rebuilds the panel (fence or tool result)
    publishPanelSpec('s1', { items: [text('y')] }, 4)
    expect(getPanelSpec('s1')?.items).toHaveLength(1)
  })
})
