/**
 * The `render_ui` tool: a model-facing channel that renders a GenUI spec as
 * an interactive card in the conversation TOOL ROW (route A of the design
 * doc). The ```dsh-ui fence channel renders inline in the reply; this tool
 * renders in the tool row and rides the harness's result `meta` projection:
 * `presentationMeta` stores the repaired spec, the browser toolview
 * (`src/client/toolview.tsx`) reads it from the result node and renders.
 *
 * Zero runtime harness imports, deliberately: an external plugin's node half
 * must not depend on the harness module graph at runtime (the profile
 * resolves only the plugin package itself). The definition is therefore a
 * plain `ToolDefinition` object — the exact shape `defineTool` returns — with
 * the arguments schema authored as JSON Schema (the harness validates args
 * and output with the same JSON Schema validator defineTool uses). Deep
 * validation, deterministic repair, and resource limits live in the shared
 * guard (`src/client/guard.ts`), which the schema deliberately stays loose
 * enough to reach.
 * @module @deepseek-ai/dsh-genui/plugin/tool
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import type { GenericCallView, GenericResultView, JsonSchemaNode, ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { GenuiSpec } from '../client/spec.ts'
import { GENUI_LIMITS, repairGenuiSpec } from '../client/guard.ts'

/**
 * Arguments schema: an open `spec` slot. The schema must NOT reject anything
 * the guard could repair — the model's component trees are imperfect by
 * nature, and the guard heals them; argument validation would only strand
 * them. `additionalProperties: false` keeps the call shape honest.
 *
 * `spec` IS typed `object` on purpose: the guard can only repair plain
 * records (a serialized JSON string, array, or scalar root is unusable), so
 * argument validation rejecting non-objects loses nothing repairable — and
 * it stops the model from double-encoding the tree as a string (observed
 * twice in the wild), failing fast with a clear schema error instead.
 */
const RENDER_UI_PARAMETERS: Record<string, unknown> = {
  type: 'object',
  properties: {
    spec: {
      type: 'object',
      description: 'GenUI component tree (white-listed vocabulary, see the dsh-ui fence section in the system prompt). Deep-validated and repaired by the renderer. Pass the spec as a JSON OBJECT — never as a serialized JSON string (a string fails argument validation).',
    },
  },
  required: ['spec'],
  additionalProperties: false,
}

/** The tool's canonical value is a short model-facing summary string. */
const RENDER_UI_OUTPUT_SCHEMA: JsonSchemaNode = { type: 'string', description: 'One-line human-readable render summary for the model.' }

/** Read the `spec` argument defensively (presenters run on replayed args). */
function specOf(args: unknown): unknown {
  return typeof args === 'object' && args !== null ? (args as { spec?: unknown }).spec : undefined
}

/** Total node count of a repaired spec (already bounded by the guard). */
function countNodes(spec: GenuiSpec): number {
  let n = 0
  const walk = (list: readonly unknown[]): void => {
    for (const node of list) {
      if (n >= GENUI_LIMITS.maxNodes) return
      n += 1
      const items = (node as { items?: unknown }).items
      if (Array.isArray(items)) walk(items)
    }
  }
  walk(spec.items)
  return n
}

/** Tool-call title shared by the pending and completed presentations. */
function cardTitle(args: unknown): string | undefined {
  const spec = repairGenuiSpec(specOf(args))
  return spec === null ? undefined : `渲染 UI：${spec.title ?? '未命名'}`
}

/**
 * Build the render_ui tool definition. Registered by the plugin node half;
 * `ctx.tools.register` consumes it exactly like a `defineTool` result.
 */
export function createRenderUiTool(): ToolDefinition {
  return {
    name: 'render_ui',
    description:
      'Render an interactive UI card in the conversation tool row by passing a GenUI spec (a white-listed component tree; the same vocabulary as the ```dsh-ui fence, see the system prompt). '
      + 'Use it when the user asks for a structured panel, dashboard, or form that belongs in the tool row rather than inline in the reply. '
      + 'The card is interactive client-side (tabs, buttons, inputs, switches); components carrying an "action" field send [genui-action] back to you when the user interacts, and you should re-render the updated UI.',
    parameters: RENDER_UI_PARAMETERS,
    output: {
      schema: RENDER_UI_OUTPUT_SCHEMA,
      render(_args: unknown, value: JsonValue): ContentBlock[] {
        return [{ type: 'text', text: String(value) }]
      },
      presentationMeta(args: unknown): JsonValue {
        // The browser toolview reads the repaired spec from result meta. The
        // spec is JSON-safe by construction (only string/number/boolean/array
        // fields after repair), so the widening cast is lossless.
        return repairGenuiSpec(specOf(args)) as unknown as JsonValue
      },
    },
    async execute(args: unknown): Promise<JsonValue> {
      const spec = repairGenuiSpec(specOf(args))
      if (spec === null) {
        return 'render_ui：spec 无效 —— 根对象需要 "items" 数组（组件树白名单见系统提示词），请修正后重试。'
      }
      const title = spec.title ?? '未命名'
      return `已渲染 UI「${title}」（${countNodes(spec)} 个组件）。用户现在可以看到这张卡片；组件带 action 时，用户交互会以 [genui-action] 消息发回给你，届时请重新渲染更新后的界面。`
    },
    presentCall(args: unknown): GenericCallView | undefined {
      const title = cardTitle(args)
      return title === undefined ? undefined : { card: 'generic', title, kind: 'other' }
    },
    presentResult(args: unknown): GenericResultView | undefined {
      const title = cardTitle(args)
      return title === undefined ? undefined : { card: 'generic', title }
    },
  }
}
