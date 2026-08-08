import { describe, expect, it } from 'vitest'
import { Context } from 'cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as GenUI from '../src/plugin/index.ts'

/** Boot the plugin and return the assembled system-prompt sections. */
async function assemble() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(GenUI)
  return ctx.systemPrompt.assemble({})
}

describe('genui:fence section', () => {
  it('registers the dsh-ui fence language section', async () => {
    const assembly = await assemble()
    const names = assembly.sections.map(s => s.name)
    expect(names).toContain('genui:fence')
  })

  it('teaches the fence syntax and the component vocabulary', async () => {
    const assembly = await assemble()
    const section = assembly.sections.find(s => s.name === 'genui:fence')
    expect(section).toBeDefined()
    const text = typeof section!.text === 'string' ? section!.text : ''
    expect(text).toContain('dsh-ui')
    // The model must know the white-listed component types.
    for (const type of ['text', 'card', 'grid', 'stat', 'table', 'chart', 'tabs', 'button', 'progress', 'plot', 'callout', 'steps', 'diff', 'mermaid', 'scene3d']) {
      expect(text).toContain(type)
    }
  })

  it('sorts the section among the tool-guidance sections', async () => {
    const assembly = await assemble()
    const names = assembly.sections.map(s => s.name)
    // The section lands among the tool-guidance band, not at the harness identity head.
    const index = names.indexOf('genui:fence')
    expect(index).toBeGreaterThan(0)
  })
})
