# dsh-genui

让 DeepSeek Harness 的模型在回答里直接画界面。

平时模型回你的是纯文字。装了这个插件之后，模型可以在回答的中间（注意，是回答的一部分，不是工具卡片）直接输出一块可交互的 UI——统计看板、图表、函数图、表单、测验题，甚至是 3D 场景。你甚至可以点里面的按钮，模型会收到你的操作并更新界面。

<video src="./assets/demo.mp4" controls width="100%"></video>

> 上面是 60 秒演示录屏。完整的四幕演示脚本（怎么让模型把每种能力都展示一遍）在 [demo-prompts.md](./demo-prompts.md)。

## 它长什么样

模型回答里会出现这样一块东西：

```dsh-ui
{"title":"订单概览","items":[
  {"type":"stat","label":"总收入","value":"¥128,430","delta":"+12.4%"},
  {"type":"stat","label":"订单数","value":"1,024","delta":"-3.1%"},
  {"type":"progress","label":"本月目标","value":72,"valueLabel":"72%"}
]}
```

渲染出来就是一个实时统计面板。回答还在滚动生成的时候，每个组件写完就立刻出现，不用等整段回答结束。

## 能做什么

- **排版与数据**：标题/正文层级、卡片、网格、表格、键值对、列表、徽章、进度条、头像
- **图表**：柱状图（含分组）、折线图、环形占比图；`plot` 画数学函数曲线，带参数滑块——拖动滑块曲线实时变化（y 轴锁定，只动曲线不动数轴），也可以让参数自动动画
- **表单与交互**：按钮、输入框、下拉、单选、复选、开关、标签页、折叠面板、复制按钮——开关和按钮可以带 `action`，点击后消息会回传给模型，模型执行完再输出更新后的界面（比如点「刷新数据」，模型真的重新生成一组数据）
- **教学场景**：`quiz` 出选择题，点击直接判对错并给出解析，错了可以重试；步骤条、提示框配合讲解
- **花活**：mermaid 流程图/时序图/甘特图、WebGL 3D 场景（可拖拽旋转）、文件树、时间线、面包屑、JSON 查看器、代码 diff

完整组件清单和 JSON 语法见 [SKILL.md](./SKILL.md)（这份文件同时也是给模型看的技能说明）。

## 安装

前置条件：你的 dsh 版本包含 `fence-registry` 扩展点（`registerFenceRenderer` 那个）。当前内测 staging 构建都有；不确定的话在 dsh 源码里搜一下：

```sh
grep -r registerFenceRenderer <dsh源码目录>/packages/client/ui-primitives/src/
```

有输出就说明支持。然后：

```sh
git clone https://github.com/dsh-external/dsh-genui.git
dsh plugin --profile web add link:/path/to/dsh-genui
```

重启 dsh web，浏览器硬刷新（Cmd+Shift+R），完事。`dsh plugin add` 会自动把插件的配置行加进 profile，不需要手动改任何 yml 文件。装了社区 [plugin-registry](https://github.com/dsh-external/plugin-registry) 的话也可以走 `dsh registry install`。

**验证装没装上**：新开一个会话，让模型"用 dsh-ui 画一个统计看板"。如果看到的是可交互的组件，成了；如果还是一坨代码块，看下面的常见问题。

## 模型怎么知道要用它

两部分配合：

1. **插件**（本仓库 `src/plugin`）：启动时往 system prompt 里注入一段 `dsh-ui` 语法说明。模型没看过这段说明就不会输出围栏，所以这个插件对你现有会话是零打扰的。
2. **技能**（`SKILL.md`）：可选增强。复制到 `~/.dsh/skills/genui/SKILL.md`，模型通过技能机制会更主动地使用组件（尤其是 plot 滑块、quiz 这些进阶玩法）。

## 它是怎么工作的

```dsh-ui
{"title":"渲染链路","items":[{"type":"mermaid","code":"graph LR\n  A[模型回答] -->|dsh-ui 围栏| B[MarkdownText]\n  B --> C[fence-registry 查表]\n  C --> D[GenuiBlock 渲染器]\n  D --> E[可交互组件]\n  E -->|action 回传| F[模型更新界面]"}]}
```

- 模型把组件描述写成 JSON 放进 ```dsh-ui 围栏，这是**回答的一部分**，不是工具调用
- 浏览器端的渲染器（本仓库 `src/client`）通过主仓的 fence-registry 扩展点注册 `dsh-ui` 语言，MarkdownText 渲染围栏时查到注册就调它
- 没装插件时，围栏退化成普通代码块——不会报错，也不会渲染出奇怪的东西
- 组件是**白名单**的：spec 只是数据，模型没法注入任意 HTML 或脚本；plot 表达式走递归下降解析器（不用 eval）；3D 场景只有几种基础几何体

## 常见问题

**装了但 dsh-ui 还是代码块**
先确认 dsh 版本带 fence-registry（上面的 grep 命令），再确认插件真的进 profile 了（`dsh plugin --profile web list` 能看到 @deepseek-ai/dsh-genui），最后确认重启 + 硬刷新都做了。

**模型不主动输出 dsh-ui**
插件注入的语法说明只在模型看到的时候生效——重启 dsh 后新会话才有效。也可以直接明说"用 dsh-ui 输出"。

**仓库里没有看到 lib/？**
`lib/` 是构建产物，随仓库分发（群友 clone 即用、不用构建）。如果你 clone 的版本没有，跑 `pnpm install && pnpm run check` 自己构建一份。

## 开发

```sh
pnpm install
pnpm run check    # 类型检查 + 63 个测试 + 构建 lib/ 与 client.js
```

测试通过 vitest 解析到 dsh workspace 源码（`vitest.config.ts` 里的 `DSH_ROOT`，默认 `~/.dsh/source/current`，换环境改这里）。构建产物 `lib/` 直接入库，和 [dsh-visualize](https://github.com/dsh-external/dsh-visualize) 一个模式。

## License

BSD-3-Clause
