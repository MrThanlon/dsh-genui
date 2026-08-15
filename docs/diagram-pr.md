# PR: 新增 `diagram` 组件——编辑级品牌图(diagram-design 移植)

> 向 `@omdsh-dev/dsh-genui` 提交的 PR 说明。本文件是提交的"模式与标准"文档:
> 目标、改动面、设计决策、测试、范围与后续迭代。设计全文见
> [`docs/diagram-component-design.md`](./diagram-component-design.md)。

---

## 1. 概述

新增 `diagram` 组件:让模型在 ```dsh-ui 围栏里直接输出**编辑级品牌图**——
27 种视觉类型(架构图、流程图、时序图、状态机、ER、泳道、雷达、循环、
树、层叠、维恩、金字塔、甘特、散点、数据流、安全矩阵等),由浏览器端
渲染器按 diagram-design 的编辑级规范生成内联 SVG。

**与现有 `mermaid` 的分工:**
- `mermaid` = 自动布局的通用图(模型只给源码,引擎排版);
- `diagram` = 编辑级排版(正交连接器、语义 token、焦点色预算、复杂度预算
  全部由渲染器强制,模型无法产出"AI slop"示意图)。

## 2. 改动面

| 文件 | 改动 |
|---|---|
| `src/client/spec.ts` | 新增 `GenuiDiagram` / `GenuiDiagramNode` / `GenuiDiagramEdge` / `GenuiDiagramZone` / `GenuiDiagramTheme` 类型与 `DIAGRAM_KINDS`(27 种)常量;并入 `GenuiNode` 联合 |
| `src/client/guard.ts` | 新增复杂度上限(`maxDiagramNodes=9` 等);`repairGenuiSpec` 的 `diagram` 分支(4px 网格取整、kind 白名单、节点/边/zone 清洗、主题色安全过滤);`validateGenuiSpec` 校验 |
| `src/client/blocks/diagram/theme.ts` | 语义 token 系统:light/dark 双皮肤 + `theme` 覆盖;节点类型→填充/描边;边语义→颜色 |
| `src/client/blocks/diagram/geometry.ts` | 正交连接器系统:端口选择、elbow path(r=8)、fan 规则、边标签遮罩、桥接跳线 |
| `src/client/blocks/diagram/layout.ts` | 布局引擎:坐标类 kind 透传定位;规则类 kind 自动排版(column/row/layer/tree/grid);64px 编辑级节点高度 |
| `src/client/blocks/diagram/index.tsx` | `DiagramNode` React 组件:dotted-paper 底纹、zone 分组、64px 节点(序号角标/tag/名称/sublabel)、legend 底条、a11y 外壳、焦点预算、z-order、accent 箭头加粗 |
| `src/client/blocks/render-node.tsx` | `case 'diagram'` 接入渲染分发 |
| `src/plugin/index.ts` | `GENUI_SECTION_TEXT` 增加 `diagram` 教学行;组件选择规则更新 |
| `SKILL.md` | 增加 `diagram` 组件规范、kind 表、与 mermaid 的分工 |
| `tests/genui-diagram-guard.spec.ts` | guard 纯测试:4px 取整、kind/节点清洗、预算、重复 id、标签长度、主题色安全 |
| `tests/genui-diagram.spec.tsx` | jsdom 渲染测试:a11y、标签、正交路径、语义色、dark 变体、27 种 kind 全渲染、zone/legend、dotted-paper |
| `docs/diagram-component-design.md` | 设计文档(本移植的模式与标准) |

## 3. 设计决策

### 3.1 为什么是核心白名单组件而非插件注册组件

dsh-genui 提供 `registerGenuiComponent` 协议(插件注册自定义类型),但:
- 核心路径让 `diagram` 自动获得 **guard 清洗、流式渲染、持久化、自愈**;
- 插件注册的未知类型被 guard 透传,不校验字段、不自愈、不参与预算;
- 目标是可合入 upstream 的一等公民。

结论:走核心路径(spec.ts + render-node switch),与 `mermaid`/`plot` 同级。

### 3.2 声明式 spec:模型给数据,渲染器给设计

模型不写 SVG path,只声明节点(坐标或数据)+ 边。布局与样式全部编码进
渲染器——这正是 diagram-design "规则由系统强制"理念的移植:模型无法选择
斜线连接器、无法把 accent 用到 4 个节点、无法超过复杂度预算。

### 3.3 双布局模式

- **坐标类**(architecture / it-state / high-level / process / medallion /
  data-flow / dp-integration):模型给 x/y/w/h,渲染器正交连线。
- **规则类**(其余 20 种):模型只给数据,渲染器按类型排版
  (column / row / layer / tree / grid)。

v1 的规则类布局是"最小可用"泛化布局;每种 kind 的精细排版(swimlane 分栏、
sequence 激活条、radar 网格等)留到 v2(见 §7)。

### 3.4 编辑级约束全部硬编码

正交连接器、4px 网格、语义 token、焦点 ≤2、复杂度预算、z-order、边标签
6-10px 间隙、无阴影无发光——全部是渲染器行为,spec 无法绕过。设计文档
§6 列出了完整的强制清单。

## 4. 测试

```
tests/genui-diagram-guard.spec.ts   8 tests  (4px 取整/清洗/预算/重复 id/标签/主题色)
tests/genui-diagram.spec.tsx        7 tests  (a11y/标签/正交路径/语义色/dark/27 kind 全渲染)
```

- 全部 27 种 kind 至少一个最小 spec 能渲染 `<svg role="img">` 不抛错。
- 现有功能零回归(见下)。

## 5. 回归与已知环境问题

本 PR 在本地以 `DSH_ROOT=/Users/xpeng/deepseek-harness` 运行:

| | 本 PR | baseline(无改动) |
|---|---|---|
| diagram 测试 | 15/15 ✅ | — |
| 全量失败 | 4 文件 / 71 测试 | 5 文件 / 79 测试 |

失败测试(genui-panel / panel-append / dom-fence 等)**在本 PR 之前已存在**,
根因是 **Node ≥22 的 `localStorage` 实验性行为**(`--localstorage-file` 未提供时
`localStorage` 为 undefined),与 `diagram` 无关。CI 若在 Node LTS(≤20)下运行
不受影响;建议上游在 CI 或测试 setup 中为 jsdom 补 localStorage polyfill。

## 6. 使用示例

```dsh-ui
{"title":"系统架构","items":[
  {"type":"diagram","kind":"architecture","title":"订单系统","nodes":[
    {"id":"web","label":"Web 前端","type":"focal","x":40,"y":40,"w":128,"h":48,"tag":"WEB"},
    {"id":"api","label":"订单服务","x":240,"y":40,"w":128,"h":48,"sub":"svc:8080"},
    {"id":"db","label":"订单库","type":"store","x":240,"y":160,"w":128,"h":48,"sub":"rds:5432"}
  ],"edges":[
    {"from":"web","to":"api","label":"HTTPS","kind":"link"},
    {"from":"api","to":"db","label":"WRITE","kind":"accent"}
  ]}
]}
```

## 7. 范围与后续迭代(v2,不在本 PR)

- 每种 kind 的精细布局(swimlane 分栏、sequence lifeline 激活条、radar 网格、
  gantt 时间轴、venn 圆交叠计算、quadrant 象限定位)。
- 品牌抓取(onboarding,对应 diagram-design 的 URL 提取流程)。
- `editorial` 变体精修、`sketchy`/`terminal` 皮肤。
- drawio/mermaid 导入重绘(对应 diagram-design `scripts/*.py`)。

## 8. 上游致谢

设计系统移植自 [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design)
(MIT, v2.4)。组件名、kind 枚举、语义 token 与强制规则均对齐其 SKILL.md 与
`references/` 规范,以便双向同步。
