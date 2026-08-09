/** Latest repaired spec per session id; absent = no panel content. */
const specs = new Map();
/** Panel subscribers (the dock component); notified on any publish. */
const listeners = new Set();
/**
 * Publish the latest spec for a session. `null` clears the panel.
 * Reference-stable: publishing the identical object is a no-op for
 * subscribers (their useSyncExternalStore snapshots stay equal).
 */
export function publishPanelSpec(sessionId, spec) {
    const prev = specs.get(sessionId);
    if (prev === spec)
        return;
    if (spec === null)
        specs.delete(sessionId);
    else
        specs.set(sessionId, spec);
    for (const fn of listeners)
        fn();
}
/** Current spec for a session (useSyncExternalStore getSnapshot). */
export function getPanelSpec(sessionId) {
    return specs.get(sessionId) ?? null;
}
/** Subscribe to panel changes. Returns the disposer. */
export function subscribePanel(listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
//# sourceMappingURL=panel-store.js.map