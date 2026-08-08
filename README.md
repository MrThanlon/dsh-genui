# dsh-genui

模型在回答里直接画可交互界面。装上后，你问它问题，它可能一边写字一边给你渲染数据面板、图表、函数曲线、表单、测验题，甚至 3D 场景——你还能点按钮、拖滑块，模型会响应并更新界面。

<div align="center">

https://github.com/user-attachments/assets/f5db33ec-7471-4d4a-a85b-79c9962ab4ef

</div>

> 60 秒演示。播放器没出来可 [下载 mp4](./assets/demo.mp4)；四幕演示脚本见 [demo-prompts.md](./demo-prompts.md)。

## 快速开始

前置：dsh 含 `fence-registry`（`grep -r registerFenceRenderer <dsh源码>/packages/client/ui-primitives/src/` 有输出即可）。

```sh
git clone https://github.com/dsh-external/dsh-genui.git
dsh plugin --profile web add link:/path/to/dsh-genui
```

重启 dsh web + 硬刷新。新会话里说"用 dsh-ui 画个统计看板"验证。

## 它能做什么

- **回答即界面**：组件嵌在回答里，边生成边出现，不用等整段写完
- **30+ 组件**：卡片、表格、图表、表单、标签页、折叠面板、文件树、时间线、diff……
- **函数图**：`plot` 带参数滑块，拖动实时变化，可自动动画
- **测验**：`quiz` 点选判题 + 解析 + 重试
- **事件循环**：按钮/开关带 `action`，点击回传模型，模型更新界面
- **零打扰**：不装插件时围栏只是代码块，不报错

组件 JSON 语法见 [SKILL.md](./SKILL.md)（也可复制到 `~/.dsh/skills/genui/` 增强模型使用）。

## 示例

```dsh-ui
{"title":"订单概览","items":[
  {"type":"stat","label":"总收入","value":"¥128,430","delta":"+12.4%"},
  {"type":"stat","label":"订单数","value":"1,024","delta":"-3.1%"}
]}
```

模型输出上面这段围栏，你看到的是两张统计卡片。

## 原理

模型把界面描述写成 JSON 放进 `dsh-ui` 围栏，浏览器端渲染器（`src/client`）通过主仓 `fence-registry` 接口认领这门语言并渲染。组件是白名单的，模型塞不进 HTML/脚本；函数表达式走独立解析器，不用 eval。

## 常见问题

- **显示成代码块？** 查三处：dsh 版本带 fence-registry、`dsh plugin --profile web list` 里有本插件、重启 + 硬刷新。
- **模型不主动输出？** 重启后新会话生效；或直接说"用 dsh-ui 输出"。
- **clone 后没有 lib/？** `pnpm install && pnpm run check` 自己构建。

## 开发

```sh
pnpm install
pnpm run check   # 类型检查 + 63 测试 + 构建
```

测试解析 dsh 源码（`vitest.config.ts` 的 `DSH_ROOT`，默认 `~/.dsh/source/current`）。

## License

BSD-3-Clause
