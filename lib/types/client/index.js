import { jsx as _jsx } from "react/jsx-runtime";
import { CodeBlock, registerFenceRenderer } from '@deepseek-ai/dsh-client-ui-primitives';
import { GenuiBlock } from "./GenuiBlock.js";
import { repairGenuiSpec } from "./guard.js";
import { parsePartialGenuiSpec } from "./parse-partial.js";
import { GenuiToolView } from "./toolview.js";
/** Render a ```dsh-ui fence body as interactive components. While the body
 * still has no finished component (fence open / malformed) the renderer falls
 * back to a plain code block, re-evaluated per chunk — matching the markdown
 * renderer's settled contract. Every accepted body runs through the spec
 * guard (limits + deterministic repair) so pathological or hostile specs
 * degrade gracefully instead of stalling the UI. */
export const renderGenuiFence = (raw, key) => {
    const parsed = parsePartialGenuiSpec(raw);
    const spec = parsed === null ? null : repairGenuiSpec(parsed);
    if (spec === null)
        return _jsx(CodeBlock, { code: `${raw}\n`, lang: "dsh-ui" }, key);
    return _jsx(GenuiBlock, { spec: spec }, key);
};
/** Cordis client entry: register the fence renderer on boot and the keyed
 * toolview for the render_ui tool; returning the disposers lets cordis tear
 * both registrations down on plugin unload. */
export function apply(ctx) {
    const disposers = [registerFenceRenderer('dsh-ui', renderGenuiFence)];
    // Keyed toolview: the harness dispatches 'tool.call.toolview' by wire tool
    // name; registering under 'render_ui' gives the tool's result card the
    // GenUI renderer (reading the repaired spec from result meta).
    disposers.push(ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview',
        key: 'render_ui',
    }, GenuiToolView)));
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
/** Browser services: the slots registry (for the keyed toolview). */
export const inject = ['slots'];
//# sourceMappingURL=index.js.map