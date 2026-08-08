# dsh-genui

**让 DeepSeek Harness 的模型在回答里直接给你画界面。**

不用装什么复杂的东西。装上这个插件之后，你问模型问题时，它可能会在回答的中间（注意，就是回答的一部分，不是旁边弹出来的工具卡片）直接给你画一块能用的界面——统计面板、图表、函数曲线、表单、测验题，甚至一个能转的 3D 场景。更妙的是，你还能**点**里面的东西：按个按钮、拖个滑块，模型会收到你的操作，然后把界面更新给你看。

<video src="./assets/demo.mp4" controls width="100%"></video>

> 上面的 60 秒录屏是完整演示。如果播放器没显示出来（有些环境不支持内嵌视频），[点这里下载 demo.mp4](./assets/demo.mp4) 看。想让模型自己把每种能力都展示一遍？[demo-prompts.md](./demo-prompts.md) 里有现成的四幕演示脚本，照着发就行。

---

## 它到底长什么样

想象你在问模型："帮我看下这个月的订单情况。" 它可能一边写文字，一边给你渲染出这样一块：

```dsh-ui
{"title":"订单概览","items":[
  {"type":"stat","label":"总收入","value":"¥128,430","delta":"+12.4%"},
  {"type":"stat","label":"订单数","value":"1,024","delta":"-3.1%"},
  {"type":"progress","label":"本月目标","value":72,"valueLabel":"72%"}
]}
```

你不用看懂上面这堆 JSON——这是模型写给浏览器看的。你看到的是一排实时统计卡片，而且**回答还在滚动的时候，每个组件写完就立刻蹦出来**，不用等整段话打完。

## 能拿来干嘛

- **看数据**：统计卡片、表格、进度条、徽章、柱状图/折线图/环形图，还有带参数滑块的函数曲线图——拖动滑块曲线实时变，也可以让它自己动起来
- **填东西**：输入框、下拉框、单选、复选框、开关、标签页、折叠面板，组件齐全
- **跟模型互动**：开关和按钮可以"接线"。比如模型给你一个「刷新数据」按钮，你一点，模型真的会重新算一组数据，然后输出一块更新过的面板给你
- **学习**：模型可以出选择题（quiz），你点选项它当场判对错、给解析，错了还能重试
- **玩**：流程图/时序图/甘特图（mermaid）、可拖拽旋转的 3D 几何体、文件树、时间线、代码 diff…… 无聊但确实能画

完整组件清单和 JSON 语法在 [SKILL.md](./SKILL.md)——顺便说，这份文件不只是文档，它同时也是教模型怎么用这些组件的"技能书"。

## 安装

前提是你的 dsh 版本带了 `fence-registry` 扩展点（一个让插件注册渲染器的接口）。当前内测构建都有，不确定就查一下：

```sh
grep -r registerFenceRenderer <你的dsh源码目录>/packages/client/ui-primitives/src/
```

有输出就 OK。然后：

```sh
git clone https://github.com/dsh-external/dsh-genui.git
dsh plugin --profile web add link:/path/to/dsh-genui
```

重启 dsh web（浏览器记得硬刷新 Cmd+Shift+R），就装好了。`dsh plugin add` 会自动把插件注册进 profile，不用手动改任何配置文件。装了社区 [plugin-registry](https://github.com/dsh-external/plugin-registry) 的也可以走 `dsh registry install` 通道。

**怎么确认装好了**：新开个会话，跟模型说"用 dsh-ui 画一个统计看板"。看到可交互组件就成功了；如果还是一堆代码块，看下面的常见问题。

## 模型怎么知道要用它

- **插件**（`src/plugin`）：启动时往 system prompt 里注入一段 dsh-ui 语法说明。它没看过这段就不会用，所以不装插件时，你的会话完全不受影响
- **技能**（可选）：把 `SKILL.md` 复制到 `~/.dsh/skills/genui/SKILL.md`，模型会更主动地玩这些组件，尤其是 plot 滑块、quiz 这些进阶玩法

## 原理（30 秒版）

模型把界面描述写成 JSON，包在 ```dsh-ui 围栏里，作为回答的一部分发出来 → 浏览器端的渲染器（`src/client`）通过主仓的 fence-registry 接口认领 `dsh-ui` 这个语言 → 渲染成组件。没装插件时，围栏就只是个普通代码块，不会报错也不会渲染出奇怪的东西。

安全方面：组件是白名单的，模型只能往 JSON 里塞规定好的字段，塞不了 HTML 或脚本；函数曲线的表达式走自己的解析器（不用 eval）；3D 场景只有几种基础几何体。也就是说，模型的输出再野，也画不出一个能偷你数据的网页。

## 常见问题

**装了对，但 dsh-ui 还是代码块**
① 确认 dsh 版本带 fence-registry（上面 grep 那条）② `dsh plugin --profile web list` 能看到 @deepseek-ai/dsh-genui ③ 确认重启 + 硬刷新都做了。三步都对了还不行，来仓库开 issue。

**模型不主动输出 dsh-ui**
插件注入的说明只在模型看到时生效——重启 dsh 后开的新会话才有效。或者直接跟它说"用 dsh-ui 输出"，它就会了。

**仓库里怎么没有 lib/？**
`lib/` 是构建产物（随仓库分发，群友 clone 即用、不用自己构建）。如果 clone 下来没有，`pnpm install && pnpm run check` 自己构建一份。

## 开发

```sh
pnpm install
pnpm run check   # 类型检查 + 63 个测试 + 构建 lib/ 与 client.js
```

测试会通过 vitest 解析到 dsh 源码（`vitest.config.ts` 里的 `DSH_ROOT`，默认 `~/.dsh/source/current`，换了环境改这里就行）。

## License

BSD-3-Clause
