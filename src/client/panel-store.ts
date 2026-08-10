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
import type { GenuiSpec, GenuiTab } from './spec.ts'

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
    lastAppendSource.delete(sessionId)
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

/* ---------------- incremental append ---------------- */

/** If `spec` is a single root `tabs` node, its tabs; otherwise null. */
function asTabs(spec: GenuiSpec): GenuiTab[] | null {
  if (spec.items.length !== 1) return null
  const only = spec.items[0]
  if (only?.type !== 'tabs' || !Array.isArray(only.tabs)) return null
  return only.tabs
}

/**
 * Last MERGED append source per session (a fence key). The fence renderer
 * re-invokes a completed fence several times (stream settle, re-renders), so
 * an append must merge exactly once per source — otherwise identical content
 * accumulates on every render pass.
 */
const lastAppendSource = new Map<string, string>()

/**
 * Merge an `append` spec into the current panel spec:
 * - both sides single-tabs containers → merge BY TAB LABEL: items of
 *   same-labelled tabs are appended, new labels are added (order preserved);
 * - otherwise → plain item lists are appended to the tail.
 * The previous title wins unless it was absent. `next` is returned as-is when
 * there is nothing to merge into. Export for tests.
 */
export function mergePanelSpecs(prev: GenuiSpec | null, next: GenuiSpec): GenuiSpec {
  if (prev === null || prev.items.length === 0) return next
  const title = prev.title ?? next.title
  const base = { ...prev, ...(title === undefined ? {} : { title }) }
  const prevTabs = asTabs(prev)
  const nextTabs = asTabs(next)
  if (prevTabs !== null && nextTabs !== null) {
    const merged = new Map(prevTabs.map(t => [t.label, { label: t.label, items: [...t.items] }]))
    for (const tab of nextTabs) {
      const existing = merged.get(tab.label)
      if (existing !== undefined) existing.items.push(...tab.items)
      else merged.set(tab.label, { label: tab.label, items: [...tab.items] })
    }
    return { ...base, items: [{ type: 'tabs', tabs: [...merged.values()] }] }
  }
  return { ...base, items: [...prev.items, ...next.items] }
}

/**
 * Append-publish: merge `spec` into the session's current panel spec and
 * publish the merged result (same ordering rules as {@link publishPanelSpec}).
 * Lets the model grow a panel incrementally without resending accumulated
 * content, so a panel is never bounded by a single transfer's size.
 *
 * `sourceId` (the fence key) makes the merge idempotent PER SOURCE: repeated
 * renderer invocations of the same completed fence merge once, while
 * distinct fences (new messages) always merge. Clearing the panel resets the
 * remembered source.
 */
export function publishPanelAppend(sessionId: string, spec: GenuiSpec, seq = Number.POSITIVE_INFINITY, sourceId?: string): void {
  if (sourceId !== undefined) {
    if (lastAppendSource.get(sessionId) === sourceId) return
    lastAppendSource.set(sessionId, sourceId)
  }
  const prev = entries.get(sessionId)?.spec ?? null
  const merged = mergePanelSpecs(prev, spec)
  publishPanelSpec(sessionId, merged, seq)
}

/** Subscribe to panel changes. Returns the disposer. */
export function subscribePanel(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/* ---------------- expand requests ---------------- */

/**
 * Per-session expand tokens: a monotone counter bumped by every explicit
 * expand request (the /panel slash command). The dock compares the token
 * against its own last-seen value so a fresh request expands the panel even
 * when the user collapsed it manually in between.
 */
const expandTokens = new Map<string, number>()

const expandListeners = new Set<() => void>()

/** Request the panel dock to expand for a session (e.g. the /panel command). */
export function requestPanelExpand(sessionId: string): void {
  expandTokens.set(sessionId, (expandTokens.get(sessionId) ?? 0) + 1)
  for (const fn of expandListeners) fn()
}

/** Current expand token for a session (useSyncExternalStore getSnapshot). */
export function getPanelExpandToken(sessionId: string): number {
  return expandTokens.get(sessionId) ?? 0
}

/** Subscribe to expand requests. Returns the disposer. */
export function subscribePanelExpand(listener: () => void): () => void {
  expandListeners.add(listener)
  return () => {
    expandListeners.delete(listener)
  }
}
