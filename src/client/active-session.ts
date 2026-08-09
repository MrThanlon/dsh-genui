/**
 * Active-session tracker: the plugin's browser half keeps the current
 * session id from the sessions service feed so synchronous render paths
 * (fence renderers, which have no React context seat) can target the panel
 * store without a session-scoped component boundary.
 *
 * Approximation, deliberately bounded: the feed is the renderer host's
 * current-session projection, so a fence rendered while the user is viewing
 * a session publishes to that session. Historical replays render while the
 * replayed session is current — the last panel fence of the opened session
 * lands in that session's panel, which is the desired reopen behavior.
 * Multi-window/split-view races can misdirect a publish, but the next
 * correct publish overwrites it; the panel never shows stale cross-session
 * content for long.
 */
export type ActiveSession = string | null

/** Current session id (null = no session / still loading). */
let activeSessionId: ActiveSession = null

/** Read the current session id (sync, fence-renderer safe). */
export function getActiveSessionId(): ActiveSession {
  return activeSessionId
}

/** Set the current session id (from the sessions feed subscription). */
export function setActiveSessionId(id: ActiveSession): void {
  activeSessionId = id
}
