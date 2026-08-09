const entries = new Map();
/** Panel subscribers (the dock component); notified on any accepted publish. */
const listeners = new Set();
/**
 * Publish a spec for a session. Older seqs are rejected (see module doc).
 * `null` unconditionally clears the panel (resets the entry, so any later
 * publish — fence or tool result — can rebuild it). Same-seq publishes
 * overwrite.
 */
export function publishPanelSpec(sessionId, spec, seq = Number.POSITIVE_INFINITY) {
    if (spec === null) {
        if (!entries.has(sessionId))
            return;
        entries.delete(sessionId);
        for (const fn of listeners)
            fn();
        return;
    }
    const prev = entries.get(sessionId);
    if (prev !== undefined && seq < prev.seq)
        return;
    if (prev !== undefined && prev.spec === spec && prev.seq === seq)
        return;
    entries.set(sessionId, { spec, seq });
    for (const fn of listeners)
        fn();
}
/** Current spec for a session (useSyncExternalStore getSnapshot). */
export function getPanelSpec(sessionId) {
    return entries.get(sessionId)?.spec ?? null;
}
/** Subscribe to panel changes. Returns the disposer. */
export function subscribePanel(listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
//# sourceMappingURL=panel-store.js.map