# Changelog

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
