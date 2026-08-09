/** Current session id (null = no session / still loading). */
let activeSessionId = null;
/** Read the current session id (sync, fence-renderer safe). */
export function getActiveSessionId() {
    return activeSessionId;
}
/** Set the current session id (from the sessions feed subscription). */
export function setActiveSessionId(id) {
    activeSessionId = id;
}
//# sourceMappingURL=active-session.js.map