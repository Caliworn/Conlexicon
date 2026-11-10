# Layered Glass Skin Specification

层叠玻璃以 Windows 11 Fluent 的材质层次为视觉语言。页面用不透明的云母色承托内容，词条和工具页以细边与明度分层，最前方的临时浮层使用亚克力。皮肤的通用接口见 [Style Skin Plan](STYLE_SKIN_PLAN.md)。

## 身份与边界

- 用户可见名称为「层叠玻璃 / Layered Glass」，公开 ID 为 `layered-glass`。选择结果作为全局偏好写入 `data/index.json`，本地镜像负责首屏预着色。
- `theme-layered-glass.css` 负责明暗配色、材质和皮肤专属状态，包括所有皮肤下可见的候选缩略图。普通组件继续复用共享 DOM、布局、断点、z-index 和虚拟列表。
- 画布、导航、内容、控件和短时浮层通过角色 token 接入。同一套语义色贯穿明暗主题，强调色为 Fluent 品牌蓝（浅色 `#0f6cbd`，暗色 `#479ef5`，取自 Fluent UI 的 brandWeb 色阶 80 与 100），警告为琥珀，危险为红。实色按钮浅色用白字，暗色用深字。界面与词形沿用 Noto Sans 和 Charis SIL。

## 材质与几何

| 表面 | 浅色 | 暗色 | 规则 |
| --- | --- | --- | --- |
| 画布、工具导航、移动顶栏和词条抽屉 | `#e2e8ee` | `#191d22` | 实色云母，比内容外壳暗一档。工具导航靠细边分隔，移动导航抽屉另有遮罩和投影。 |
| 面板与内容外壳 | `#f0f3f6` | `#252a30` | 实色底与 1px 细边。词条查看、完整编辑与标有 `data-surface="content-shell"` 的工具卡片共用 8px 圆角和轻投影。 |
| 详情分区、词条卡片、内嵌底色 | `#ffffff` | `#30373f` | 比外壳更亮的实色。详情分区与词条卡片使用 4px 圆角和细边，详情分区间距 8px。 |
| 普通控件 | `#ffffff` | `#333739` | 普通和移动控件圆角 4px，字段使用清晰描边，独立按钮的底边比顶边深。 |
| 小型菜单、来源建议、结构化 tooltip | `#fcfdfd`，70% 不透明 | `#272a2c`，80% 不透明 | `blur(15px)`、细边、8px 圆角与轻投影。 |
| 应用内弹窗、词汇网络 | `#f0f3f6`，70% 不透明 | `#252a30`，80% 不透明 | `blur(20px)`、边框与投影。弹窗暗幕为浅色 28%、暗色 42%，词汇网络暗幕为浅色 34%、暗色 48%。 |
| 普通 tooltip、toast、质量提示与列表导航条标记 | 实色 | 实色 | 保持高对比，质量提示和导航条标记可以与其他浮层同时出现。 |

浅色与暗色的云母色、亚克力模糊和不透明度是适配词典界面的 Web 参数。材质分工参考 Windows 的 Mica、Acrylic 和 Smoke。圆角沿用 Windows 11 的 4px 控件、8px 容器取值，详情分区采用 Fluent 2 的 8px 间距。 [Windows 材质](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/materials) · [Windows 11 圆角](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/geometry) · [Fluent 2 布局](https://fluent2.microsoft.design/layout)

亚克力以实色表面为基础，在浏览器支持 backdrop blur 且允许透明材质时增强。采样优先给最前方的弹窗或词汇网络，其次是最前方的菜单，再其次是当前输入框的来源建议和独立的结构化 tooltip。下层浮层使用实色，常驻 backdrop blur 为零，临时 backdrop blur 最多一层。背景亮度和饱和度均为 100%。底色上平铺 96 × 96 的静态噪点，像素不透明度上限为浅色 8/255、暗色 4/255。移动抽屉沿用独立遮罩。

## 选中、按压与焦点

- 导航当前项、词条当前卡片和语料选中行以浅强调底配左侧 3px 圆角标记。标记复用组件的现有选中状态，无独立焦点或命中区域。导航与 WinUI 的左侧选中标记方向一致。 [Windows NavigationView](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/navigationview)
- 详情悬浮使用轻微强调底和较强细边，局部编辑用强调色描边。焦点环沿用共享方案，导航使用与画布匹配的强调色。
- 独立描边和实色按钮以填充、边框区分悬浮与按下，按压时把较深的边移到顶边。词条工具栏沿用平面按钮配方。导航按压以填充反馈。
- 控件过渡、应用 tooltip 和词汇网络入场采用 150ms，toast 采用 160ms。浮层入场位移最大 3px。 [Fluent 2 动效](https://fluent2.microsoft.design/motion) · [Fluent UI durationFast](https://github.com/microsoft/fluentui/blob/master/packages/tokens/src/global/durations.ts)

## 辅助模式与验收

- 禁用透明材质或浏览器不支持 backdrop blur 时，菜单、弹窗和结构化提示使用同角色的实色填充。强制颜色使用系统色描边、`Highlight` 选中标记和实色动作配色。减少动态时，皮肤的控件过渡与浮层位移动画关闭。
- 使用临时词典覆盖中英文、明暗、320／480／768／1024／1440px，以及桌面展开栏、窄轨与移动抽屉。用长词典名、工具名、标签、筛选名和形态表格检查截断、换行和画布层次。
- 检查键盘焦点、按钮状态、浮层与 tooltip 层级、叠加确认框、辅助模式与三皮肤切换。检查浅色和暗色亚克力上的正文与次要文字对比度，并核对常驻和临时模糊数量。
- 在 320px 和桌面宽度下用 2 万词条的临时词典检查窗口化滚动、重复开关浮层与合成开销。
- 样式契约由 `node scripts/check-style-contract.js` 验证。浏览器计算样式和控件对照页补充视觉及交互检查，待验收项统一记在 [实施交接](../NEXT_IMPLEMENTATION_HANDOFF.md)。
