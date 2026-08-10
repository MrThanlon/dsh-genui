# Changelog

## [Unreleased]

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
