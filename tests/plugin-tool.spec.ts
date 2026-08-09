// The render_ui tool definition: schema shape, execute behavior (guard-backed
// repair + caps), and the presentation projections (call/result cards + meta
// spec for the browser toolview).
import { describe, expect, it } from 'vitest'
import { createRenderUiTool } from '../src/plugin/tool.ts'
import { GENUI_LIMITS } from '../src/client/guard.ts'

const tool = createRenderUiTool()

const text = (content: string) => ({ type: 'text', content })

describe('render_ui tool definition', () => {
  it('registers under the render_ui name with an open spec argument', () => {
    expect(tool.name).toBe('render_ui')
    expect(typeof tool.description).toBe('string')
    expect(tool.description.length).toBeGreaterThan(50)
    const parameters = tool.parameters as { required?: string[]; properties?: Record<string, unknown> }
    expect(parameters.required).toContain('spec')
    expect(parameters.properties?.spec).toBeDefined()
  })

  it('declares a string output schema and a render projection', () => {
    const schema = tool.output.schema as { type?: string }
    expect(schema.type).toBe('string')
    const blocks = tool.output.render({ spec: {} }, 'ok')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.type).toBe('text')
  })
})

describe('render_ui execute', () => {
  it('returns a render summary for a valid spec', async () => {
    const value = await tool.execute({ spec: { title: '监控面板', items: [text('a'), { type: 'stat', label: 'CPU', value: '42%' }] } })
    expect(String(value)).toContain('监控面板')
    expect(String(value)).toContain('2 个组件')
  })

  it('repairs oversized specs before summarizing (caps apply)', async () => {
    const value = await tool.execute({ spec: { items: Array.from({ length: 500 }, (_, i) => text(`n${i}`)) } })
    expect(String(value)).toContain(`${GENUI_LIMITS.maxNodes} 个组件`)
  })

  it('returns a corrective message for an unusable spec', async () => {
    const value = await tool.execute({ spec: 'not a tree' })
    expect(String(value)).toContain('spec 无效')
  })
})

describe('render_ui projections', () => {
  it('projects the repaired spec into result meta for the toolview', () => {
    const meta = tool.output.presentationMeta!({ spec: { items: [text('x'), { type: 'progress', value: 150 }] } })
    const spec = meta as { items: Array<{ type: string }> }
    expect(spec.items).toHaveLength(2)
    expect((spec.items[1] as { value: number }).value).toBe(100) // clamped
  })

  it('presents pending and completed cards with the spec title', () => {
    const args = { spec: { title: '订单', items: [text('a')] } }
    const call = tool.presentCall!(args)
    expect(call).not.toBeUndefined()
    expect(call!.card).toBe('generic')
    expect((call as { title: string }).title).toContain('订单')
    const result = tool.presentResult!(args, { isError: false } as never)
    expect(result).not.toBeUndefined()
    expect((result as { title: string }).title).toContain('订单')
  })

  it('falls back to generic presentation for invalid args (replay safety)', () => {
    expect(tool.presentCall!({ spec: 42 })).toBeUndefined()
    expect(tool.presentResult!({ spec: null }, { isError: false } as never)).toBeUndefined()
  })
})
