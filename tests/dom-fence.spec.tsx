// @vitest-environment jsdom
// DOM render channel: pure-plugin fence rendering on pristine hosts.
// Builds the stock CodeBlock surface (`.md-code-block` + banner label div +
// `<pre>`) inside a conversation row and drives the observer pipeline.
import { cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { installDomFenceRenderer } from '../src/client/dom-fence.tsx'
import { getPanelSpec } from '../src/client/panel-store.ts'

const VALID_SPEC = '{"title":"卡片","items":[{"type":"text","content":"你好，世界"}]}'
const BUTTON_SPEC = '{"items":[{"type":"button","label":"刷新","action":"refresh"}]}'
const PANEL_SPEC = '{"panel":true,"title":"面板A","items":[{"type":"text","content":"A"}]}'
const BROKEN_SPEC = '{"items":[{"type":"text","content":'

function makeCtx(sessionId: string | undefined, send: ReturnType<typeof vi.fn>): Context {
  return {
    sessions: { list: { getSnapshot: () => ({ current: sessionId }) } },
  } as unknown as Context
}

/** Stock CodeBlock surface: wrapper.md-code-block > banner > label div + pre. */
function stockCodeBlock(raw: string, lang: string): HTMLElement {
  const block = document.createElement('div')
  block.className = 'md-code-block'
  const banner = document.createElement('div')
  const label = document.createElement('div')
  label.textContent = lang
  banner.appendChild(label)
  const pre = document.createElement('pre')
  const code = document.createElement('code')
  code.textContent = raw
  pre.appendChild(code)
  block.appendChild(banner)
  block.appendChild(pre)
  return block
}

function assistantRow(anchorKey: string, streaming = false): HTMLElement {
  const row = document.createElement('div')
  row.setAttribute('data-chat-anchor-key', anchorKey)
  row.setAttribute('data-chat-flow-kind', 'assistant-step')
  if (streaming) row.setAttribute('data-streaming', '')
  return row
}

async function tick(ms = 40): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('installDomFenceRenderer', () => {
  it('renders a settled dsh-ui fence into its own root and hides the stock block', async () => {
    const row = assistantRow('s7')
    const block = stockCodeBlock(VALID_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      expect(block.style.display).toBe('none')
      const container = row.querySelector('.genui-dom-fence')
      expect(container).not.toBeNull()
      expect(container!.textContent).toContain('你好，世界')
    } finally {
      dispose()
    }
  })

  it('ignores non-dsh-ui code blocks', async () => {
    const row = assistantRow('s8')
    const ts = stockCodeBlock('const x = 1', 'ts')
    const plain = stockCodeBlock('hello', '')
    row.appendChild(ts)
    row.appendChild(plain)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(ts.hasAttribute('data-genui-rendered')).toBe(false)
      expect(plain.hasAttribute('data-genui-rendered')).toBe(false)
      expect(ts.style.display).toBe('')
    } finally {
      dispose()
    }
  })

  it('waits for the settled marker (data-streaming) before mounting', async () => {
    const row = assistantRow('s9', true)
    const block = stockCodeBlock(VALID_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      row.removeAttribute('data-streaming')
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      expect(row.querySelector('.genui-dom-fence')).not.toBeNull()
    } finally {
      dispose()
    }
  })

  it('keeps the stock block visible for an unrepairable body', async () => {
    const row = assistantRow('s10')
    const block = stockCodeBlock(BROKEN_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(block.style.display).toBe('')
      expect(row.querySelector('.genui-dom-fence')).toBeNull()
    } finally {
      dispose()
    }
  })

  it('relays component actions through the injected sender', async () => {
    const row = assistantRow('s11')
    const block = stockCodeBlock(BUTTON_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      const button = row.querySelector('.genui-dom-fence button')
      expect(button).not.toBeNull()
      fireEvent.click(button!)
      // The action rides the per-action trailing debounce (300ms).
      await tick(400)
      expect(send).toHaveBeenCalledTimes(1)
      const [sessionId, action] = send.mock.calls[0] as [string, string, unknown]
      expect(sessionId).toBe('sess-1')
      expect(action).toBe('refresh')
    } finally {
      dispose()
    }
  })

  it('publishes a panel:true fence to the panel store without mounting UI', async () => {
    const row = assistantRow('s12')
    const block = stockCodeBlock(PANEL_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      expect(block.style.display).toBe('none')
      // The publisher renders nothing: the mounted root is an empty container.
      const container = row.querySelector('.genui-dom-fence')
      expect(container).not.toBeNull()
      expect(container!.textContent).toBe('')
      expect(getPanelSpec('sess-1')?.title).toBe('面板A')
    } finally {
      dispose()
    }
  })

  it('unmounts and restores the stock block when the row leaves the DOM', async () => {
    const row = assistantRow('s13')
    const block = stockCodeBlock(VALID_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx('sess-1', send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      row.remove()
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(false)
      expect(block.style.display).toBe('')
      expect(block.isConnected).toBe(false)
    } finally {
      dispose()
    }
  })

  it('skips fences without a current session (renders with no persistence)', async () => {
    const row = assistantRow('s14')
    const block = stockCodeBlock(VALID_SPEC, 'dsh-ui')
    row.appendChild(block)
    document.body.appendChild(row)
    const send = vi.fn()
    const dispose = installDomFenceRenderer(makeCtx(undefined, send), send)
    try {
      await tick()
      expect(block.hasAttribute('data-genui-rendered')).toBe(true)
      expect(row.querySelector('.genui-dom-fence')?.textContent).toContain('你好，世界')
    } finally {
      dispose()
    }
  })
})
