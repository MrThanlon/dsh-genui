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

import type { Context } from 'cordis'
import { CodeBlock, registerFenceRenderer, type FenceRenderer } from '@deepseek-ai/dsh-client-ui-primitives'
import { GenuiBlock } from './GenuiBlock.tsx'
import { parsePartialGenuiSpec } from './parse-partial.ts'

/** Render a ```dsh-ui fence body as interactive components. While the body
 * still has no finished component (fence open / malformed) the renderer falls
 * back to a plain code block, re-evaluated per chunk — matching the markdown
 * renderer's settled contract. */
export const renderGenuiFence: FenceRenderer = (raw, key) => {
  const spec = parsePartialGenuiSpec(raw)
  if (spec === null) return <CodeBlock key={key} code={`${raw}\n`} lang="dsh-ui" />
  return <GenuiBlock key={key} spec={spec} />
}

/** Cordis client entry: register the renderer on boot; returning the
 * disposer lets cordis tear the registration down on plugin unload. */
export const apply = (_ctx: Context): (() => void) =>
  registerFenceRenderer('dsh-ui', renderGenuiFence)

/** Client-side only: nothing to inject. */
export const inject: string[] = []
