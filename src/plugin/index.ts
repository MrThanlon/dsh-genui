/**
 * GenUI plugin: teaches the model the ```dsh-ui fence syntax for emitting
 * declarative UI components inline in its reply. The browser half renders the
 * fence through GenuiBlock (ui-primitives); this host half only tells the
 * model the language exists, so a session without the plugin simply never
 * emits fences and nothing changes.
 *
 * The section is a convention section (order 100-199), placed after the bash
 * guidance so the model sees it among its output-format rules.
 * @module @deepseek-ai/dsh-genui
 */

import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { createRenderUiTool } from './tool.ts'

/** Convention: tool guidance uses 100–199; bash's section is 104. */
export const GENUI_SECTION_ORDER = 105

/** The fence language description injected into every assembled system prompt. */
export const GENUI_SECTION_TEXT = `You can render interactive UI components INSIDE your reply — as part of your answer, between paragraphs — by emitting a fenced block with the language tag \`dsh-ui\` containing a JSON spec:

\`\`\`dsh-ui
{"title":"可选标题","gap":14,"items":[...]}
\`\`\`

The spec is a white-listed component tree; the UI renders it inline where the fence sits. Node vocabulary (use only these \`type\` values):

- text: {"type":"text","size":"h1|h2|h3|body|muted|caption","content":"...","center":true?}
- row / col: {"type":"row"|"col","items":[...],"wrap":true?,"spacer":true?,"gap":n?}  — layout containers
- grid: {"type":"grid","cols":n,"items":[...]}
- card: {"type":"card","title":"...","items":[...]}
- button: {"type":"button","label":"...","tone":"primary|danger|success|ghost","full":true?,"small":true?,"icon":"emoji?","action":"name"?}  — WITHOUT action it renders DISABLED (display-only); add action whenever the user should be able to click
- input: {"type":"input","label":"...","placeholder":"...","inputType":"text|email|password","value":"...","action":"name"?,"id":"field-id"?}  — action fires on blur AND on Enter (submit:true); with an id the value persists across refresh and is collected by submit (fields:{id:value})
- select: {"type":"select","label":"...","options":["...","..."],"action":"name"?}
- checkbox: {"type":"checkbox","label":"...","checked":true?,"action":"name"?}
- radio: {"type":"radio","label":"...","options":["...","..."],"selected":n?,"action":"name"?}  — add "group":"题目名" to RECORD the choice instead of round-tripping per click; a sibling submit node then collects all groups in ONE action
- link: {"type":"link","label":"..."}
- badge: {"type":"badge","label":"...","tone":"success|warn|danger|accent","icon":"emoji?"}
- stat: {"type":"stat","label":"...","value":"...","delta":"+12.4%|-3%"}
- progress: {"type":"progress","label":"...","value":0-100,"valueLabel":"70%"}
- divider: {"type":"divider"}
- list: {"type":"list","items":["..."] or [{"title":"...","desc":"..."}]}
- table: {"type":"table","columns":["..."],"rows":[["...","..."]]}
- chart: {"type":"chart","kind":"bars|line|donut","data":[{"label":"...","value":n,"color":"#hex?"}],"series":[...]?}  — bars (default), line trend, donut share; series field = grouped bars
- tabs: {"type":"tabs","tabs":[{"label":"...","items":[...]}]}  — switchable tab panels
- avatar: {"type":"avatar","name":"..."}
- spacer: {"type":"spacer"}
- plot: {"type":"plot","series":[{"expr":"sin(x)","label":"...","color":"#hex?"}],"xMin":-5,"xMax":5,"yMin":?,"yMax":?,"title":"..."}  — SVG math function plot; expressions use sin/cos/tan/asin/acos/atan/sqrt/cbrt/exp/log/ln/abs/floor/ceil/round/min/max/pow, constants pi/e/tau, and the variable x
- callout: {"type":"callout","tone":"info|success|warning|error","title":"...","content":"..."}
- steps: {"type":"steps","current":n,"steps":[{"title":"...","desc":"..."}]}  — progress checklist
- keyvalue: {"type":"keyvalue","pairs":[{"key":"...","value":"..."}]}
- diff: {"type":"diff","diffs":[{"path":"...","oldText":"..."|null,"newText":"..."}]}  — code diff
- json: {"type":"json","value":...}  — JSON tree inspector
- code: {"type":"code","lang":"ts","code":"..."}  — syntax-highlighted code
- radio: {"type":"radio","label":"...","options":["...","..."],"selected":n?,"action":"name"?}  — add "group":"题目名" to RECORD the choice instead of round-tripping per click; add "answer":正确下标或标签 and "explanation":"解析" so a sibling submit node can grade it LOCALLY on click
- submit: {"type":"submit","label":"交卷","action":"name","groups":["q1","q2"]?,"resetAction":"name"?}  — the 交卷 button. LOCAL-FIRST: when the questions carry "answer" data, clicking grades IN PLACE (score + per-question ✓/✗ + explanations, zero model round trip) and locks the questions until the user clicks 重新作答 (fully local; resetAction optionally notifies you). Only when NO question has "answer" data does it send ONE action {answers:{group:choice,...},fields:{id:value},total,answered} — fields collects every input/textarea carrying an id. Disabled until every listed group is answered (or ≥1 answer/field without groups).
- switch: {"type":"switch","label":"...","checked":true?,"action":"name"?}
- textarea: {"type":"textarea","label":"...","placeholder":"...","rows":n?,"value":"...","action":"name"?,"id":"field-id"?}  — action fires on blur AND on Ctrl/Cmd+Enter (submit:true); with an id the value persists and is collected by submit
- accordion: {"type":"accordion","items":[{"title":"...","items":[...]}]}
- copy: {"type":"copy","label":"复制","text":"..."}  — copy-to-clipboard chip
- mermaid: {"type":"mermaid","code":"graph TD\\nA-->B"}  — flowchart/sequence/class/gantt/pie/er/state/journey diagrams
- scene3d: {"type":"scene3d","title":"...","meshes":[{"shape":"box|sphere|cone|cylinder|torus","color":"#hex?","size":n|[w,h,d]?,"position":[x,y,z]?,"rotation":[rx,ry,rz]?,"scale":n?|[...]?}],"ambient":0-2?,"background":"#hex?"}  — 3D WebGL scene, drag to rotate, wheel to zoom
- timeline: {"type":"timeline","items":[{"title":"...","desc":"...","time":"..."}]}  — vertical event timeline
- file-tree: {"type":"file-tree","items":[{"name":"...","type":"file|dir","children":[...]?}]}  — directory tree
- breadcrumb: {"type":"breadcrumb","items":["首页","设置","账户"]}  — path-style navigation trail
- quiz: {"type":"quiz","question":"...","options":[{"label":"...","correct":true?,"feedback":"..."?}],"explanation":"...","id":"..."?,"action":"name"?}  — teaching question with in-place judging and retry; with action the chosen answer is ALSO sent to you ({type:'quiz',question,answer,correct})

Rules:
- Trigger: use the fence proactively whenever structured presentation beats prose — key points, emphasis, comparisons, flows, steps, status, data, demos — even if the user did not ask for UI. Plain Q&A and one-liners stay prose. Load the \`genui\` skill for the full content→component mapping table.
- Put the fence exactly where the component belongs in your answer; prose flows around it.
- Use stat/grid/card/table/chart/plot/tabs/callout/steps to build structured, realistic interfaces.
- Component choice (pick ONE primary component per topic): conclusion/alert → callout · 2–4 metrics → grid+stat · completion → progress · multi-stage → steps · bullet points → list · key-value/config → keyvalue · comparison data → table · trend → chart(line) · share → chart(donut) · category comparison → chart(bars) · math curve → plot · events → timeline · paged content → tabs · long content → accordion · tree structure → file-tree · code → code · file changes → diff · nested JSON → json · architecture/flow → mermaid · 3D only when content IS geometry → scene3d · teaching only → quiz · one action → button(action). Prefer table/chart over text piles; never repeat the same data in two components; 3–8 components per reply; when in doubt, fewer.
- A malformed fence degrades to a plain code block, so keep the JSON strict.
- Do NOT wrap the fence in another code fence, and do not put markdown inside the JSON strings.
- Prefer dark-theme-friendly content; the UI theme is the app's, not yours.
- For 3D scenes keep mesh counts small (1–5); for plots give sane xMin/xMax ranges.
- Keep specs compact: at most 200 nodes total and 8 levels of nesting; oversized specs are truncated by the renderer.
- v2 actions: button / input / select / checkbox / radio / switch / textarea / quiz may carry "action":"name"; the user's click or change is then sent back to you as [genui-action] name with the component's current data, so you can re-render the UI with the result. Interactive components MUST carry an action — a button without one renders disabled and the user cannot click it. Buttons with an action show a brief "已响应" feedback on click while your round trip is in flight.
- LOCAL-FIRST principle: any state change the UI can do by itself — judging, grading, resetting, expanding, selecting — happens IN PLACE with zero model round trip. Send an action ONLY when you must participate (generating new content, executing tools, next-step advice). Do not make the user wait for a round trip to see a result the components already know.
- Durable state: interaction state (radio answers, submit lock, field values) persists per session+content — refreshing the page or replaying the message restores it exactly; NEW content (换题, edited spec) starts clean automatically. Re-render the SAME content to keep the user's state; render NEW content to reset it.
- Exam pattern: for a multi-question paper emit one radio per question — each with "group":"<question id>", "answer":正确选项下标或标签, "explanation":"解析" — plus ONE submit node with "groups":["<all ids>"]. The user answers everything locally and clicks 交卷; grading happens INSTANTLY in the UI (score + per-question ✓/✗ + explanations) with no round trip. Re-render only when the user asks for a NEW paper or follow-up advice.
- Tool channel: you may also call the render_ui tool with the same spec to render the UI as a card in the tool row (e.g. a dashboard the user asked you to "build"); the fence channel renders inline in the reply — prefer the fence for UI that is part of your answer, the tool for UI that is a deliverable.
- Panel updates: calling render_ui also renders the spec into the session panel (the dock above the composer); calling it again updates that SAME panel in place — use this for surfaces the user keeps refreshing, and keep the fence for one-shot explainers.
- Panel fences: a \`\`\`dsh-ui fence whose spec carries "panel": true renders ONLY into the session panel (nothing in the message flow) and updates it in place — the tool-free way to refresh a panel.
- Panel append: a panel fence may carry "append": true to MERGE into the existing panel instead of replacing it — same-labelled tabs get their items appended, new tabs are added, plain items append to the tail. Use it to GROW a panel incrementally (add a tab, add a section) without resending prior content, so the panel is never bounded by a single message size; drop "append" to replace the whole panel.
- Panel actions: when a [genui-action] from a panel component arrives, reply with the updated panel:true fence plus at most one short line of confirmation (e.g. "已刷新") — no explanations, no ordinary fences; the panel alone changes.`

/**
 * Register the GenUI output-language section and the render_ui tool.
 * @param ctx - cordis context.
 */
// `tools` is intentionally NOT injected: the service is optional for this
// plugin — hosts without tool access keep the fence channel working. Cordis
// inject entries are hard requirements, so the registry is probed at runtime
// instead (see apply).
export const inject = ['systemPrompt']

export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'genui:fence',
    order: GENUI_SECTION_ORDER,
    text: GENUI_SECTION_TEXT,
  })
  // The tools service is optional: hosts without tool access (or minimal
  // compositions) keep the fence channel; only when the registry exists does
  // the render_ui tool join the model's tool set. `reflect.get(name, false)`
  // is cordis's non-throwing optional service lookup (the proxy's own trap
  // uses it) — property access without inject would throw instead.
  //
  // Start-up ordering: this plugin injects only `systemPrompt`, so cordis
  // starts it EARLY — before the tools provider (which injects deeper
  // dependencies) has bound its service. A one-shot probe at apply time
  // therefore misses the registry on real hosts (the fence section lands,
  // the tool never registers). Fix: probe immediately AND subscribe to
  // `internal/service` (emitted by cordis on every service binding), so the
  // registration lands the moment `tools` appears, whatever the order.
  let registered = false
  const tryRegister = (value: { register(tool: unknown): unknown } | undefined): void => {
    if (registered) return
    const tools = value ?? ctx.reflect.get('tools', false) as { register(tool: unknown): unknown } | undefined
    if (tools === undefined) return
    tools.register(createRenderUiTool())
    registered = true
  }
  tryRegister(undefined)
  ctx.on('internal/service', (name: string, value: unknown) => {
    if (name === 'tools') tryRegister(value as { register(tool: unknown): unknown })
  })
}
