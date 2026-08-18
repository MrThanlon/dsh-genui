// @vitest-environment jsdom
// EChartNode rendering: preset five forms, error fallback, option priority,
// title/height, role=img/aria-label, scatter with CJK labels.
// The echarts engine is mocked — we verify the component wiring, not the
// engine internals.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EChartsInstance } from '../src/client/echarts-lazy.ts'

const { createChartMock } = vi.hoisted(() => ({
  createChartMock: vi.fn<(el: HTMLElement, option: unknown, opts?: { height?: number }) => Promise<EChartsInstance>>(),
}))

vi.mock('../src/client/echarts-lazy.ts', () => ({
  createChart: createChartMock,
}))

import { EChartNode } from '../src/client/EChartNode.tsx'
import type { GenuiEChart } from '../src/client/spec.ts'

afterEach(() => {
  cleanup()
  createChartMock.mockReset()
})

function fakeInstance(): EChartsInstance {
  return { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() }
}

async function waitForEChart(container: HTMLElement): Promise<void> {
  await vi.waitFor(() => {
    expect(container.querySelector('[data-genui-echart]')).not.toBeNull()
  })
}

describe('EChartNode: preset rendering', () => {
  it('renders data-genui-echart container for each preset', async () => {
    for (const preset of ['bar', 'line', 'area', 'pie', 'scatter'] as const) {
      createChartMock.mockResolvedValueOnce(fakeInstance())
      const node: GenuiEChart = { type: 'echart', preset, data: [{ label: 'a', value: 1 }] }
      const { container, unmount } = render(<EChartNode node={node} />)
      await waitForEChart(container)
      unmount()
    }
  })
})

describe('EChartNode: error fallback', () => {
  it('shows error fallback when engine load fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    createChartMock.mockRejectedValueOnce(new Error('asset 404'))
    const node: GenuiEChart = { type: 'echart', preset: 'bar', data: [{ label: 'a', value: 1 }] }
    const { container } = render(<EChartNode node={node} />)
    await vi.waitFor(() => {
      expect(container.textContent).toContain('ECharts 渲染失败')
    })
    expect(warnSpy).toHaveBeenCalledWith('[dsh-genui] ECharts render failed:', expect.any(Error))
    warnSpy.mockRestore()
  })
})

describe('EChartNode: option vs preset', () => {
  it('option takes priority over preset', async () => {
    createChartMock.mockResolvedValueOnce(fakeInstance())
    const node: GenuiEChart = {
      type: 'echart',
      preset: 'bar',
      option: { title: { text: 'custom' } },
      data: [{ label: 'a', value: 1 }],
    }
    render(<EChartNode node={node} />)
    await vi.waitFor(() => { expect(createChartMock).toHaveBeenCalledTimes(1) })
    const passedOption = createChartMock.mock.calls[0]![1] as Record<string, unknown>
    expect(passedOption.title).toEqual({ text: 'custom' })
    // Should NOT contain preset-generated keys like xAxis/series from preset
    expect(passedOption.xAxis).toBeUndefined()
  })
})

describe('EChartNode: title and height', () => {
  it('renders title when provided', async () => {
    createChartMock.mockResolvedValueOnce(fakeInstance())
    const node: GenuiEChart = { type: 'echart', preset: 'bar', title: '销售趋势', data: [{ label: 'a', value: 1 }] }
    const { container } = render(<EChartNode node={node} />)
    await waitForEChart(container)
    expect(container.textContent).toContain('销售趋势')
  })

  it('applies custom height to canvas', async () => {
    createChartMock.mockResolvedValueOnce(fakeInstance())
    const node: GenuiEChart = { type: 'echart', preset: 'bar', height: 500, data: [{ label: 'a', value: 1 }] }
    const { container } = render(<EChartNode node={node} />)
    await waitForEChart(container)
    const canvas = container.querySelector('[role="img"]') as HTMLElement
    expect(canvas.style.height).toBe('500px')
  })

  it('defaults height to 300px', async () => {
    createChartMock.mockResolvedValueOnce(fakeInstance())
    const node: GenuiEChart = { type: 'echart', preset: 'bar', data: [{ label: 'a', value: 1 }] }
    const { container } = render(<EChartNode node={node} />)
    await waitForEChart(container)
    const canvas = container.querySelector('[role="img"]') as HTMLElement
    expect(canvas.style.height).toBe('300px')
  })
})

describe('EChartNode: accessibility', () => {
  it('renders role=img and aria-label with title', async () => {
    createChartMock.mockResolvedValueOnce(fakeInstance())
    const node: GenuiEChart = { type: 'echart', preset: 'bar', title: '图表', data: [{ label: 'a', value: 1 }] }
    const { container } = render(<EChartNode node={node} />)
    await waitForEChart(container)
    const canvas = container.querySelector('[role="img"]')
    expect(canvas).not.toBeNull()
    expect(canvas?.getAttribute('aria-label')).toBe('图表')
  })

  it('renders aria-label fallback when no title', async () => {
    createChartMock.mockResolvedValueOnce(fakeInstance())
    const node: GenuiEChart = { type: 'echart', preset: 'bar', data: [{ label: 'a', value: 1 }] }
    const { container } = render(<EChartNode node={node} />)
    await waitForEChart(container)
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('ECharts chart')
  })
})

describe('EChartNode: scatter with CJK labels', () => {
  it('passes category xAxis with CJK labels (not value axis)', async () => {
    createChartMock.mockResolvedValueOnce(fakeInstance())
    const node: GenuiEChart = {
      type: 'echart',
      preset: 'scatter',
      data: [{ label: '一月', value: 10 }, { label: '二月', value: 20 }],
    }
    render(<EChartNode node={node} />)
    await vi.waitFor(() => { expect(createChartMock).toHaveBeenCalledTimes(1) })
    const passedOption = createChartMock.mock.calls[0]![1] as { xAxis?: { type?: string; data?: string[] } }
    expect(passedOption.xAxis?.type).toBe('category')
    expect(passedOption.xAxis?.data).toEqual(['一月', '二月'])
  })
})
