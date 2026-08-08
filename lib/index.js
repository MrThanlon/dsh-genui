//#region lib/types/plugin/index.js
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
/** Convention: tool guidance uses 100–199; bash's section is 104. */
const GENUI_SECTION_ORDER = 105;
/** The fence language description injected into every assembled system prompt. */
const GENUI_SECTION_TEXT = `You can render interactive UI components INSIDE your reply — as part of your answer, between paragraphs — by emitting a fenced block with the language tag \`dsh-ui\` containing a JSON spec:

\`\`\`dsh-ui
{"title":"可选标题","gap":14,"items":[...]}
\`\`\`

The spec is a white-listed component tree; the UI renders it inline where the fence sits. Node vocabulary (use only these \`type\` values):

- text: {"type":"text","size":"h1|h2|h3|body|muted|caption","content":"...","center":true?}
- row / col: {"type":"row"|"col","items":[...],"wrap":true?,"spacer":true?,"gap":n?}  — layout containers
- grid: {"type":"grid","cols":n,"items":[...]}
- card: {"type":"card","title":"...","items":[...]}
- button: {"type":"button","label":"...","tone":"primary|danger|success|ghost","full":true?,"small":true?,"icon":"emoji?"}
- input: {"type":"input","label":"...","placeholder":"...","inputType":"text|email|password","value":"..."}
- select: {"type":"select","label":"...","options":["...","..."]}
- checkbox: {"type":"checkbox","label":"...","checked":true?}
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
- radio: {"type":"radio","label":"...","options":["...","..."],"selected":n?}
- switch: {"type":"switch","label":"...","checked":true?}
- textarea: {"type":"textarea","label":"...","placeholder":"...","rows":n?,"value":"..."}
- accordion: {"type":"accordion","items":[{"title":"...","items":[...]}]}
- copy: {"type":"copy","label":"复制","text":"..."}  — copy-to-clipboard chip
- mermaid: {"type":"mermaid","code":"graph TD\\nA-->B"}  — flowchart/sequence/class/gantt/pie/er/state/journey diagrams
- scene3d: {"type":"scene3d","title":"...","meshes":[{"shape":"box|sphere|cone|cylinder|torus","color":"#hex?","size":n|[w,h,d]?,"position":[x,y,z]?,"rotation":[rx,ry,rz]?,"scale":n?|[...]?}],"ambient":0-2?,"background":"#hex?"}  — 3D WebGL scene, drag to rotate, wheel to zoom
- timeline: {"type":"timeline","items":[{"title":"...","desc":"...","time":"..."}]}  — vertical event timeline
- file-tree: {"type":"file-tree","items":[{"name":"...","type":"file|dir","children":[...]?}]}  — directory tree
- breadcrumb: {"type":"breadcrumb","items":["首页","设置","账户"]}  — path-style navigation trail

Rules:
- Put the fence exactly where the component belongs in your answer; prose flows around it.
- Use stat/grid/card/table/chart/plot/tabs/callout/steps to build structured, realistic interfaces.
- A malformed fence degrades to a plain code block, so keep the JSON strict.
- Do NOT wrap the fence in another code fence, and do not put markdown inside the JSON strings.
- Prefer dark-theme-friendly content; the UI theme is the app's, not yours.
- For 3D scenes keep mesh counts small (1–5); for plots give sane xMin/xMax ranges.`;
/**
* Register the GenUI output-language section.
* @param ctx - cordis context.
*/
const inject = ["systemPrompt"];
function apply(ctx) {
	ctx.systemPrompt.section({
		name: "genui:fence",
		order: 105,
		text: GENUI_SECTION_TEXT
	});
}
//#endregion
export { GENUI_SECTION_ORDER, GENUI_SECTION_TEXT, apply, inject };
