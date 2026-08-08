/**
 * Partial GenUI spec parsing: extract the components that are already
 * complete from a still-growing ```dsh-ui fence body, so the UI can render
 * top-down as the model writes — each finished component appears the moment
 * its JSON object closes, instead of the whole block waiting for the fence.
 *
 * Strategy (tolerant, white-list-agnostic):
 * 1. Full parse first (the common settled case).
 * 2. Scan for every position where all brackets are balanced; try each as a
 *    complete prefix (longest first). This covers trailing junk like a
 *    closing fence or a stray comma.
 * 3. If nothing parses, walk backward from each closing `}`: truncate there
 *    and close the remaining open brackets. This yields the longest run of
 *    finished array elements — an unfinished trailing element is dropped.
 *
 * The result is only ever a PREFIX of the intended spec, so it is always
 * safe to render: components already present are complete and valid.
 */
import { isGenuiSpec } from "./spec.js";
function scanBrackets(text) {
    const stack = [];
    const balancedEnds = [];
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped)
                escaped = false;
            else if (ch === '\\')
                escaped = true;
            else if (ch === '"')
                inString = false;
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === '{' || ch === '[') {
            stack.push(ch);
            continue;
        }
        if (ch === '}' || ch === ']') {
            const open = stack.pop();
            const expects = ch === '}' ? '{' : '[';
            if (open !== expects) {
                // Unbalanced (mismatched or stray close): the tail is unusable.
                return { stack: null, balancedEnds };
            }
            if (stack.length === 0)
                balancedEnds.push(i + 1);
            continue;
        }
    }
    return { stack, balancedEnds };
}
/** Try to parse a candidate as a GenuiSpec. */
function trySpec(candidate) {
    try {
        const value = JSON.parse(candidate);
        return isGenuiSpec(value) ? value : null;
    }
    catch {
        return null;
    }
}
/**
 * Parse a possibly incomplete genui spec body.
 * @param raw - the fence body as accumulated so far.
 * @returns a spec containing only finished components, or null when nothing
 *   usable has been written yet.
 */
export function parsePartialGenuiSpec(raw) {
    const text = raw.trim();
    if (text === '')
        return null;
    // 1. Full parse (settled / already-complete body).
    const full = trySpec(text);
    if (full !== null)
        return full;
    // 2. Balanced prefixes, longest first (trailing comma / fence tail).
    const scan = scanBrackets(text);
    if (scan.stack !== null) {
        for (const end of [...scan.balancedEnds].reverse()) {
            const candidate = trySpec(text.slice(0, end));
            if (candidate !== null)
                return candidate;
        }
    }
    // 3. Unfinished: drop the trailing incomplete element and close brackets.
    //    Walk backward over every `}` (a completed element's end), truncate
    //    there, and close whatever brackets remain open. Longest first.
    for (let i = text.length - 1; i > 0; i--) {
        if (text[i] !== '}')
            continue;
        const prefix = text.slice(0, i + 1);
        const rescan = scanBrackets(prefix);
        if (rescan.stack === null)
            continue;
        let candidate = prefix;
        for (const open of [...rescan.stack].reverse()) {
            candidate += open === '{' ? '}' : ']';
        }
        const spec = trySpec(candidate);
        if (spec !== null)
            return spec;
    }
    // 4. Not even one complete element yet (e.g. `{"items":[{"type":"tex`).
    return null;
}
//# sourceMappingURL=parse-partial.js.map