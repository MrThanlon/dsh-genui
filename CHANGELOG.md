## [0.3.4] - 2026-08-11

### 新增
- **fence 解析失败诊断条（根治静默退化）**：`dsh-ui` 围栏在消息结束后仍无法解析为 JSON 时，渲染器显示「⚠️ dsh-ui fence JSON 解析失败（含位置）」红色诊断条，原始内容保留在下方代码块——作者一眼可见缺陷，不再无声变成代码块；流式输出中的 partial JSON 不误报（按宿主 `[data-streaming]` 标记判定已结束）

# Changelog

## [0.3.3] - 2026-08-11

### 新增
- **状态持久化（v2.7，刷新/重开不丢）**：交互状态（radio 答案、交卷锁定、带 `id` 的输入值）按「会话 + 块位置 + 内容指纹」存 localStorage——刷新页面、重开会话后同一块 UI 的状态原样恢复；重渲染相同内容（seed 回填）保留用户状态，渲染新内容（换题）自动从头开始；单键存储、200 块 LRU 上限、防抖 300ms 落盘
- **表单回车提交**：`input` 回车 / `textarea` Ctrl+Enter 立即触发 action（payload 带 `submit:true`），不再依赖失焦；`input`/`textarea` 改为受控组件（值可追踪）
- **字段收集**：`input`/`textarea` 新增可选 `id`——带 id 的值进入 submit 的 `fields:{id:value}` 收集（纯表单 = 多个输入 + 一个 submit 提交）；无 group 时 submit 按「任一答案或字段已填」启用
- 系统提示词与 SKILL 同步「持久化」规则（相同内容=保留状态，新内容=重置）

### 修复
- 修复「重置后恢复状态被覆盖」：round 复位 effect 跳过首次挂载，恢复的答案/勾选不再被清掉

### 兼容
- 全部为可选字段：无 `stateKey`/`id` 时行为与 0.3.2 完全一致（旧围栏不持久化，行为不变）
- 测试新增 10 个（store 单测/刷新恢复/内容隔离/重置清空/Enter 提交/fields 收集），全套 199 通过

## [0.3.2] - 2026-08-11

### 新增
- **本地判卷（v2.6，零往返）**：`radio` 新增 `answer`（正确选项下标或标签）+ `explanation`（解析）——带答案的卷子点 `submit` 交卷时**当场本地判卷**：得分、每题 ✓/✗、正确答案、解析全部立即出现在 UI 里，不发模型、不等生成；判卷后题目锁定，点「重新作答」本地重置（可选 `resetAction` 通知模型）。题目没带答案时才退回 v2.5 的聚合 action
- **本地优先原则**：系统提示词与 SKILL 明确——UI 自己能完成的状态变化（判卷、判题、重置、展开、选中）一律本地即时完成，action 只用于必须模型参与的事
- **按钮本地点击反馈**：带 action 的按钮点击后立即显示「✓ 已响应」徽标（1.4s 后消失），模型往返期间用户也能看到点击被接收
- **修复默认选中吞答案**：`radio` 不再默认预选第一项（除非模型显式 `selected`），避免「保持默认即未作答」的静默丢失；模型给了 `selected` 时作为初始答案立即注册
- **重置完整复位**：重新作答同时清空 radio 本地选中态（round 机制），避免上一轮的勾选残留导致 change 事件不触发

### 修复
- guard：`answer` 越界下标从「钳位」改为「丢弃」（钳位会静默判错选项）

### 兼容
- 全部为可选字段：旧 spec 零改动；无 `answer` 数据的 submit 行为与 0.3.1 完全一致
- 测试新增 11 个（本地判卷/锁定/重置/离线判卷/按钮反馈/守卫），全套 189 通过

## [0.3.1] - 2026-08-11

### 新增
- **`submit` 交卷组件（v2.5）**：`{"type":"submit","label":"交卷","action":"grade","groups":["q1","q2"]}` —— 配合带 `group` 的 `radio` 聚合作答：用户在本地答完所有题后点一次交卷，模型一次性收到 `{answers:{题目:选项,...},total,answered}`，不再逐题刷往返；`groups` 列出的题未答完时按钮禁用，旁侧显示「已选 n/m」进度
- **`radio` 聚合模式**：`radio` 增加可选 `group` 字段——设置后选择只本地记录、不发逐次 action（兼容旧行为：不带 `group` 仍逐次回传）
- **`quiz` / `textarea` 支持 `action`**：`quiz` 作答时回传 `{type:'quiz',question,answer,correct}`（本地判题不变）；`textarea` 失焦时回传 `{type:'textarea',value}`
- **诚实交互（消灭假按钮）**：不带 `action` 的按钮渲染为禁用态（`disabled` + 置灰 + `not-allowed` 光标），不再出现"看着能点、点了没反应"的控件；系统提示词同步强调"交互组件必须带 action"

### 修复
- 按钮 hover 样式改为 `:not(:disabled)`，禁用态不再有高亮/悬停反馈

### 兼容
- 全部为可选字段：旧 spec 零改动；`radio` 不带 `group` 时行为与 0.3.0 完全一致
- 测试新增 14 个（v2.5 交互 + 守卫），全套 178 通过

## [0.3.0] - 2026-08-11

### 新增
- **`/panel` 会话面板命令**：slash 命令客户端直开面板（默认组件总览）；`/panel <指令>` 把指令转发给模型定制面板内容（指令不再被命令吞掉）；`/panel clear` 清空收起；面板 dock 收到命令自动展开
- **面板增量追加**：`panel: true` 围栏携带 `append: true` 时按标签页合并进现有面板——同名标签页内容追加、新标签页新增、普通内容追加到尾部；面板可无限累积，不再受单条消息传输大小限制；按 fence key 幂等去重（同一围栏只合并一次）
- **面板高度拖拽**：展开态拖拽面板顶边框调高（120–600px），自定义高度跨折叠/展开保留
- **表格横向滚动**：宽表格在容器内横向滚动（overscroll 约束），不再撑破面板/消息流

### 修复
- **render_ui 工具参数桥接兼容**：`specOf` 递归解包 harness 桥接层的所有参数形态（`{spec:对象}`、`{spec:"<JSON>"}`、`{arguments:包装}`、裸字符串、内层嵌套 spec 键）——此前小参数被包装成错误形状、工具行面板整体不可用；损坏 JSON 现在输出 `[genui-tool]` 诊断日志并给出明确错误
- **mermaid 错误图上屏**：`suppressErrorRendering` + 私有容器渲染——语法错误不再以 "Syntax error in text / mermaid version…" 错误图形式直接显示在页面上，统一走源码降级提示
- **mermaid 自动修复重试**：渲染失败后自动修复常见模型笔误再试一次——剥标签内反引号、引号化中文/空格标签、剥离 `<br/>`；修复成功则正常显示，仍失败才降级源码
- **测试环境**：jsdom PointerEvent polyfill，支持面板拖拽等指针交互测试
- **适配 0810 snapshot 的 `dsh.client` 声明契约**：浏览器端声明从顶层 `dshClient` 迁移到 `dsh.client` 子字段——新版 client-modules 只读取 `dsh.client`，旧字段被静默跳过，导致渲染器不进 boot 图、`/plugins/@deepseek-ai/dsh-genui/client.js` 404、页面上所有 `dsh-ui` 围栏退化为代码块；同批修复 dsh-annotation、better-sidebar 等 5 个插件同款问题

### 兼容
- spec 新增可选 `append` 字段（仅 `panel: true` 时生效），旧 spec 不受影响

## [0.2.2] - 2026-08-10

### 安全
- **mermaid 出口检查**：渲染出的 SVG 上屏前再验一次货——含 `<script>`、`on*` 事件属性或 `javascript:` URI 一律拒绝并回退源码块（入口 kind 白名单之外的第二道防线；mermaid strict 模式之外的最后兜底），新增 5 个测试锁死该门

### 优化
- **组件选择规则**：系统提示词新增「一个主题选一种主组件」决策表（结论→callout、指标→stat、对比→table、趋势→line、占比→donut、流程→steps 等）；SKILL.md 新增数量纪律与反例（同一数据不重复表达、3–8 个组件、3D 仅在内容本身是几何时用）

## [0.2.1] - 2026-08-10

### 优化
- **主动触发**：系统提示的 fence 规范新增 Trigger 规则——要点、强调、对比、流程、步骤、状态、数据、演示等结构化场景应主动用 UI，无需用户开口要图表；纯文字问答保持 prose
- **SKILL.md 路由拓宽**：description 从"可视化专用"改为"结构化呈现通用"；新增「内容类型 → 组件」映射表（要点→list/callout、强调→callout/badge、流程→steps/timeline/mermaid、对比→table/tabs、状态→badge/progress 等）

## [0.2.0] - 2026-08-09

### 修复
- **渲染错误边界**：任一 GenUI 块（fence / 工具卡片 / 面板）渲染异常时降级为内联提示，不再拖垮整个聊天界面（issue #2 白屏事故的根因已在主仓修复：默认分支更新至 fence-registry commit 47d230e）
- 安装说明改为 git URL 方式（`link:` 装干净 clone 会漏装 mermaid/three/react 依赖）

### 新增
- `scripts/install.sh`：一键安装（自检 dsh / pnpm / GitHub 凭据 → 安装 → 提示重启）
- `scripts/e2e.mjs`：真机 e2e（临时 dsh web + 插件 → 模型输出 fence → 渲染 → action 回传 → 模型响应）
- GitHub Actions CI（tsc + 135 测试 + 构建 + lib 与 src 一致性校验）
- README 顶部「dsh 版本要求」警示（需 fence-registry ≥ 47d230e）

## [0.1.1] - 2026-08-09

- panel 停靠（collapsible dock）、panel-only fence、spec 守卫、render_ui 工具通道、quiz/a11y/防抖加固、画廊全词汇
