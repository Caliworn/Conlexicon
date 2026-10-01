# Conlexicon 实施交接

本文只记录接手所需的当前状态、进行中与待验收事项和下一步。长期规则见 `AGENTS.md`；已完成功能的规范在 `docs/` 专题文档中；2026-09-30 精简前的完整交接内容（含阶段 B 实施流水）原样保存在 [交接历史归档](docs/archive/HANDOFF_HISTORY.md)，仅供追溯，不是现行规范。

## 1. 接手入口

1. 阅读 `AGENTS.md`、[文档索引](docs/README.md)、[API 契约](docs/API_CONTRACT.md)、本文和 `CHANGELOG.md` 最近的日期段。
2. 执行 `git status --short`，确认分支、工作树和最新提交；有未提交改动时先判断归属并提醒用户，不得回滚。
3. 运行期后端只有 SQLite。涉及启动或存储时先跑目标功能的定向检查；跨模块或准备提交时运行 `node scripts/check-all.js`。测试只断言当前契约和明确的架构不变量。

## 2. 仓库速览

- 仓库：`Caliworn/Conlexicon`；本地路径：`C:\Users\scheh\Documents\Conlexicon`。
- 前端：`index.html`、`styles.css`、三套皮肤 `theme-*.css`、`app.js`，共享模型位于 `lib/` 并由前后端共用。
- 后端：无外部依赖的 Node HTTP 服务（`server.js` + `lib/api-routes.js` + `lib/sqlite-dictionary-repository.js`）。
- 存储：`data/index.json` 加每词典一个 `data/dictionaries/*.sqlite`；旧 JSON 只用于显式导入、导出和目录迁移。
- 已完成的主要能力及其规范：应用外壳（[APP_SHELL_SPEC](docs/APP_SHELL_SPEC.md)）、SQLite 主存储（[SQLITE_BACKEND_PLAN](docs/SQLITE_BACKEND_PLAN.md)）、查询会话与窗口化（[QUERY_SESSION_CACHE_PLAN](docs/QUERY_SESSION_CACHE_PLAN.md)）、高级筛选 F0–F4（[ADVANCED_FILTER_QUERY_PLAN](docs/ADVANCED_FILTER_QUERY_PLAN.md)、[FEATURE_RESULT_SESSION_PLAN](docs/FEATURE_RESULT_SESSION_PLAN.md)）、样式皮肤（[STYLE_SKIN_PLAN](docs/STYLE_SKIN_PLAN.md) 及两份玻璃皮肤规范）、来源自动补全（[SOURCE_AUTOCOMPLETE_PLAN](docs/SOURCE_AUTOCOMPLETE_PLAN.md)，2026-09-30 实装）。

## 3. 进行中与待验收

- **数据规范化与 SQLite 读取修复**：[计划](docs/DATA_NORMALIZATION_REPAIR_PLAN.md)已于 2026-09-30 复评并收窄，2026-10-01 按修订后的 `AGENTS.md` ID 不变量新增阶段 4（普通保存不再做跨类型 ID 扫描），共四个阶段，尚未实装；对应技术债仍保留在第 5 节，实装后再删除。
- **来源自动补全界面验收未完成项**：已覆盖中文、经典浅色与液态玻璃暗色、键盘与模拟指针交互；尚未逐项检查英文界面、层叠玻璃、320／480／768／1024 宽度，以及真实输入法和真实鼠标悬停。2026-09-30 修正的请求生命周期（组字、Esc、失焦、编辑退出时取消请求）只用合成事件和延迟请求验证过。留待统一视觉审查。
- **液态玻璃 tinted／solid**（2026-09-24）：已接入语义化 compact 资格入口，自动检查通过；明暗与辅助模式下的可读性、染色强度和分段选中效果待用户验收，当前调参不是视觉定稿。
- **液态玻璃 LQ-7**（全量性能与资源验收）未实施；SDF Baseline 替换生产算法前须先完成 Lab 人工对照，见 [液态玻璃规范](docs/LIQUID_GLASS_SKIN_SPEC.md) 第 13 节。2026-09-27 代码审查另记录三个待 LQ-7 实测确认的风险：`activate()` 对 `document.body` 建立 subtree MutationObserver；词根模式虚拟列表滚动时逐个注册／注销折叠按钮光学表面；`unregister()` 每次断开后为全部表面重新观察祖先链。
- **质量检查 F5-1**：下一步实装 QualityService、最小 repository 输入和 `/quality/query`、`/quality/location`，契约见 [QUALITY_RESULT_PLAN](docs/QUALITY_RESULT_PLAN.md)；之后 F5-2／F5-3 迁移质量页面并替换旧本地质量结果 adapter。
- **词源网络视图对循环和菱形缺少表达**（2026-09-30 检查）：视图只显示一层来源和衍生词；两个词互相引用时对方只出现在来源栏，两条反向连线重叠成双箭头，更长的循环和菱形都看不出来。`/entry-relations` 返回的 `rootGroup` 前端拿到但没有渲染。改进方向（循环标记、双向节点、展开到词根层级）属于界面设计，待用户决定。
- **浏览态词源回退文本**：关系数据加载完成前仍读取前端完整快照（`renderEtymology()`），不在来源补全计划范围内。

## 4. 待视觉审查（记录，暂不单独修复）

- 暗色主题只调亮 `--ui-accent`，未覆盖 `--ui-text-on-solid`：实色强调底上的白字对比度在经典／层叠玻璃暗色约 2.86:1，液态玻璃暗色估算约 4.5:1（其实色配方压暗底色）。受影响的有 `data-control-emphasis="solid"` 的强调／危险按钮和 `.segmented-control` 选中项；改用深色文字约可达 5.8–7.3:1。来源补全选中行已单独改为浅色调高亮，不在此列。（2026-09-30）
- **导航栏在较矮窗口出现原生滚动条**（2026-09-30 分析，方案待用户决定，未改代码）：导航是固定高度的纵向堆叠，`.tool-list` 以 `overflow-y: auto` 兜底。按经典皮肤窄栏的 CSS 估算，需要约 860px 高度才放得下，包括 10 个 50px 目的地及间距约 590px、底部三个工具按钮约 150px、品牌区与内边距约 120px；1024×700 窄栏截图已出现滚动条。该数值未逐皮肤、中英文和展开状态实测。建议三套皮肤共用以下三层规则，各皮肤只调数值：
  1. **按导航实际高度收紧密度**（响应式，纯 CSS）：导航设为尺寸容器（`container-type: size`），用 `@container (max-height: …)` 把目的地按钮从 50px 降到约 40px、间距压到 4px（10 项约 436px），并以 `@media (pointer: coarse)` 保留 44px 触控区域。不直接按窗口高度判断，因为液态玻璃内缩的浮动导航、品牌区和展开／窄栏都会改变可用高度。
  2. **底部皮肤、主题、语言合并为一个“外观”菜单**（固定结构改动，不随尺寸切换）：约省 100px；只在矮窗口合并需同时维护两套 DOM，不建议。
  3. **极矮窗口仍可滚动，但不用原生滚动条**（响应式，纯 CSS）：例如低于约 560px 的横屏手机或开着开发者工具。改用 `scrollbar-width: thin` 加颜色 token，并用 `background-attachment: local`／`scroll` 叠加渐变做上下渐隐遮罩，只在确有未显示内容的一侧出现。不能只隐藏滚动条。

  不建议的做法：把放不下的项收进随窗口变化的“更多”菜单，这会破坏位置记忆并需要 JS 测量；减少或合并目的地（如形态函数与形态表格、数据分析与质量检查）属于信息架构决定，留给视觉方案审查。

## 5. 已知技术债与后续评估

- **前端完整快照的剩余消费者**（2026-09-29 代码检查，随代码变化需复核）。是否移除快照应先实测 10k／30k 词典的快照加载耗时、体积和内存再决定：
  - 服务端已有能力的本地后备：`filteredEntries()` 的本地筛选路径、`refreshActiveFilterState()` 按快照清理失效 ID——可直接删除。
  - 整词典批处理：`batchGenerateIpa()`、`applyTagSortOrder()`、前端 `buildQualityReport()`（其缓存键 `qualityReportCacheKey()` 本身序列化全部词条，为 O(N)）——宜改为服务端批处理命令，质量部分即 F5。
  - 快照同步维护：`upsertEntryInDictionary()`、`removeEntryFromDictionary()`、`applyEntryPatchPayload()`——快照移除后自然消失。
  - 小范围查找：上文的浏览态词源回退文本。
- **代码审查发现**（2026-09-27，尚未处理；前两项已纳入[数据规范化修复计划](docs/DATA_NORMALIZATION_REPAIR_PLAN.md)）：
  - `app.js` 复制了 `lib/dictionary-model.js` 26 个函数中的 22 个（`normalizeDictionary`、`normalizeDictionarySettings` 等），且已出现字段漂移（前端多出 `toolNavOrder`）；前端还在 30 余处对已规范化的 settings 重复调用 `normalizeDictionarySettings()`，部分位于逐标签热路径。
  - `sqlite-dictionary-repository.js` 的 `parseJson()` 在解析失败时静默返回默认值；词典 settings 损坏时可能被默认值覆盖后写回。
  - 对 `NOT NULL` 列的读取仍层层兜底（如 `rowCount || 1` 会把 0 静默改为 1）；`elements.xxx?.` 用于静态 DOM 会掩盖 ID 改名错误。
- **过度防御与重复代码复查**（2026-09-30 由 Claude 两轮扫描，GPT 复核并实测部分条目后修正；按模式扫描后逐处核实，非逐行审查，`app.js` 中 69 处 `String(x || "")` 和液态玻璃引擎的能力检测未逐个检查；均未处理）。按以下顺序处理：
  1. **IPA 前后文条件语义**（`lib/ipa-model.js` 的 `conditionMatches()`，会改变自动 IPA 结果，需在 CHANGELOG 说明）：
     - 锚点直接拼接在用户条件上，前文为 `${condition}$`、后文为 `^${condition}`。含 `|` 的合法条件只有一个分支受锚点约束：前文 `ac` 配条件 `a|b`、后文 `cb` 配条件 `a|b` 都被判为匹配（已实测）。修法是加非捕获分组 `(?:…)`。
     - 无效正则（如 `[`）会被静默接受并退回按字面匹配开头或结尾，保存时也不校验。应在保存和沙盒中明确报告规则错误。
     - 正则每次调用都重新编译，复用编译结果可在上面两项之后处理。
  2. **只读接口按需读取模块**：已纳入[数据规范化计划](docs/DATA_NORMALIZATION_REPAIR_PLAN.md)阶段 1。GPT 用临时数据复现：关系查询和 facets 每次都各自解析约 100 万字符的语料 JSON。保存路径目前依赖 corpus 做跨实体 ID 冲突检查，由计划阶段 4 去掉该扫描后再按需读取。
  3. **`closePendingEditsForPageSwitch()` 吞异常**：外层 `try { … } catch { return false; }` 不记录日志。内部 `saveEntry`／`savePartialEdit` 已自行提示并返回 `false`，外层只会接住程序缺陷，表现为导航无反应、控制台无输出（GPT 已模拟复现）。在 catch 中 `console.error` 并保持返回 `false`，行为不变、可排错。
  4. **小范围清理**：
     - `lib/orthography-model.js` 的 `orthographyMatches()` 在 SQL 自定义函数中逐行重新规范化筛选条件，并 `try/catch` 返回 `false`；条件已在 `entry-query-model.js` 入口校验过。保留现有校验函数及其错误契约，另加一个只匹配已校验条件的函数供 SQL 使用。
     - `lib/entry-relations-model.js` 的 `buildEntryRelationIndex()` 仍为每个词条规范化 ID 和词形，构建无读取方的 `byId`、`byLemma`、`normalize`。这是来源按词形匹配时期的遗留，G3 时漏清。
  5. **数据分析加载函数重构**（单独提交）：8 个加载函数（`loadAnalysisOrthography`、`loadAnalysisTags`、`loadAnalysisRootFamilies`、`loadAnalysisActivity` 等，约 `app.js` 9885–10600 行，状态变量约 216–275 行）流程相同。差异包括请求端点（5 个用 `/analysis/query`、3 个用 `/analysis/features/query`）、请求体、缓存键和“当前是否可见”的判断，抽象时都要参数化。每个加载函数保留各自的状态与过期响应检查，以浏览器回归数据分析各页为验收，不以减少行数为目标。
  6. **死代码整理**（低优先级）：
     - 约 25 个界面文案键只在中英文字典中定义，如 `linkedSource`、`unlinkedSource`、`tableSize`、`morphologyNone`、`glbSmallCaps`、`planned`、`corpusRequiredUnitContent`、`orthographyStressModule`。这是按字面搜索的结果，删前逐个排除动态拼接。
     - 无调用方的薄包装可删：`search-normalization-model` 的 `DEFAULT_CONFIGURED_SEARCH_NORMALIZATION`、`createSearchNormalizer`，`tag-model` 的 `entryListDisplayTag`。
     - 只有测试调用的导出逐个看用途，不批量删除。`sampleSurface` 用于验证生成贴图与解析采样一致，`qualityIssueIdentity` 对应质量计划中的问题身份契约，均保留。`fieldFuzzyEnabled`、`normalizeConfiguredSearchText`、`resolveDisplayIdentity`、`findDerivedEntries` 待确认；删除函数时不能顺带丢掉其覆盖的行为验证。

  并入其他工作：`lib/quality-model.js` 对必然加载的 `entryRelationsModel` 使用可选调用，并保留永远不会执行的 `find` 后备路径（约 149–160、165、208 行），F5-1 搬迁质量规则时一并删除。

  低优先级评估：`requireDictionary()`（24 处调用）每个请求都读取并解析 `data/index.json`，并检查数据库文件是否存在。改为内存缓存前，要先设计写入失败、增删词典和外部修改后的刷新语义：例如用户实例与测试实例指向同一数据目录时，“仓储是唯一写入方”并不成立。

  不处理：`RootTopologyCache` 的类型与参数检查成本很低，且能明确报告调用错误。普通词条与词根组的分窗加载函数（`loadEntryQueryWindowPage`、`loadRootGroupsWindowPage`）结构约一半相同，但定位与展开细节差异较大，暂不合并。
- 语料库保存：评估是否先拆为块／单元级 changeset，再决定何时 SQL 分表。
- 增量保存稳定后，基于目标对象 `updatedAt` 做轻量冲突检查；短期不引入词典级 revision。

## 6. 路线图

1. **F5 质量检查查询化**：见上文；`source_cycle` 消费[词源图模块](docs/ETYMOLOGY_GRAPH_PLAN.md)的分量结果。
2. **阶段 A+ 触摸、焦点与无障碍**：[计划](docs/TOUCH_FOCUS_A11Y_PLAN.md)，建议在阶段 B 或 C 之后集中处理。
3. **阶段 C 例句迁移为语料单元链接**：[计划](docs/EXAMPLE_CORPUS_LINK_PLAN.md)。
4. **阶段 D 语料库工作区重做**：[计划](docs/CORPUS_WORKSPACE_PLAN.md)，依赖阶段 C。

约束：

- 各阶段独立提交，不在同一批改动中同时进行产品内自动迁移、例句语料迁移和大规模前端模块化。
- 旧 JSON 词典通过词典管理的 JSON 导入手动迁入 SQLite；未设计备份、报告和回滚前不加入启动时自动迁移。
- 不一次性重写 `app.js`；后端沿 `lib/` 既有边界增量拆分。前端若改用 ES modules，单独提交并完整验证启动、Electron 和全局事件。Gloss 解析、实体 ID 验证和迁移函数保持前后端单一实现。
