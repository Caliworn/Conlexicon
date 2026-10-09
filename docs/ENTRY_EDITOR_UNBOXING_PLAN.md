# Entry Editor Unboxing Plan / 词条编辑去框化设计草案

状态：设计草案（2026-10-05），已做一次独立复评（第 8 节）。2026-10-09 用户确认 D1–D8 按建议执行，D9 留到 U4 再定；U1、U2 已实装（2026-10-09），U3–U5 待实施。

本文设计完整编辑（`#entryForm`）和局部编辑（`.inline-partial-edit-form`）的去框化，使编辑态沿用词条详情已有的分区分隔接口（[Style Skin Plan](STYLE_SKIN_PLAN.md)“词条详情分区分隔接口”），各皮肤只换材质，不另写结构。本文不改变保存范围、数据模型、未保存检查、API 和字段 `data-field` 契约。

## 1. 现状（已由当前实现确认）

### 1.1 完整编辑的框层级

| 层 | 选择器 | 当前外观 | 来源 |
| --- | --- | --- | --- |
| 1 | `#entryForm.editor-panel` | 面板底、边框、圆角、阴影；层叠／液态改用 `--material-entry-detail-*` 外壳 | `styles.css` `.editor-panel`；`theme-layered-glass.css`、`theme-liquid-glass.css` `:where(#entryForm)` |
| 2 | `.definition-editor`（释义、词源、衍生、形态、备注五个 section） | 1px `--ui-border` 边框、16px 内边距、面板与画布 90% 混合底 | `styles.css` `.definition-editor` |
| 3 | `.definition-form-card`、`.entry-morphology-group-card` | 再一层 1px 边框和面板底 | `styles.css` |
| 4 | `input` / `textarea` / `select`、形态覆盖表单元格内的 `input` | 控件边框与底 | `styles.css` 通用控件规则 |

- 词形、发音、标签三个基础字段直接放在外壳里，没有 section，和下方五个带框 section 视觉层级不一致。
- 删除词条按钮放在表单标题右侧，与保存／取消分处两端。
- 完整编辑的 section 不消费分区分隔 token，因此三套皮肤的编辑表单内部完全相同，只有外壳不同；而详情视图在 2026-10-01 已按皮肤区分分区。

### 1.2 局部编辑

- 进入时给宿主分区加 `.partial-editing`，隐藏宿主所有非表单子元素，再追加 `.inline-partial-edit-form`（`app.js` `openPartialEdit`）。
- 宿主分区已经按皮肤显示编辑态（`--material-entry-detail-section-editing-*`），但内部表单又画一层边框、混合底和 `--material-floating-soft-shadow`，即“编辑态分区套一张浮起卡片”。
- 表单自带“局部编辑 / 释义”双行标题，与被隐藏的分区标题重复；取消在标题右侧，保存在底部右侧，分处两处。
- 释义局部编辑复用 `definitionFormCardHtml`，所以层 3 的释义卡片框同样出现。
- 已有快捷键：`Ctrl/Cmd+S` 提交局部编辑或完整编辑。`Esc` 当时不取消局部编辑（U1 已加入）。

## 2. 设计目标

1. **一套骨架**：详情、完整编辑、局部编辑共用同一分区几何和分隔 token。查看 → 编辑切换时，分区位置、标题和间距尽量不跳动，只把内容换成字段。
2. **框预算**：任何字段离外壳最多三层：外壳 → 分区（由皮肤决定是卡片、玻璃带还是细线）→ 字段。重复项（释义、形态组）不再加框，用编号槽、细线或间距分隔，与详情视图一致。
3. **字段仍可辨认**：去掉的是容器框，不是输入框边界。字段边界由皮肤以边框、填充或下沿线表达，但必须满足非文本对比度要求（见第 6 节）。
4. **皮肤只换材质**：结构与布局在 `styles.css`；字段、条目分隔、操作栏的外观值作为皮肤 token，由三套皮肤各自完整定义。
5. **行为不变**：`data-field`、`data-action`、`.definition-form-card`、`.entry-morphology-group-card` 等 JS 钩子保留；收集、比较、未保存检查路径不改。

## 3. 结构设计

### 3.1 完整编辑

```
form#entryForm                         外壳（不变：editor-panel / 皮肤 entry-detail 外壳）
  header.entry-editor-header           对应详情标题区；下沿用 --material-entry-detail-header-divider
    eyebrow（新建／编辑）
    词形输入（标题样式）  发音输入 + 自动 IPA  IPA 键盘
    标签输入 + 帮助文本
  section.display-section.entry-editor-section[data-entry-form-section=definitions]
    .section-heading 释义                         [添加释义]
    .definition-form-list
      .definition-form-card（无框）  编号槽 1 | 含义 / 例句 / 释义备注 / [+例句][+备注]  [移除]
      细线或间距
      .definition-form-card（无框）  编号槽 2 | …
  section … etymology / derived（只读）/ morphology / notes
  footer.entry-editor-actions          [删除词条]                         [取消] [保存词条]
```

- 五个 `.definition-editor` 改为与详情相同的 `.display-section` 规则（新增 `.entry-editor-section` 只承担编辑态差异，如字段间距）。不加 `data-edit-section`，因此不会得到分区悬浮反馈。
- 分区标题统一为 `.section-heading` 一行，分区级操作（添加释义）放在标题行右侧；不再使用 `form-heading compact-heading` + `eyebrow` 的组合。
- 备注分区的 label 与分区标题重复，标题行承担标题，textarea 用 `aria-labelledby` 指向标题。

### 3.2 词形标题输入

- 词形输入使用详情标题的字体族和接近的字号（建议 `clamp(1.6rem, 3vw, 2.4rem)`，比详情略小，给输入留余量），使完整编辑的头部和详情头部对齐。
- 仍保留字段边界（第 4 节字段材质），不做“看起来像纯文字”的无边界输入；可见 label 改为视觉隐藏但保留可访问名称。是否保留可见 label 列为开放决策 D2。

### 3.3 释义条目

- 复用详情的 `22px | 1fr` 编号槽网格：编号是纯数字，不再显示“释义 1”粗体标题；可访问名称由 `aria-label="释义 1"` 提供。
- 移除按钮移到条目右上角，改为紧凑图标按钮（保留 `danger/tinted` 语义和文字 tooltip）；只有一条释义时仍隐藏。
- 条目之间使用新 token `--material-entry-editor-item-divider`：经典与层叠为间距 + 细线，液态只用细线。
- 例句字段不加详情中的浅色例句底块：编辑态的例句已经是字段，再加底块会形成第 4 层。

### 3.4 形态分区

- `.entry-morphology-group-card` 去掉边框和底，组之间用 `--material-entry-editor-item-divider` 分隔，组标题行沿用现有 heading 结构。
- 形态覆盖表保留表格网格（它是数据表，不是容器框）；单元格内的覆盖输入去掉独立边框，由表格单元格线界定，聚焦时显示焦点环。这一项需单独验证密集表格中的焦点与占位文字可读性。

### 3.5 操作栏

- 删除、取消、保存合并到底部 `.entry-editor-actions`：删除靠左（危险操作与保存拉开距离），取消、保存靠右。
- 操作栏在完整编辑中 `position: sticky; bottom: 0`，长表单时保存始终可达；材质用新 token `--material-entry-editor-actions-{surface,edge,filter}`。是否吸底列为开放决策 D3。
- 移动端（应用外壳 drawer 布局）吸底时须避开移动底栏和软键盘；如无法稳定避开，移动宽度退为普通流内操作栏。

### 3.6 局部编辑

```
section.display-section.partial-editing[data-edit-section=definitions]   皮肤编辑态（不变）
  .section-heading 释义   · 编辑中                                       ← 保留可见
  form.inline-partial-edit-form（无框、无底、无阴影）
    .partial-edit-body    与完整编辑同一字段结构
    .form-actions                                       [取消] [保存]
```

- 局部编辑表单去掉边框、背景、阴影和 `margin-top`；分区本身的编辑态 token 已经承担“正在编辑”的反馈，不再叠一张浮起卡片。
- 去掉表单内重复的“局部编辑 / 释义”标题：进入编辑时保留分区原有标题行，只隐藏内容；标题旁加一个小型“编辑中”状态文字（`aria-live` 不需要，表单可访问名称取自标题与状态，如“释义 编辑中”）。实现上需要把 `.partial-editing > :not(.inline-partial-edit-form)` 的隐藏规则收窄为不隐藏 `.section-heading`；词条标题区（`basic`）在详情中没有分区标题，编辑时在表单顶部补一行同样的标题行“基本信息 · 编辑中”（2026-10-10 用户确定名称）。
- 取消和保存合并在表单底部右侧。
- 新增 `Esc` 取消局部编辑（焦点在表单内、无输入法组字、没有打开的建议列表或弹层时）；无改动时直接取消；有改动时总是弹出“保存 / 放弃更改 / 取消”，不跟随词典的离开时处理设置（D4）。
- 局部编辑与完整编辑共用字段、条目分隔和操作栏规则，局部编辑的操作栏不吸底。

## 4. 皮肤映射

| 元素 | 经典 | 层叠玻璃 | 液态玻璃 |
| --- | --- | --- | --- |
| 外壳 | 面板（不变） | 玻璃外壳（不变） | 一整片焦点玻璃（不变） |
| 分区 | 带边框的分区卡片（复用详情 token） | 无边框半透明玻璃带，上沿高光（复用） | 细线分隔，向两侧外扩（复用） |
| 局部编辑分区 | 强调色边框 + 焦点环（复用 editing token） | 玻璃带变亮 + 强调色描边（复用） | 强调色浅底 + 描边（复用） |
| 字段默认 | 1px 边框 + 面板底（等同现状） | 无边框的较实玻璃填充 + 1px 下沿线 | 浅填充（复用现有 `--material-entry-detail-section-background` 字段材质）+ 弱边框 |
| 字段悬浮 | 边框加深 | 填充变亮、下沿线加深 | 填充略加深 |
| 字段聚焦 | `--ui-focus` 边框 + 焦点环（不变） | 同左，不改共享焦点环 | 同左 |
| 重复项分隔 | 12px 间距 + 细线 | 10px 间距 + 半透明细线 | 细线 |
| 操作栏 | 面板底 + 上沿细线 | 玻璃带 + 上沿高光 | 外壳内细线；吸底时为紧凑浮层玻璃 |

经典皮肤的字段外观刻意保持现状，去框化只体现在容器层减少；视觉差异主要由两套玻璃皮肤承担。

## 5. Token 接口（草案）

沿用分区分隔接口的例外原则：这些值决定皮肤外观，由三套皮肤分别完整定义，`styles.css` 只消费。

| Token | 用途 |
| --- | --- |
| `--material-entry-editor-field-{surface,outline,edge}` | 编辑表单字段默认材质 |
| `--material-entry-editor-field-hover-{surface,outline,edge}` | 字段悬浮 |
| `--material-entry-editor-item-divider` | 释义条目、形态组之间的分隔线（`transparent` 表示只用间距） |
| `--material-entry-editor-item-gap` | 重复项间距 |
| `--material-entry-editor-actions-{surface,edge,filter}` | 操作栏材质 |

- 字段 token 在 `:is(#entryForm, .inline-partial-edit-form)` 作用域内映射为 `--material-control-background/border/shadow`，从而继续走通用控件规则；聚焦态仍用共享 `--ui-focus` 和 `--ui-focus-ring`，不新增焦点 token。
- 液态玻璃现在在全局把文字输入映射到 `--material-entry-detail-section-background/-border`；本方案让它的编辑表单字段 token 引用同一对值，不改写全局映射，也不改写这两个 token。
- 只在 `styles.css` 消费，不在共享文件中写任何皮肤字面量；样式契约检查需扩展为检查这组 token 在三套皮肤的明暗作用域中都已定义、且共享规则只消费 token。

## 6. 可访问性与降级

- **字段边界对比度**：字段的可辨识边界（边框、下沿线或填充与相邻背景之间）对相邻颜色至少 3:1（WCAG 1.4.11）。层叠玻璃的“下沿线”和液态的弱边框需要实测；不达标时加深线色，而不是取消边界。
- **减少透明度 / 不支持 blur**：两套玻璃皮肤的字段与操作栏退为实色填充 + 1px 边框，与现有分区降级路径一致。
- **强制高对比**：所有字段恢复 `CanvasText` 边框，操作栏使用 `Canvas` 底和 `CanvasText` 上沿线；分区编辑态用 `Highlight`。
- **键盘**：Tab 顺序与 DOM 顺序一致（删除按钮在操作栏左侧，位于取消与保存之前），移除释义的图标按钮保留可见焦点环和可访问名称；`Esc` 取消（D4）。
- **触屏**：移除按钮在 `hover: none` 下常驻显示，不依赖悬浮露出。

## 7. 响应式

- >640px：释义编号槽 22px；发音字段与“自动 IPA”同行。
- ≤640px：沿用现有断点，`.inline-field-action` 已在此改为单列，自动 IPA 落到字段下方；`.form-actions` 按钮已均分宽度，操作栏中删除单独占一行。
- <480px：编号槽缩为 18px。
- 320px：分区内边距由皮肤 token 控制，不得出现横向滚动；形态覆盖表继续在 `.morphology-table-scroll` 内横向滚动。

## 8. 独立复评

把第 2–7 节当作外部提案重新检查：

1. **字段本身也去框？** 初稿曾考虑液态玻璃字段只留下划线。复评认为这会损害可辨识性，且下划线在玻璃底上很难稳定达到 3:1；修正为“去容器框，保留字段边界”，字段只在材质上随皮肤变化。
2. **是否需要新 token？** 备选方案是直接在编辑作用域内覆盖 `--material-control-*`。但覆盖值属于皮肤，按文件边界只能写在皮肤文件里，结果仍是每套皮肤各声明一组值；命名为 `--material-entry-editor-*` 能让样式契约逐项检查，故保留，但把数量压到第 5 节的最小集合，不为聚焦、禁用另设 token。
3. **完整编辑复用 `.display-section` 的耦合风险**：详情分区规则一旦改动会同时影响编辑态。这正是“一套骨架”的目标；风险由 `[data-edit-section]` 只出现在详情中来隔离悬浮反馈。保留。
4. **吸底操作栏**：收益是长表单可达，代价是移动端底栏与软键盘冲突、液态玻璃新增一块光学表面。收窄为桌面与平板吸底、移动宽度可退回流内，并在第 9 节请用户确认；液态吸底时不注册新的光学角色，只用浮层材质 token。
5. **词形标题输入**：可能让新建词条时输入框过大。收窄为比详情标题小一档，且新建与编辑相同，不做所见即所得的无边界输入。
6. **局部编辑保留分区标题**：需要改隐藏规则，`basic` 分区是例外。改动面小，收益是去掉重复标题并减少切换跳动，保留。
7. **形态覆盖表单元格去框**：密集表格里只靠单元格线可能让占位文字与已填值难区分（占位文字是自动生成的默认形态）。保留方案，但作为独立阶段 U4，验收不过就回退为保留单元格输入边框。
8. **与例句语料引用计划（阶段 C）的关系**：[Example Corpus Link Plan](EXAMPLE_CORPUS_LINK_PLAN.md) 会改变例句编辑方式。本方案只调整例句字段的容器，不预设其未来交互；阶段 C 实施时沿用本方案的条目结构即可。

## 9. 设计决策

2026-10-09 用户确认 D1–D8 按下表建议执行；D9 待 U4 时决定。D6–D9 是绘制分皮肤对照图时补充的决策。

| 编号 | 问题 | 结论 |
| --- | --- | --- |
| D1 | 经典皮肤是否也改字段外观？ | 不改，只减少容器层；字段差异由玻璃皮肤承担 |
| D2 | 词形标题输入是否保留可见“词形” label？ | 保留一行小号 label，避免新建空词条时不知该填什么 |
| D3 | 完整编辑操作栏是否吸底？ | 桌面／平板吸底，移动宽度流内 |
| D4 | 局部编辑 `Esc` 取消且有改动时，是否先弹“保存 / 放弃更改 / 取消”？ | 弹；无改动时直接取消 |
| D5 | 删除词条移到底部操作栏左侧是否可以？ | 可以，与保存拉开距离并保留 danger 确认弹窗 |
| D6 | 层叠玻璃字段样式 | 无四边边框的较实填充 + 下沿线；浏览器实测边界对比度不足 3:1 时退回四边弱边框 |
| D7 | 液态玻璃吸底操作栏 | 紧凑胶囊，只用浮层材质 token，不注册新的光学角色 |
| D8 | 释义条目标识与移除按钮 | 只显示编号（可访问名称“释义 N”）；移除改为图标按钮，文字放入 tooltip |
| D9 | 形态覆盖表单元格去框 | 待定：U4 作为实验，验收不过则保留单元格输入边框 |

## 10. 分阶段实施

| 阶段 | 内容 | 主要文件 |
| --- | --- | --- |
| U1（已完成 2026-10-09） | 局部编辑去框：表单去边框／底／阴影，保留分区标题与“编辑中”，合并操作按钮，`Esc` 取消 | `styles.css`、`app.js` `openPartialEdit`、键盘处理 |
| U2（已完成 2026-10-09） | 完整编辑骨架：基础字段进标题区，五个 section 改用分区规则，标题行统一，操作栏合并（暂不吸底） | `index.html`、`styles.css` |
| U3 | 释义与形态组条目去框：编号槽、图标移除按钮、条目分隔 token | `app.js` `definitionFormCardHtml`、`renderEntryMorphologyGroupEditor`、`styles.css`、三套皮肤 |
| U4 | 字段材质 token 与形态覆盖表单元格去框；降级与高对比路径 | 三套皮肤、`styles.css`、样式契约检查 |
| U5 | 操作栏吸底（按 D3） | `styles.css`、皮肤 token |

每阶段完成后更新 `CHANGELOG.md`，U4 完成后把有效契约迁入 [Style Skin Plan](STYLE_SKIN_PLAN.md) 的分区分隔接口一节，全部完成后删除本文。

## 11. 验收

- 行为：新建、完整编辑、五类局部编辑的保存、取消、未保存检查（含三选项取消中断）、`Ctrl/Cmd+S`、来源自动补全、IPA 键盘插入、添加／移除释义、可选字段展开、形态手动／自动切换与组排序均与改动前一致；`check-editor-saves.js` 与 `node scripts/check-all.js` 通过。
- 层级：浏览器中抽查任意字段到外壳之间带边框或背景的祖先不超过一层（分区）。
- 视觉：三套皮肤 × 浅色／深色 × 中文／英文；长词形、长标签、长来源、多释义（≥10）与多形态组；320／480／768／1024／1440px；减少透明度、无 blur、强制高对比；字段边界对比度实测记录。
- 交互：键盘 Tab 顺序、焦点环、`Esc`、tooltip 与确认弹窗层级；触屏下移除按钮常驻；查看 ↔ 局部编辑切换时分区不跳位。
- 无法完成的项按 `AGENTS.md` 在回复和交接中逐项列出。
