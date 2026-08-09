import type { GenuiSpec } from './spec.ts';
export interface GenuiBlockProps {
    /** Parsed spec to render. */
    spec: GenuiSpec;
    /**
     * v2: optional action callback. Interactive components carrying an
     * `action` field fire it (button click, switch toggle, form submit);
     * absent = components are display-only (v1 behavior).
     */
    onAction?: ((action: string, payload: Record<string, unknown>) => void) | undefined;
}
/**
 * Trailing debounce window (ms) for one `[genui-action]` name: rapid
 * repeated interactions on one control (button mashing, switch flipping)
 * collapse into a single action with the LAST payload. Different action
 * names stay independent. The model round-trip takes seconds, so a few
 * hundred ms of trailing delay is imperceptible — and it stops bursts of
 * queued user turns.
 */
export declare const GENUI_ACTION_DEBOUNCE_MS = 300;
/**
 * Render a GenUI spec as an inline block. Falls back to nothing when the spec
 * carries no items (the fence renderer already refused non-specs before us).
 */
export declare const GenuiBlock: import("react").NamedExoticComponent<GenuiBlockProps>;
//# sourceMappingURL=GenuiBlock.d.ts.map