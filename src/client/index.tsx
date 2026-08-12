/**
 * dsh-genui browser half: registers the `dsh-ui` fence renderer with
 * MarkdownText via the fence-registry extension point shipped by
 * `@deepseek-ai/dsh-client-ui-primitives`, the keyed toolview for the
 * `render_ui` tool (renders the tool's result card in the tool row), and the
 * session panel dock (re-renders the latest render_ui spec IN PLACE above
 * the composer, so repeated calls update one surface instead of stacking).
 *
 * The renderer parses the fence body with the partial parser: while the reply
 * streams, every FINISHED component appears the moment its JSON object
 * closes, so the UI assembles top-down before the fence (or reply) completes.
 * A body with no finished component yet falls back to a plain code block,
 * re-evaluated per chunk. Action callbacks (v2 event loop) are not threaded
 * here — GenuiBlock reads them from GenuiActionContext, installed by the
 * markdown host (fences) or by the panel component (dock).
 * @module @deepseek-ai/dsh-genui/client
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { useLayoutEffect, useEffect, useRef, useState, type CSSProperties, type Key } from 'react'
import { CodeBlock, registerFenceRenderer, type FenceRenderer } from '@deepseek-ai/dsh-client-ui-primitives'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { GenuiBlock } from './GenuiBlock.tsx'
import { repairGenuiSpec } from './guard.ts'
import { fenceStateKey } from './interaction-store.ts'
import { parsePartialGenuiSpec } from './parse-partial.ts'
import { createPanelSlashSource } from './panel-command.ts'
import { GenuiPanel, type GenuiPanelInjected } from './panel.tsx'
import { applyPanelOperation, diagnosePanelBudget, type PanelOperationStatus } from './panel-store.ts'
import { GenuiToolView } from './toolview.tsx'
import type { GenuiSpec } from './spec.ts'
import type { SlashServiceContract } from '@deepseek-ai/dsh-client-ui-slash/client'

/** Render a ```dsh-ui fence body as interactive components. While the body
 * still has no finished component (fence open / malformed) the renderer falls
 * back to a plain code block, re-evaluated per chunk — matching the markdown
 * renderer's settled contract. Every accepted body runs through the spec
 * guard (limits + deterministic repair) so pathological or hostile specs
 * degrade gracefully instead of stalling the UI.
 *
 * A spec flagged `"panel": true` is PANEL-ONLY: it publishes to the session
 * panel store (via the settled fence source context) and renders nothing
 * in the message flow — the model updates the dock surface without stacking
 * UI blocks per round. */
/** A fence body counts as complete when it parses as a whole JSON value —
 * used to gate append publishes, which must merge exactly once (never per
 * streaming chunk). */
function isCompleteJson(raw: string): boolean {
  try {
    JSON.parse(raw)
    return true
  } catch {
    return false
  }
}

/** Short human-readable reason for a body that fails whole-JSON parsing, or
 * null when it parses. Positions come from the host's JSON.parse error. */
function describeJsonFailure(raw: string): string | null {
  try {
    JSON.parse(raw)
    return null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const pos = msg.match(/position (\d+)/i)
    const where = pos !== null ? `（字符 ${pos[1]} 附近）` : ''
    return `${where}${msg.slice(0, 140)}`
  }
}

/**
 * Tier-1 repair — SAFE AT ANY TIME (streaming included): heals the most
 * common model JSON typos that do NOT change the body's structure, and only
 * when the whole body parses afterwards (so a still-growing streaming half
 * can never be adopted):
 *
 * 1. Unescaped half-width `"` inside a string value — Chinese text quoted
 *    with ASCII quotes (e.g. `对"别名路径"判定失败`), which makes JSON.parse
 *    fail near that quote with "Expected ',' or ']'...".
 * 2. Trailing commas before `}` / `]` or at end of input.
 *
 * The state-machine scan walks the raw body tracking string-open state:
 * - inside a string, a quote whose next non-space char is NOT one of `, ] } :`
 *   (or end of input) cannot legally close the string → escape it as `\"`;
 * - a `,` whose next non-space char is `}` / `]` / end of input is a trailing
 *   comma → drop it.
 *
 * Returns `{ text, repairs }` on success, or null when nothing needed fixing
 * or the body still does not parse (callers fall through to tier-2 / banner).
 */
function repairFenceJson(raw: string): { text: string; repairs: number } | null {
  try {
    JSON.parse(raw)
    return null
  } catch {
    // fall through to the repair scan
  }
  let out = ''
  let inString = false
  let escaped = false
  let repairs = 0
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (escaped) {
      out += ch
      escaped = false
      continue
    }
    if (inString && ch === '\\') {
      out += ch
      escaped = true
      continue
    }
    if (ch === '"') {
      if (!inString) {
        inString = true
        out += ch
        continue
      }
      // Inside a string: is this quote the terminator? Look past whitespace.
      let j = i + 1
      while (j < raw.length && (raw[j] === ' ' || raw[j] === '\t' || raw[j] === '\n' || raw[j] === '\r')) j++
      const next = j < raw.length ? raw[j] : ''
      if (next === ',' || next === ']' || next === '}' || next === ':' || next === '') {
        inString = false
        out += ch
      } else {
        // Free-standing quote inside a value → escape it.
        out += '\\"'
        repairs++
      }
      continue
    }
    if (ch === ',') {
      // Trailing comma before `}` / `]` / end of input → drop it.
      let j = i + 1
      while (j < raw.length && (raw[j] === ' ' || raw[j] === '\t' || raw[j] === '\n' || raw[j] === '\r')) j++
      const next = j < raw.length ? raw[j] : ''
      if (next === '}' || next === ']' || next === '') {
        repairs++
        continue
      }
    }
    out += ch
  }
  if (repairs === 0) return null
  try {
    JSON.parse(out)
    return { text: out, repairs }
  } catch {
    return null
  }
}

/**
 * Tier-2 repair — SETTLED MESSAGES ONLY (never while streaming): heals
 * structural incompleteness — missing closing quotes/brackets — by appending
 * the missing terminators, and heals stray closers — a `]` mistyped as `}` or
 * a duplicated terminator — by skipping closers that do not match the open
 * stack (they cannot be legal JSON). This must NOT run on a still-growing
 * body (a half would parse as a finished prefix and flash premature UI), so
 * callers gate it on `context.source` being present, which the host only
 * provides once the message is settled.
 *
 * Runs on the tier-1 result (or the raw body), then closes any unterminated
 * string and appends the missing `}` / `]` in stack order, while skipping
 * mismatched closers. Adopted only when the completed body parses as whole
 * JSON.
 */
function completeFenceJson(raw: string): { text: string; repairs: number } | null {
  const tier1 = repairFenceJson(raw)
  const base = tier1 !== null ? tier1.text : raw
  try {
    JSON.parse(base)
    return tier1
  } catch {
    // fall through to completion
  }
  let out = ''
  const stack: Array<'}' | ']'> = []
  let inString = false
  let escaped = false
  let repairs = tier1 !== null ? tier1.repairs : 0
  for (let i = 0; i < base.length; i++) {
    const ch = base[i]
    if (escaped) {
      out += ch
      escaped = false
      continue
    }
    if (inString) {
      if (ch === '\\') {
        out += ch
        escaped = true
        continue
      }
      if (ch === '"') inString = false
      out += ch
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      continue
    }
    if (ch === '{') {
      stack.push('}')
      out += ch
      continue
    }
    if (ch === '[') {
      stack.push(']')
      out += ch
      continue
    }
    if (ch === '}' || ch === ']') {
      if (stack[stack.length - 1] === ch) {
        stack.pop()
        out += ch
      } else {
        // Mismatched closer (e.g. a `]` mistyped as `}`, or a duplicated
        // terminator): no legal JSON can contain it here, so skip it and let
        // the remaining closers pair up again. The whole-body parse below is
        // the final arbiter — if skipping made things worse, nothing is
        // adopted and the diagnostic banner stays.
        repairs++
      }
      continue
    }
    out += ch
  }
  if (inString) {
    // Unterminated string value → close it.
    out += '"'
    repairs++
  }
  while (stack.length > 0) {
    out += stack.pop()
    repairs++
  }
  if (repairs === 0) return null
  try {
    JSON.parse(out)
    return { text: out, repairs }
  } catch {
    return null
  }
}

/** Inline diagnostic banner for a settled-but-malformed fence body. Kept
 * minimal and self-contained (inline styles only — the host may override
 * stylesheet rules), tone-friendly on both light and dark themes. */
const FENCE_ERROR_STYLE: CSSProperties = {
  margin: '0 0 6px',
  padding: '6px 10px',
  borderRadius: 6,
  background: 'rgba(239, 68, 68, 0.14)',
  border: '1px solid rgba(239, 68, 68, 0.4)',
  color: '#f87171',
  fontSize: 12,
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
}

/**
 * Fallback for a ```dsh-ui fence whose body has no finished component yet.
 * Two very different situations land here and they must not be conflated:
 *
 * 1. **Streaming partial** — the reply is still being written and the JSON
 *    simply is not complete. The host marks the streaming message with
 *    `[data-streaming]` on the AssistantMarkdown root, which is an ancestor
 *    of every fence. While that marker is present, a plain code block is the
 *    correct rendering (partial JSON must never look like an error).
 *
 * 2. **Settled defect** — the message is finished but the body still does
 *    not parse as JSON (a malformed fence like a missing `}`). This used to
 *    fail silently: the fence degraded to a code block with no hint, and the
 *    author had no way to know the UI never rendered. Once the streaming
 *    marker is gone, surface a compact diagnostic with the parse position so
 *    the defect is visible instead of silent.
 *
 * The settle transition is observed with a layout effect that re-runs on
 * every render: the host removes `[data-streaming]` in the final update, so
 * the effect sees the marker disappear and flips `settled` once. Hosts that
 * never carry the marker (toolview, panel, static text) count as settled
 * from the first mount.
 */
function FenceFallback({ raw, fenceKey }: { raw: string; fenceKey: Key }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [settled, setSettled] = useState(false)
  useLayoutEffect(() => {
    const node = ref.current
    if (node !== null && node.closest('[data-streaming]') === null) setSettled(true)
  })
  const diagnostic = settled && raw.trim() !== '' ? describeJsonFailure(raw) : null
  return (
    <div ref={ref}>
      {diagnostic !== null && (
        <div style={FENCE_ERROR_STYLE} role="alert">
          ⚠️ dsh-ui fence JSON 解析失败{diagnostic} —— 围栏保持为代码块；请让模型检查并修复 JSON 后重发。
        </div>
      )}
      <CodeBlock key={fenceKey} code={`${raw}\n`} lang="dsh-ui" />
    </div>
  )
}

/**
 * Keyed publisher for a settled `panel:true` fence: submits ONE panel
 * operation from the host-provided stable source (id + order), in an
 * effect — never inside the render function. StrictMode's duplicate effects
 * are absorbed by the operation map's per-source dedup, so the panel folds
 * and notifies exactly once per source. Renders nothing.
 */
function FencePanelPublisher({ sessionId, sourceId, order, spec }: {
  sessionId: string
  sourceId: string
  order: readonly [number, number, number]
  spec: GenuiSpec
}) {
  useEffect(() => {
    const status: PanelOperationStatus = applyPanelOperation(sessionId, {
      sourceId,
      order,
      mode: spec.append === true ? 'append' : 'replace',
      spec,
    })
    if (status === 'overflow') diagnosePanelBudget(sessionId, sourceId)
  }, [sessionId, sourceId, order, spec])
  return null
}

export const renderGenuiFence: FenceRenderer = (raw, key, context) => {
  const parsed = parsePartialGenuiSpec(raw)
  let spec = parsed === null ? null : repairGenuiSpec(parsed)
  if (spec === null) {
    // Tier-1 (quote escape + trailing commas): safe at any time — adopted
    // only when the whole body parses, so a still-growing streaming half
    // keeps falling back to the code block, never flashing a repair banner.
    const repaired = repairFenceJson(raw)
    if (repaired !== null) {
      const reparsed = parsePartialGenuiSpec(repaired.text)
      spec = reparsed === null ? null : repairGenuiSpec(reparsed)
    }
    // Tier-2 (structural completion: missing quotes/brackets): only for
    // settled messages — the host provides `source` exclusively once the
    // message is finished, so streaming halves are never completed early.
    if (spec === null && context?.source !== undefined) {
      const completed = completeFenceJson(raw)
      if (completed !== null) {
        const reparsed = parsePartialGenuiSpec(completed.text)
        spec = reparsed === null ? null : repairGenuiSpec(reparsed)
      }
    }
  }
  if (spec === null) return <FenceFallback key={key} fenceKey={key} raw={raw} />
  if (spec.panel === true) {
    // Publish only with a settled stable source — streaming/identity-less
    // renders keep the panel untouched. Appends additionally gate on a
    // complete body (a settled-but-malformed append never merges partial
    // content).
    if (context !== undefined && context.sessionId !== undefined && context.source !== undefined) {
      if (spec.append === true && !isCompleteJson(raw)) return null
      return (
        <FencePanelPublisher
          key={key}
          sessionId={context.sessionId}
          sourceId={context.source.id}
          order={context.source.order}
          spec={spec}
        />
      )
    }
    return null
  }
  const sessionId = context?.sessionId
  return (
    // React key carries the stable source identity when present (atomic
    // remount at streaming→settled), falling back to the document key.
    // Repaired specs render SILENTLY: once the UI renders, no amber note
    // tells the user something was wrong — only an unrecoverable body keeps
    // the red diagnostic.
    <ErrorBoundary key={context?.source?.id ?? key} label="该界面">
      <GenuiBlock
        spec={spec}
        // v2.7 durable state: session + stable source + content fingerprint —
        // replaying the same content restores answers/lock/field values; new
        // content (换题, edited spec) gets a fresh key. Without a stable
        // source (streaming / non-conversation surfaces) state is not
        // persisted.
        stateKey={sessionId === undefined
          ? undefined
          : fenceStateKey(sessionId, context?.source?.id ?? String(key), JSON.stringify(spec))}
      />
    </ErrorBoundary>
  )
}

/** Session panel action loop: same [genui-action] contract as inline fences,
 * routed through the scoped conversation send (queued user message). The
 * prompt asks the model to re-run render_ui so the panel updates in place. */
function panelActionSend(ctx: Context, sessionId: SessionId): GenuiPanelInjected {
  const scoped = ctx.sessions.scope(sessionId)
  const conversation = scoped?.get('conversation') as IConversation | undefined
  return {
    sessionId,
    sendGenuiAction: (action, payload) => {
      if (conversation === undefined) return
      const payloadText = Object.keys(payload).length === 0
        ? ''
        : ` 组件数据: ${JSON.stringify(payload)}`
      void conversation.send(`[genui-action] ${action}。用户刚刚在面板中触发了动作 "${action}"，请根据组件数据执行相应操作，只输出一个 panel:true 的 dsh-ui 围栏来更新面板，回复文本至多一行 10 字以内的确认（如"已刷新"），不要解释、不要普通围栏。${payloadText}`).catch((err: unknown) => {
        // A failed prompt (session gone, agent busy) drops the action; the
        // panel stays interactive — the component is not disabled. Log the
        // failure WITHOUT the action payload or any secret values (the
        // message may contain field content).
        console.warn(`[genui] 面板动作 "${action}" 发送失败（session ${sessionId}）：`, err instanceof Error ? err.message : String(err))
      })
    },
  }
}

/** Relay a `/panel <指令>` instruction to the model: the scoped conversation
 * send with an explicit panel-only directive, so the model replaces the
 * default panel with content tailored to the request. */
function sendPanelInstruction(ctx: Context, sessionId: SessionId, instruction: string): void {
  const scoped = ctx.sessions.scope(sessionId)
  const conversation = scoped?.get('conversation') as IConversation | undefined
  if (conversation === undefined) return
  void conversation.send(`用户执行了 /panel 并请求：${instruction}。请只输出一个 panel:true 的 dsh-ui 围栏来更新会话面板，内容按请求定制；回复文本至多一行 10 字以内的确认（如"已更新"），不要解释、不要普通围栏。`).catch((err: unknown) => {
    // A failed prompt drops the instruction; the default panel stays
    // visible. Log without the instruction text (may contain secrets).
    console.warn(`[genui] /panel 指令发送失败（session ${sessionId}）：`, err instanceof Error ? err.message : String(err))
  })
}

/** Cordis client entry: register the fence renderer on boot, the keyed
 * toolview for the render_ui tool, and the session panel dock; returning the
 * disposers lets cordis tear all registrations down on plugin unload. */
export function apply(ctx: Context): () => void {
  const disposers: Array<() => void> = [registerFenceRenderer('dsh-ui', renderGenuiFence)]
  // Keyed toolview: the harness dispatches 'tool.call.toolview' by wire tool
  // name; registering under 'render_ui' gives the tool's result card the
  // GenUI renderer (reading the repaired spec from result meta). The toolview
  // also publishes every settled spec to the session panel store.
  disposers.push(ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'render_ui',
  }, GenuiToolView)))
  // Session panel dock: a session-scoped, always-present seat above the
  // composer (TodoDock posture). Renders the session's latest render_ui
  // spec in place; absent spec = no panel.
  disposers.push(ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'genui-panel',
    order: 50,
    inject: (sessionId: SessionId): GenuiPanelInjected => panelActionSend(ctx, sessionId),
  }, GenuiPanel)))
  // /panel slash command: a deterministic, client-side entry point that
  // opens the panel dock (publishes the default spec + expand request),
  // clears it (/panel clear), or relays an instruction to the model
  // (/panel <指令>) so the panel gets tailored content.
  const slash = ctx.get('slash') as SlashServiceContract | undefined
  if (slash !== undefined) {
    disposers.push(ctx.effect(() => slash.registerSource(
      createPanelSlashSource((sessionId, instruction) => sendPanelInstruction(ctx, sessionId, instruction)),
    ), 'genui: /panel'))
  } else {
    console.warn('[genui] slash service unavailable; /panel command disabled')
  }
  return () => {
    for (const dispose of disposers) dispose()
  }
}

/** Browser services: the slots registry (toolview + dock), sessions (for
 * the scoped conversation send behind panel actions), and slash (the /panel
 * command source). */
export const inject = ['slots', 'sessions', 'slash']
