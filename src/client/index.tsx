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

import type { Context } from 'cordis'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import { CodeBlock, registerFenceRenderer, type FenceRenderer } from '@deepseek-ai/dsh-client-ui-primitives'
import { GenuiBlock } from './GenuiBlock.tsx'
import { repairGenuiSpec } from './guard.ts'
import { parsePartialGenuiSpec } from './parse-partial.ts'
import { GenuiToolView } from './toolview.tsx'

/** Render a ```dsh-ui fence body as interactive components. While the body
 * still has no finished component (fence open / malformed) the renderer falls
 * back to a plain code block, re-evaluated per chunk — matching the markdown
 * renderer's settled contract. Every accepted body runs through the spec
 * guard (limits + deterministic repair) so pathological or hostile specs
 * degrade gracefully instead of stalling the UI. */
export const renderGenuiFence: FenceRenderer = (raw, key) => {
  const parsed = parsePartialGenuiSpec(raw)
  const spec = parsed === null ? null : repairGenuiSpec(parsed)
  if (spec === null) return <CodeBlock key={key} code={`${raw}\n`} lang="dsh-ui" />
  return <GenuiBlock key={key} spec={spec} />
}

/** Cordis client entry: register the fence renderer on boot and the keyed
 * toolview for the render_ui tool; returning the disposers lets cordis tear
 * both registrations down on plugin unload. */
export function apply(ctx: Context): () => void {
  const disposers: Array<() => void> = [registerFenceRenderer('dsh-ui', renderGenuiFence)]
  // Keyed toolview: the harness dispatches 'tool.call.toolview' by wire tool
  // name; registering under 'render_ui' gives the tool's result card the
  // GenUI renderer (reading the repaired spec from result meta).
  disposers.push(ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'render_ui',
  }, GenuiToolView)))
  return () => {
    for (const dispose of disposers) dispose()
  }
}

/** Browser services: the slots registry (for the keyed toolview). */
export const inject = ['slots']
