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
import { type GenuiSpec } from './spec.ts';
/**
 * Parse a possibly incomplete genui spec body.
 * @param raw - the fence body as accumulated so far.
 * @returns a spec containing only finished components, or null when nothing
 *   usable has been written yet.
 */
export declare function parsePartialGenuiSpec(raw: string): GenuiSpec | null;
//# sourceMappingURL=parse-partial.d.ts.map