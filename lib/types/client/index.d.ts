/**
 * dsh-genui browser half: registers the `dsh-ui` fence renderer with
 * MarkdownText via the fence-registry extension point shipped by
 * `@deepseek-ai/dsh-client-ui-primitives`, plus the keyed toolview for the
 * `render_ui` tool (renders the tool's result card in the tool row).
 *
 * The renderer parses the fence body with the partial parser: while the reply
 * streams, every FINISHED component appears the moment its JSON object
 * closes, so the UI assembles top-down before the fence (or reply) completes.
 * A body with no finished component yet falls back to a plain code block,
 * re-evaluated per chunk. Action callbacks (v2 event loop) are not threaded
 * here — GenuiBlock reads them from GenuiActionContext, installed by the
 * markdown host.
 * @module @deepseek-ai/dsh-genui/client
 */
import type { Context } from 'cordis';
import { type FenceRenderer } from '@deepseek-ai/dsh-client-ui-primitives';
/** Render a ```dsh-ui fence body as interactive components. While the body
 * still has no finished component (fence open / malformed) the renderer falls
 * back to a plain code block, re-evaluated per chunk — matching the markdown
 * renderer's settled contract. Every accepted body runs through the spec
 * guard (limits + deterministic repair) so pathological or hostile specs
 * degrade gracefully instead of stalling the UI. */
export declare const renderGenuiFence: FenceRenderer;
/** Cordis client entry: register the fence renderer on boot and the keyed
 * toolview for the render_ui tool; returning the disposers lets cordis tear
 * both registrations down on plugin unload. */
export declare function apply(ctx: Context): () => void;
/** Browser services: the slots registry (for the keyed toolview). */
export declare const inject: string[];
//# sourceMappingURL=index.d.ts.map