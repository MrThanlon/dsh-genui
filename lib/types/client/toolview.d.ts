/**
 * The `render_ui` tool's card in the tool row. The host projected the
 * repaired spec into the result's `meta` (the tool's `presentationMeta`);
 * this keyed toolview reads it and renders through GenuiBlock — the same
 * renderer the ```dsh-ui fence uses. Falls back to a compact summary row
 * when the meta is missing or invalid (e.g. a replay of a log recorded
 * before the projection existed).
 */
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/src/client/contract/slots';
/**
 * Keyed toolview for the `render_ui` tool. `block` is the settled result
 * node once the call completes; while it runs (or on replay without meta)
 * the summary fallback is shown.
 */
export declare function GenuiToolView({ toolName, block }: ToolCallViewProps): import("react").JSX.Element;
//# sourceMappingURL=toolview.d.ts.map