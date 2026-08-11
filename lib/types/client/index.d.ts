/**
 * dsh-genui browser half: registers the `dsh-ui` fence renderer with
 * MarkdownText via the fence-registry extension point shipped by
 * `@deepseek-ai/dsh-client-ui-primitives`, the keyed toolview for the
 * `render_ui` tool (renders the tool's result card in the tool row), and the
 * session panel dock (re-renders the latest render_ui spec IN PLACE above
 * the composer, so repeated calls update one surface instead of stacking).
 *
 * The renderer parses the fence body with the partial parser: while the reply
 * streams, every FINISHED component appears the moment its JSON object
 * closes, so the UI assembles top-down before the fence (or reply) completes.
 * A body with no finished component yet falls back to a plain code block,
 * re-evaluated per chunk. Action callbacks (v2 event loop) are not threaded
 * here — GenuiBlock reads them from GenuiActionContext, installed by the
 * markdown host (fences) or by the panel component (dock).
 * @module @deepseek-ai/dsh-genui/client
 */
import type { Context } from '@deepseek-ai/cordis';
import { type Key, type ReactNode } from 'react';
/**
 * Plugin-local fence context types. Structurally identical to the host's
 * `FenceRenderContext`/`FenceSource` (dsh-client-ui-primitives) once the
 * fence-source contract ships; defined here so this plugin builds and runs
 * against hosts without the contract (optional third renderer argument,
 * absent context = transitional path). Remove the local copies and the
 * registration cast when the host contract lands.
 */
export interface GenuiFenceSource {
    id: string;
    order: readonly [messageSeq: number, textBlockIndex: number, fenceIndex: number];
}
export interface GenuiFenceContext {
    sessionId?: string;
    source?: GenuiFenceSource;
}
export type GenuiFenceRenderer = (raw: string, key: Key, context?: GenuiFenceContext) => ReactNode;
export declare const renderGenuiFence: GenuiFenceRenderer;
/** Cordis client entry: register the fence renderer on boot, the keyed
 * toolview for the render_ui tool, and the session panel dock; returning the
 * disposers lets cordis tear all registrations down on plugin unload. */
export declare function apply(ctx: Context): () => void;
/** Browser services: the slots registry (toolview + dock), sessions (for
 * the scoped conversation send behind panel actions), and slash (the /panel
 * command source). */
export declare const inject: string[];
