/**
 * Session GenUI panel: the dock surface that renders the latest `render_ui`
 * spec IN PLACE. The toolview publishes every new result into the panel
 * store; this component subscribes and re-renders the same block, so a
 * refresh (model calls render_ui again) updates the panel instead of the
 * message flow accumulating new UI per round.
 *
 * Mounted through the 'conversation.input.dock' list slot (TodoDock posture)
 * — a session-scoped, always-present seat above the composer — so the panel
 * coexists with the message flow on one screen. Absent spec = no panel.
 *
 * Actions ride the same GenuiActionContext contract as inline fences: the
 * sendGenuiAction injection (built from the scoped conversation service in
 * apply) queues a [genui-action] user message back to the model.
 */
import { useSyncExternalStore } from 'react'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import { GenuiActionContext, type GenuiActionHandler } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { GenuiBlock } from './GenuiBlock.tsx'
import { getPanelSpec, subscribePanel } from './panel-store.ts'
import css from './GenuiBlock.module.css'

/** Injection face built per session in apply (scoped conversation send). */
export interface GenuiPanelInjected {
  sessionId: string
  sendGenuiAction: GenuiActionHandler
}

export type GenuiPanelProps = PropsRuntime<'conversation.input.dock'> & GenuiPanelInjected

/**
 * Panel dock entry. Renders nothing until the session's toolview published a
 * spec; afterwards the SAME block re-renders on every publish.
 */
export function GenuiPanel({ sessionId, sendGenuiAction }: GenuiPanelProps) {
  const spec = useSyncExternalStore(subscribePanel, () => getPanelSpec(sessionId))
  if (spec === null || spec.items.length === 0) return null
  return (
    <div className={css.panel} data-genui-panel>
      <GenuiActionContext.Provider value={sendGenuiAction}>
        <GenuiBlock spec={spec} />
      </GenuiActionContext.Provider>
    </div>
  )
}
