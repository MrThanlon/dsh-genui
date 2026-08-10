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
import type { GenuiSpec } from './spec.ts';
/**
 * Publish a spec for a session. Older seqs are rejected (see module doc).
 * `null` unconditionally clears the panel (resets the entry, so any later
 * publish — fence or tool result — can rebuild it). Same-seq publishes
 * overwrite.
 */
export declare function publishPanelSpec(sessionId: string, spec: GenuiSpec | null, seq?: number): void;
/** Current spec for a session (useSyncExternalStore getSnapshot). */
export declare function getPanelSpec(sessionId: string): GenuiSpec | null;
/**
 * Merge an `append` spec into the current panel spec:
 * - both sides single-tabs containers → merge BY TAB LABEL: items of
 *   same-labelled tabs are appended, new labels are added (order preserved);
 * - otherwise → plain item lists are appended to the tail.
 * The previous title wins unless it was absent. `next` is returned as-is when
 * there is nothing to merge into. Export for tests.
 */
export declare function mergePanelSpecs(prev: GenuiSpec | null, next: GenuiSpec): GenuiSpec;
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
export declare function publishPanelAppend(sessionId: string, spec: GenuiSpec, seq?: number, sourceId?: string): void;
/** Subscribe to panel changes. Returns the disposer. */
export declare function subscribePanel(listener: () => void): () => void;
/** Request the panel dock to expand for a session (e.g. the /panel command). */
export declare function requestPanelExpand(sessionId: string): void;
/** Current expand token for a session (useSyncExternalStore getSnapshot). */
export declare function getPanelExpandToken(sessionId: string): number;
/** Subscribe to expand requests. Returns the disposer. */
export declare function subscribePanelExpand(listener: () => void): () => void;
//# sourceMappingURL=panel-store.d.ts.map