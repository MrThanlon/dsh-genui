/**
 * Session GenUI panel store: the latest repaired `render_ui` spec per
 * session, published by the toolview and consumed by the conversation panel
 * dock. Module-level by design (no cordis): both sides are browser-only and
 * share this plugin's module instance.
 *
 * The panel is the "update in place" surface: every render_ui call publishes
 * the newest spec for its session, so the dock re-renders the SAME panel
 * block instead of the message flow piling up new UI blocks per refresh.
 */
import type { GenuiSpec } from './spec.ts'

/** Latest repaired spec per session id; absent = no panel content. */
const specs = new Map<string, GenuiSpec>()

/** Panel subscribers (the dock component); notified on any publish. */
const listeners = new Set<() => void>()

/**
 * Publish the latest spec for a session. `null` clears the panel.
 * Reference-stable: publishing the identical object is a no-op for
 * subscribers (their useSyncExternalStore snapshots stay equal).
 */
export function publishPanelSpec(sessionId: string, spec: GenuiSpec | null): void {
  const prev = specs.get(sessionId)
  if (prev === spec) return
  if (spec === null) specs.delete(sessionId)
  else specs.set(sessionId, spec)
  for (const fn of listeners) fn()
}

/** Current spec for a session (useSyncExternalStore getSnapshot). */
export function getPanelSpec(sessionId: string): GenuiSpec | null {
  return specs.get(sessionId) ?? null
}

/** Subscribe to panel changes. Returns the disposer. */
export function subscribePanel(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
