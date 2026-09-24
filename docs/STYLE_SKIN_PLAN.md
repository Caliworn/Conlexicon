# Style Skin Plan

本文记录 Conlexicon 样式解耦后的文件边界、皮肤 token 契约和验收基线。S0 建立可替换皮肤基础；后续职责拆分又把皮肤拥有的几何值、经典皮肤和组件消费规则分离，过程均不得改变计算样式。

## 1. 文件边界

- `theme-classic.css`：经典皮肤完整的明暗语义色、材质、圆角和交互参数，以及经典候选缩略图；无皮肤、显式 `classic` 与未知皮肤值均由该文件提供默认回退。
- `theme-layered-glass.css` / `theme-liquid-glass.css`：各自完整定义同一套标准 token、必要的皮肤专属选择器和对应候选缩略图；不得隐式继承经典值。
- `styles.css`：布局、组件、状态、响应式规则和对皮肤 token 接口的消费；皮肤选择器只在此定义菜单、选项及缩略图公共框架，不得声明目标皮肤外观、皮肤 token 或主题材质字面量。

## 2. Token 层级

语义颜色以 `--ui-*` 命名，表达画布、文字、边框、强调、警告、危险和焦点等含义。材质角色以 `--material-*` 命名，分别表达 panel、control、inset、floating、mobile-bar、navigation、tooltip 和 overlay 的背景、边框、阴影与滤镜。标准 token 由三套皮肤分别完整拥有；token 名称是组件接口，值属于皮肤。

圆角接口保留 control、mobile-control、panel、floating 和 pill 五种角色，由每套皮肤在自身基础作用域中定义。当前三套皮肤继续使用等值的 `8px` 标准控件/面板/浮层、`10px` 移动控件和 `999px` 圆头，但契约不要求跨皮肤等值；更小的嵌套曲率、局部四角、严格圆形、液态玻璃导航专属层级及独立 Lab 几何继续留在自身组件边界，不为了消灭字面量扩张接口。

布局间距、虚拟列表尺寸、网格轨道、响应式断点和 z-index 不属于皮肤，不迁入共享 token。`uiTheme` 仍只表达 light/dark，`uiSkin` 的公开取值和持久化协议不因文件拆分改变。

### 控件颜色语义接口（2026-09-20）

共享组件通过 `data-control-tone` 声明语义：
neutral 使用唯一中性配方，必须省略 `data-control-emphasis`；
accent 与 danger 必须明确选择 outline、tinted 或 solid。契约按上述七种有效声明校验，
不将所有字段的笛卡尔积视为有效接口。新增配方需有明确用途与状态验证，不以是否已经迁移消费者作为唯一依据。
七种配方共用状态出口；未声明的组件继续走原有样式，包括菜单及文字操作的无底外观。
这是颜色、强调与交互阴影接口，不是 Q3 注册接口，不改变尺寸、布局、按压变换或业务行为。

| emphasis | 默认底色 / 边框 | 用途 |
| --- | --- | --- |
| outline | 同皮肤 panel 中性底 / tone 色 | 描边操作 |
| tinted | tone 弱底 / 初始透明边框 | 弱强调／危险操作 |
| solid | tone 实色 / 初始透明边框 | 高强调操作 |

局部 `--control-tone-*` 从当前皮肤的 `--ui-*` / `--material-*` 取值；
`--control-background`、`--control-border`、`--control-color` 及 hover/pressed/disabled 对应变量是皮肤配方输入。
共享状态规则解析为 `--control-current-background/border/color/shadow`，普通绘制与已适配 Q3 都消费解析结果，
不由光学层再写一套状态切换。优先级为 disabled、pressed、hover、default；focus-visible 独立叠加焦点环。
别名在控件本身声明，避免在 body 声明后绑定浅色值。无需新增一套同义全局颜色 token。
accent 和 danger 分别使用现有强调/危险色、soft 交互底及实色前景。
neutral 使用 panel 中性底、ui-border 细边框及 ui-text；hover/pressed 使用 inset 中性底与 ui-border-strong，
不引入强调色。不存在 neutral 的 outline/tinted/solid 分档。液态配色适配覆盖全部七种配方；
按钮／label 按有效语义取得 compact 光学资格，仍受父 Q3 排除边界约束。

hover 沿本身 tone 变化，outline 出现弱有色底，tinted 保持弱底并强化边框；
普通 neutral 的展开底为 panel/inset 混合，hover 使用 inset，pressed 向中性文字色轻染；
普通 outline 的 pressed 在 tone 弱底上进一步轻染本身语义色。液态 neutral/outline 使用浮层中性玻璃底，
hover/pressed 分别混入 18%/28% 自身 tone 色，中性按钮保持中性。只改变 CSS 材质，不重建光学贴图。
focus-visible 使用独立金色焦点环。disabled/aria-disabled 控件关闭接口的 hover/pressed；
一般控件使用 muted，solid 则将底色与文字成对切到 inset 中性底和 ui-text，避免灰字压在强有色底上。
词典“当前”是选中状态展示，保留本身的 solid 底色/前景配对及默认光标，不套用不可用操作的弱化。
aria-disabled 仅影响外观，业务仍需自行阻止激活。
选中控件通过静态 `data-control-selection` 选择配方（不是状态副本），状态只来自原生 checked、
aria-checked、aria-selected 或 aria-pressed。selected/selected-hover/selected-pressed/selected-disabled 四组配方
仍输出到 current 的背景、边框、文字和阴影；禁用保留选中标识并停止交互，焦点环独立叠加。
首批覆盖 B/I/SC、文档／语料互斥模式、分析／质量页签。B/I/SC 保留 checkbox；
分段控件为 radiogroup/radio，方向键切换；页签为 tablist/tab/tabpanel，左右/Home/End 移焦，
Enter/Space 手动激活，跳过禁用项，重绘后恢复焦点。质量分组属于同一 tablist。
词根模式通过 aria-pressed 接入选中配方，设置名保持恒定；词根状态由应用更新，
不再由 Mail 布局创建或移除。语言切换仍为目标语言命令，不添加 pressed。
主题保留固定名称和 aria-pressed，但用太阳／月亮表达当前状态，不启用常驻选中底；仍复用导航的普通交互配方。
内容折叠、整个列表、导航展开与皮肤菜单使用静态 data-control-disclosure 标记，
直接读取已有 aria-expanded；箭头和布局仍由原组件负责。展开配方解析背景、边框与阴影，
hover/pressed/disabled 优先，展开不等于选中。
导航收起与 utility 控件复用 current 出口，但以导航 token 提供局部配方；
经典 utility 保留普通控件底，层叠保留 utility 阴影，液态保留透明 utility 行；
移动导航/列表按钮保留顶栏材质。导航目的地、菜单项及列表当前项暂不迁移。
光学范围与单外壳分段布局不变。
首批将语料层／单元上下移动按钮接入 neutral，删除语料图标按钮重复的 hover/危险文字规则；
普通操作现已扩展到词条查看／编辑／定位、完整与局部取消和自动 IPA、各页返回、
词典配置／导出／设为当前／导入、分析重试／更多／查看质量、四类信息说明、
手动形态组排序／应用尺寸、标签排序应用，以及网络／信息／确认弹窗和搜索／筛选面板内的普通操作。
文件导入保留原生 input 和 label，隐藏输入仍可键盘聚焦，外层显示焦点环。
迁移只选择配方，不扩大光学注册；面板内仍共享父 Q3。
第 2 类已接入：搜索清除保持无底无独立边框；搜索设置、排序、筛选和展开／收起命令在 Mail
共享透明外壳，配置生效（现有 active）用强调色文字／边框，弹层展开（aria-expanded）使用持续底色，
hover／pressed 覆盖展开底色，禁用时不显示展开反馈。排序不新增 selected 状态。
手动／自动形态按钮仍是动作命令；完整与局部 IPA 键盘使用 neutral 状态出口及独立中性键帽配方，
保留几何和插入行为，不新增折射。
禁用排序操作仍无 hover。B/I/SC 与页签旧选中配色已被组合状态配方替代，其余未迁移控件保持原实现。

接口试点为删除层（danger/tinted）和解除关联（danger/outline），保留其 34px 尺寸及既有交互。
第一批已扩展到删除词条/词典/语料块/单元、移除释义/形态组/形态表/标准化规则和 IPA 规则
（danger/tinted），添加释义/可选字段/标准化规则（accent/outline），现有主操作
（accent/solid），以及重写全部发音和危险确认（danger/solid）。
完整编辑、局部编辑和动态模板均声明属性；共享确认按钮每次打开都同步 tone/emphasis，
普通确认与编辑切换保存会恢复 accent。放弃更改的 alternate 按钮固定使用 danger/tinted，
与语料删除属性一致；清除筛选使用 danger/outline，保留其既有 Q3 资格与语义描边反馈。
添加类使用标准 outline 中性底和强调色边框，IPA 批量入口使用标准 solid 配方，不再单设同色边框。
IPA 规则删除保留默认中性边框，以局部变量接入。原 class 继续承担布局、阴影配方映射及既有注册边界；
additive-button 不再定义透明底或专属交互配色；primary/danger 等旧布局类不再决定光学资格。
有效的 neutral、accent/danger outline/tinted/solid 按钮与 label 自动注册，仍遵守 Q3 父表面内
不重复折射的边界；Q1 详情与编辑外壳允许子控件 Q3。当前词典状态可分配光学资源，
但保留 disabled 语义、无交互反馈和本身有色材质，不套普通禁用弱化。
2026-09-21：添加 IPA 映射、语料属性、语料层、关联单元，以及移动/列表新建、
筛选刷新/切换按钮已迁移 accent/outline；图标新建和筛选操作不再采用 hover 实色填充。
已注册为 relationship 的语义 outline 使用 floating 中性透视底，并消费 control 边框与
hover/pressed tint；不会新增光学注册，父 Q3 排除边界不变。
Mail 搜索/工具外壳的内部控件同时映射旧 material 与新 control 配色接口：
默认透明、hover/pressed 沿自身 tone 轻染色，共享外壳玻璃，不绘制独立面板底。
这些映射只覆盖既有直接控件位置，不作用于 body 级挂载的菜单。
2026-09-24：tinted 采用中性浮层底混入语义色，solid 采用高密度有色透射底；
明暗分别校准前景及深色底，hover/pressed 仅改变材质，不修改 compact 光学参数或缓存键。
语义属性变化纳入注册监听；Q3 父级 pending/fallback 不会给子控件临时光学资格。
文档／语料分段选中块复用 solid 材质，整组仍是唯一 Q3 外壳。
减少透明度／无 blur 时 solid 使用不透明底，强制高对比使用系统色。
语法、样式契约与完整检查可自动验证；浏览器计算样式、视觉及辅助模式验收仍需另行完成。

## 3. S0 基线与边界

S0-1 曾把原 `:root` 和 `body.dark-theme` 主题值集中迁入 `theme-tokens.css`；S0-2/S0-3 再将语义颜色和材质角色接入组件。三套皮肤成熟后，颜色、材质和圆角均由各自皮肤完整拥有，失去职责的共享文件及其根级启动浅色默认已经删除。加载顺序固定为经典、层叠玻璃、液态玻璃、组件样式。

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

当前代码边界已经完成：`styles.css` 只消费皮肤角色，不声明 `--ui-*`、`--material-*` 或 `--radius-*`，也不包含主题色字面量、组件级暗色分支和直接材质模糊/投影。经典、层叠玻璃和液态玻璃各自完整拥有同一套颜色、材质与圆角 token；无消费者的通用 warning soft、普通 tooltip muted、旧 dialog overlay 和预留网络标签 filter 已删除。

皮肤选择器的三个目标缩略图分别由对应皮肤文件拥有。它们必须保持无 `body[data-ui-skin]` 作用域，因为选择菜单在任意当前皮肤下都要同时展示全部候选；共享组件样式只负责统一的缩略图尺寸、基础边框和布局。

`scripts/check-style-contract.js` 持续验证：

1. 四张样式表必须按经典、层叠玻璃、液态玻璃、组件的顺序加载。
2. 三套皮肤必须完整定义全部标准 token；五种角色圆角必须各有组件消费者，但允许皮肤使用不同值。
3. 组件样式不得声明皮肤 token，也不得恢复旧别名、主题分支、目标皮肤预览或主题材质字面量。

拆分前后的浏览器验收均比较浅色和暗色下的画布、导航、控件、面板、浮层、tooltip、toast 与词汇网络计算样式；关键宽度继续覆盖 320/480/768/1024/1440px。圆角接线只替换等值 `8px` 和 `999px`，不得改变当前形状。

新增皮肤必须使用独立且有作用域的文件完整定义标准 token；透明度、模糊、圆角、降级策略和性能验收仍由各皮肤规范负责。两套玻璃皮肤的具体边界分别见 `docs/LAYERED_GLASS_SKIN_SPEC.md` 和 `docs/LIQUID_GLASS_SKIN_SPEC.md`。
