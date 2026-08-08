/**
 * GenuiBlock: renders a declarative GenUI spec (from a ```dsh-ui fence in an
 * assistant reply) as real interactive components inline in the conversation.
 * The component tree is white-listed and mapped to DOM directly — no raw HTML.
 * v1 interactivity is client-side only (buttons, tabs, checkboxes, and inputs
 * are operable; events do not flow back to the model).
 */
import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { DiffBlock, JsonTree, CodeBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import { useGenuiAction, getGenuiComponent, type GenuiCustomNode } from '@deepseek-ai/dsh-client-ui-primitives'
import { PlotBlock } from './PlotBlock.tsx'
import type {
  GenuiAccordion, GenuiBreadcrumb, GenuiCallout, GenuiChart, GenuiCode, GenuiCopy, GenuiDiff, GenuiFileTree,
  GenuiFileTreeNode, GenuiJson, GenuiKeyValue, GenuiMermaid, GenuiNode, GenuiPlot, GenuiRadio, GenuiScene3D, GenuiSpec,
  GenuiQuiz, GenuiSteps, GenuiSwitch, GenuiTabs, GenuiTextarea, GenuiTimeline,
} from './spec.ts'
import css from './GenuiBlock.module.css'

export interface GenuiBlockProps {
  /** Parsed spec to render. */
  spec: GenuiSpec
  /**
   * v2: optional action callback. Interactive components carrying an
   * `action` field fire it (button click, switch toggle, form submit);
   * absent = components are display-only (v1 behavior).
   */
  onAction?: ((action: string, payload: Record<string, unknown>) => void) | undefined
}

/** Deterministic avatar color by name hash. */
const AVATAR_COLORS = ['#4f8ef7', '#5b8def', '#3d9e8f', '#c9a24b', '#c96a5b', '#8a7bb8', '#6b8fa3', '#7d9e6b']

/** Categorical palette for multi-series charts: muted, dark-theme friendly,
 * high separation (not a rainbow). Single series keep the brand accent. */
const CHART_COLORS = ['#4f8ef7', '#3ecf8e', '#e0a458', '#e07b6a', '#9a86d8', '#5cb8b8', '#d487b6', '#8aaa6e']

/** Series color: explicit color wins; multi-series auto-assign from the palette. */
const seriesColor = (i: number, n: number, c?: string): string | undefined =>
  c ?? (n > 1 ? CHART_COLORS[i % CHART_COLORS.length] : undefined)

function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  // The array is a literal with 8 entries; the index is always in range.
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!
}

function renderNode(node: GenuiNode, key: number, onAction?: GenuiBlockProps['onAction']): ReactNode {
  switch (node.type) {
    case 'text': {
      const size = node.size ?? 'body'
      return (
        <div key={key} className={`${css.text} ${css[size]}` + (node.center ? ` ${css.center}` : '')}>
          {node.content}
        </div>
      )
    }
    case 'row': {
      return (
        <div key={key} className={css.row + (node.wrap ? ` ${css.wrap}` : '')}>
          {node.items.map((c, i) => renderNode(c, i, onAction))}
          {node.spacer && <div className={css.spacer} />}
        </div>
      )
    }
    case 'col': {
      return (
        <div key={key} className={css.col} style={node.gap !== undefined ? { gap: `${node.gap}px` } : undefined}>
          {node.items.map((c, i) => renderNode(c, i, onAction))}
        </div>
      )
    }
    case 'grid': {
      return (
        <div key={key} className={css.grid} style={{ gridTemplateColumns: `repeat(${Math.max(1, node.cols)}, 1fr)` }}>
          {node.items.map((c, i) => renderNode(c, i, onAction))}
        </div>
      )
    }
    case 'card': {
      return (
        <div key={key} className={css.card}>
          {node.title !== undefined && <div className={css.cardTitle}>{node.title}</div>}
          {node.items.map((c, i) => renderNode(c, i, onAction))}
        </div>
      )
    }
    case 'button': {
      const tone = node.tone ?? ''
      const cls = `${css.button} ${css[tone] || ''}` + (node.full ? ` ${css.full}` : '') + (node.small ? ` ${css.small}` : '')
      const action = node.action
      return (
        <button
          key={key}
          type="button"
          className={cls}
          onClick={action !== undefined && onAction !== undefined
            ? () => onAction(action, { type: 'button', label: node.label })
            : undefined}
        >
          {node.icon !== undefined && <span aria-hidden>{node.icon} </span>}
          {node.label}
        </button>
      )
    }
    case 'input': {
      const action = node.action
      return (
        <label key={key} className={css.field}>
          {node.label !== undefined && <span>{node.label}</span>}
          <input
            className={css.input}
            type={node.inputType ?? 'text'}
            placeholder={node.placeholder}
            defaultValue={node.value}
            onBlur={action !== undefined && onAction !== undefined
              ? e => onAction(action, { type: 'input', value: e.currentTarget.value })
              : undefined}
          />
        </label>
      )
    }
    case 'select': {
      const action = node.action
      return (
        <label key={key} className={css.field}>
          {node.label !== undefined && <span>{node.label}</span>}
          <select
            className={css.select}
            onChange={action !== undefined && onAction !== undefined
              ? e => onAction(action, { type: 'select', value: e.currentTarget.value })
              : undefined}
          >
            {node.options.map((o, i) => <option key={i}>{o}</option>)}
          </select>
        </label>
      )
    }
    case 'checkbox': {
      const action = node.action
      return (
        <label key={key} className={css.checkbox}>
          <input
            type="checkbox"
            defaultChecked={node.checked === true}
            onChange={action !== undefined && onAction !== undefined
              ? e => onAction(action, { type: 'checkbox', checked: e.currentTarget.checked })
              : undefined}
          />
          <span>{node.label}</span>
        </label>
      )
    }
    case 'link': {
      return <button key={key} type="button" className={css.link}>{node.label}</button>
    }
    case 'badge': {
      const tone = node.tone ?? ''
      return (
        <span key={key} className={`${css.badge} ${css[tone] || ''}`}>
          {node.icon !== undefined && <span aria-hidden>{node.icon} </span>}
          {node.label}
        </span>
      )
    }
    case 'stat': {
      const down = node.delta !== undefined && node.delta.startsWith('-')
      return (
        <div key={key} className={css.stat}>
          <span className={css.statLabel}>{node.label}</span>
          <span className={css.statValue}>{node.value}</span>
          {node.delta !== undefined && <span className={`${css.statDelta} ${down ? css.down : css.up}`}>{node.delta}</span>}
        </div>
      )
    }
    case 'progress': {
      const v = Math.max(0, Math.min(100, Number(node.value) || 0))
      return (
        <div key={key} className={css.progress}>
          {(node.label !== undefined || node.valueLabel !== undefined) && (
            <div className={css.progressRow}>
              <span>{node.label}</span>
              {node.valueLabel !== undefined && <span>{node.valueLabel}</span>}
            </div>
          )}
          <div className={css.track}><div className={css.fill} style={{ width: `${v}%` }} /></div>
        </div>
      )
    }
    case 'divider': return <hr key={key} className={css.divider} />
    case 'list': {
      return (
        <div key={key} className={css.list}>
          {node.items.map((item, i) => (
            <div key={i} className={css.li}>
              {typeof item === 'string'
                ? <span className={css.liTitle}>{item}</span>
                : <><span className={css.liTitle}>{item.title}</span>{item.desc !== undefined && <span className={css.liDesc}>{item.desc}</span>}</>}
            </div>
          ))}
        </div>
      )
    }
    case 'table': {
      return (
        <div key={key} className={css.tableWrap}>
          <table className={css.table}>
            <thead><tr>{node.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
            <tbody>
              {node.rows.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j}>{String(cell)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case 'chart': return <ChartNode key={key} chart={node} />
    case 'tabs': return <TabsNode key={key} tabs={node} onAction={onAction} />
    case 'avatar': {
      return (
        <div key={key} className={css.avatar} style={{ background: node.color ?? avatarColor(node.name) }}>
          {node.name.slice(0, 1).toUpperCase()}
        </div>
      )
    }
    case 'spacer': return <div key={key} className={css.spacer} />
    case 'plot': return <PlotNode key={key} plot={node} />
    case 'callout': return <CalloutNode key={key} node={node} />
    case 'steps': return <StepsNode key={key} steps={node} />
    case 'keyvalue': return <KeyValueNode key={key} node={node} />
    case 'diff': return <DiffNode key={key} node={node} />
    case 'json': return <JsonNode key={key} node={node} />
    case 'code': return <CodeNode key={key} node={node} />
    case 'radio': return <RadioNode key={key} node={node} onAction={onAction} />
    case 'switch': return <SwitchNode key={key} node={node} onAction={onAction} />
    case 'textarea': return <TextareaNode key={key} node={node} />
    case 'accordion': return <AccordionNode key={key} node={node} onAction={onAction} />
    case 'copy': return <CopyNode key={key} node={node} />
    case 'mermaid': return <MermaidNode key={key} node={node} />
    case 'scene3d': return <Scene3DNode key={key} node={node} />
    case 'timeline': return <TimelineNode key={key} node={node} />
    case 'file-tree': return <FileTreeNode key={key} node={node} />
    case 'breadcrumb': return <BreadcrumbNode key={key} node={node} />
    case 'quiz': return <QuizNode key={key} node={node} />
    default: {
      // Plugin-registered custom types: a plugin ships a renderer through
      // registerGenuiComponent; unregistered unknowns render nothing. The
      // spec union is exhaustive, so an unknown node arrives as a plugin
      // extension — treat it as a generic data node.
      const custom = node as unknown as GenuiCustomNode
      const Custom = getGenuiComponent(custom.type)
      if (Custom !== undefined) {
        return (
          <Custom
            key={key}
            node={custom}
            onAction={onAction}
            renderChildren={(nodes, base) => nodes.map((c, i) => renderNode(c as GenuiNode, Number(base) + i, onAction))}
          />
        )
      }
      return null
    }
  }
}

/* ---------------- v1.1 nodes ---------------- */

const CALLOUT_TONES: Record<string, string> = {
  info: css.calloutInfo!, success: css.calloutSuccess!, warning: css.calloutWarning!, error: css.calloutError!,
}

/** Callout: a tinted notice box with an optional heading. */
function CalloutNode({ node }: { node: GenuiCallout }) {
  const tone = node.tone ?? 'info'
  const toneClass = CALLOUT_TONES[tone] ?? css.calloutInfo
  return (
    <div className={`${css.callout} ${toneClass}`} data-genui-callout>
      {node.title !== undefined && <div className={css.calloutTitle}>{node.title}</div>}
      <div className={css.calloutBody}>{node.content}</div>
    </div>
  )
}

/** Steps: a vertical progress checklist with an optional current index. */
function StepsNode({ steps }: { steps: GenuiSteps }) {
  const current = steps.current ?? steps.steps.length
  return (
    <ol className={css.steps}>
      {steps.steps.map((step, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={i} className={`${css.step} ${done ? css.stepDone : ''} ${active ? css.stepActive : ''}`}>
            <span className={css.stepMarker}>{done ? '✓' : String(i + 1)}</span>
            <span className={css.stepContent}>
              <span className={css.stepTitle}>{step.title}</span>
              {step.desc !== undefined && <span className={css.stepDesc}>{step.desc}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** KeyValue: a definition list for configs and metadata. */
function KeyValueNode({ node }: { node: GenuiKeyValue }) {
  return (
    <dl className={css.keyvalue}>
      {node.pairs.map((pair, i) => (
        <div key={i} className={css.kvRow}>
          <dt className={css.kvKey}>{pair.key}</dt>
          <dd className={css.kvValue}>{pair.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Plot: SVG function plot over the SafeMath evaluator. */
function PlotNode({ plot }: { plot: GenuiPlot }) {
  return (
    <PlotBlock
      series={plot.series.map(s => ({ expr: s.expr, label: s.label, color: s.color, params: s.params }))}
      xMin={plot.xMin} xMax={plot.xMax} yMin={plot.yMin} yMax={plot.yMax} title={plot.title}
    />
  )
}

/** Diff: 收编 dsh DiffBlock (same path/oldText/newText shape as DiffHunk). */
function DiffNode({ node }: { node: GenuiDiff }) {
  return <DiffBlock diffs={node.diffs} />
}

/** Json: 收编 dsh JsonTree. */
function JsonNode({ node }: { node: GenuiJson }) {
  const data = node.value
  if (typeof data !== 'object' || data === null) {
    return <div className={css.jsonScalar}>{String(data)}</div>
  }
  return <JsonTree data={data as object | unknown[]} copyable />
}

/** Code: 收编 dsh CodeBlock with explicit language. */
function CodeNode({ node }: { node: GenuiCode }) {
  return <CodeBlock code={node.code} lang={node.lang} />
}

/** Chart: bars (default), line (trend), or donut (share); multi-series bars via `series`. */
function ChartNode({ chart }: { chart: GenuiChart }) {
  const kind = chart.kind ?? 'bars'
  if (kind === 'donut') return <DonutNode chart={chart} />
  if (kind === 'line') return <LineChartNode chart={chart} />
  return <BarsNode chart={chart} />
}

/** Bars: one column per datum (grouped bars when `series` is present). */
function BarsNode({ chart }: { chart: GenuiChart }) {
  const grouped = chart.series
  if (grouped !== undefined && grouped.length > 0) {
    const labels = grouped[0]!.data.map(d => d.label)
    const max = Math.max(...grouped.flatMap(s => s.data.map(d => Number(d.value) || 0)), 1)
    return (
      <div className={css.chart}>
        {labels.map((label, i) => (
          <div key={i} className={css.barCol}>
            <div className={css.groupedBars}>
              {grouped.map((s, si) => {
                const d = s.data[i]
                const h = d === undefined ? 0 : Math.round((Number(d.value) / max) * 100)
                return (
                  <div
                    key={si}
                    className={css.groupedFill}
                    style={{
                      height: `${h}%`,
                      background: seriesColor(si, grouped.length, s.color) ?? 'var(--dsw-alias-state-business-primary, #4f8ef7)',
                    }}
                    title={s.label}
                  />
                )
              })}
            </div>
            <span className={css.barLabel}>{label}</span>
          </div>
        ))}
      </div>
    )
  }
  const data = chart.data
  const max = Math.max(...data.map(d => Number(d.value) || 0), 1)
  return (
    <div className={css.chart}>
      {data.map((d, i) => {
        const h = Math.round((Number(d.value) / max) * 100)
        return (
          <div key={i} className={css.barCol}>
            <span className={css.barValue}>{String(d.value)}</span>
            <div className={css.barFill} style={{ height: `${h}%`, ...(d.color !== undefined ? { background: d.color } : {}) }} />
            <span className={css.barLabel}>{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Line: polyline over a fixed-height plot area. */
function LineChartNode({ chart }: { chart: GenuiChart }) {
  const data = chart.data
  const W = 460
  const H = 140
  const pad = 8
  const max = Math.max(...data.map(d => Number(d.value) || 0), 1)
  const min = Math.min(...data.map(d => Number(d.value) || 0), 0)
  const span = max - min || 1
  const n = Math.max(data.length - 1, 1)
  const pt = (i: number, v: number): [number, number] => [
    pad + (i / n) * (W - pad * 2),
    pad + (1 - (v - min) / span) * (H - pad * 2),
  ]
  const d = data.map((datum, i) => pt(i, Number(datum.value) || 0))
  const path = d.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  return (
    <div className={css.lineChart}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
        {data.map((datum, i) => {
          const [x, y] = pt(i, Number(datum.value) || 0)
          return <circle key={i} cx={x} cy={y} r={3} className={css.lineDot} fill={datum.color ?? undefined} />
        })}
        <path d={path} className={css.linePath} />
      </svg>
      <div className={css.lineLabels}>
        {data.map((d, i) => <span key={i} className={css.barLabel}>{d.label}</span>)}
      </div>
    </div>
  )
}

/** Donut: share of total with a center total. */
function DonutNode({ chart }: { chart: GenuiChart }) {
  const data = chart.data
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0) || 1
  const R = 42
  const C = 2 * Math.PI * R
  let offset = 0
  return (
    <div className={css.donut}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="14" className={css.donutTrack} />
        {data.map((d, i) => {
          const frac = (Number(d.value) || 0) / total
          const len = frac * C
          const el = (
            <circle
              key={i}
              cx="60" cy="60" r={R} fill="none" strokeWidth="14"
              stroke={seriesColor(i, data.length, d.color) ?? 'var(--dsw-alias-state-business-primary, #4f8ef7)'}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
            />
          )
          offset += len
          return el
        })}
        <text x="60" y="58" textAnchor="middle" className={css.donutTotal}>{total >= 1000 ? `${Math.round(total / 100) / 10}k` : String(total)}</text>
        <text x="60" y="74" textAnchor="middle" className={css.donutTotalLabel}>合计</text>
      </svg>
      <div className={css.donutLegend}>
        {data.map((d, i) => (
          <span key={i} className={css.legendItem}>
            <span className={css.legendSwatch} style={{ background: seriesColor(i, data.length, d.color) ?? 'var(--dsw-alias-state-business-primary, #4f8ef7)' }} />
            {d.label} · {String(d.value)}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Tab strip with local active-tab state. */
function TabsNode({ tabs, onAction }: { tabs: GenuiTabs; onAction?: GenuiBlockProps['onAction'] }) {
  const [active, setActive] = useState(0)
  const current = tabs.tabs[active]
  return (
    <div className={css.tabs}>
      <div className={css.tabBar} role="tablist">
        {tabs.tabs.map((tab, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === active}
            className={`${css.tab} ${i === active ? css.tabActive : ''}`}
            onClick={() => setActive(i)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {current !== undefined && (
        <div className={css.col} role="tabpanel">
          {current.items.map((c, i) => renderNode(c, i, onAction))}
        </div>
      )}
    </div>
  )
}

/** Radio: one option from a group; local selection state. */
function RadioNode({ node, onAction }: { node: GenuiRadio; onAction?: GenuiBlockProps['onAction'] }) {
  const [selected, setSelected] = useState(node.selected ?? 0)
  const action = node.action
  return (
    <div className={css.fieldGroup} role="radiogroup" aria-label={node.label}>
      {node.label !== undefined && <span className={css.fieldLabel}>{node.label}</span>}
      {node.options.map((opt, i) => (
        <label key={i} className={css.radio}>
          <input
            type="radio"
            name={`genui-radio-${Math.random().toString(36).slice(2)}`}
            checked={i === selected}
            onChange={() => {
              setSelected(i)
              if (action !== undefined && onAction !== undefined) onAction(action, { type: 'radio', value: opt })
            }}
          />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  )
}

/** Switch: toggle with local state. */
function SwitchNode({ node, onAction }: { node: GenuiSwitch; onAction?: GenuiBlockProps['onAction'] }) {
  const [on, setOn] = useState(node.checked === true)
  const action = node.action
  return (
    <label className={css.switchRow}>
      <span className={css.switchLabel}>{node.label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={`${css.switch} ${on ? css.switchOn : ''}`}
        onClick={() => {
          const next = !on
          setOn(next)
          if (action !== undefined && onAction !== undefined) onAction(action, { type: 'switch', checked: next })
        }}
      >
        <span className={css.switchKnob} />
      </button>
    </label>
  )
}

/** Textarea: multi-line input. */
function TextareaNode({ node }: { node: GenuiTextarea }) {
  return (
    <label className={css.field}>
      {node.label !== undefined && <span>{node.label}</span>}
      <textarea
        className={css.textarea}
        placeholder={node.placeholder}
        rows={node.rows ?? 4}
        defaultValue={node.value}
      />
    </label>
  )
}

/** Accordion: collapsible sections with local open state. */
function AccordionNode({ node, onAction }: { node: GenuiAccordion; onAction?: GenuiBlockProps['onAction'] }) {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className={css.accordion}>
      {node.items.map((item, i) => (
        <div key={i} className={css.accItem}>
          <button
            type="button"
            className={css.accHead}
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span className={css.accTitle}>{item.title}</span>
            <span className={css.accChevron}>{open === i ? '▾' : '▸'}</span>
          </button>
          {open === i && (
            <div className={css.accBody}>
              {item.items.map((c, ci) => renderNode(c, ci, onAction))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** Copy: a one-click copy chip. */
function CopyNode({ node }: { node: GenuiCopy }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className={`${css.copyChip} ${copied ? css.copyChipDone : ''}`}
      onClick={() => {
        void navigator.clipboard?.writeText(node.text).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? '✓ 已复制' : (node.label ?? '复制')}
    </button>
  )
}

/** Mermaid: lazily loaded diagram renderer. */
function MermaidNode({ node }: { node: GenuiMermaid }) {
  const [html, setHtml] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    void import('./mermaid-lazy.ts').then(async m => {
      try {
        const svg = await m.renderMermaid(node.code)
        if (alive) setHtml(svg)
      } catch {
        if (alive) setFailed(true)
      }
    })
    return () => { alive = false }
  }, [node.code])
  if (failed) return <div className={css.mermaidFallback}><pre>{node.code}</pre><div className={css.mermaidErr}>mermaid 渲染失败</div></div>
  if (html === null) return <div className={css.mermaidFallback}><pre>{node.code}</pre><div className={css.mermaidHint}>渲染中…</div></div>
  return <div className={css.mermaid} dangerouslySetInnerHTML={{ __html: html }} data-genui-mermaid />
}

/** Scene3D: three.js WebGL canvas, lazily imported. */
function Scene3DNode({ node }: { node: GenuiScene3D }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    let alive = true
    let dispose: (() => void) | undefined
    void import('./scene3d-lazy.ts').then(async m => {
      if (!alive || ref.current === null) return
      try {
        dispose = await m.mountScene(ref.current, node)
        if (alive) setStatus('ready')
      } catch {
        if (alive) setStatus('error')
      }
    })
    return () => { alive = false; dispose?.() }
  }, [node])
  return (
    <div className={css.scene3dWrap} data-genui-scene3d>
      {node.title !== undefined && <div className={css.scene3dTitle}>{node.title}</div>}
      <div ref={ref} className={css.scene3dCanvas} />
      {status === 'loading' && <div className={css.scene3dHint}>加载 3D 场景…</div>}
      {status === 'error' && <div className={css.scene3dHint}>3D 渲染失败</div>}
    </div>
  )
}

/** Timeline: vertical event list with time markers. */
function TimelineNode({ node }: { node: GenuiTimeline }) {
  return (
    <div className={css.timeline}>
      {node.items.map((item, i) => (
        <div key={i} className={css.tlItem}>
          <div className={css.tlRail}>
            <span className={css.tlDot} />
            {i < node.items.length - 1 && <span className={css.tlLine} />}
          </div>
          <div className={css.tlBody}>
            <div className={css.tlHead}>
              <span className={css.tlTitle}>{item.title}</span>
              {item.time !== undefined && <span className={css.tlTime}>{item.time}</span>}
            </div>
            {item.desc !== undefined && <div className={css.tlDesc}>{item.desc}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

/** FileTree: indented tree of files and folders. */
function FileTreeNode({ node }: { node: GenuiFileTree }) {
  const renderNode = (n: GenuiFileTreeNode, depth: number, i: number): ReactNode => {
    const isDir = n.type === 'dir' || (n.children !== undefined && n.children.length > 0)
    return (
      <div key={`${depth}-${i}`} className={css.ftRow} style={{ paddingLeft: `${depth * 16}px` }}>
        <span className={`${css.ftIcon} ${isDir ? css.ftIconDir : ''}`}>{isDir ? '▸' : '·'}</span>
        <span className={`${css.ftName} ${isDir ? css.ftDir : ''}`}>{n.name}</span>
        {(n.children ?? []).map((c, ci) => renderNode(c, depth + 1, ci))}
      </div>
    )
  }
  return <div className={css.fileTree}>{node.items.map((n, i) => renderNode(n, 0, i))}</div>
}

/** Quiz: a self-contained teaching question. Selecting an option marks it
 * correct/incorrect in place and reveals feedback + explanation — pure
 * frontend, no model round-trip (fits the v1 interaction contract). */
function QuizNode({ node }: { node: GenuiQuiz }) {
  const [selected, setSelected] = useState<number | null>(null)
  const answered = selected !== null
  const chosen = selected === null ? undefined : node.options[selected]
  const correct = chosen?.correct === true
  return (
    <div className={css.quiz} data-genui-quiz>
      <div className={css.quizQuestion}>{node.question}</div>
      <div className={css.quizOptions}>
        {node.options.map((opt, i) => {
          const isChosen = selected === i
          const cls = answered
            ? isChosen
              ? opt.correct === true ? css.quizOptCorrect : css.quizOptWrong
              : opt.correct === true ? css.quizOptReveal : css.quizOpt
            : css.quizOpt
          return (
            <button
              key={i}
              type="button"
              className={cls}
              disabled={answered}
              onClick={() => setSelected(i)}
            >
              <span className={css.quizMarker}>{answered && (opt.correct === true ? '✓' : isChosen ? '✗' : '')}</span>
              {opt.label}
            </button>
          )
        })}
      </div>
      {answered && (
        <div className={css.quizResult}>
          <div className={correct ? css.quizCorrectMsg : css.quizWrongMsg}>
            {correct ? '✓ 回答正确！' : '✗ 再想想看'}
            {chosen?.feedback !== undefined && <div className={css.quizFeedback}>{chosen.feedback}</div>}
          </div>
          {node.explanation !== undefined && <div className={css.quizExplanation}>{node.explanation}</div>}
          <button type="button" className={css.quizRetry} onClick={() => setSelected(null)}>重新作答</button>
        </div>
      )}
    </div>
  )
}

/** Breadcrumb: path-style navigation trail. */
function BreadcrumbNode({ node }: { node: GenuiBreadcrumb }) {
  return (
    <nav className={css.breadcrumb} aria-label="breadcrumb">
      {node.items.map((item, i) => (
        <span key={i} className={css.bcItem}>
          <span className={`${css.bcText} ${i === node.items.length - 1 ? css.bcCurrent : ''}`}>{item}</span>
          {i < node.items.length - 1 && <span className={css.bcSep}>/</span>}
        </span>
      ))}
    </nav>
  )
}

/**
 * Render a GenUI spec as an inline block. Falls back to nothing when the spec
 * carries no items (the fence renderer already refused non-specs before us).
 */
export const GenuiBlock = memo(function GenuiBlock({ spec }: GenuiBlockProps) {
  const gap = spec.gap ?? 14
  const onAction = useGenuiAction()
  return (
    <div className={css.block} data-genui>
      {spec.title !== undefined && <div className={css.banner}>{spec.title}</div>}
      <div className={css.col} style={{ gap: `${gap}px` }}>
        {spec.items.map((c, i) => (
          // Staggered reveal: each root item fades/slides in after its
          // predecessors, so the block assembles piece by piece instead of
          // popping in as one slab. Delay capped so long specs still settle
          // quickly; prefers-reduced-motion disables it (see CSS).
          <div
            key={i}
            className={css.reveal}
            style={{ animationDelay: `${Math.min(i * 90, 720)}ms` }}
          >
            {renderNode(c, i, onAction)}
          </div>
        ))}
      </div>
    </div>
  )
})
