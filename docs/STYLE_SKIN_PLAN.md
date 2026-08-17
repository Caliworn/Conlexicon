# Style Skin Plan

本文记录 Conlexicon 样式解耦后的文件边界、皮肤 token 契约和验收基线。S0 建立可替换皮肤基础；后续职责拆分又把共享几何、经典皮肤和值消费规则分离，过程均不得改变计算样式。

## 1. 文件边界

- `theme-tokens.css`：只保存跨皮肤共享的 control、mobile-control、panel、floating 与 pill 五种圆角，以及启动阶段的浅色 `color-scheme` 默认值。
- `theme-classic.css`：经典皮肤完整的明暗语义色、材质和交互参数；无皮肤、显式 `classic` 与未知皮肤值均由该文件提供默认回退。
- `theme-layered-glass.css` / `theme-liquid-glass.css`：各自完整定义全部非共享标准 token，并保存必要的皮肤专属选择器；不得隐式继承经典材质。
- `styles.css`：布局、组件、状态、响应式规则和对共享 token 接口的消费；不得声明皮肤 token 或主题材质字面量。

## 2. Token 层级

语义颜色以 `--ui-*` 命名，表达画布、文字、边框、强调、警告、危险和焦点等含义。材质角色以 `--material-*` 命名，分别表达 panel、control、inset、floating、mobile-bar、navigation、tooltip 和 overlay 的背景、边框、阴影与滤镜。非共享标准 token 由三套皮肤分别完整拥有；token 名称是接口，值属于皮肤。

共享圆角只保留 control、mobile-control、panel、floating 和 pill 五种角色。产品中的标准 `8px` 控件、面板和浮层分别消费其语义角色，完整圆头消费 pill；更小的嵌套曲率、局部四角、严格圆形、液态玻璃导航专属层级及独立 Lab 几何继续留在自身组件边界，不为了消灭字面量扩张契约。

布局间距、虚拟列表尺寸、网格轨道、响应式断点和 z-index 不属于皮肤，不迁入共享 token。`uiTheme` 仍只表达 light/dark，`uiSkin` 的公开取值和持久化协议不因文件拆分改变。

## 3. S0 基线与边界

S0-1 曾把原 `:root` 和 `body.dark-theme` 主题值集中迁入 `theme-tokens.css`；S0-2/S0-3 再将语义颜色和材质角色接入组件。三套皮肤成熟后，经典具体值已迁入 `theme-classic.css`，共享文件只保留五个圆角。加载顺序固定为共享 token、经典、层叠玻璃、液态玻璃、组件样式。

由于自定义属性在声明所在元素上求值，暗色作用域中需要跟随主题重新求值的派生材质必须在同一皮肤暗色作用域就地声明，不能依赖浅色作用域别名间接更新。

改动前后均以浏览器计算样式抽取以下关键角色：

| 角色 | 浅色背景 / 边框 | 暗色背景 / 边框 | 圆角 | 滤镜 |
| --- | --- | --- | --- | --- |
| 画布 | `#f4f6f2` | `#151a1d` | `0` | `none` |
| 导航 | `#22313a` | `#10181c` | `0` | `none` |
| 控件 | `#ffffff` / `#d8e0e8` | `#1f282d` / `#405057` | `8px` | `none` |
| 面板 | `#ffffff` / `#d8e0e8` | `#1f282d` / `#405057` | `8px` | `none` |
| 浮层 | `#ffffff` / `#d8e0e8` | `#1f282d` / `#405057` | `8px` | `none` |

浅色和暗色的 body、navigation、control、panel、floating 与筛选按钮计算样式在 S0-1 前后逐项一致。

## 4. 当前状态

当前代码边界已经完成：`styles.css` 只消费皮肤角色，不声明 `--ui-*`、`--material-*` 或 `--radius-*`，也不包含主题色字面量、组件级暗色分支和直接材质模糊/投影。经典、层叠玻璃和液态玻璃各自拥有 92 个非共享标准 token；共享文件只拥有 5 个有消费者且禁止皮肤覆盖的圆角。无消费者的通用 warning soft、普通 tooltip muted、旧 dialog overlay 和预留网络标签 filter 已删除。

`scripts/check-style-contract.js` 持续验证：

1. 五张样式表必须按共享、经典、层叠玻璃、液态玻璃、组件的顺序加载。
2. 三套皮肤必须完整定义全部非共享标准 token；共享圆角必须有消费者且不得被皮肤覆盖。
3. 组件样式不得声明皮肤 token，也不得恢复旧别名、主题分支或主题材质字面量。

拆分前后的浏览器验收均比较浅色和暗色下的画布、导航、控件、面板、浮层、tooltip、toast 与词汇网络计算样式；关键宽度继续覆盖 320/480/768/1024/1440px。圆角接线只替换等值 `8px` 和 `999px`，不得改变当前形状。

新增皮肤必须使用独立且有作用域的文件完整定义非共享标准 token；透明度、模糊、降级策略和性能验收仍由各皮肤规范负责。两套玻璃皮肤的具体边界分别见 `docs/LAYERED_GLASS_SKIN_SPEC.md` 和 `docs/LIQUID_GLASS_SKIN_SPEC.md`。
