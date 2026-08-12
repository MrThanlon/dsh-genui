/**
 * GenuiBlock: renders a declarative GenUI spec (from a ```dsh-ui fence in an
 * assistant reply) as real interactive components inline in the conversation.
 * The component tree is white-listed and mapped to DOM directly — no raw HTML.
 * v1 interactivity is client-side only (buttons, tabs, checkboxes, and inputs
 * are operable; events do not flow back to the model).
 */
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { DiffBlock, JsonTree, CodeBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import { useGenuiAction, getGenuiComponent, type GenuiCustomNode } from '@deepseek-ai/dsh-client-ui-primitives'
import { GENUI_LIMITS } from './guard.ts'
import { PlotBlock } from './PlotBlock.tsx'
import { loadBlockState, saveBlockState } from './interaction-store.ts'
import type {
  GenuiAccordion, GenuiBreadcrumb, GenuiCallout, GenuiChart, GenuiCode, GenuiCopy, GenuiDiff, GenuiFileTree,
  GenuiFileTreeNode, GenuiInput, GenuiJson, GenuiKeyValue, GenuiMermaid, GenuiNode, GenuiPlot, GenuiQuiz, GenuiRadio,
  GenuiScene3D, GenuiSelect, GenuiSpec, GenuiSteps, GenuiSubmit, GenuiSwitch, GenuiTabs, GenuiTextarea, GenuiTimeline,
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
  /**
   * v2.7: durable-state key (session + slot + content fingerprint). When set,
   * interaction state (radio answers, submit lock, field values) persists to
   * localStorage and restores on refresh / re-render of the same content.
   */
  stateKey?: string | undefined
}

/** Deterministic avatar color by name hash. Host static tokens ONLY —
 * design system v2: no off-brand hexes, the palette always matches the
 * theme's families (deepseek/blue/green/amber/red/neutral). */
const AVATAR_COLORS = [
  'var(--dsw-static-deepseek-400)',
  'var(--dsw-static-deepseek-450)',
  'var(--dsw-static-blue-450)',
  'var(--dsw-static-green-400)',
  'var(--dsw-static-amber-400)',
  'var(--dsw-static-red-400)',
  'var(--dsw-static-deepseek-300)',
  'var(--dsw-static-neutral-bluish-400)',
]

/** Categorical palette for multi-series charts: host static tokens only,
 * same source of truth as the avatar palette — high separation, muted,
 * dark-theme friendly. Single series keep the brand accent. */
const CHART_COLORS = [
  'var(--dsw-static-deepseek-400)',
  'var(--dsw-static-green-400)',
  'var(--dsw-static-amber-400)',
  'var(--dsw-static-red-400)',
  'var(--dsw-static-blue-450)',
  'var(--dsw-static-deepseek-450)',
  'var(--dsw-static-neutral-bluish-400)',
  'var(--dsw-static-deepseek-300)',
]

/** Series color: explicit color wins; multi-series auto-assign from the palette. */
const seriesColor = (i: number, n: number, c?: string): string | undefined =>
  c ?? (n > 1 ? CHART_COLORS[i % CHART_COLORS.length] : undefined)

function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  // The array is a literal with 8 entries; the index is always in range.
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!
}

/** Per-question metadata registered by grouped radios for local grading. */
interface QuestionMeta {
  label: string
  options: string[]
  /** Correct option: index (number) or label (string); absent = no local grading. */
  answer?: number | string | undefined
  /** Shown after local grading. */
  explanation?: string | undefined
}

/** Block-wide answers registry (v2.5/v2.6): grouped radios record selections
 * and register their question metadata here; a sibling `submit` node either
 * grades IN PLACE (questions carry `answer` data) or collects everything
 * into ONE action. Lives in GenuiBlock state so re-renders keep the
 * selections, threaded down through the recursive render walk. Answers are
 * plain group → chosen-option-label strings (the display label lives in
 * QuestionMeta; localStorage stores the same string table — no migration). */
interface AnswersState {
  answers: Record<string, string>
  /** Field values by id (input/textarea with an `id`), collected by submit. */
  fields: Record<string, string>
  /** Field ids whose value must never be persisted or collected (secrets). */
  secretFields: ReadonlySet<string>
  meta: Record<string, QuestionMeta>
  /** True after a local grading: questions are locked until 重新作答. */
  locked: boolean
  /** Bumped by every reset; radios use it as their remount key. */
  round: number
  setAnswer: (group: string, choice: string) => void
  setField: (id: string, value: string) => void
  registerSecretField: (id: string) => void
  registerMeta: (group: string, meta: QuestionMeta) => void
  clear: () => void
  setLocked: (locked: boolean) => void
}

/** Button with LOCAL click feedback: clicking an actionable button shows a
 * brief "✓ 已响应" chip so the user sees the click registered even while the
 * model round trip is in flight — no more "点了没反应" perception. The chip
 * is purely cosmetic; the action fires through `onClick` as before. */
function ClickFeedbackButton({ className, disabled, onClick, children }: {
  className: string
  disabled?: boolean
  onClick?: (() => void) | undefined
  children: ReactNode
}) {
  const [sent, setSent] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={onClick === undefined ? undefined : () => {
        onClick()
        if (timer.current !== null) clearTimeout(timer.current)
        setSent(true)
        timer.current = setTimeout(() => setSent(false), 1400)
      }}
    >
      {children}
      {sent && <span className={css.btnSent}>✓ 已触发</span>}
    </button>
  )
}

function renderNode(
  node: GenuiNode,
  key: number,
  onAction: GenuiBlockProps['onAction'] | undefined,
  depth = 0,
  answers?: AnswersState,
): ReactNode {
  // Depth guard: a pathological spec must never recurse past the limit
  // (stack overflow / DOM explosion). The fence path already repairs specs
  // against the same limit; this is the belt-and-suspenders for direct
  // GenuiBlock use and plugin-registered custom renderers.
  if (depth > GENUI_LIMITS.maxDepth) return null
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
          {node.items.map((c, i) => renderNode(c, i, onAction, depth + 1, answers))}
          {node.spacer && <div className={css.spacer} />}
        </div>
      )
    }
    case 'col': {
      return (
        <div key={key} className={css.col} style={node.gap !== undefined ? { gap: `${node.gap}px` } : undefined}>
          {node.items.map((c, i) => renderNode(c, i, onAction, depth + 1, answers))}
        </div>
      )
    }
    case 'grid': {
      return (
        <div key={key} className={css.grid} style={{ gridTemplateColumns: `repeat(${Math.max(1, node.cols)}, minmax(0, 1fr))` }}>
          {node.items.map((c, i) => renderNode(c, i, onAction, depth + 1, answers))}
        </div>
      )
    }
    case 'card': {
      return (
        <div key={key} className={css.card}>
          {node.title !== undefined && <div className={css.cardTitle}>{node.title}</div>}
          {node.items.map((c, i) => renderNode(c, i, onAction, depth + 1, answers))}
        </div>
      )
    }
    case 'button': {
      const tone = node.tone ?? ''
      const cls = `${css.button} ${css[tone] || ''}` + (node.full ? ` ${css.full}` : '') + (node.small ? ` ${css.small}` : '')
      const action = node.action
      // A button without an action (or without an action provider) is a
      // display-only control: render it DISABLED so the affordance is honest
      // — clickable-looking dead buttons were the top complaint in the field.
      const interactive = action !== undefined && onAction !== undefined
      return (
        <ClickFeedbackButton
          key={key}
          className={cls}
          disabled={!interactive}
          onClick={interactive ? () => onAction(action, { type: 'button', label: node.label }) : undefined}
        >
          {node.icon !== undefined && <span aria-hidden>{node.icon} </span>}
          {node.label}
        </ClickFeedbackButton>
      )
    }
    case 'input': return <InputNode key={key} node={node} onAction={onAction} answers={answers} />
    case 'select': return <SelectNode key={key} node={node} onAction={onAction} answers={answers} />
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
      // Honest affordance: with a whitelisted href this is a REAL anchor;
      // without one it is plain styled text (a dead clickable-looking button
      // was the same complaint class as the disabled-button fix).
      const href = node.href
      return href !== undefined
        ? <a key={key} className={css.link} href={href} target="_blank" rel="noopener noreferrer">{node.label}</a>
        : <span key={key} className={css.linkText}>{node.label}</span>
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
        <div
          key={key}
          className={css.progress}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={v}
          aria-label={node.label ?? node.valueLabel ?? undefined}
        >
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
      const items = node.items.slice(0, GENUI_LIMITS.maxListItems)
      return (
        <div key={key} className={css.list}>
          {items.map((item, i) => (
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
      const columns = node.columns.slice(0, GENUI_LIMITS.maxTableCols)
      const rows = node.rows.slice(0, GENUI_LIMITS.maxTableRows)
      return (
        <div key={key} className={css.tableWrap}>
          <table className={css.table}>
            <thead><tr>{columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>{row.slice(0, columns.length).map((cell, j) => <td key={j}>{String(cell)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case 'chart': return <ChartNode key={key} chart={node} />
    case 'tabs': return <TabsNode key={key} tabs={node} onAction={onAction} depth={depth + 1} answers={answers} />
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
    case 'radio': return <RadioNode key={`${key}:r${answers?.round ?? 0}`} node={node} onAction={onAction} answers={answers} />
    case 'submit': return <SubmitNode key={key} node={node} onAction={onAction} answers={answers} />
    case 'switch': return <SwitchNode key={key} node={node} onAction={onAction} />
    case 'textarea': return <TextareaNode key={key} node={node} onAction={onAction} answers={answers} />
    case 'accordion': return <AccordionNode key={key} node={node} onAction={onAction} depth={depth + 1} answers={answers} />
    case 'copy': return <CopyNode key={key} node={node} />
    case 'mermaid': return <MermaidNode key={key} node={node} />
    case 'scene3d': return <Scene3DNode key={key} node={node} />
    case 'timeline': return <TimelineNode key={key} node={node} />
    case 'file-tree': return <FileTreeNode key={key} node={node} />
    case 'breadcrumb': return <BreadcrumbNode key={key} node={node} />
    case 'quiz': return <QuizNode key={key} node={node} onAction={onAction} />
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
            renderChildren={(nodes, base) => nodes.map((c, i) => renderNode(c as GenuiNode, Number(base) + i, onAction, depth + 1, answers))}
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
  const list = steps.steps.slice(0, GENUI_LIMITS.maxSteps)
  const current = steps.current ?? list.length
  return (
    <ol className={css.steps}>
      {list.map((step, i) => {
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
  const pairs = node.pairs.slice(0, GENUI_LIMITS.maxKeyValuePairs)
  return (
    <dl className={css.keyvalue}>
      {pairs.map((pair, i) => (
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
  const series = plot.series.slice(0, GENUI_LIMITS.maxPlotSeries)
  return (
    <PlotBlock
      series={series.map(s => ({ expr: s.expr, label: s.label, color: s.color, params: s.params }))}
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
  return <CodeBlock code={node.code.slice(0, GENUI_LIMITS.maxCode)} lang={node.lang} />
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
  const grouped = chart.series !== undefined ? chart.series.slice(0, GENUI_LIMITS.maxPlotSeries) : undefined
  if (grouped !== undefined && grouped.length > 0) {
    const labels = grouped[0]!.data.map(d => d.label)
    const max = Math.max(...grouped.flatMap(s => s.data.map(d => Number(d.value) || 0)), 1)
    return (
      <div className={css.chart}>
        <div className={css.chartPlot}>
          {[0, 25, 50, 75].map(p => (
            <span key={p} className={p === 0 ? css.baseline : css.gridline} style={{ bottom: `${p}%` }} />
          ))}
          {labels.map((_, i) => (
            <div key={i} className={css.barCol}>
              <div className={css.groupedBars}>
                {grouped.map((s, si) => {
                  const d = s.data[i]
                  // Cap at 82% so the per-bar value annotation stays inside
                  // the plot; negatives clamp to a zero-height bar.
                  const v = d === undefined ? 0 : Number(d.value) || 0
                  const h = d === undefined ? 0 : Math.min(Math.round((Math.max(0, v) / max) * 100), 82)
                  return (
                    <div key={si} className={css.groupedBar} title={s.label}>
                      <span className={css.groupValue}>{d === undefined ? '' : String(d.value)}</span>
                      <div
                        className={css.groupedFill}
                        style={{
                          height: `${h}%`,
                          background: seriesColor(si, grouped.length, s.color) ?? 'var(--dsw-alias-state-business-primary, #4f8ef7)',
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className={css.chartLabels}>
          {labels.map(label => <span key={label} className={css.barLabel}>{label}</span>)}
        </div>
      </div>
    )
  }
  const data = chart.data.slice(0, GENUI_LIMITS.maxChartPoints)
  // Negative values clamp to a zero-height bar (the value annotation still
  // shows the real number) — a negative `height` percentage is invalid CSS
  // and used to collapse the bar entirely.
  const max = Math.max(...data.map(d => Number(d.value) || 0), 1)
  return (
    <div className={css.chart}>
      <div className={css.chartPlot}>
        {[0, 25, 50, 75].map(p => (
          <span key={p} className={p === 0 ? css.baseline : css.gridline} style={{ bottom: `${p}%` }} />
        ))}
        {data.map((d, i) => {
          // Cap at 85% so the value annotation always stays inside the plot.
          const v = Number(d.value) || 0
          const h = Math.min(Math.round((Math.max(0, v) / max) * 100), 85)
          return (
            <div key={i} className={css.barCol}>
              <span className={css.barValue}>{String(d.value)}</span>
              <div className={css.barFill} style={{ height: `${h}%`, ...(d.color !== undefined ? { background: d.color } : {}) }} />
            </div>
          )
        })}
      </div>
      <div className={css.chartLabels}>
        {data.map(d => <span key={d.label} className={css.barLabel}>{d.label}</span>)}
      </div>
    </div>
  )
}

/** Line: polyline over a fixed-height plot area with a readable Y axis —
 * four evenly spaced gridlines + tick labels (design system v2 skeleton). */
function LineChartNode({ chart }: { chart: GenuiChart }) {
  const data = chart.data.slice(0, GENUI_LIMITS.maxChartPoints)
  const W = 460
  const H = 150
  const padL = 36
  const padR = 8
  const padT = 10
  const padB = 6
  const max = Math.max(...data.map(d => Number(d.value) || 0), 1)
  const min = Math.min(...data.map(d => Number(d.value) || 0), 0)
  const span = max - min || 1
  const n = Math.max(data.length - 1, 1)
  const pt = (i: number, v: number): [number, number] => [
    padL + (i / n) * (W - padL - padR),
    padT + (1 - (v - min) / span) * (H - padT - padB),
  ]
  const d = data.map((datum, i) => pt(i, Number(datum.value) || 0))
  const path = d.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const ticks = [0, 1, 2, 3].map(i => min + (span * i) / 3)
  const formatTick = (t: number): string => {
    const abs = Math.abs(t)
    if (abs >= 1000) return `${(t / 1000).toFixed(abs % 1000 === 0 ? 0 : 1)}k`
    if (Number.isInteger(t)) return String(t)
    return t.toFixed(1)
  }
  return (
    <div className={css.lineChart}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
        {ticks.map((t, i) => {
          const y = padT + (1 - (t - min) / span) * (H - padT - padB)
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} className={i === 0 ? css.lineGridAxis : css.lineGrid} />
              <text x={padL - 6} y={y + 3} textAnchor="end" className={css.lineTick}>{formatTick(t)}</text>
            </g>
          )
        })}
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

/** Donut: share of total with a center total. Negative values contribute
 * zero arc (a negative dasharray segment used to produce an invalid
 * stroke-dasharray and the browser drew the FULL circle instead). */
function DonutNode({ chart }: { chart: GenuiChart }) {
  const data = chart.data.slice(0, GENUI_LIMITS.maxChartPoints)
  const clamped = data.map(d => ({ ...d, v: Math.max(0, Number(d.value) || 0) }))
  const total = clamped.reduce((s, d) => s + d.v, 0) || 1
  const R = 42
  const C = 2 * Math.PI * R
  let offset = 0
  return (
    <div className={css.donut}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="14" className={css.donutTrack} />
        {clamped.map((d, i) => {
          const frac = d.v / total
          const len = frac * C
          const el = (
            <circle
              key={i}
              cx="60" cy="60" r={R} fill="none" strokeWidth="14"
              style={{ stroke: seriesColor(i, data.length, d.color) ?? 'var(--dsw-alias-state-business-primary, #4f8ef7)' }}
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

/** Tab strip with local active-tab state. Keyboard: ArrowLeft/Right to move,
 * Home/End to jump; ids wired via useId so `aria-controls` stays unique
 * across fences and sessions. */
function TabsNode({ tabs, onAction, depth = 0, answers }: {
  tabs: GenuiTabs
  onAction?: GenuiBlockProps['onAction']
  depth?: number
  answers?: AnswersState | undefined
}) {
  const [active, setActive] = useState(0)
  const uid = useId()
  const list = tabs.tabs.slice(0, GENUI_LIMITS.maxTabs)
  const current = list[active]
  const move = (next: number): void => {
    const n = (next + list.length) % list.length
    setActive(n)
    document.getElementById(`${uid}-tab-${n}`)?.focus()
  }
  return (
    <div className={css.tabs}>
      <div
        className={css.tabBar}
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={e => {
          if (e.key === 'ArrowRight') { e.preventDefault(); move(active + 1) }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); move(active - 1) }
          else if (e.key === 'Home') { e.preventDefault(); move(0) }
          else if (e.key === 'End') { e.preventDefault(); move(list.length - 1) }
        }}
      >
        {list.map((tab, i) => (
          <button
            key={i}
            id={`${uid}-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-controls={`${uid}-panel-${i}`}
            tabIndex={i === active ? 0 : -1}
            className={`${css.tab} ${i === active ? css.tabActive : ''}`}
            onClick={() => setActive(i)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {current !== undefined && (
        <div className={css.col} role="tabpanel" id={`${uid}-panel-${active}`} aria-labelledby={`${uid}-tab-${active}`}>
          {current.items.map((c, i) => renderNode(c, i, onAction, depth + 1, answers))}
        </div>
      )}
    </div>
  )
}

/** Radio: one option from a group; local selection state. The group name is
 * useId-based so sibling groups never collide (deterministic per mount).
 *
 * v2.5 aggregation: when `group` is set, the selection is recorded into the
 * block-wide answers registry instead of firing a per-click action — a
 * sibling `submit` node then grades the paper IN PLACE (v2.6, questions
 * carry `answer` data) or collects all groups in ONE action. Without
 * `group`, the legacy per-click action fires. After a local grading the
 * group locks until 重新作答 resets it. */
function RadioNode({ node, onAction, answers }: {
  node: GenuiRadio
  onAction?: GenuiBlockProps['onAction']
  answers?: AnswersState | undefined
}) {
  const action = node.action
  const group = node.group
  const grouped = group !== undefined
  const options = node.options.slice(0, GENUI_LIMITS.maxOptions)
  // No default selection unless the model explicitly sets `selected` — a
  // pre-checked first option silently swallows the user's "keep the default"
  // answer (the registry only records real change events). A DURABLE answer
  // (restored from localStorage) wins over both. The parent key includes the
  // reset round, so 重新作答 remounts this radio with a clean selection —
  // no sync effect needed.
  const restoredIndex = group !== undefined && answers?.answers[group] !== undefined
    ? options.indexOf(answers!.answers[group]!)
    : -1
  const [selected, setSelected] = useState<number | null>(restoredIndex >= 0 ? restoredIndex : (node.selected ?? null))
  const uid = useId()
  const locked = grouped && answers?.locked === true
  // Register question metadata for local grading (mount + when the question
  // changes). `answers` is deliberately NOT a dep: the callback identity is
  // stable and re-registering on every answers update is needless churn.
  useEffect(() => {
    if (group === undefined) return
    answers?.registerMeta(group, {
      label: node.label ?? group,
      options,
      answer: node.answer,
      explanation: node.explanation,
    })
    // A model-provided default selection IS the answer — but only when the
    // group has no durable answer yet (a restored user choice must win).
    if (node.selected !== undefined && options[node.selected] !== undefined && answers?.answers[group] === undefined) {
      answers?.setAnswer(group, options[node.selected]!)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, node.label, node.answer, node.explanation, node.options, node.selected])
  return (
    <div className={css.fieldGroup} role="radiogroup" aria-label={node.label}>
      {node.label !== undefined && <span className={css.fieldLabel}>{node.label}</span>}
      {options.map((opt, i) => (
        <label key={i} className={css.radio}>
          <input
            type="radio"
            name={`genui-radio-${uid}`}
            checked={selected === i}
            disabled={locked}
            onChange={() => {
              setSelected(i)
              if (grouped) {
                // Aggregation mode: record, do NOT round-trip per click.
                answers?.setAnswer(group, opt)
              } else if (action !== undefined && onAction !== undefined) {
                onAction(action, { type: 'radio', value: opt })
              }
            }}
          />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  )
}

/** Resolve a question's correct label from its metadata. */
function correctLabelOf(m: QuestionMeta): string | undefined {
  if (m.answer === undefined) return undefined
  if (typeof m.answer === 'number') return m.options[m.answer]
  return m.answer
}

/** Submit: the "交卷" control of a grouped-radio block. LOCAL-FIRST (v2.6):
 * when at least one question carries `answer` data the click grades IN PLACE
 * — score, per-question right/wrong, explanations — with zero model round
 * trip, and locks the questions until 重新作答 resets them. Only when NO
 * question has answers does it fall back to firing ONE action
 * (`{type:'submit', answers, total, answered}`). Disabled until the
 * selection criteria are met (all listed groups answered, or ≥1 answer
 * without a group list); the hint shows the progress. */
function SubmitNode({ node, onAction, answers }: {
  node: GenuiSubmit
  onAction?: GenuiBlockProps['onAction']
  answers?: AnswersState | undefined
}) {
  const recorded = answers?.answers ?? {}
  const fields = answers?.fields ?? {}
  const meta = answers?.meta ?? {}
  const expected = node.groups
  // One shared notion of "filled fields" for answered/ready/payload: non-blank
  // values only, secrets (password inputs) never collected into submit.
  const filledFields = Object.fromEntries(
    Object.entries(fields).filter(([id, v]) => v.trim() !== '' && !answers?.secretFields.has(id)),
  )
  // Without an explicit group list, the submit counts radio answers AND
  // filled fields — a fields-only form (inputs with id + submit) enables
  // once any field has a value.
  const answered = expected === undefined
    ? Math.max(Object.keys(recorded).length, Object.keys(filledFields).length)
    : expected.filter(g => recorded[g] !== undefined).length
  const total = expected?.length ?? answered
  const scope = expected ?? Object.keys(recorded)
  // Local grading is possible when ANY in-scope question carries answers.
  const canGradeLocally = scope.some(g => meta[g]?.answer !== undefined)
  const submitted = answers?.locked === true
  // Ready = enough answers AND the click can do something: either local
  // grading, or a real action name + provider. A submit with neither is a
  // display-only control — honest disabled affordance (action is optional:
  // local grading needs no round trip).
  const ready = answered > 0 && answered >= total
    && (canGradeLocally || (node.action !== undefined && onAction !== undefined))

  if (submitted) {
    // ── local grading result ──
    const graded = scope.filter(g => recorded[g] !== undefined && meta[g]?.answer !== undefined)
    const score = graded.filter(g => recorded[g] === correctLabelOf(meta[g]!)).length
    return (
      <div className={css.gradeWrap} data-genui-grade>
        <div className={css.gradeScore}>
          <span className={css.gradeScoreValue}>{score} / {graded.length}</span>
          <span className={css.gradeScoreLabel}>得分{graded.length < scope.length ? `（${scope.length - graded.length} 题无答案未计分）` : ''}</span>
        </div>
        <div className={css.gradeList}>
          {scope.map(g => {
            const entry = recorded[g]
            const m = meta[g]
            if (entry === undefined || m === undefined) return null
            const correct = correctLabelOf(m)
            if (correct === undefined) {
              return (
                <div key={g} className={css.gradeItem}>
                  <span className={css.gradeQ}>{m.label}</span>
                  <span className={css.gradeAns}>你的答案：{entry}</span>
                </div>
              )
            }
            const isCorrect = entry === correct
            return (
              <div key={g} className={`${css.gradeItem} ${isCorrect ? css.gradeItemOk : css.gradeItemNo}`}>
                <span className={css.gradeQ}>{m.label}</span>
                <span className={css.gradeTag}>{isCorrect ? '✓' : '✗'}</span>
                <span className={css.gradeAns}>
                  你的答案：{entry}
                  {!isCorrect && <span className={css.gradeRight}> 正确答案：{correct}</span>}
                </span>
                {m.explanation !== undefined && <span className={css.gradeExp}>{m.explanation}</span>}
              </div>
            )
          })}
        </div>
        <button
          type="button"
          className={`${css.button} ${css.ghost} ${css.submit}`}
          onClick={() => {
            answers?.clear()
            if (node.resetAction !== undefined && onAction !== undefined) {
              onAction(node.resetAction, { type: 'submit-reset', groups: expected ?? Object.keys(recorded) })
            }
          }}
        >
          重新作答
        </button>
      </div>
    )
  }

  return (
    <div className={css.submitRow}>
      <button
        type="button"
        className={`${css.button} ${css.primary} ${css.submit}`}
        disabled={!ready}
        onClick={ready ? () => {
          if (canGradeLocally) {
            // Local grading: immediate in-place result, no model round trip.
            answers?.setLocked(true)
          } else if (node.action !== undefined && onAction !== undefined) {
            // `ready` already guarantees this branch, but the narrow keeps
            // the optional-action type honest.
            onAction(node.action, {
              type: 'submit',
              answers: recorded,
              ...(Object.keys(filledFields).length > 0 ? { fields: filledFields } : {}),
              total,
              answered,
            })
          }
        } : undefined}
      >
        {node.label}
      </button>
      {total > 0 && <span className={css.submitHint} aria-live="polite">已选 {answered}/{total}</span>}
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

/** Reuse the DSH main input's three-layer IME protection (verified in the
 *  host InputBar): composition start arms a ref, composition end clears it
 *  10ms later (Safari sends the closing keydown BEFORE compositionend), and
 *  every submit keydown re-checks the ref, the native `isComposing` flag,
 *  and `keyCode === 229`. A Chinese selection Enter must never submit. */
function useImeComposing(): {
  isComposing: () => boolean
  onCompositionStart: () => void
  onCompositionEnd: () => void
} {
  const composing = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])
  return {
    isComposing: () => composing.current,
    onCompositionStart: () => {
      composing.current = true
      if (timer.current !== null) {
        clearTimeout(timer.current)
        timer.current = null
      }
    },
    onCompositionEnd: () => {
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        composing.current = false
      }, 10)
    },
  }
}

function isImeSubmitKeydown(e: React.KeyboardEvent): boolean {
  const native = e.nativeEvent
  return native.isComposing === true || native.keyCode === 229
}

/** Select: single choice from a dropdown, field-aligned (v2.8). With an `id`
 * the chosen option persists across refresh and joins the sibling submit's
 * `fields` collection; a model-provided `selected` default registers at
 * mount; a restored durable value wins over both. Without any default a
 * placeholder option shows — nothing is silently pre-registered (same
 * philosophy as radio). */
function SelectNode({ node, onAction, answers }: {
  node: GenuiSelect
  onAction?: GenuiBlockProps['onAction']
  answers?: AnswersState | undefined
}) {
  const action = node.action
  const id = node.id
  const options = node.options.slice(0, GENUI_LIMITS.maxOptions)
  const restored = id !== undefined && answers?.fields[id] !== undefined
    ? options.indexOf(answers!.fields[id]!)
    : -1
  const defaultValue = restored >= 0
    ? options[restored]!
    : node.selected !== undefined && options[node.selected] !== undefined
      ? options[node.selected]!
      : null
  const [value, setValue] = useState<string | null>(defaultValue)
  // Field invariant: a spec-provided default registers at mount.
  const mounted = useRef(false)
  useEffect(() => {
    if (mounted.current) return
    mounted.current = true
    if (id !== undefined && defaultValue !== null) {
      answers?.setField(id, defaultValue)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const send = (v: string): void => {
    if (action !== undefined && onAction !== undefined) {
      onAction(action, { type: 'select', value: v, ...(id !== undefined ? { id } : {}) })
    }
  }
  return (
    <label className={css.field}>
      {node.label !== undefined && <span>{node.label}</span>}
      <select
        className={css.select}
        value={value ?? ''}
        onChange={e => {
          const v = e.currentTarget.value
          setValue(v)
          if (id !== undefined) answers?.setField(id, v)
          send(v)
        }}
      >
        {value === null && <option value="" hidden disabled>请选择…</option>}
        {options.map((o, i) => <option key={i} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

/** Input: single-line field. Controlled (value tracked for persistence and
 *  submit collection when `id` is set). With `action`: Enter submits
 *  immediately (`{type:'input', value, submit:true}`), blur sends too —
 *  the user never has to click elsewhere for the value to reach the model.
 *  Enter during IME composition never submits. `inputType: 'password'`
 *  stays masked; its value is never persisted and never joins submit
 *  collection (secrets stay out of localStorage), while its own `action`
 *  still delivers on explicit user submit. */
function InputNode({ node, onAction, answers }: {
  node: GenuiInput
  onAction?: GenuiBlockProps['onAction']
  answers?: AnswersState | undefined
}) {
  const action = node.action
  const id = node.id
  const secret = node.inputType === 'password'
  // Initial value: spec default, else durable state (restored after refresh).
  // Secrets restore as blank: a password that survives a refresh would be a
  // stored secret, which is exactly what the boundary forbids.
  const [value, setValue] = useState<string>(() =>
    secret ? '' : (node.value ?? (id !== undefined ? answers?.fields[id] ?? '' : '')))
  // Last value actually DELIVERED to the model: blur only sends when the
  // value changed since the last delivery (a focus-in/focus-out with no edit
  // used to fire a pointless action round trip). Seeded with the mount value
  // so the very first unedited blur also stays silent.
  const lastSent = useRef<string | null>(value)
  const send = (submit: boolean): void => {
    if (action !== undefined && onAction !== undefined) {
      lastSent.current = value
      onAction(action, { type: 'input', value, ...(id !== undefined ? { id } : {}), ...(submit ? { submit: true } : {}) })
    }
  }
  const ime = useImeComposing()
  // Field invariant: a spec-provided non-blank default registers at mount.
  const mounted = useRef(false)
  useEffect(() => {
    if (mounted.current) return
    mounted.current = true
    if (!secret && id !== undefined && node.value !== undefined && node.value.trim() !== '') {
      answers?.setField(id, node.value)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Secret fields are filtered from persistence and submit collection.
  useEffect(() => {
    if (secret && id !== undefined) answers?.registerSecretField(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret, id])
  return (
    <label className={css.field}>
      {node.label !== undefined && <span>{node.label}</span>}
      <input
        className={css.input}
        type={node.inputType ?? 'text'}
        placeholder={node.placeholder}
        value={value}
        onChange={e => {
          const v = e.currentTarget.value
          setValue(v)
          if (id !== undefined) answers?.setField(id, v)
        }}
        onBlur={() => {
          if (value !== lastSent.current) send(false)
        }}
        onCompositionStart={ime.onCompositionStart}
        onCompositionEnd={ime.onCompositionEnd}
        onKeyDown={e => {
          if (e.key !== 'Enter') return
          if (ime.isComposing() || isImeSubmitKeydown(e)) return
          e.preventDefault()
          send(true)
        }}
      />
    </label>
  )
}

/** Textarea: multi-line input; with `action`, blurring sends the value and
 *  Ctrl/Cmd+Enter submits immediately. Controlled when `id` is set (durable
 *  value + submit collection). Ctrl/Cmd+Enter during IME composition never
 *  submits. */
function TextareaNode({ node, onAction, answers }: {
  node: GenuiTextarea
  onAction?: GenuiBlockProps['onAction']
  answers?: AnswersState | undefined
}) {
  const action = node.action
  const id = node.id
  const [value, setValue] = useState<string>(() =>
    node.value ?? (id !== undefined ? answers?.fields[id] ?? '' : ''))
  // Last value delivered to the model: blur sends only on change. Seeded
  // with the mount value so an unedited blur stays silent.
  const lastSent = useRef<string | null>(value)
  const send = (submit: boolean): void => {
    if (action !== undefined && onAction !== undefined) {
      lastSent.current = value
      onAction(action, { type: 'textarea', value, ...(id !== undefined ? { id } : {}), ...(submit ? { submit: true } : {}) })
    }
  }
  const ime = useImeComposing()
  // Field invariant: a spec-provided non-blank default registers at mount.
  const mounted = useRef(false)
  useEffect(() => {
    if (mounted.current) return
    mounted.current = true
    if (id !== undefined && node.value !== undefined && node.value.trim() !== '') {
      answers?.setField(id, node.value)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <label className={css.field}>
      {node.label !== undefined && <span>{node.label}</span>}
      <textarea
        className={css.textarea}
        placeholder={node.placeholder}
        rows={node.rows ?? 4}
        value={value}
        onChange={e => {
          const v = e.currentTarget.value
          setValue(v)
          if (id !== undefined) answers?.setField(id, v)
        }}
        onBlur={() => {
          if (value !== lastSent.current) send(false)
        }}
        onCompositionStart={ime.onCompositionStart}
        onCompositionEnd={ime.onCompositionEnd}
        onKeyDown={e => {
          if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return
          if (ime.isComposing() || isImeSubmitKeydown(e)) return
          e.preventDefault()
          send(true)
        }}
      />
    </label>
  )
}

/** Accordion: collapsible sections with local open state. Headings and
 * bodies are wired via useId (`aria-controls`/`aria-labelledby`). */
function AccordionNode({ node, onAction, depth = 0, answers }: {
  node: GenuiAccordion
  onAction?: GenuiBlockProps['onAction']
  depth?: number
  answers?: AnswersState | undefined
}) {
  const [open, setOpen] = useState<number | null>(0)
  const uid = useId()
  const items = node.items.slice(0, GENUI_LIMITS.maxAccordionItems)
  return (
    <div className={css.accordion}>
      {items.map((item, i) => (
        <div key={i} className={css.accItem}>
          <button
            type="button"
            className={css.accHead}
            id={`${uid}-head-${i}`}
            aria-expanded={open === i}
            aria-controls={`${uid}-body-${i}`}
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span className={css.accTitle}>{item.title}</span>
            <span className={css.accChevron}>{open === i ? '▾' : '▸'}</span>
          </button>
          {open === i && (
            <div className={css.accBody} id={`${uid}-body-${i}`} aria-labelledby={`${uid}-head-${i}`}>
              {item.items.map((c, ci) => renderNode(c, ci, onAction, depth + 1, answers))}
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
  const code = node.code.slice(0, GENUI_LIMITS.maxMermaid)
  useEffect(() => {
    let alive = true
    void import('./mermaid-lazy.ts').then(async m => {
      try {
        const svg = await m.renderMermaid(code)
        if (alive) setHtml(svg)
      } catch {
        if (alive) setFailed(true)
      }
    })
    return () => { alive = false }
  }, [code])
  if (failed) return <div className={css.mermaidFallback}><pre>{code}</pre><div className={css.mermaidErr}>图语法有误，已降级显示源码</div></div>
  if (html === null) return <div className={css.mermaidFallback}><pre>{code}</pre><div className={css.mermaidHint}>渲染中…</div></div>
  return <div className={css.mermaid} dangerouslySetInnerHTML={{ __html: html }} data-genui-mermaid />
}

/** Scene3D: three.js WebGL canvas, lazily imported. */
function Scene3DNode({ node }: { node: GenuiScene3D }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const ref = useRef<HTMLDivElement | null>(null)
  // Mesh cap mirrored from the guard: a pathological scene never reaches
  // three.js (per-frame cost scales with mesh count).
  const scene = node.meshes.length > GENUI_LIMITS.maxMeshes ? { ...node, meshes: node.meshes.slice(0, GENUI_LIMITS.maxMeshes) } : node
  useEffect(() => {
    let alive = true
    let dispose: (() => void) | undefined
    void import('./scene3d-lazy.ts').then(async m => {
      if (!alive || ref.current === null) return
      try {
        dispose = await m.mountScene(ref.current, scene)
        if (alive) setStatus('ready')
      } catch {
        if (alive) setStatus('error')
      }
    })
    return () => { alive = false; dispose?.() }
  }, [scene])
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
  const items = node.items.slice(0, GENUI_LIMITS.maxTimelineItems)
  return (
    <div className={css.timeline}>
      {items.map((item, i) => (
        <div key={i} className={css.tlItem}>
          <div className={css.tlRail}>
            <span className={css.tlDot} />
            {i < items.length - 1 && <span className={css.tlLine} />}
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

/** FileTree: indented tree of files and folders. Directory rows are LOCAL
 * collapsible (spec.ts promised "collapsible children"; this makes it true)
 * — click a dir to fold/unfold, default fully open. Zero model round trip. */
function FileTreeNode({ node }: { node: GenuiFileTree }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const pathKey = (depth: number, i: number): string => `${depth}-${i}`
  const toggle = (k: string): void => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }
  const renderNode = (n: GenuiFileTreeNode, depth: number, i: number): ReactNode => {
    if (depth > GENUI_LIMITS.maxTreeDepth) return null
    const isDir = n.type === 'dir' || (n.children !== undefined && n.children.length > 0)
    const k = pathKey(depth, i)
    const folded = isDir && collapsed.has(k)
    return (
      <div key={k} className={css.ftRow} style={{ paddingLeft: `${depth * 16}px` }}>
        <button
          type="button"
          className={css.ftNameBtn}
          aria-expanded={isDir ? !folded : undefined}
          onClick={isDir ? () => toggle(k) : undefined}
        >
          <span className={`${css.ftIcon} ${isDir ? css.ftIconDir : ''}`} aria-hidden>{isDir ? (folded ? '▸' : '▾') : '·'}</span>
          <span className={`${css.ftName} ${isDir ? css.ftDir : ''}`}>{n.name}</span>
        </button>
        {isDir && !folded && (n.children ?? []).map((c, ci) => renderNode(c, depth + 1, ci))}
      </div>
    )
  }
  return <div className={css.fileTree}>{node.items.slice(0, GENUI_LIMITS.maxListItems).map((n, i) => renderNode(n, 0, i))}</div>
}

/** Quiz: a self-contained teaching question. Selecting an option marks it
 * correct/incorrect in place and reveals feedback + explanation. With
 * `action`, the chosen answer is ALSO sent back to the model
 * (`{type:'quiz', question, answer, correct}`) so the model can collect or
 * grade it — the in-place judging stays local (no round trip needed). */
function QuizNode({ node, onAction }: {
  node: GenuiQuiz
  onAction?: GenuiBlockProps['onAction']
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const options = node.options.slice(0, GENUI_LIMITS.maxQuizOptions)
  const answered = selected !== null
  const chosen = selected === null ? undefined : options[selected]
  const correct = chosen?.correct === true
  const action = node.action
  return (
    <div className={css.quiz} data-genui-quiz>
      <div className={css.quizQuestion}>{node.question}</div>
      <div className={css.quizOptions}>
        {options.map((opt, i) => {
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
              onClick={() => {
                setSelected(i)
                if (action !== undefined && onAction !== undefined) {
                  onAction(action, {
                    type: 'quiz',
                    question: node.question,
                    answer: opt.label,
                    correct: opt.correct === true,
                  })
                }
              }}
            >
              <span className={css.quizMarker}>{answered && (opt.correct === true ? '✓' : isChosen ? '✗' : '')}</span>
              {opt.label}
            </button>
          )
        })}
      </div>
      {answered && (
        <div className={css.quizResult} aria-live="polite">
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
  const items = node.items.slice(0, GENUI_LIMITS.maxBreadcrumbItems)
  return (
    <nav className={css.breadcrumb} aria-label="breadcrumb">
      {items.map((item, i) => (
        <span key={i} className={css.bcItem}>
          <span className={`${css.bcText} ${i === items.length - 1 ? css.bcCurrent : ''}`}>{item}</span>
          {i < items.length - 1 && <span className={css.bcSep}>/</span>}
        </span>
      ))}
    </nav>
  )
}

/**
 * Trailing debounce window (ms) for one `[genui-action]` name: rapid
 * repeated interactions on one control (button mashing, switch flipping)
 * collapse into a single action with the LAST payload. Different action
 * names stay independent. The model round-trip takes seconds, so a few
 * hundred ms of trailing delay is imperceptible — and it stops bursts of
 * queued user turns.
 */
export const GENUI_ACTION_DEBOUNCE_MS = 300

/**
 * Wrap the harness action callback with the per-action trailing debounce.
 * Absent provider = v1 behavior (components are display-only, callback
 * stays undefined). Pending timers are cleared on unmount so a click that
 * never fired does not leak into the next mount.
 */
function useDebouncedAction(onAction: GenuiBlockProps['onAction'] | undefined): GenuiBlockProps['onAction'] {
  const pending = useRef<Map<string, ReturnType<typeof setTimeout>> | null>(null)
  useEffect(() => {
    return () => {
      const timers = pending.current
      if (timers === null) return
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])
  return useMemo(() => {
    if (onAction === undefined) return undefined
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    pending.current = timers
    return (action: string, payload: Record<string, unknown>): void => {
      const existing = timers.get(action)
      if (existing !== undefined) clearTimeout(existing)
      timers.set(action, setTimeout(() => {
        timers.delete(action)
        onAction(action, payload)
      }, GENUI_ACTION_DEBOUNCE_MS))
    }
  }, [onAction])
}

/**
 * Structural spec equality for the memo comparator: the fence path re-parses
 * the body on every streaming chunk and produces a FRESH object even when the
 * repaired content is unchanged (a chunk that closed no new component). The
 * default shallow memo would then re-render the whole tree per chunk — up to
 * ~200 full-tree renders for a max-size fence. Stringify equality makes the
 * memo skip renders whose content did not actually change; the cost is one
 * JSON.stringify per chunk (≤200 nodes, negligible next to a React tree
 * reconciliation). `stateKey` already embeds the content fingerprint, so when
 * both keys are equal and non-undefined the specs necessarily stringify
 * equal — the stringify branch matters for the streaming path (stateKey
 * undefined).
 */
function specEquivalent(a: GenuiSpec, b: GenuiSpec): boolean {
  if (a === b) return true
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Render a GenUI spec as an inline block. Falls back to nothing when the spec
 * carries no items (the fence renderer already refused non-specs before us).
 */
export const GenuiBlock = memo(function GenuiBlock({ spec, stateKey }: GenuiBlockProps) {
  const gap = spec.gap ?? 16
  const onAction = useDebouncedAction(useGenuiAction())
  // v2.5/v2.6 answers registry: grouped radios record selections + question
  // metadata here; `submit` nodes grade locally (locked until 重新作答) or
  // collect into one action. Block-local state survives re-renders (streaming
  // settle, panel updates) — selections persist while the block is mounted.
  // v2.7 durability: with a stateKey the state ALSO survives refresh/reopen —
  // loaded once at mount (seed for re-renders of the same content) and saved
  // on every change.
  const [persisted] = useState(() => (stateKey === undefined ? null : loadBlockState(stateKey)))
  const [answers, setAnswers] = useState<Record<string, string>>(persisted?.answers ?? {})
  const [fields, setFields] = useState<Record<string, string>>(persisted?.fields ?? {})
  const [meta, setMeta] = useState<Record<string, QuestionMeta>>({})
  const [locked, setLocked] = useState(persisted?.locked === true)
  const [round, setRound] = useState(0)
  // Secret (password) field ids: their values never persist and never join
  // submit collection — the input itself stays masked and its own action
  // still delivers the value on explicit user submit.
  const [secretFields, setSecretFields] = useState<ReadonlySet<string>>(new Set())
  const setAnswer = useCallback((group: string, choice: string) => {
    setAnswers(prev => (prev[group] === choice ? prev : { ...prev, [group]: choice }))
  }, [])
  const setField = useCallback((id: string, value: string) => {
    // Field invariant: a blank (trim-empty) value leaves the shared registry.
    setFields(prev => {
      if (value.trim() === '') {
        if (!(id in prev)) return prev
        const next = { ...prev }
        delete next[id]
        return next
      }
      return prev[id] === value ? prev : { ...prev, [id]: value }
    })
  }, [])
  const registerSecretField = useCallback((id: string) => {
    setSecretFields(prev => (prev.has(id) ? prev : new Set(prev).add(id)))
  }, [])
  const registerMeta = useCallback((group: string, m: QuestionMeta) => {
    setMeta(prev => {
      const existing = prev[group]
      if (existing !== undefined && existing.label === m.label && existing.answer === m.answer
        && existing.explanation === m.explanation) return prev
      return { ...prev, [group]: m }
    })
  }, [])
  const clear = useCallback(() => {
    setAnswers({})
    setLocked(false)
    setRound(r => r + 1) // radios remount (key carries the round) with clean selections
  }, [])
  const answersState = useMemo<AnswersState>(
    () => ({
      answers, fields, secretFields, meta, locked, round,
      setAnswer, setField, registerSecretField, registerMeta, clear, setLocked,
    }),
    [answers, fields, secretFields, meta, locked, round, setAnswer, setField, registerSecretField, registerMeta, clear],
  )
  // Durable save (debounced 300ms — typing in a field fires per keystroke).
  // Secret field values are stripped before writing: passwords never persist.
  useEffect(() => {
    if (stateKey === undefined) return
    const timer = setTimeout(() => {
      const safeFields = Object.fromEntries(
        Object.entries(fields).filter(([id]) => !secretFields.has(id)),
      )
      saveBlockState(stateKey, {
        answers,
        locked,
        ...(Object.keys(safeFields).length > 0 ? { fields: safeFields } : {}),
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [stateKey, answers, locked, fields, secretFields])
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
            {renderNode(c, i, onAction, 0, answersState)}
          </div>
        ))}
      </div>
    </div>
  )
}, (prev, next) => prev.stateKey === next.stateKey && specEquivalent(prev.spec, next.spec))
