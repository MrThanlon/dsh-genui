/**
 * Session GenUI panel store: the latest repaired `render_ui`/panel-fence
 * spec per session, published by the toolview and fence renderer and
 * consumed by the conversation panel dock. Module-level by design (no
 * cordis): both sides are browser-only and share this plugin's module
 * instance.
 *
 * The panel is the "update in place" surface: every render_ui call or
 * panel:true fence publishes the newest spec for its session, so the dock
 * re-renders the SAME panel block instead of the message flow piling up new
 * UI blocks per refresh.
 *
 * Ordering: publishes carry a monotone message seq — the toolview passes the
 * settled result block's seq, panel fences publish as "latest" (Infinity).
 * A publish with a seq older than the stored one is rejected, so replay /
 * refresh re-renders of an OLD tool-result block can never clobber a newer
 * fence or result (observed: replay rendered the old toolview after the new
 * fence and overwrote the panel). Ties (same seq, or two fences) resolve to
 * the later publish.
 */
import type { GenuiSpec } from './spec.ts'

/** Stored panel state per session. */
interface PanelEntry {
  /** Latest accepted spec; null = cleared. */
  spec: GenuiSpec | null
  /** Seq of the accepted publish; fences publish as Infinity ("latest"). */
  seq: number
}

const entries = new Map<string, PanelEntry>()

/** Panel subscribers (the dock component); notified on any accepted publish. */
const listeners = new Set<() => void>()

/**
 * Publish a spec for a session. Older seqs are rejected (see module doc).
 * `null` unconditionally clears the panel (resets the entry, so any later
 * publish — fence or tool result — can rebuild it). Same-seq publishes
 * overwrite.
 */
export function publishPanelSpec(sessionId: string, spec: GenuiSpec | null, seq = Number.POSITIVE_INFINITY): void {
  if (spec === null) {
    if (!entries.has(sessionId)) return
    entries.delete(sessionId)
    for (const fn of listeners) fn()
    return
  }
  const prev = entries.get(sessionId)
  if (prev !== undefined && seq < prev.seq) return
  if (prev !== undefined && prev.spec === spec && prev.seq === seq) return
  entries.set(sessionId, { spec, seq })
  for (const fn of listeners) fn()
}

/** Current spec for a session (useSyncExternalStore getSnapshot). */
export function getPanelSpec(sessionId: string): GenuiSpec | null {
  return entries.get(sessionId)?.spec ?? null
}

/** Subscribe to panel changes. Returns the disposer. */
export function subscribePanel(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
