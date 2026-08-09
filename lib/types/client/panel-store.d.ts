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
 * `null` clears the panel (also seq-gated). Same-seq publishes overwrite.
 */
export declare function publishPanelSpec(sessionId: string, spec: GenuiSpec | null, seq?: number): void;
/** Current spec for a session (useSyncExternalStore getSnapshot). */
export declare function getPanelSpec(sessionId: string): GenuiSpec | null;
/** Subscribe to panel changes. Returns the disposer. */
export declare function subscribePanel(listener: () => void): () => void;
//# sourceMappingURL=panel-store.d.ts.map