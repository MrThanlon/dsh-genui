/**
 * DOM render channel: pure-plugin fence rendering for pristine hosts.
 *
 * Stock DSH renders every fenced code block through the shared CodeBlock
 * surface (stable class `md-code-block`, language label rendered as the
 * banner's childless label div). This channel observes the conversation DOM,
 * finds settled blocks labelled `dsh-ui`, parses the raw fence body and
 * mounts the plugin's own React tree next to the (hidden) stock block:
 *
 * - The stock block stays in the DOM (hidden), so streaming updates keep
 *   flowing through it; rendering is gated on the settled marker
 *   (`[data-streaming]` absent — the same marker the annotation plugin
 *   consumes), so partial JSON never renders prematurely.
 * - Stable identity: the owning row's `data-chat-anchor-key` (session-stable,
 *   seq-derived) + the fence's ordinal among dsh-ui blocks in that row.
 *   `sourceId = dom:<anchor>:<ordinal>` feeds panel dedup and durable state.
 * - Actions ride the plugin-owned GenuiActionContext provider: every tree
 *   this channel mounts is wrapped with a handler that relays
 *   `[genui-action]` through the scoped conversation send — no host plumbing.
 * - Removal (branch switch, unload): each mount is unmounted with its root,
 *   and the stock block is restored.
 *
 * Security posture matches the registry channel: only code shipped in this
 * plugin's browser bundle mounts React roots, the model can only author
 * fence text, and unrepairable bodies stay stock code blocks.
 */
import type { Key, ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { GenuiActionContext, type GenuiActionHandler } from './action-context.ts'
import { renderResolvedFenceNode, type GenuiFenceContext } from './fence-render.tsx'

/** The stock code-block surface every markdown fence renders through. */
const CODE_BLOCK = '.md-code-block'
/** Marker attribute set on blocks this channel has taken over. */
const PROCESSED = 'data-genui-rendered'
/** The settled marker on AssistantMarkdown (absent = settled). */
const STREAMING = '[data-streaming]'
/** Container class for the plugin-owned root. */
const CONTAINER_CLASS = 'genui-dom-fence'
/** Slow sweep interval: the observer catches everything, this is the 1s
 * belt-and-braces pass (history loads, missed attribute batches). */
const SWEEP_MS = 1000

interface Mount {
  root: Root
  container: HTMLElement
  block: HTMLElement
  lastRaw: string
}

function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE
}

/** The banner's language label: a childless div whose text is exactly the lang. */
function infostringOf(block: Element): string | null {
  // The label div holds nothing but text; the banner wrapper concatenates
  // label + copy-button text, so only the leaf div matches exactly.
  for (const div of block.querySelectorAll('div')) {
    if (div.childElementCount === 0 && div.textContent === 'dsh-ui') return 'dsh-ui'
  }
  return null
}

/** Raw fence body from the stock block's code surface. */
function rawOf(block: Element): string {
  const pre = block.querySelector('pre')
  if (pre === null) return ''
  let text = ''
  for (const node of pre.childNodes) {
    if (isTextNode(node)) text += node.textContent ?? ''
    else text += node.textContent ?? ''
  }
  return text
}

/** Settled gate: no streaming marker on any ancestor. */
function isSettled(block: Element): boolean {
  return block.closest(STREAMING) === null
}

/** The owning conversation row (stable per-message identity). */
function rowOf(block: Element): Element | null {
  return block.closest('[data-chat-anchor-key]')
}

/** 1-based ordinal of this block among the row's dsh-ui blocks (document order). */
function fenceIndexOf(row: Element, block: Element): number {
  let index = 0
  for (const candidate of row.querySelectorAll(CODE_BLOCK)) {
    if (candidate.closest(STREAMING) !== null) continue
    if (infostringOf(candidate) === null) continue
    index += 1
    if (candidate === block) return index
  }
  return index + 1
}

/** messageSeq estimate: the numeric part of the anchor key when present,
 * else the row's document-order index among chat rows (monotonic in seq). */
function anchorSeqOf(row: Element): number {
  const key = row.getAttribute('data-chat-anchor-key') ?? ''
  const match = /(\d+)/.exec(key)
  if (match !== null) {
    const value = Number(match[1])
    if (Number.isFinite(value)) return value
  }
  const rows = document.querySelectorAll('[data-chat-anchor-key]')
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i] === row) return i
  }
  return 0
}

/**
 * Install the DOM render channel. Returns a disposer that restores every
 * taken-over block and disconnects the observers.
 *
 * @param ctx - the client context (sessions service for the current session).
 * @param sendAction - plugin-owned relay: (sessionId, action, payload) → the
 *   scoped conversation send carrying the `[genui-action]` prompt.
 */
export function installDomFenceRenderer(
  ctx: Context,
  sendAction: (sessionId: SessionId, action: string, payload: Record<string, unknown>) => void,
): () => void {
  if (typeof document === 'undefined') return () => {}
  const mounts = new Map<HTMLElement, Mount>()

  const sessionIdOf = (): SessionId | undefined => {
    try {
      return ctx.sessions.list.getSnapshot().current
    } catch {
      return undefined
    }
  }

  function unmountBlock(block: HTMLElement): void {
    const mount = mounts.get(block)
    if (mount === undefined) return
    mounts.delete(block)
    mount.root.unmount()
    mount.container.remove()
    block.style.display = ''
    block.removeAttribute(PROCESSED)
  }

  function renderBlock(block: HTMLElement): void {
    if (block.hasAttribute(PROCESSED)) return
    if (!isSettled(block)) return
    if (infostringOf(block) === null) return
    const row = rowOf(block)
    if (row === null) return
    const raw = rawOf(block)
    if (raw.trim() === '') return
    const sessionId = sessionIdOf()
    const fenceIndex = fenceIndexOf(row, block)
    const anchorKey = row.getAttribute('data-chat-anchor-key') ?? 'unknown'
    const source: GenuiFenceContext['source'] = {
      id: `dom:${anchorKey}:${fenceIndex}`,
      order: [anchorSeqOf(row), 0, fenceIndex],
    }
    const context: GenuiFenceContext = {
      ...(sessionId === undefined ? {} : { sessionId }),
      source,
    }
    const node: ReactNode | null = renderResolvedFenceNode(raw, `dom:${anchorKey}:${fenceIndex}` as Key, context)
    if (node === null) return // unrepairable: the stock code block stays visible
    const container = document.createElement('div')
    container.className = CONTAINER_CLASS
    block.style.display = 'none'
    block.after(container)
    block.setAttribute(PROCESSED, '')
    const root = createRoot(container)
    const handler: GenuiActionHandler = (action, payload) => {
      const sid = sessionIdOf()
      if (sid === undefined) return
      sendAction(sid, action, payload)
    }
    root.render(<GenuiActionContext.Provider value={handler}>{node}</GenuiActionContext.Provider>)
    mounts.set(block, { root, container, block, lastRaw: raw })
  }

  /** Sweep: drop dead mounts, then take over every newly-settled dsh-ui block. */
  function sweep(): void {
    for (const [block, mount] of mounts) {
      if (!block.isConnected) unmountBlock(block)
      else if (mount.lastRaw !== rawOf(block)) {
        // Settled content changed (rare: repaired render or host re-render).
        // Re-render in place with the same stable source identity.
        const row = rowOf(block)
        const sessionId = sessionIdOf()
        const fenceIndex = fenceIndexOf(row ?? block.parentElement ?? block, block)
        const anchorKey = row?.getAttribute('data-chat-anchor-key') ?? 'unknown'
        const raw = rawOf(block)
        const source: GenuiFenceContext['source'] = {
          id: `dom:${anchorKey}:${fenceIndex}`,
          order: [anchorSeqOf(row ?? block), 0, fenceIndex],
        }
        const context: GenuiFenceContext = {
          ...(sessionId === undefined ? {} : { sessionId }),
          source,
        }
        const node = renderResolvedFenceNode(raw, `dom:${anchorKey}:${fenceIndex}` as Key, context)
        if (node === null) {
          unmountBlock(block)
          return
        }
        mount.lastRaw = raw
        mount.root.render(<GenuiActionContext.Provider value={(action, payload) => {
          const sid = sessionIdOf()
          if (sid !== undefined) sendAction(sid, action, payload)
        }}>{node}</GenuiActionContext.Provider>)
      }
    }
    for (const block of Array.from(document.querySelectorAll<HTMLElement>(CODE_BLOCK))) {
      renderBlock(block)
    }
  }

  let scheduled = false
  const schedule = (): void => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      sweep()
    })
  }

  const observer = new MutationObserver(() => schedule())
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-streaming'],
  })
  const interval = window.setInterval(sweep, SWEEP_MS)
  sweep()

  return () => {
    observer.disconnect()
    window.clearInterval(interval)
    for (const block of Array.from(mounts.keys())) unmountBlock(block)
  }
}
