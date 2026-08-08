import { jsx as _jsx } from "react/jsx-runtime";
import { registerFenceRenderer } from '@deepseek-ai/dsh-client-ui-primitives';
import { GenuiBlock } from "./GenuiBlock.js";
import { parsePartialGenuiSpec } from "./parse-partial.js";
/** Render a ```dsh-ui fence body as interactive components (or null while no component has closed yet). */
export const renderGenuiFence = (raw, key) => {
    const spec = parsePartialGenuiSpec(raw);
    if (spec === null)
        return null;
    return _jsx(GenuiBlock, { spec: spec }, key);
};
/** Cordis client entry: register the renderer on boot; returning the
 * disposer lets cordis tear the registration down on plugin unload. */
export const apply = (_ctx) => registerFenceRenderer('dsh-ui', renderGenuiFence);
/** Client-side only: nothing to inject. */
export const inject = [];
//# sourceMappingURL=index.js.map