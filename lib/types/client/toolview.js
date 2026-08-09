import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { GenuiBlock } from "./GenuiBlock.js";
import { repairGenuiSpec } from "./guard.js";
import css from './GenuiBlock.module.css';
/**
 * Keyed toolview for the `render_ui` tool. `block` is the settled result
 * node once the call completes; while it runs (or on replay without meta)
 * the summary fallback is shown.
 */
export function GenuiToolView({ toolName, block }) {
    // `meta` exists only on the settled result node; running calls (and
    // replayed logs without the projection) fall back to the summary row.
    const meta = 'meta' in block ? block.meta : undefined;
    const spec = meta === undefined ? null : repairGenuiSpec(meta);
    if (spec === null || spec.items.length === 0) {
        return (_jsxs("div", { className: css.toolFallback, "data-genui-tool": true, children: [_jsx("span", { className: css.toolFallbackTitle, children: toolName }), _jsx("span", { className: css.toolFallbackMeta, children: block.callId })] }));
    }
    return (_jsx("div", { className: css.tool, "data-genui-tool": true, children: _jsx(GenuiBlock, { spec: spec }) }));
}
//# sourceMappingURL=toolview.js.map