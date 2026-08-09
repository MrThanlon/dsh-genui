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
 * The dock is COLLAPSIBLE (TodoDock pattern), defaulting to a one-line
 * header: a tall always-open panel pins above the composer and crushes the
 * message flow's visible area, making history feel unreachable. Collapsed,
 * it takes a single row; expanded, the body caps its height and scrolls
 * internally, so the conversation stays scrollable either way.
 *
 * Actions ride the same GenuiActionContext contract as inline fences: the
 * sendGenuiAction injection (built from the scoped conversation service in
 * apply) queues a [genui-action] user message back to the model.
 */
import { useState, useSyncExternalStore } from 'react'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import { GenuiActionContext, type GenuiActionHandler } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { GenuiBlock } from './GenuiBlock.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'
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
 * spec; afterwards the SAME block re-renders on every publish. Collapsed by
 * default so the dock never steals the message flow's scroll room; the
 * header always shows the current panel title.
 */
export function GenuiPanel({ sessionId, sendGenuiAction }: GenuiPanelProps) {
  const spec = useSyncExternalStore(subscribePanel, () => getPanelSpec(sessionId))
  const [collapsed, setCollapsed] = useState(true)
  if (spec === null || spec.items.length === 0) return null
  return (
    <div className={css.panel} data-genui-panel>
      <div className={css.panelHeader}>
        <button
          type="button"
          className={css.panelToggle}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(c => !c)}
        >
          <span className={css.panelBadge}>面板</span>
          <span className={css.panelTitle}>{spec.title ?? 'GenUI 面板'}</span>
          <span className={css.panelChevron} aria-hidden>{collapsed ? '▸' : '▾'}</span>
        </button>
      </div>
      {!collapsed && (
        <div className={css.panelBody}>
          <GenuiActionContext.Provider value={sendGenuiAction}>
            <ErrorBoundary label="面板">
              <GenuiBlock spec={spec} />
            </ErrorBoundary>
          </GenuiActionContext.Provider>
        </div>
      )}
    </div>
  )
}
