import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The `render_ui` tool's card in the tool row. The host projected the
 * repaired spec into the result's `meta` (the tool's `presentationMeta`);
 * this keyed toolview reads it and renders through GenuiBlock — the same
 * renderer the ```dsh-ui fence uses. Falls back to a compact summary row
 * when the meta is missing or invalid (e.g. a replay of a log recorded
 * before the projection existed).
 *
 * Every settled spec is ALSO published to the session panel store: the
 * conversation dock re-renders the same panel block in place, so repeated
 * render_ui calls update one surface instead of stacking tool-row cards.
 */
import { useEffect, useMemo } from 'react';
import { GenuiBlock } from "./GenuiBlock.js";
import { repairGenuiSpec } from "./guard.js";
import { publishPanelSpec } from "./panel-store.js";
import css from './GenuiBlock.module.css';
/**
 * Keyed toolview for the `render_ui` tool. `block` is the settled result
 * node once the call completes; while it runs (or on replay without meta)
 * the summary fallback is shown.
 */
export function GenuiToolView({ toolName, block, sessionId }) {
    // `meta` exists only on the settled result node; running calls (and
    // replayed logs without the projection) fall back to the summary row.
    // Memoized so the publish effect only fires when the settled spec
    // actually changes (same block → same object → no panel churn).
    const meta = 'meta' in block ? block.meta : undefined;
    const spec = useMemo(() => (meta === undefined ? null : repairGenuiSpec(meta)), [meta]);
    useEffect(() => {
        // Publish the settled spec to the session panel (dock), carrying the
        // result block's message seq: replay/refresh re-renders of an older
        // result cannot clobber a newer panel fence. Running calls publish
        // nothing — the panel keeps its last content.
        if (spec !== null && spec.items.length > 0) {
            publishPanelSpec(sessionId, spec, 'seq' in block ? block.seq : undefined);
        }
    }, [sessionId, spec, block]);
    if (spec === null || spec.items.length === 0) {
        return (_jsxs("div", { className: css.toolFallback, "data-genui-tool": true, children: [_jsx("span", { className: css.toolFallbackTitle, children: toolName }), _jsx("span", { className: css.toolFallbackMeta, children: block.callId })] }));
    }
    return (_jsx("div", { className: css.tool, "data-genui-tool": true, children: _jsx(GenuiBlock, { spec: spec }) }));
}
//# sourceMappingURL=toolview.js.map