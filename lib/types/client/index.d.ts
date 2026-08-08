/**
 * dsh-genui browser half: registers the `dsh-ui` fence renderer with
 * MarkdownText via the fence-registry extension point shipped by
 * `@deepseek-ai/dsh-client-ui-primitives`.
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
/** Render a ```dsh-ui fence body as interactive components (or null while no component has closed yet). */
export declare const renderGenuiFence: FenceRenderer;
/** Cordis client entry: register the renderer on boot; returning the
 * disposer lets cordis tear the registration down on plugin unload. */
export declare const apply: (_ctx: Context) => (() => void);
/** Client-side only: nothing to inject. */
export declare const inject: string[];
//# sourceMappingURL=index.d.ts.map