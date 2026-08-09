// The session panel: store publish/subscribe isolation, dock rendering, the
// action loop wiring, and the toolview→store publish path.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GENUI_ACTION_DEBOUNCE_MS } from '../src/client/GenuiBlock.tsx'
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
