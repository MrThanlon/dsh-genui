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
import type { GenuiSpec } from './spec.ts';
/**
 * Publish the latest spec for a session. `null` clears the panel.
 * Reference-stable: publishing the identical object is a no-op for
 * subscribers (their useSyncExternalStore snapshots stay equal).
 */
export declare function publishPanelSpec(sessionId: string, spec: GenuiSpec | null): void;
/** Current spec for a session (useSyncExternalStore getSnapshot). */
export declare function getPanelSpec(sessionId: string): GenuiSpec | null;
/** Subscribe to panel changes. Returns the disposer. */
export declare function subscribePanel(listener: () => void): () => void;
//# sourceMappingURL=panel-store.d.ts.map