# Conlexicon 下一阶段实施交接

本文供新的开发对话直接接手，记录当前完成状态和以下后续工作：

1. 已完成的基础 UI 外壳与暂缓的触摸/焦点/无障碍专项。
2. 已默认 SQLite 的保存读取接口、查询会话和窗口化，以及剩余查询消费者的 API 化。
3. 将词条例句迁移为对语料单元的链接。
4. 重做语料库 UI，形成适合文本语料和未来多媒体时间轴的工作区。

## 1. 仓库与当前状态

- 仓库：`Caliworn/Conlexicon`
- 本地路径：`C:\Users\scheh\Documents\Conlexicon`
- 当前主要文件：`index.html`、`styles.css`、`app.js`、`server.js`、`README.md`
- 当前后端：无外部依赖的 Node HTTP 服务。
- 当前存储：`data/index.json` 加每词典一个 `data/dictionaries/*.sqlite`；旧 JSON 仅通过显式导入、导出或只读目录迁移工具使用。
- 如果有尚未提交的变更，接手时必须先检查 `git status` 和 diff，并提醒用户，不得回滚。
- 长期工作流、验证命令、changelog 规则和不得回归的工程约束见 `AGENTS.md`。

## 2. 不得回归的现有约束

长期约束已迁移到 `AGENTS.md`。接手阶段性工作时先阅读 `AGENTS.md`，再阅读本文后续阶段规划。

## 3. 推荐实施顺序

建议严格分阶段，避免同一提交同时改变页面外壳、存储主模型和语料迁移。

### 阶段 A：基础应用外壳（核心已完成）

可收起导航、可收起词条列表和移动端抽屉已完成。此阶段剩余内容仅是独立的 A+ 触摸、焦点与无障碍专项，不与语料内容区重做混合处理。

### 阶段 B：数据访问层与索引（核心已完成）

前端已通过 HTTP API 与具体文件读写解耦，SQLite 已是默认主存储。静态字段和动态形态的严格/fuzzy 搜索 projection、查询会话、纯滚动数据窗口、列表 summary DTO、按需词条详情、词根模式、词汇关系 API、高级筛选 F0–F3、F4a 轻量分析查询，以及 F4b-1 IPA 自动生成比较结果会话均已接入。阶段 B 的下一步是 F4b-2 IPA 分布迁移，随后以共享 morphology model 完成 F4b-3 正式形态分析，再由 F5 质量 API 接管质量检查。词根家族排行直接消费稳定后端拓扑，不进入 feature session。所有后续语料功能继续只依赖稳定 API，不直接依赖 JSON 或 SQLite。

### 阶段 C：例句链接迁移

在实体 ID、事务和 repository 接口稳定后，把旧 `definition.example` 自动迁移为独立语料单元和引用。

### 阶段 D：语料库工作区重做

最后在稳定的查询、顺序和链接 API 上构建文本轨道和未来多媒体时间轴 UI。

## 4. 阶段 A：基础 UI 更新

### 4.1 目标布局

桌面宽屏：

```text
[全局工具导航] [词条列表] [主编辑/查看区]
```

桌面中等宽度：

```text
[强制收起的图标导航栏] [可收起词条列表] [主编辑/查看区]
```

竖屏移动端：

```text
[紧凑应用栏：菜单 | 当前模块 | 列表 | 主操作]
[主编辑/查看区]
```

- 全局工具导航在移动端成为左侧覆盖抽屉。
- 词条列表成为单独的列表/搜索抽屉。
- 选择词条后关闭列表抽屉并立即显示详情，不再要求滚动到列表底部。
- 抽屉内容独立滚动，页面主体保持自己的滚动位置。
- 语料列表暂不套用最终设计；只接入通用外壳，具体列表等待阶段 D。

### 4.2 状态模型（已实装）

当前应用外壳使用独立的进程 UI 状态，核心字段如下：

```js
const shellState = {
  navCollapsed: false,
  wideNavCollapsed: false,
  navDrawerOpen: false,
  browserCollapsedByView: {},
  browserDrawerOpen: false,
};
```

- 这些状态不写入词典数据。
- 响应式自动折叠和宽屏用户手动折叠已经分开：中等宽度强制使用 rail，宽屏只读写 `wideNavCollapsed`，不会互相覆盖。
- 切换词典时可以保留全局导航状态，但词条列表抽屉应关闭。
- 打开/关闭抽屉不是数据页面切换，不应触发保存弹窗。
- 在抽屉中选择新词条或新模块时，仍必须经过现有未保存处理流程。

### 4.3 DOM 和 CSS 边界

- 应用外壳已经使用稳定区域：`app-nav`、`view-browser`、`view-content`、`mobile-app-bar`。
- 当前使用 CSS class 和 `data-*` 表达状态，例如：

```text
data-nav-state="expanded|rail|drawer"
data-browser-state="expanded|collapsed|drawer"
```

- 桌面收起导航后只显示图标，并使用应用内 tooltip 和可访问名称。
- 导航使用现有内联图标体系，不另用文字圆角块代替常见图标。
- 词条详情没有复制到移动端专用 DOM；同一内容区通过布局状态响应。
- 避免只依赖 viewport 宽度；主工作区可考虑 container query，使 Electron 窗口和网页嵌入都能正确响应。

当前主断点如下；后续仍应以内容是否可用为准：

- 宽屏：约 `>= 1280px`。
- 中等宽度：约 `800-1279px`。
- 抽屉模式：约 `< 800px`。

### 4.4 交互与可访问性

- `Escape` 先关闭最上层抽屉或弹窗。
- 抽屉打开后锁定背景交互；完整焦点陷阱、触摸替代交互和无障碍专项见阶段 A+。
- 所有收起按钮提供 `aria-expanded`、`aria-controls` 和中英文 tooltip。
- 抽屉打开时不能破坏虚拟列表测量；容器从隐藏变为可见后要重新测量可见高度。
- 选择虚拟列表条目后，详情定位、词根模式多来源实例和高级筛选返回方式必须保持正确。

### 4.5 阶段 A 验收

- 竖屏首次进入词条编辑时可直接看到词条详情或空状态。
- 无需滚过完整列表即可打开任意词条。
- 中等宽度工具导航固定为图标栏且不显示手动开关；词条列表仍可单独收起。
- 抽屉内搜索、排序、词根模式和高级筛选正常。
- 完整/局部编辑未保存时，从抽屉切换词条或模块仍正确提示。
- 320、480、768、1024、1440px 下无不可访问操作。
- 深色模式、中英文和长工具名称均测试通过。

### 4.6 当前收尾状态

- 基础应用外壳、桌面导航收起、词条列表收起、移动端顶部应用栏、工具导航抽屉和词条列表抽屉已经实装。
- 触发标签、词性、高级筛选和数据分析“当前搜索命中”等词条结果入口时，移动端会打开词条列表抽屉，桌面端会展开已收起的词条列表。
- 词条列表隐藏或抽屉关闭时触发跳转/保存后，会记录待聚焦词条，并在列表重新显示后滚动到当前词条。
- 移动端抽屉打开时，通用确认弹窗层级高于抽屉。
- 已抽查 320、480、768、1024、1440px 基础布局；320px 下抽屉筛选入口与未保存确认流程已抽查。
- 主要页面区域、词条编辑/详情和筛选排序控件已有中英文无障碍名称；完整焦点陷阱、触摸替代和系统性无障碍验收仍属于 A+。
- 阶段 A 收尾不包含阶段 A+ 的完整触摸、焦点陷阱和无障碍专项。

## 4A+. 触摸、焦点管理与无障碍专项（阶段 A 之后，暂不纳入阶段 A 收尾）

本专项不作为当前阶段 A 收尾条件。建议在阶段 B 或阶段 C 完成后再集中处理，避免把触摸、hover、右键、弹窗、抽屉和焦点管理拆成零散补丁。

### 4A+.1 目标范围

- 触摸设备没有可靠 hover，也不应依赖右键；需要为 hover-only 信息和右键菜单提供触摸替代入口。
- 宽屏平板可能满足桌面宽度，但交互仍是触摸；布局断点和输入能力判定应分开处理。
- 抽屉、modal、tooltip、popover、右键菜单和质量问题详情卡片需要统一考虑层级、关闭行为和焦点返回。
- 阶段 A 当前只要求基础布局和抽屉可用；完整触摸、焦点和无障碍体验在本专项完成。

### 4A+.2 输入能力判定

- 宽度只决定布局，不应单独决定交互方式。
- 触摸交互应结合媒体能力判断，例如 `hover: none`、`pointer: coarse`。
- `hover: hover` + `pointer: fine` 使用桌面鼠标交互。
- `hover: none` + `pointer: coarse` 使用触摸交互。
- 对混合设备保留显式按钮入口，避免只依赖 hover、右键或长按。

### 4A+.3 交互分类规则

先盘点所有交互对象是否具有左键、右键、悬浮三类行为，再决定触摸替代方式：

- 主操作（左键点击）：触摸端直接点击。
- 上下文菜单（右键）：触摸端可用长按触发，但关键操作最好同时提供显式“更多”按钮。
- 说明信息（hover tooltip）：触摸端优先点击显示 tooltip/popover，不使用长按。
- 状态反馈（hover highlight）：触摸端通常不需要适配；只有承载必要信息时才提供替代入口。

设计原则：

- 右键菜单只能作为已有对象主操作的扩展，不应成为唯一入口。
- 如果一个对象没有左键主操作，就不应只有右键操作。
- 如果一个对象只有 hover 信息，没有左键/右键，则触摸端改为点击显示信息。
- 不要把右键和悬浮统一绑定到长按；长按更适合作为上下文菜单，不适合作为说明信息。

### 4A+.4 重点对象建议

- 词条卡片：点击选择词条；桌面右键打开操作菜单；触摸端长按或“更多”按钮打开操作菜单。
- 质量问题小卡片：桌面 hover 显示详情；触摸端点击显示详情；应阻止 contextmenu/longpress 冒泡到词条卡片右键菜单。
- 高级筛选绿色标签和长文本：桌面 hover 显示完整文本；触摸端点击显示轻量 popover，不用长按。
- 省略标签 chip：触摸端点击显示隐藏标签列表或标签信息，不参与词条卡片右键菜单。
- 工具导航和抽屉菜单：抽屉内保留图标 + 文字；中等宽度图标栏保留 tooltip 和可访问名称。
- 设置 info 按钮：点击打开说明弹窗；tooltip 只用于短说明，不承载复杂规则。

### 4A+.5 触摸命中区域

- 触摸设备上，所有可点击、可长按或可打开浮层的目标都应有不小于约 44×44 CSS px 的有效命中区域。
- 视觉尺寸可以小于命中区域，但扩大命中区不能覆盖相邻目标或造成误触。
- 图标按钮建议按钮盒子保持约 40–44px，图标本身可保持 18–24px。
- 可交互 chip、质量问题卡片和省略标签应增加 padding 或外层命中区。
- 卡片内小控件触发自身行为时应阻止冒泡，避免同时触发词条选择或卡片上下文菜单。

### 4A+.6 焦点管理和无障碍

- modal 应高于抽屉并接管焦点；关闭后焦点返回触发对象或合理的上下文位置。
- 抽屉打开时应限制背景焦点；关闭后焦点返回打开抽屉的按钮。
- popover/tooltip 从点击触发时，需要支持点击外部、再次点击、Escape 关闭。
- Tab / Shift+Tab 不应进入被遮罩的背景区域。
- 触摸目标放大后，键盘焦点样式应跟随真实可交互外层，而不是只画在内部图标或文字上。
- 屏幕阅读器语义应覆盖抽屉、modal、菜单和信息按钮的角色、名称与展开状态。

### 4A+.7 验收建议

- 触摸端能完成核心流程：打开工具抽屉、打开词条列表、选择词条、新建词条、执行筛选、退出高级筛选。
- 不依赖 hover 或右键才能发现关键功能。
- 长按、点击、滚动不会互相抢事件。
- 抽屉、modal、popover、右键菜单层级稳定，关闭顺序可预测。
- 320、480、768、1024、横屏平板宽度下检查触摸命中区和误触。

## 5. 阶段 B：保存读取接口、SQLite 与索引

### 5.1 Repository 边界（已建立）

前端不感知后端文件结构；`server.js`、API 路由与 SQLite repository 的边界已经建立。后续扩展继续沿该边界增加细粒度能力，不把 SQL 或旧 JSON 形状泄露给前端。

代表性的核心接口如下：

```js
class DictionaryRepository {
  listDictionaries() {}
  getDictionaryMeta(id) {}
  getDictionarySnapshot(id) {}
  queryEntries(id, query) {}
  getEntry(id, entryId) {}
  saveEntry(id, entry, options) {}
  saveCorpusChanges(id, changes, options) {}
  exportDictionary(id) {}
  importDictionary(snapshot, options) {}
}
```

当前进度：

- 已建立 `SqliteDictionaryRepository`、词典模型规范化模块、API 路由模块、HTTP 工具模块和静态文件服务模块；`server.js` 只负责组装 SQLite repository、路由、静态服务并启动服务。
- `server.js` 运行期只使用 SQLite repository；旧 JSON runtime repository 和 `CONLEXICON_REPOSITORY` feature flag 已移除。
- 当前 API 契约记录在 `docs/API_CONTRACT.md`。该文档是前后端接口边界的长期参考；本文只记录阶段状态和后续计划。
- 普通运行期保存已基本迁移到词条级、模块级或批量 patch API：新建/完整编辑/局部编辑/删除词条走词条级 API；其他设置、语言文档、语料库、自动形态学、自动 IPA、自动整理标签顺序和批量 IPA 生成走模块级或批量词条 API。
- 词典管理的名称、语言和描述保存已改用词典元数据 API；页面卸载时的文档/语料自动保存兜底统一走 autosave 入口。
- 后端 API 错误已改为结构化错误码；前端保存、导入、词典切换和偏好保存等路径会显示本地化短 toast，控制台保留原始技术错误。
- `GET /api/dictionaries/:id` 仍按需读取当前词典完整快照；完整快照 PUT 和 repository 的整库写入兼容方法已移除。导入和导出继续使用各自的完整 JSON 边界。`GET /api/state` 已是轻量 payload，不属于完整快照路径，但其 `rootCount` 在冷启动时仍可能建立稳定词根拓扑。
- repository 不再提供伪细粒度的 `queryCorpusUnits()` / `getCorpusBlock()`；语料库 UI 仍以整份 corpus 模块保存为主。真正的语料读取 API 等语料块、层和单元 SQL 模型确定后重新设计。

### 5.2 SQLite 化方向

SQLite 已是默认主存储。真实 schema、当前状态审计和后续优化建议见 `docs/SQLITE_BACKEND_PLAN.md`；迁移策略、JSON 导入/导出 profile 和回滚策略见 `docs/SQLITE_MIGRATION_PLAN.md`。本文只保留接手时需要知道的阶段状态：

- 正式运行期方向是全面 SQLite 化，不设计 JSON/SQLite 存储分流；`index.json` 继续只保存当前词典、词典 ID 列表和 UI 偏好。
- 旧 JSON 词典暂时通过词典管理界面的 JSON 导入功能手动迁入 SQLite；产品内自动迁移向导暂缓。
- 旧 JSON 只保留为导入、导出和目录迁移格式；目录迁移脚本直接只读 `index.json` 与词典文件，再交给 conversion service 和 legacy migration。
- SQLite repository 跑完整当前主契约；模型、旧 JSON 转换和目录迁移分别运行定向检查，不再维护第二套 runtime repository contract。
- 当前 SQLite 写入已是 SQL 增量写入；词典元数据、设置、IPA、文档、语料、形态、单词条和批量 patch 的普通响应均已收窄。autosave 必须携带 docs 或 corpus；携带两者时会合并两个局部保存结果。
- 形态学结构化 schema 见 `docs/SQLITE_BACKEND_PLAN.md` 5.4：模板组/子表/单元格/词条形态组/override 已 SQL 化；共享 `morphology-model` 已使用当前 `templateGroups` / `morphologyGroups` 结构，旧形态结构迁移集中在 `lib/legacy-dictionary-migration.js`。同一词条不能重复实例化同一模板组，`entry_morphology_groups` 以 `entry_id + template_group_id` 为组合主键，override 使用同一组合外键，不再分配 `emorph` UUID。`notes` 已作为词条实例备注接入 SQL、导入导出和详情展示；模板组 `notes` 不应出现在词条详情或词条编辑。SQLite 读取与导出已停止回吐旧 `morphology.tables` / `entry.morphology`；**形态表格**页面现按模板组编辑，支持可编辑的组标题、自动匹配标签、空组、组内多个子表、各级排序和独立的子表尺寸。词条完整/局部编辑已使用正式的词条级多组/多子表 override 视图。导航栏已拆为独立的**形态函数**与**形态表格**页面，前者单独保存函数配置，为 DSL 配置预留。旧 `leftV/rightV` 设置暂留 `module_blobs.morphology`，函数、集合和 DSL 源码后续不做函数级主表，生成结果、AST 和诊断只作为派生缓存或索引。
- 词条形态已切换为 `morphologyMode: auto | manual`：`auto` 由自动规则决定模板组，`morphologyGroups` 仅作为按真实 `templateGroupId` 查找的 overlay；`manual` 按形态组 position 决定展示顺序，空列表即明确不使用形态。自动转手动会将当前自动结果按自动顺序实体化，并在其后保留 dormant overlay；手动转自动须确认并放弃手动配置。SQLite `entries.morphology_mode`、repository 读写、词条 API、共享解析和形态搜索均已接入。完整编辑和局部编辑已改为正式的多组/多子表 override 视图，支持标题 override、词条形态备注、自动 overlay、手动增删组与排序。**已知清债项：数据分析的旧形态统计仍在 `app.js` 通过临时派生的旧式 `morphology.tables` 视图和 `entry.morphology` 读取；它不参与持久化，但无法表达当前多组、多子表和 nested override 语义。后续升级数据分析（以及若质量检查未来加入形态规则时）必须改为直接调用 `morphology-model.resolveEntryMorphologyGroups()` / `morphologyCellValue()`，然后删除该临时视图和全部旧字段读取。**旧 JSON 的 `entry.morphology`、`templateGroupId: "auto"` / `"none"` 只在 `legacy-dictionary-migration` 导入阶段转换；核心模型、repository 与前端持久化路径不再解释旧字段。**不为既有 SQLite schema 写运行时迁移，旧 SQLite 测试库需从 JSON 重新导入。**后续可单独处理表格行列可视化编辑、结构操作下 override 坐标语义和自动分配 DSL。
- 数据模型升级时只保证旧版本 JSON 能导入并转换成新格式；除非确有必要，不要为了旧前端数据形状额外维护临时兼容层。旧 JSON 字段迁移集中在 `lib/legacy-dictionary-migration.js`，核心 `dictionary-model` 只处理当前形状规范化。前端因新模型出问题时，优先修前端。
- 搜索 projection 已完成第一轮 SQL 接线；候选索引、数据分析/质量检查 API 化、语料 SQL 分表和产品内迁移向导都不是当前 SQLite 主路径的阻断项。
- 搜索字段配置已接入词条列表、词根模式、本地筛选、搜索摘要和搜索字段分析；词典级 `settings.search.fields` 现在是新会话默认值，前端按词典 ID 维护不持久化的运行期字段/fuzzy profile，列表搜索框右侧可以临时调整或恢复默认。数据分析“当前搜索命中字段”直接切换该 profile，不再创建高级筛选。读取 API 现在只接受 `fields` / `fuzzyFields`，旧 `fuzzy` / `tagFuzzy` 参数已删除。`scripts/benchmark-entry-search.js` 可将指定 JSON 词典临时导入 SQLite 后测量搜索模式；`scripts/generate-morphology-stress-dictionary-10k.js` 默认生成带 3×4 自动形态模板和少量 override 的 10k 压力词典，也可用 `CONLEXICON_STRESS_ENTRY_COUNT` 在临时目录生成 30k 等专项规模，不应把大型生成数据提交到仓库。
- `/entries` 的严格和 fuzzy 搜索均按所选字段读取静态 `entry_search_values` 与形态 `entry_morphology_search_values`，承接 ASCII、Unicode、NFC、case folding 和自定义等价规则，并只为当前页回读完整 `searchHits`。没有结构条件时直接扫描目标 projection；存在词性、标签或其他结构条件时，冷会话把结构 SQL 编译为物化候选关系并直接连接两张 projection，不再传回候选 ID、分批执行 `IN (...)` 或由 JS 求交。形态单字段和静态+形态混合查询均不再导出完整 snapshot 或逐词条动态生成形态；fuzzy 由连接级确定性函数复用共享评分语义。词根分组搜索也直接从两张 projection 取得命中 ID，并在独立 relation generation 的稳定词根拓扑上生成查询视图，不再走完整共享 JS 路径；关系分组键保持既有独立语义。
- `scripts/check-entry-search-consistency.js` 验证严格及 fuzzy 的静态/形态 projection 查询均不调用完整 snapshot，并覆盖逐值字段、命中定位、结构筛选、分页、NFC、Unicode case folding 和 PUA 自定义规则。列表查询固定返回摘要 DTO，完整词条由单词条端点按需读取。
- 搜索规范化 S2 已接线：`settings.search.normalization` 支持可选 NFC、Unicode 17 default case folding 和 `{ canonical, variants }[]` 自定义规则；默认严格关闭。词条列表、词根模式、搜索摘要/高亮、搜索字段分析和词源自动补全共用缓存的词典级 normalizer。精确高亮带原文范围映射，可处理 `ß → ss`、NFC 和自定义替换造成的长度变化。标签/词性/形态匹配等结构键不套用自由文本配置；词源关系与 `source_key` 继续保持既有匹配，留待稳定 ID 引用升级。S3.3 已让 SQLite 规范化检索 projection 承接全部非 fuzzy 静态查询。
- 词源自动补全仍在前端当前词典快照上执行，复用 normalizer 和独立的 `etymologyAutocomplete.fuzzy` 开关，但尚未接入 `/entries` projection 与普通列表查询路径；若后续迁移，需保留其前缀优先和 fuzzy 分数排序，而不能直接复用按 lemma 排序的普通列表响应。
- 搜索 S3.1/S3.2/S3.3 已完成逐值 projection 契约、静态写入和查询接线：`entry-search-model.entrySearchValueRecords()` 为词形、IPA、原始/显示标签、各义项释义/例句/备注、词条备注、词源描述/来源和动态形态生成带 `field + sourceType/sourceId/sourcePosition + valueType` 的独立 records，现有 matcher 也从同一 records 聚合字段值。SQLite `entry_search_values` 不分配实体 ID，写入词形、IPA、标签、释义、例句、备注和词源；导入、整库覆盖、单词条保存、批量 patch、删除级联以及规范化/标签替换设置变化均维护该 projection。非 fuzzy 静态查询直接读取 projection 并返回 `searchHits`，前端用其选择命中摘要。没有 schema 版本、旧 SQLite 回填或运行时兼容；测试库需从 JSON 重建。
- 搜索 S4 已建立并查询 `entry_morphology_search_values`：共享 `morphologySearchValueRecords()` 输出真实模板组/子表/行列坐标与求值顺序，SQLite 只写非空原始值和规范化值。导入/整库覆盖、形态模块保存和搜索规范化变化全量重建；词条保存/patch 局部重建；删除通过外键级联；标签显示替换不会误触发形态重建。该表不进入 JSON，未加入 schema 版本或旧库兼容。10k 形态压力词典验收生成 115872 条 records，覆盖 9656 个实际命中形态组的词条，完整 JSON 导入连同全部 SQLite projection 构建约 2737ms。严格及 fuzzy 的形态单字段、静态字段和混合查询均已读取两张 projection；fuzzy 通过连接级确定性函数复用共享评分。`limit=10000`、7 轮独立进程基准中，`body` 的全字段/静态字段 fuzzy 约 251ms/162ms，`bdy` 约 251ms/159ms，形态 fuzzy-only 的 `qna` 约 218ms。fuzzy 仍线性扫描 records，下一阶段是否增加真正候选索引应由真实词典基准决定。
- 读取稳定性与查询缓存 Q1–Q4 已完成：搜索输入采用 250ms debounce（连续输入会重置计时），请求 ID 丢弃过期响应，SQLite 排序使用 ID 作为最终稳定键；前端有紧凑 LRU，后端严格/fuzzy entries 与 root-groups 有运行时会话，并分别为已物化结果维护 `entryId → resultIndex`、`rootId → resultIndex`。普通列表和父级词根组列表区分顺序分页 `nextCursor` 与随机窗口 `windowCursor`，并使用等高占位让滚动条代表完整结果集；远端窗口按需加载并最多保留 5 页，单个词根组展开后一次读取整组衍生词，不再嵌套窗口。

当前前端数据分析已采用按需切片构建和 slice cache。现阶段缓存上限为 24 条 slice 结果，只是防止搜索词、排序、语言或词典版本变化导致缓存无限增长的临时小容量策略，不是长期语义约束。API 化数据分析后，应由 repository/SQLite 索引、服务端 query planner 或更明确的缓存键替代这类前端临时缓存。

质量检查也已有一项前端完整 report 缓存，并与数据分析缓存分离；但两者命中前仍会序列化完整活动词典的相关字段来构造 key，缓存 key 本身仍是 O(N)，首次 miss 也仍运行完整前端算法。因此“已有薄缓存”不等于已经 API 化或消除了大词典扫描。

词根模式已经接入 `/root-groups`，前端正常路径不再本地构建完整词根分组，也不在请求失败时回退前端全量计算。后端以独立 relation generation 缓存与搜索条件无关的 rootId → derivedIds 稳定拓扑，并维护 entryId → rootIds、rootId → group 反向索引；词典摘要计数、无搜索/搜索分组、组内读取和词汇网络关系 API 复用该拓扑。只有词条增删、lemma/来源变化和整库替换会清除拓扑；普通词条保存/patch 只刷新排序记录，其他模块保存不再影响它。Q4 只对父级词根组列表进行窗口加载；展开单组时一次读取该组全部衍生词，子端点不分页。“全部展开”已改为全局状态意图，不再要求全部父级窗口同时加载；父级首窗提供窗口级组数/衍生词数统计来估算展开高度。`all` 模式下可以单独收起词根作为例外，父级淘汰不丢失该状态；全部展开或全部收起会清理上一轮例外。增强型滚动条/词典地图和 marker/overview 数据仍是后续独立设计，不应混入当前原生滚动窗口。

`/api/state` 虽只返回 metadata/summary，但 `summary.rootCount` 同样复用该拓扑；10k 词典冷启动时首次拓扑构建仍可能明显变慢。不要把“轻量 payload”误写成“常数时间读取”，后续应在启动摘要、拓扑预热或更轻计数契约之间单独评估。

### 5.3 阶段 B 验收

- 旧 JSON 中受支持的词条、定义、顺序、语料、设置和文档字段可以导入并按当前结构重新导出。
- 迁移与 roundtrip 检查验证已识别字段的语义等价；未知字段目前不承诺原样保留。
- 同 ID、重复父级、缺失引用会被事务拒绝并给出可理解错误。
- API 层的普通编辑保存不再依赖完整词典 PUT。
- SQLite repository 的普通词条保存不重写整库，且 `saveEntry()` / `deleteEntry()` / `patchEntries()` 响应已收窄；模块保存也只返回各自的局部 payload。
- 当前 10k 压力词典的关键基准结果记录在文档或 benchmark 输出中；只有真实需求出现时再增加更大数据级别的专项基准。
- 失败迁移不会删除或修改原始 JSON。

## 6. 阶段 C：例句迁移为语料单元链接

### 6.1 目标模型

当前定义使用：

```js
{
  id: "def-...",
  meaning: "...",
  example: "...",
  note: "..."
}
```

推荐升级为可支持多个例句的引用：

```js
{
  id: "def-...",
  meaning: "...",
  examples: [
    {
      id: "example-ref-...",
      unitId: "unit-..."
    }
  ],
  note: "..."
}
```

- 例句内容只存于语料单元，引用中不复制正文。
- 语料单元保持干净，不存反向词条引用。
- 反向引用由 repository/索引查询得到。
- 不自动把相同文本的旧例句合并为同一单元，以免错误合并语境和来源。

### 6.2 自动迁移

对每条非空 `definition.example`：

1. 生成新的孤立语料单元 ID。
2. 将原始例句文本逐字写入单元 `content`。
3. 保留创建/更新时间；可在迁移元数据中记录来源 definition ID。
4. 在定义中建立 `examples` 引用。
5. 标记迁移版本，例如 `migrations.exampleCorpusLinks = 1`。
6. 整个词典迁移在单一事务或原子 JSON 写入中完成。

迁移必须幂等：重复打开或重复导入不能再次创建同一批单元。

过渡期建议：

- 读取层同时接受旧 `example` 和新 `examples`。
- 新保存只写新模型。
- 如需旧版兼容导出，可在导出阶段从第一个引用单元派生 legacy `example`，但不要在主存储中长期双写。

### 6.3 编辑行为

词条编辑中的例句区应支持：

- 创建新的孤立语料单元并链接。
- 搜索并链接已有语料单元。
- 打开所链接单元的快速编辑或跳转到语料库。
- 解除链接但默认不删除语料单元。
- 一个定义链接多个例句并调整顺序。

删除语料单元时：

- 先查询被哪些定义引用。
- 有引用时显示应用内确认，提供取消或明确处理引用的路径。
- 不允许产生静默悬空引用。

语料单元内容更新后，词条例句展示应即时反映，不复制旧快照。

### 6.4 Gloss 和分析兼容

- 词条例句继续使用独立的 `entryExampleRenderPattern` 和对齐设置。
- 数据分析的 glossed examples 检查改为读取链接单元。
- 高级筛选返回词条编辑时仍恢复原查看方式。
- 搜索是否索引例句内容应保持与现有行为一致，并通过反向索引避免全库扫描。

### 6.5 阶段 C 验收

- 旧词典首次打开后，每条旧例句只迁移一次。
- 原始例句文本、换行和 Gloss 语法不丢失。
- 迁移后修改语料单元，词条展示同步变化。
- 解除链接不会误删单元。
- 删除被引用单元不会产生悬空引用。
- 新旧 JSON 导入路径都有测试。

## 7. 阶段 D：语料库 UI 重做

### 7.1 总体工作区

建议采用类似 DAW、Premiere、After Effects、ELAN 的轨道工作区，但提供文本和多媒体两种模式。

```text
[语料浏览器] [块工作区 / 轨道区] [属性检查器]
```

- 语料浏览器：块/单元标签页、搜索、筛选、孤立单元入口。
- 块工作区：块级标题、标签、备注和层轨道。
- 属性检查器：当前块、层或单元的原始属性、继承属性、标签和备注。
- 导航栏、语料浏览器和检查器都可收起。

### 7.2 文本模式

- 每个语料层是一条轨道，左侧固定显示层名称、发言人、模态和层操作。
- 每个语料单元是轨道中的素材卡，按链接顺序排列。
- 块直属单元使用单独的“块级单元”轨道。
- 支持拖动调整单元顺序、移到另一层或变为块直属单元。
- 改变父级必须原子地解除旧链接并建立新链接。
- 孤立单元可从浏览器拖入轨道。
- 单元卡提供紧凑预览，详细属性在检查器编辑，避免卡片内堆满表单。

### 7.3 多媒体/时间轴模式

第一版可以只建立可扩展布局，不必立即处理真实媒体：

- 顶部时间标尺。
- 轨道头固定，时间轴区域横向滚动。
- 单元数据预留 `startTime`、`endTime` 或独立 annotation span。
- 视频/音频文件不应作为 base64 写入 JSON 或 SQLite。
- 未来资源使用相对路径、资源 ID、MIME、时长、哈希等元数据；文件放在词典资源目录。
- 文本模式的顺序和时间轴模式的时间位置必须定义转换或并存规则，不要隐式覆盖。

### 7.4 属性与继承的所见即所得

检查器应同时展示：

- 当前实体显式写入的属性。
- 从块或层继承的有效值。
- 被当前实体覆盖但仍保存在文件中的原始值。
- 每个有效值的来源层级。

编辑父级属性时，受影响的单元预览即时更新，但不能删除其被覆盖的原始属性。

### 7.5 长 Gloss 与对齐

不要依赖普通 CSS `flex-wrap` 拆分对齐 Gloss。自动换行应以对齐词组为单位：

1. 解析 `gla/glb/glc` 为相同列数的 token 组。
2. 测量可用宽度。
3. 将连续列切成多个视觉行组。
4. 每个行组内部继续保持行间列对齐。
5. `ft` 作为独立自由翻译行，不参与列切分。
6. 容器宽度改变时通过 `ResizeObserver` 重新分组。

建议词典级显示选项：

- `wrap`：按词组自动换行，推荐默认。
- `truncate`：限制行数，显示展开按钮。
- `scroll`：保持单行对齐并在组件内部横向滚动。

卡片预览和单元详情可以分别配置模式，但应共享同一 Gloss 解析与布局函数。

### 7.6 草稿、撤销和保存

- 延续当前 corpus draft，不要让自动保存重新渲染并替换整个编辑 DOM。
- 拖动顺序、属性编辑和链接变化都进入同一可撤销命令历史。
- 自动保存保存草稿快照但不清空撤销栈。
- 切换块、模块或关闭程序时继续走统一未保存逻辑。
- 大型块保存使用增量 changeset，避免每次序列化全部语料单元。

### 7.7 性能要求

- 浏览器列表和轨道区继续虚拟化。
- 不一次渲染 100,000 个单元。
- 文本轨道可按可见区域和缓冲区渲染。
- 时间轴未来按水平时间窗口加垂直轨道窗口双向虚拟化。
- Gloss 测量和 ResizeObserver 更新应批处理，避免每个卡片独立同步重排。
- 搜索使用阶段 B 的索引和分页 API。

### 7.8 响应式策略

- 宽屏显示浏览器、工作区、检查器三栏。
- 中等宽度默认收起检查器，点击后覆盖打开。
- 移动端浏览器和检查器均为抽屉/底部面板，主工作区占满。
- 文本模式在移动端仍可编辑；时间轴模式允许局部横向滚动。
- 不在移动端强行把所有轨道堆成超长纵向表单。

### 7.9 阶段 D 验收

- 可视化创建、删除、排序块和层。
- 单元可在孤立、块直属和层父级之间移动，永远只有一个父级。
- 文本模式可完成当前语料库已有全部编辑功能。
- 属性继承和覆盖来源清楚可见。
- 自动保存不改变选择、滚动、草稿和撤销状态。
- 大型块只渲染可见单元。
- 长 Gloss 三种显示模式都不会撑破工作区。

## 8. 测试与迁移基础设施

当前项目没有完整测试框架。建议使用 Node 内置测试运行器，避免立即引入大型工具链：

```text
test/
  fixtures/
  migrations/
  repositories/
  api/
  corpus/
  benchmarks/
```

- 测试数据必须位于 `test/fixtures` 或临时目录。
- SQLite repository 运行当前完整主契约；旧 JSON 导入/转换与目录迁移由独立定向检查覆盖。
- 迁移测试包含旧词典、部分迁移词典、重复 ID、悬空引用和重复父级。
- API 测试验证事务失败后没有半保存状态。
- 浏览器验收至少覆盖桌面、中等宽度和竖屏。
- UI 变更后检查深色模式、中英文、长标签、虚拟列表和未保存弹窗。

每阶段完成时至少执行：

```bash
node --check app.js
node --check server.js
git diff --check
```

如增加测试脚本，把标准命令补充到 README。

## 9. 代码组织建议

不要一次性重写整个 `app.js`。现有后端模块集中在 `lib/`，继续沿已经形成的边界增量拆分：

```text
lib/
  sqlite-dictionary-repository.js
  api-routes.js
  dictionary-model.js
  legacy-dictionary-migration.js
  entry-search-model.js
  morphology-model.js
  analysis-model.js
  quality-model.js
```

- 后端 CommonJS 拆分风险较低，可以先进行。
- 前端若改用 ES modules，需要单独提交并完整验证启动、Electron 和全局事件，不要与 SQLite 迁移混在一起。
- Gloss 解析、实体 ID 验证和迁移函数应保持单一实现，避免前后端规则漂移；若暂时不能共享模块，至少建立同一套 fixture 契约测试。

## 10. 当前接手入口

新的开发对话应按以下顺序开始：

1. 阅读 `AGENTS.md`、`docs/API_CONTRACT.md`、本文、`CHANGELOG.md` 和当前 diff。
2. 确认当前分支、工作树和最新提交；如果有未提交改动，先判断归属，不要默认回滚。
3. 运行期后端只有 SQLite。若涉及启动/存储，先跑 SQLite schema、repository contract 或目标功能的定向检查；改动旧 JSON 边界时验证 conversion service 和目录迁移，不再验证 JSON runtime 模式。
4. 若继续阶段 B，优先处理默认 SQLite 后的清债项：
   - 查询缓存 Q1–Q4 已完成前端查询 LRU、后端严格/fuzzy entries 与 root-groups 运行时会话、in-flight 合并、词典级 generation 失效、summary DTO、按需详情、词根组子项懒加载、版本化 cursor 和纯滚动数据窗口。`/entries/:entryId/location` 与 `/root-groups/location` 已接入自动滚动：普通目标直接装入返回窗口，词根衍生词先定位父级、保留多来源根语境，再读取整组子项。前端不再通过完整活动词典 snapshot 猜测未加载页号；SWR 保留的旧列表也不能提前完成新查询的滚动请求。
   - 两段式 stale-while-revalidate 已接入查询首窗和按需词条详情：200ms 内保持原内容，但旧详情从请求开始即进入 `inert`；超过后以统一覆盖视觉显示详情遮罩和变淡列表的“正在更新”。首次无旧内容仍直接显示加载状态，失败直接进入现有错误状态，不重试或把旧内容当作成功结果。词条切换和词汇网络返回已改为局部提交，只同步已渲染卡片选中态、详情和必要滚动，不再调用全局 `render()` 或重建查询窗口。详情来源、详情/完整编辑衍生词和词汇网络已共用 `/entry-relations/:entryId` 与前端关系缓存，不再重建完整词典关系索引。
   - 高级筛选查询化 F0–F3 已完成：共享 `EntryQuery/EntryFilter` 已统一现有 `/entries` 参数、查询 descriptor、cursor digest 与缓存身份；字段存在性、来源数量和 UTC 日期已接入同一 SQLite 编译器及定位 API。可稳定查询的高级筛选前端状态已经从完整 `entryIds` 数组迁为结构 descriptor，并复用普通查询窗口、定位、排序、SWR 与搜索。循环变体已拆分结构 facts 与当前搜索结果：`/entries/filter-facts` 只批量判断 filter 候选是否存在，并按 generation 复用；搜索只重查当前变体，进入筛选和写入后自动补齐未知 facts，有效的非当前响应继续进入前端缓存。手动刷新只失效当前 entries/定位缓存并强制重新验证 facts。与词条详情/词汇网络重复的来源文本、指定来源词条筛选已删除；总览“衍生词”入口复用“有来源”条件。
   - F4a 已实装同步、按需的 `POST /api/dictionaries/:id/analysis/query`：`entryCount`、`coverageBreakdown`、`partDistribution` 和 `activityPreview` 由最小 widget planner 合并为三个 SQLite 聚合任务。前端总览异步消费 widget DTO，已迁移统计不再读取完整活动词典；F4a 没有建设通用后台任务框架。
   - F4b-0 与 F4b-1 已完成，契约见 `docs/FEATURE_RESULT_SESSION_PLAN.md`：客户端携带可重建 result source descriptor，服务端内部会话复用基础算法结果，分类、搜索、排序和窗口不触发算法重算。当前 `ipaAutoCompare` 以可替换 adapter 包装简易模型，query/location API 返回 summary、EntrySummary 窗口和轻量 feature detail；分析页及高级筛选不再持有三类完整 ID 数组，也未新增自动 IPA 持久化列。
   - F4b-2 再迁移 IPA 音位/首尾音/音节分布，F4b-3 以共享 morphology model 重做形态分析并删除旧单表适配。词根家族排行改用稳定 topology summary，正写法统计另走轻量 summary/facet，Gloss 等待阶段 C 的例句链接边界。F5 建立独立 `/quality/query`，只复用内部会话原语并删除剩余质量 ID/issue bridge。
   - F4b 首版同步构建并使用有界运行时缓存；只有 10k/30k 基准或可观察交互证明请求内计算不可接受时才加入进程内后台状态，近期不增加持久化 job 表。
   - 普通词条和词根模式的搜索、窗口、定位与关系读取已完成查询化；候选索引是否采用 FTS/ngram 由真实基准决定，不再把这些已完成路径列为待接线项。
   - 形态学结构化存储已完成；DSL v2、表格结构编辑与 layout 设计暂缓，除明确 bug 外不要继续扩展其 schema。数据分析升级时删除 `app.js` 的旧形态单表适配，改为直接调用共享 morphology model。
   - F4a、F4b-0 与 F4b-1 已完成；下一步按 F4b-2 → F4b-3 → F5 顺序迁移 IPA 分布、正式形态分析与质量检查，不得把 feature result 伪装成 repository 普通 predicate，也不得为已有 topology/summary 能力重复建会话。
   - 评估语料库是否先拆为块/单元级 changeset，再决定何时 SQL 分表。
5. 旧 JSON 词典当前通过词典管理界面的 JSON 导入功能手动迁入 SQLite；不要在未设计备份、报告和回滚前加入启动时自动迁移。
6. 增量保存稳定后，再基于目标对象的 `updatedAt` 做轻量冲突检查；短期不引入词典级 revision。
7. 不要在同一批改动里同时进行产品内自动迁移、例句语料迁移和大规模前端模块化。

每一阶段独立提交，`CHANGELOG.md` 的 `New` 节随实现更新；重大用户可见行为、运行方式、数据存储或快捷键变化需要检查 README。
