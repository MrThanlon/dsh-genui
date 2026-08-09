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

import type { Context } from 'cordis'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { CodeBlock, registerFenceRenderer, type FenceRenderer } from '@deepseek-ai/dsh-client-ui-primitives'
import { GenuiBlock } from './GenuiBlock.tsx'
import { repairGenuiSpec } from './guard.ts'
import { parsePartialGenuiSpec } from './parse-partial.ts'
import { GenuiPanel, type GenuiPanelInjected } from './panel.tsx'
import { GenuiToolView } from './toolview.tsx'

/** Render a ```dsh-ui fence body as interactive components. While the body
 * still has no finished component (fence open / malformed) the renderer falls
 * back to a plain code block, re-evaluated per chunk — matching the markdown
 * renderer's settled contract. Every accepted body runs through the spec
 * guard (limits + deterministic repair) so pathological or hostile specs
 * degrade gracefully instead of stalling the UI. */
export const renderGenuiFence: FenceRenderer = (raw, key) => {
  const parsed = parsePartialGenuiSpec(raw)
  const spec = parsed === null ? null : repairGenuiSpec(parsed)
  if (spec === null) return <CodeBlock key={key} code={`${raw}\n`} lang="dsh-ui" />
  return <GenuiBlock key={key} spec={spec} />
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
      void conversation.send(`[genui-action] ${action}。用户刚刚在面板中触发了动作 "${action}"，请根据组件数据执行相应操作，并再次调用 render_ui 工具更新面板。${payloadText}`).catch(() => {
        // A failed prompt (session gone, agent busy) drops the action; the
        // panel stays interactive — the component is not disabled.
      })
    },
  }
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
  return () => {
    for (const dispose of disposers) dispose()
  }
}

/** Browser services: the slots registry (toolview + dock) and sessions (for
 * the scoped conversation send behind panel actions). */
export const inject = ['slots', 'sessions']
