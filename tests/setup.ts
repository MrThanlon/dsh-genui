/**
 * Test setup: register the dsh-ui fence renderer exactly like the cordis
 * client entry does, so MarkdownText renders fences in jsdom. Also stubs
 * requestAnimationFrame for the staggered-reveal animation and SVG measure
 * APIs jsdom lacks.
 */
import { registerFenceRenderer } from '@deepseek-ai/dsh-client-ui-primitives'
import { renderGenuiFence } from '../src/client/index.tsx'

registerFenceRenderer('dsh-ui', renderGenuiFence)

// jsdom lacks rAF: the reveal animation uses it per item; manual tick below.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  // @ts-expect-error test-only stub
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number
  // @ts-expect-error test-only stub
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id)
}
