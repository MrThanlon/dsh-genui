# dsh-genui

GenUI for [DeepSeek Harness](https://github.com/dsh2026/test-taekchef): the model renders **interactive UI components inline in its reply** — as part of the answer, between paragraphs — by emitting a `dsh-ui` fence. The browser half turns the declarative spec into real components: layout, data panels, charts, math plots with live sliders, quizzes, mermaid diagrams, 3D scenes, and an action event loop back to the model.

```
你  的 文 字
```dsh-ui
{"title":"订单概览","items":[{"type":"stat","label":"总收入","value":"¥128,430","delta":"+12.4%"}]}
```
你  的 文 字
```

The fence **renders the moment it closes** — components stream in top-down while the reply is still being written.

## 组成

| 部分 | 作用 |
|---|---|
| `src/plugin`（node half） | 向 system prompt 注入 `genui:fence` 段，教模型 dsh-ui 语法与组件词汇（不注入就不输出围栏，零副作用） |
| `src/client`（browser half） | 通过主仓 `fence-registry` 扩展点注册 `dsh-ui` 渲染器：GenuiBlock 组件树、plot/mermaid/scene3d 懒加载、流式部分解析 |
| `SKILL.md` | 配套技能（放 `~/.dsh/skills/genui/`，skill-local 自动发现，增强模型对组件的使用） |
| `demo-prompts.md` | 四幕录屏演示 prompt（README 视频素材） |

## 安装

**前置**：dsh 需要包含 `fence-registry` 扩展点（`@deepseek-ai/dsh-client-ui-primitives` ≥ 含 `registerFenceRenderer`）。当前内测 staging 构建已包含；检查方法：`grep -r registerFenceRenderer <dsh>/packages/client/ui-primitives/src/`。

```sh
git clone https://github.com/dsh-external/dsh-genui.git
dsh plugin --profile web add link:/path/to/dsh-genui
# 重启 dsh web，硬刷新浏览器（Cmd+Shift+R）
```

`dsh plugin add` 会：
1. 把包加入 profile 依赖（pnpm link）
2. 通过包内 `dsh.bundle.patch`（`cordis.patch.yml`）自动插入 `genui` 插件行

无需手工编辑 cordis.patch.yml。装了 [plugin-registry](https://github.com/dsh-external/plugin-registry) 的用户也可以走 `dsh registry install` 通道。

验证：新会话里让模型输出一个 ```dsh-ui 围栏（或直接说「用 dsh-ui 画一个统计看板」），组件应渲染为可交互 UI 而不是代码块。

## 能力速览

```dsh-ui
{"title":"组件词汇","gap":12,"items":[
  {"type":"text","size":"h3","content":"布局 / 展示"},
  {"type":"badge","label":"text · row · col · grid · card","tone":"accent"},
  {"type":"badge","label":"stat · badge · progress · table · keyvalue · list","tone":"accent"},
  {"type":"badge","label":"timeline · file-tree · breadcrumb · diff · json · code","tone":"accent"},
  {"type":"text","size":"h3","content":"图表 / 可视化"},
  {"type":"badge","label":"chart（bars/line/donut/分组柱）+ plot（数学函数图）","tone":"accent"},
  {"type":"badge","label":"mermaid（流程图/时序/甘特）+ scene3d（WebGL）","tone":"accent"},
  {"type":"text","size":"h3","content":"交互"},
  {"type":"badge","label":"button · input · select · checkbox · radio · switch · tabs · accordion · copy","tone":"accent"},
  {"type":"text","size":"h3","content":"教学 / 事件循环"},
  {"type":"badge","label":"quiz 判题 + steps + callout + action 事件回传模型","tone":"accent"}
]}
```

- **plot**：`params` 渲染实时滑块（拖动即时重绘，y 轴锁定），`animateTo` + `durationMs` 出现播放按钮自动动画
- **quiz**：纯前端判题（点选即出对错 + 解析 + 重试）
- **事件循环 v2**：button/switch/select 带 `action` 字段 → 点击把 `[genui-action]` 发回模型 → 模型回复新的 dsh-ui 更新面板
- **流式渲染**：围栏边写边出组件（从上到下逐个出现）

完整语法见 `SKILL.md`。

## 开发

```sh
pnpm install
pnpm run check   # tsc + 63 个测试 + 构建 lib/ 与 client.js
```

测试通过 vitest alias 解析 dsh workspace（`vitest.config.ts` 里 `DSH_ROOT` 指向 `~/.dsh/source/current`，按需调整）。

构建产物 `lib/`（node half + `client.js`）随仓库分发，与 dsh-visualize 同模式：无 install/build 运行时依赖。

## 安全边界

- 渲染器是**白名单组件树**：spec 只是数据，模型不能注入任意 HTML/JS；未知 type 渲染为空
- fence 注册是**代码级**的（只有打进 bundle 的插件代码能注册语言），模型无法注册渲染器
- plot 表达式走递归下降解析器（无 eval）；scene3d 仅白名单几何体 + 本地材质

## 演示视频

<!-- TODO: 录屏后替换为 GitHub release asset 链接 -->

- 四幕演示 prompt 见 `demo-prompts.md`（布局数据 / 交互 / 可视化教学 / 事件循环）
- 分镜与剪辑建议也在其中

## 许可证

BSD-3-Clause
