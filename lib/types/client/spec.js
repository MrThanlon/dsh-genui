/**
 * GenUI spec language: the declarative component tree a model emits inside a
 * ```dsh-ui fence in its reply, which GenuiBlock renders as real interactive
 * UI inline in the conversation. The vocabulary is a white list — the renderer
 * maps each node to DOM directly, with no arbitrary-HTML path (same
 * untrusted-output stance as MarkdownText).
 *
 * v1 interactivity is client-side only: buttons, tabs, checkboxes, and inputs
 * are operable, but events do NOT flow back to the model.
 */
/** Parse the raw fence body as a GenuiSpec, or null when it is not one. */
export function parseGenuiSpec(raw) {
    const trimmed = raw.trim();
    if (trimmed === '')
        return null;
    let value;
    try {
        value = JSON.parse(trimmed);
    }
    catch {
        return null;
    }
    return isGenuiSpec(value) ? value : null;
}
/** Basic structural guard: is this object a valid GenuiSpec? */
export function isGenuiSpec(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const v = value;
    if (!Array.isArray(v.items))
        return false;
    if (v.title !== undefined && typeof v.title !== 'string')
        return false;
    if (v.gap !== undefined && typeof v.gap !== 'number')
        return false;
    return true;
}
//# sourceMappingURL=spec.js.map