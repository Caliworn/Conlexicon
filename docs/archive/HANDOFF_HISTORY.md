# 交接文档历史归档（截至 2026-09-30）

本文是 `NEXT_IMPLEMENTATION_HANDOFF.md` 在 2026-09-30 精简前的历史记录，原样保留当时的状态说明、阶段 B 实施流水、测试与代码组织建议和接手清单，供追溯决策背景使用。

**本文不是现行规范。** 其中不少条目已被后续实现或专题文档取代（文中也有“此行为取代早期描述”之类的互相覆盖记录）。现行行为以 [API 契约](../API_CONTRACT.md)、各专题文档、`AGENTS.md` 和当前代码为准；当前进度与下一步见 `NEXT_IMPLEMENTATION_HANDOFF.md`。阶段 A、A+、C、D 的设计已分别迁至 [应用外壳规范](../APP_SHELL_SPEC.md)、[触摸、焦点与无障碍计划](../TOUCH_FOCUS_A11Y_PLAN.md)、[例句链接计划](../EXAMPLE_CORPUS_LINK_PLAN.md) 和 [语料库工作区计划](../CORPUS_WORKSPACE_PLAN.md)，不在本文重复。

---

## 原交接文档：Conlexicon 下一阶段实施交接

本文供新的开发对话直接接手，记录当前完成状态和以下后续工作：

1. 已完成的基础 UI 外壳与暂缓的触摸/焦点/无障碍专项。
2. 已默认 SQLite 的保存读取接口、查询会话和窗口化，以及剩余查询消费者的 API 化。
3. 将词条例句迁移为对语料单元的链接。
4. 重做语料库 UI，形成适合文本语料和未来多媒体时间轴的工作区。

## 1. 仓库与当前状态

- 2026-09-29：已完成[后端来源自动补全设计](../SOURCE_AUTOCOMPLETE_PLAN.md)。第 1–2 步已完成：`lib/entry-search-model.js` 新增共享排序纯函数 `rankLemmaCandidates()`；`POST /api/dictionaries/:id/source-candidates/query` 已由 repository `querySourceCandidates()` 实装并写入 API 契约，分别由 `scripts/check-source-candidate-ranking.js` 与 `scripts/check-source-candidates.js` 覆盖。第 3 步已完成：完整编辑与词源局部编辑的补全改由逐输入框 controller 调用该端点（约 100ms 防抖、旧列表立即失效、IME 与 Enter／Tab／Esc 契约、单行候选及首条释义冲突回退），旧的前端候选函数已删除；浏览器已验证键盘、失效列表、IME 模拟、局部编辑与液态玻璃暗色显示。第 4 步已完成：来源卡片改用 summary（已存来源取自 `entry-relations` 缓存并在关系数据到达后补全，新选来源取自候选项），同一输入框内同形卡片按词性与释义内联区分，`sourceInputLabel()` 已删除。补充：补全列表统一为单一当前项，指针与键盘共用 `aria-selected` 高亮并由 `setSourceCompletionActive()` 更新，去除独立 `:hover` 高亮；词汇网络、来源卡片、浏览态来源链接及两处衍生词卡片统一使用 `entrySummaryTooltipHtml()` 浮层，多义项设置改为全局的“词条悬浮卡片的多义项显示”（字段名不变），浏览态同形来源沿用卡片的内联区分，完整编辑态衍生词卡片可聚焦查看浮层但不跳转；浏览器已验证新选／已存卡片、完整与局部编辑及 tooltip。浏览视图的词源回退文本仍在关系数据加载前读取快照，不在本计划范围。第 5 步已完成：README、CHANGELOG 已更新；30k 基准为 3 字符以上中位数约 50ms、单字母约 86ms（排序改用共享 `Intl.Collator`），100ms 防抖保留。界面验收已覆盖中文、经典浅色与液态玻璃暗色、键盘与模拟指针交互，尚未逐项检查英文界面、层叠玻璃、320／480／768／1024 宽度及真实输入法与真实鼠标悬停，留待统一视觉审查。

- 待视觉审查（2026-09-30 记录，暂不单独修复）：暗色主题只调亮 `--ui-accent`，未覆盖 `--ui-text-on-solid`，实色强调底上的白字对比度在经典／层叠玻璃暗色约 2.86:1、液态玻璃暗色估算约 4.5:1（其实色配方压暗底色）。受影响的有 `data-control-emphasis="solid"` 的强调／危险按钮与 `.segmented-control` 选中项；改用深色文字可达约 5.8–7.3:1。来源补全选中行已单独改为浅色调高亮，不在此列。补全不引入 cursor、翻页或会话缓存；本轮不移除前端完整快照，也不以未加载快照作为验收项。共享祖先的词根分组正确性问题另立审计修复任务，不因本设计而视为已处理。

- 2026-09-24：液态 tinted／solid 已接入语义化 compact 资格入口，保留原光学参数、父 Q3 排除与几何缓存；当前词典状态保留有色展示，文档／语料分段选中复用 solid。自动检查通过；后续由用户验收明暗／辅助模式的可读性、染色强度与分段选中效果，不把当前调参视为视觉定稿。

- 已禁止来源自引用：候选和添加操作排除自身 ID，共享保存规范化与 JSON 导入返回 400 `self_source_reference`；不同词条循环仍由质量检查处理。已有自引用可读并手动移除，不执行自动数据修复或 schema 变更。
- 来源目标唯一性已完成：补全/添加/保存均按精确 ID 防重，保存返回 400 `duplicate_source_target`；JSON 导入保留首次引用并报告，旧有重复项保持可读以便手动删除，不暗中写库。schema 和版本号不变。
- 来源引用的数据基础已落地：`etymology.sources` 为有序 `{ entryId, text }[]`，空 ID 表示纯文本；SQLite `target_entry_id` 是可空外键，关系仅按 ID 解析，旧字符串仅在 JSON 导入边界转换。空白点击误删除已修复并验证完整/局部编辑：复合区域不再由 label 包裹按钮，标题显式关联输入，空白只聚焦。创建来源使用 `POST /entries/create-source` 原子创建与回填，核验原词条时间及来源列表，冲突完整回滚；前端创建意图随草稿销毁。同形来源的新建衍生词按精确 ID 预填与反向链接已回归。
- 来源编辑器与排序已实装：卡片在输入框上方，除删除按钮外整卡可拖动，以间隙/边缘插入线显示落点，并支持 Alt+方向键；删除按钮独立危险色反馈。纯文本留在输入框、不转卡片，统一引用在前、文本在后。下一步按 [来源编辑与操作契约](../API_CONTRACT.md#词源与词根关系) 处理补全消歧。F5-1 质量服务/API 随后独立推进，不把模型落地误认为已完成全量计算迁移。
- 没有增加 SQL 迁移或更新 schema 版本号，旧数据库须 JSON 导出后在新结构数据库重新导入；上述编辑交互继续沿用现有来源模型，不要求再改 schema。
- 已补齐 Q3 可见性恢复与几何过渡收束：启动 visibility 遮罩解除后自动恢复；宽高/圆角/padding/grid 过渡结束或取消时按最终参数处理，纯 transform/opacity 不重建。引擎统一观察并按帧合并，不在业务组件分别追加监听器。浏览器复现的冷缓存导航尾延迟从约 101ms 降至本次采样约 19ms（非性能保证）。
- Q3 已统一缓存命中直达：注册、重显、参数更新、resize 使用同一解析入口；缓存命中同步替换并保持 ready，在途任务直接复用，只有连续 resize 未命中时保留 80ms 合并。没有新增预热或扩大预算；缓存仍为精确几何的会话 LRU。历史“resize 一律先失效再等待”的描述已被此行为取代。
- Mail 控制区当前以满宽搜索框配内容自适应工具胶囊，胶囊不超过列表宽度；展开/收起组已移到词根模式按钮之后、新建之前，使用同一排列顺序自然换行。这取代早期双表面都撑满列表、将扩展组追加在新建之后的布局安排；其他皮肤恢复原位置不变。
- 液态玻璃当前词条详情 `.entry-display` 与完整编辑 `#entryForm` 已固定为 Q1（focus / css），不再自动或显式 mapped 注册、生成贴图或占用 Q3 缓存；保留 `4px` blur、`1.09×` 饱和度、原 tint/边框/阴影及实色辅助降级。此边界取代下文早期将主体 focus 外壳列入 Q3 的阶段记录；其他表面和 Lab focus 光学预设不变。
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

前端已通过 HTTP API 与具体文件读写解耦，SQLite 已是默认主存储。静态字段和动态形态的严格/fuzzy 搜索 projection、查询会话、纯滚动数据窗口、列表 summary DTO、按需词条详情、词根模式、词汇关系 API、高级筛选 F0–F3、F4a 轻量分析查询，以及 F4b-1/F4b-2 两类 IPA 功能结果会话均已接入。IPA 分布、首尾音、音位频率与音节数分析已经异步消费共享 `ipaDistribution` summary，相应统计桶也已接入功能结果高级筛选。F4b-3 已完成基于共享 morphology model 的形态分配与覆写 source、summary/items/location、最小 repository 输入、异步“使用情况/覆写”页面和高级筛选 action；F5-0 已冻结质量规则与查询契约，下一步由 F5-1 实装 QualityService 和 API。词根家族排行直接消费稳定后端拓扑，不进入 feature session。所有后续语料功能继续只依赖稳定 API，不直接依赖 JSON 或 SQLite。

### 阶段 C：例句链接迁移

在实体 ID、事务和 repository 接口稳定后，把旧 `definition.example` 自动迁移为独立语料单元和引用。

### 阶段 D：语料库工作区重做

最后在稳定的查询、顺序和链接 API 上构建文本轨道和未来多媒体时间轴 UI。

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
- `GET /api/dictionaries/:id` 仍按需读取当前词典完整快照；完整快照 PUT 和 repository 的整库写入兼容方法已移除。导入和导出继续使用各自的完整 JSON 边界。`GET /api/state` 已是轻量 payload，每本词典的 `entryCount/rootCount` 都由轻量 SQL 计算，不建立稳定词根拓扑。
- repository 不再提供伪细粒度的 `queryCorpusUnits()` / `getCorpusBlock()`；语料库 UI 仍以整份 corpus 模块保存为主。真正的语料读取 API 等语料块、层和单元 SQL 模型确定后重新设计。

### 5.2 SQLite 化方向

SQLite 已是默认主存储。真实 schema、当前状态审计和后续优化建议见 `docs/SQLITE_BACKEND_PLAN.md`；迁移策略、JSON 导入/导出 profile 和回滚策略见 `docs/SQLITE_MIGRATION_PLAN.md`。本文只保留接手时需要知道的阶段状态：

- 正式运行期方向是全面 SQLite 化，不设计 JSON/SQLite 存储分流；`index.json` 继续只保存当前词典、词典 ID 列表和 UI 偏好。
- 旧 JSON 词典暂时通过词典管理界面的 JSON 导入功能手动迁入 SQLite；产品内自动迁移向导暂缓。
- 旧 JSON 只保留为导入、导出和目录迁移格式；目录迁移脚本直接只读 `index.json` 与词典文件，再交给 conversion service 和 legacy migration。
- SQLite repository 跑完整当前主契约；模型、旧 JSON 转换和目录迁移分别运行定向检查，不再维护第二套 runtime repository contract。
- 当前 SQLite 写入已是 SQL 增量写入；词典元数据、设置、IPA、文档、语料、形态、单词条和批量 patch 的普通响应均已收窄。autosave 必须携带 docs 或 corpus；携带两者时会合并两个局部保存结果。
- 形态学结构化 schema 见 `docs/SQLITE_BACKEND_PLAN.md` 5.4：模板组/子表/单元格/词条形态组/override 已 SQL 化；共享 `morphology-model` 已使用当前 `templateGroups` / `morphologyGroups` 结构，旧形态结构迁移集中在 `lib/legacy-dictionary-migration.js`。同一词条不能重复实例化同一模板组，`entry_morphology_groups` 以 `entry_id + template_group_id` 为组合主键，override 使用同一组合外键，不再分配 `emorph` UUID。`notes` 已作为词条实例备注接入 SQL、导入导出和详情展示；模板组 `notes` 不应出现在词条详情或词条编辑。SQLite 读取与导出已停止回吐旧 `morphology.tables` / `entry.morphology`；**形态表格**页面现按模板组编辑，支持可编辑的组标题、自动匹配标签、空组、组内多个子表、各级排序和独立的子表尺寸。词条完整/局部编辑已使用正式的词条级多组/多子表 override 视图。导航栏已拆为独立的**形态函数**与**形态表格**页面，前者单独保存函数配置，为 DSL 配置预留。旧 `leftV/rightV` 设置暂留 `module_blobs.morphology`，函数、集合和 DSL 源码后续不做函数级主表，生成结果、AST 和诊断只作为派生缓存或索引。
- 词条形态已切换为 `morphologyMode: auto | manual`：`auto` 由自动规则决定模板组，`morphologyGroups` 仅作为按真实 `templateGroupId` 查找的 overlay；`manual` 按形态组 position 决定展示顺序，空列表即明确不使用形态。自动转手动会将当前自动结果按自动顺序实体化，并在其后保留 dormant overlay；手动转自动须确认并放弃手动配置。SQLite `entries.morphology_mode`、repository 读写、词条 API、共享解析和形态搜索均已接入。完整编辑和局部编辑已改为正式的多组/多子表 override 视图，支持标题 override、词条形态备注、自动 overlay、手动增删组与排序。F4b-3 数据分析已直接消费 `morphologyAnalysis` 的真实多组分配与 canonical nested override，不执行 `morphologyCellValue()`；旧单表适配、旧字段读取、生成检查和固定 ID slice 已删除。未来质量检查另行冻结形态规则。旧 JSON 的 `entry.morphology`、`templateGroupId: "auto"` / `"none"` 只在 `legacy-dictionary-migration` 导入阶段转换；核心模型、repository 与前端持久化路径不再解释旧字段。**不为既有 SQLite schema 写运行时迁移，旧 SQLite 测试库需从 JSON 重新导入。**后续可单独处理表格行列可视化编辑、结构操作下 override 坐标语义和自动分配 DSL。
- 数据模型升级时只保证旧版本 JSON 能导入并转换成新格式；除非确有必要，不要为了旧前端数据形状额外维护临时兼容层。旧 JSON 字段迁移集中在 `lib/legacy-dictionary-migration.js`，核心 `dictionary-model` 只处理当前形状规范化。前端因新模型出问题时，优先修前端。
- 搜索 projection 已完成第一轮 SQL 接线；候选索引、数据分析/质量检查 API 化、语料 SQL 分表和产品内迁移向导都不是当前 SQLite 主路径的阻断项。
- 搜索字段配置已接入词条列表、词根模式和远程高级筛选；词典级 `settings.search.fields` 是新会话默认值，前端按词典 ID 维护不持久化的运行期字段/fuzzy profile，列表搜索框右侧可以临时调整或恢复默认。带搜索的普通、词根和 feature 查询在同一轮 projection 匹配中返回 `searchSummary`，字段面板显示各启用字段的唯一命中词条数；打开面板不发请求，翻窗和定位复用会话摘要。旧数据分析“当前搜索命中字段”及本地全词典统计已删除。读取 API 只接受 `fields` / `fuzzyFields`，旧 `fuzzy` / `tagFuzzy` 参数已删除。`scripts/benchmark-query-session-cache.js` 直接读取指定 SQLite 测试目录，在产品 200/100 窗口下测量 strict/fuzzy、静态/形态字段、词根查询的冷构建与热缓存；统一的 `scripts/generate-stress-dictionary.js --data <empty-temp-dir> [--entries <count>]` 直接生成带 3×4 自动形态模板和少量 override 的 SQLite 压力词典，名称与描述随最终词条数更新。目标目录必须显式指定，可以不存在、完全为空或只含未登记词典的空数据索引，但不能使用项目的真实 `data/`；大型生成数据不应提交到仓库。
- `/entries` 的严格和 fuzzy 搜索均按所选字段读取静态 `entry_search_values` 与形态 `entry_morphology_search_values`，承接 ASCII、Unicode、NFC、case folding 和自定义等价规则，并只为当前页回读完整 `searchHits`。没有结构条件时直接扫描目标 projection；存在词性、标签或其他结构条件时，冷会话把结构 SQL 编译为物化候选关系并直接连接两张 projection，不再传回候选 ID、分批执行 `IN (...)` 或由 JS 求交。形态单字段和静态+形态混合查询均不再导出完整 snapshot 或逐词条动态生成形态；fuzzy 由连接级确定性函数复用共享评分语义。词根分组搜索也直接从两张 projection 取得命中 ID，并在独立 relation generation 的稳定词根拓扑上生成查询视图，不再走完整共享 JS 路径；关系分组键保持既有独立语义。
- `scripts/check-entry-search-consistency.js` 验证严格及 fuzzy 的静态/形态 projection 查询均不调用完整 snapshot，并覆盖逐值字段、命中定位、结构筛选、分页、NFC、Unicode case folding 和 PUA 自定义规则。列表查询固定返回摘要 DTO，完整词条由单词条端点按需读取。
- 搜索规范化 S2 已接线：`settings.search.normalization` 支持可选 NFC、Unicode 17 default case folding 和 `{ canonical, variants }[]` 自定义规则；默认严格关闭。词条列表、词根模式、搜索摘要/高亮、字段命中计数和词源自动补全共用缓存的词典级 normalizer。精确高亮带原文范围映射，可处理 `ß → ss`、NFC 和自定义替换造成的长度变化。标签/词性/形态匹配等结构键不套用自由文本配置；词源关系与 `source_key` 继续保持既有匹配，留待稳定 ID 引用升级。S3.3 已让 SQLite 规范化检索 projection 承接全部非 fuzzy 静态查询。
- 词源自动补全仍在前端当前词典快照上执行，复用 normalizer 和独立的 `etymologyAutocomplete.fuzzy` 开关，但尚未接入 `/entries` projection 与普通列表查询路径；若后续迁移，需保留其前缀优先和 fuzzy 分数排序，而不能直接复用按 lemma 排序的普通列表响应。
- 搜索 S3.1/S3.2/S3.3 已完成逐值 projection 契约、静态写入和查询接线：`entry-search-model.entrySearchValueRecords()` 为词形、IPA、原始/显示标签、各义项释义/例句/备注、词条备注、词源描述/来源和动态形态生成带 `field + sourceType/sourceId/sourcePosition + valueType` 的独立 records，现有 matcher 也从同一 records 聚合字段值。SQLite `entry_search_values` 不分配实体 ID，写入词形、IPA、标签、释义、例句、备注和词源；导入、整库覆盖、单词条保存、批量 patch、删除级联以及规范化/标签替换设置变化均维护该 projection。非 fuzzy 静态查询直接读取 projection 并返回 `searchHits`，前端用其选择命中摘要。没有 schema 版本、旧 SQLite 回填或运行时兼容；测试库需从 JSON 重建。
- 搜索 S4 已建立并查询 `entry_morphology_search_values`：共享 `morphologySearchValueRecords()` 输出真实模板组/子表/行列坐标与求值顺序，SQLite 只写非空原始值和规范化值。导入/整库覆盖和搜索规范化变化全量重建；词条保存/patch 局部重建；形态模块完整 PUT 在后端按稳定组/表 ID 生成差异计划，增量写模板行，并只重建规则、函数、结构或自动分配变化实际影响的词条；纯展示变化不触碰生成 projection，完全相同 payload 为 no-op。删除通过外键级联；标签显示替换不会误触发形态重建。模板结构删除或缩小会先拒绝可能留下的词条形态组/覆写悬空引用。该表不进入 JSON，未加入 schema 版本或旧库兼容。10k 形态压力词典验收生成 115872 条 records，覆盖 9656 个实际命中形态组的词条，完整 JSON 导入连同全部 SQLite projection 构建约 2737ms。严格及 fuzzy 的形态单字段、静态字段和混合查询均已读取两张 projection；fuzzy 通过连接级确定性函数复用共享评分。早期 `limit=10000` 大页基准中，`body` 的全字段/静态字段 fuzzy 约 251ms/162ms，`bdy` 约 251ms/159ms，形态 fuzzy-only 的 `qna` 约 218ms；这些数值混入大量 DTO 构建，只保留为历史基线，当前基准统一使用 200 条产品窗口并单独报告会话 `buildMs`。fuzzy 仍线性扫描 records，下一阶段是否增加真正候选索引应由真实词典基准决定。
- 读取稳定性与查询缓存 Q1–Q4 已完成：搜索输入采用 250ms debounce（连续输入会重置计时），请求 ID 丢弃过期响应，SQLite 排序使用 ID 作为最终稳定键；前端有紧凑 LRU，后端严格/fuzzy entries 与 root-groups 有运行时会话，并分别为已物化结果维护 `entryId → resultIndex`、`rootId → resultIndex`。普通列表和父级词根组列表区分顺序分页 `nextCursor` 与随机窗口 `windowCursor`，并使用等高占位让滚动条代表完整结果集；远端窗口按需加载并最多保留 5 页，单个词根组展开后一次读取整组衍生词，不再嵌套窗口。

当前前端数据分析已采用按需切片构建和 slice cache。现阶段缓存上限为 24 条 slice 结果，只是防止搜索词、排序、语言或词典版本变化导致缓存无限增长的临时小容量策略，不是长期语义约束。API 化数据分析后，应由 repository/SQLite 索引、服务端 query planner 或更明确的缓存键替代这类前端临时缓存。

质量检查也已有一项前端完整 report 缓存，并与数据分析缓存分离；但两者命中前仍会序列化完整活动词典的相关字段来构造 key，缓存 key 本身仍是 O(N)，首次 miss 也仍运行完整前端算法。因此“已有薄缓存”不等于已经 API 化或消除了大词典扫描。

词根模式已经接入 `/root-groups`，前端正常路径不再本地构建完整词根分组，也不在请求失败时回退前端全量计算。后端以独立 relation generation 缓存与搜索条件无关的 rootId → derivedIds 稳定拓扑，并维护 entryId → rootIds、rootId → group 反向索引；无搜索/搜索分组、组内读取和词汇网络关系 API 复用该拓扑。基础 `rootCount` 已与拓扑显示分组解耦，按没有来源记录的词条数使用轻量 SQL 计算；未解析来源产生的回退组不会污染该计数。只有词条增删、lemma/来源变化和整库替换会清除拓扑；普通词条保存/patch 只刷新排序记录，其他模块保存不再影响它。Q4 只对父级词根组列表进行窗口加载；展开单组时一次读取整组衍生词，子端点不分页。“全部展开”已改为全局状态意图，不再要求全部父级窗口同时加载；父级首窗提供窗口级组数/衍生词数统计来估算展开高度。`all` 模式下可以单独收起词根作为例外，父级淘汰不丢失该状态；全部展开或全部收起会清理上一轮例外。增强型滚动条/词典地图和 marker/overview 数据仍是后续独立设计，不应混入当前原生滚动窗口。

`/api/state` 的 `summary.rootCount` 已改为轻量 SQL，并为所有词典返回；启动和词典管理不再为摘要预热拓扑。其成本仍随词典文件数量和每库聚合查询增长，但不再承担来源解析与完整关系分组成本。

### 5.3 阶段 B 验收

- 旧 JSON 中受支持的词条、定义、顺序、语料、设置和文档字段可以导入并按当前结构重新导出。
- 迁移与 roundtrip 检查验证已识别字段的语义等价；未知字段目前不承诺原样保留。
- 同 ID、重复父级、缺失引用会被事务拒绝并给出可理解错误。
- API 层的普通编辑保存不再依赖完整词典 PUT。
- SQLite repository 的普通词条保存不重写整库，且 `saveEntry()` / `deleteEntry()` / `patchEntries()` 响应已收窄；模块保存也只返回各自的局部 payload。
- 当前 10k 压力词典的关键基准结果记录在文档或 benchmark 输出中；只有真实需求出现时再增加更大数据级别的专项基准。
- 失败迁移不会删除或修改原始 JSON。

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
  orthography-model.js
  morphology-model.js
  analysis-query-model.js
  quality-model.js
```

- 后端 CommonJS 拆分风险较低，可以先进行。
- 前端若改用 ES modules，需要单独提交并完整验证启动、Electron 和全局事件，不要与 SQLite 迁移混在一起。
- Gloss 解析、实体 ID 验证和迁移函数应保持单一实现，避免前后端规则漂移；若暂时不能共享模块，至少建立同一套 fixture 契约测试。

## 10. 当前接手入口

新的开发对话应按以下顺序开始：

1. 阅读 `AGENTS.md`、`docs/API_CONTRACT.md`、本文、`CHANGELOG.md` 和当前 diff。
2. 确认当前分支、工作树和最新提交；如果有未提交改动，先判断归属，不要默认回滚。
3. 运行期后端只有 SQLite。若涉及启动/存储，先跑 SQLite schema、repository contract 或目标功能的定向检查；跨模块或准备提交时使用 `node scripts/check-all.js` 运行统一完整回归。SQLite 运行时不可用必须使相关检查失败，不得静默跳过。改动旧 JSON 边界时验证 conversion service 和目录迁移，不再验证 JSON runtime 模式；测试只断言当前契约和明确架构不变量，不为已删除实现继续积累墓碑断言。
4. 若继续阶段 B，优先处理默认 SQLite 后的清债项：
   - 查询缓存 Q1–Q4 已完成前端查询 LRU、后端严格/fuzzy entries 与 root-groups 运行时会话、in-flight 合并、词典级 generation 失效、summary DTO、按需详情、词根组子项懒加载、版本化 cursor 和纯滚动数据窗口。`/entries/:entryId/location` 与 `/root-groups/location` 已接入自动滚动：普通目标直接装入返回窗口，词根衍生词先定位父级、保留多来源根语境，再读取整组子项。前端不再通过完整活动词典 snapshot 猜测未加载页号；SWR 保留的旧列表也不能提前完成新查询的滚动请求。
   - 两段式 stale-while-revalidate 已接入查询首窗和按需词条详情：200ms 内保持原内容，但旧详情从请求开始即进入 `inert`；超过后以统一覆盖视觉显示详情遮罩和变淡列表的“正在更新”。首次无旧内容仍直接显示加载状态，失败直接进入现有错误状态，不重试或把旧内容当作成功结果。词条切换和词汇网络返回已改为局部提交，只同步已渲染卡片选中态、详情和必要滚动，不再调用全局 `render()` 或重建查询窗口。详情来源、详情/完整编辑衍生词和词汇网络已共用 `/entry-relations/:entryId` 与前端关系缓存，不再重建完整词典关系索引。
   - 高级筛选查询化 F0–F3 已完成：共享 `EntryQuery/EntryFilter` 已统一现有 `/entries` 参数、查询 descriptor、cursor digest 与缓存身份；字段存在性、来源数量和 UTC 日期已接入同一 SQLite 编译器及定位 API。可稳定查询的高级筛选前端状态已经从完整 `entryIds` 数组迁为结构 descriptor，并复用普通查询窗口、定位、排序、SWR 与搜索。循环变体已拆分结构 facts 与当前搜索结果：`/entries/filter-facts` 只批量判断 filter 候选是否存在，并按 generation 复用；搜索只重查当前变体，进入筛选和写入后自动补齐未知 facts，有效的非当前响应继续进入前端缓存。筛选及循环变体以语义化 `titleDescriptor` 保存主 i18n key 和动态原始值，不再保存或反查已翻译标题。稳定结构和 IPA feature 筛选正常时隐藏刷新按钮，远程查询失败时才显示为重试入口且不强制重验 facts；语言切换只重绘标题，仅旧本地质量筛选为问题正文定向重建本地化 issue map。与词条详情/词汇网络重复的来源文本、指定来源词条筛选已删除；总览“衍生词”入口复用“有来源”条件。
   - F4a 已实装同步、按需的 `POST /api/dictionaries/:id/analysis/query`：`entryCount`、`lexiconSummary`、`coverageBreakdown`、`partDistribution`、`tagFrequency`、`tagSetDistribution`、`orthographyDistribution`、`activityPreview`、`activityDistribution` 和 `rootFamilyRanking` 由最小 widget planner 合并为 SQLite 聚合、最小词形扫描与稳定拓扑任务。前端总览固定为词汇规模、资料覆盖、完整词性分布和编辑活动四张卡片；“词汇 > 标签”的完整词性、排除词性的其他标签以及无序 raw-tag 标签集合，“编辑进度”的完整新增/编辑日期和“正写法”的词长、首字符、字符与双字符分布均已异步消费对应 widget，不再扫描前端完整词条。标签集合使用 exact filter 排除超集；有标签、无标签和多标签词条分别通过 `presence.tag: true`、`presence.tag: false` 与 `tagCount.min: 2` 进入普通查询，无标签不混入集合排行或集合种类。正写法统计和普通结构筛选复用 `orthography-model`，双字符只在 Unicode 空白分隔片段内部统计。资料覆盖直接在总览展示并进入有/无字段筛选，不再保留重复的覆盖率子页或前端全词典 coverage slice。词根/衍生词基础计数不建立拓扑，来源覆盖不在首屏重复展示，词根家族排行已在关系详情中按需消费稳定拓扑，孤立词根尚未接线。已迁移统计不再读取完整活动词典；F4a 没有建设通用后台任务框架。
   - F4b-0 与 F4b-1 已完成，契约见 `docs/FEATURE_RESULT_SESSION_PLAN.md`：客户端携带可重建 result source descriptor，服务端内部会话复用基础算法结果，分类、搜索、排序和窗口不触发算法重算。当前 `ipaAutoCompare` 以可替换 adapter 包装简易模型；query 支持不构建视图或词条 DTO 的全局 summary 模式，items/location API 返回 EntrySummary 窗口和轻量 feature detail。分析页及高级筛选不再持有三类完整 ID 数组，也未新增自动 IPA 持久化列。
   - F4b-2 已完成：独立 `ipaDistribution` source 的 summary 返回音素频次/唯一词条数、首尾音和音节数桶，items/location 以 `category + value` 查询并复用搜索、排序、窗口与 cursor；分布与音位分析页异步共享该 summary，相应统计桶进入词条列表时直接消费 feature query，旧前端 IPA 固定 ID slice 和本地分析计算已经删除。descriptor 只受 complex phoneme 和分隔符影响，完全不调用自动 IPA 引擎。F4b-3 也已完成：`morphologyAnalysis` summary/items/location 只表达真实模板组分配、自动/手动模式和 active/inactive nested override，最小 SQL 输入、纯 builder 与显式 source registry 已接入；前端“使用情况/覆写”异步消费该 summary，统计项使用 category/value/scope 进入 feature query，旧单表适配、生成数、空单元、子表使用排行和形态质量判断均已删除。词根家族排行已通过 `rootFamilyRanking` widget 复用稳定 topology，正写法统计使用轻量 `orthographyDistribution` widget 与普通结构筛选；旧 `analysis-model` 和最后的本地 analysis slice 已删除。Gloss 等待阶段 C 的例句链接边界。F5-0 已冻结独立 `/quality/query` 与 `/quality/location`、12 类稳定 issue、summary 计数和混合执行 planner，详细契约见 `docs/QUALITY_RESULT_PLAN.md`；下一步 F5-1 实装 QualityService、最小 repository 输入和 query/location API，之后再迁移质量页面与旧质量 ID/issue bridge。
   - F4b 首版同步构建并使用有界运行时缓存；只有 10k/30k 基准或可观察交互证明请求内计算不可接受时才加入进程内后台状态，近期不增加持久化 job 表。
   - 普通词条和词根模式的搜索、窗口、定位与关系读取已完成查询化；候选索引是否采用 FTS/ngram 由真实基准决定，不再把这些已完成路径列为待接线项。
   - 形态学结构化存储与 F4b-3 数据分析迁移已完成；DSL v2、表格结构编辑与 layout 设计暂缓，除明确 bug 外不要继续扩展其 schema。
   - F4 已完成。词典级活跃标签身份快照已复用 `entry_tags` 聚合与现有 generation 失效，不新增 SQLite schema；`/facets`、词性/其他标签/标签集合 widgets、词条列表/详情、词性菜单和高级筛选标题现在消费统一的显示碰撞标记。自动补全、标签管理影响预览和疑似重复诊断仍是后续消费者，不属于本次快照基础接线。最终浏览器验收覆盖中英文、明暗主题、320/480/768/1024/1440px、长标签、全部分析子页以及标签集合和词根家族的筛选跳转，未发现横向溢出、卡片重叠、滞留加载状态或控制台错误。F5-0 质量契约已完成，下一步进入 F5-1 QualityService/API；不得把 feature result 伪装成 repository 普通 predicate，也不得为已有 topology/summary 能力重复建会话。
   - 筛选统一化第一阶段已完成：原词性下拉移入列表控制栏的统一“筛选”面板，词性以标准 `EntryFilter.part` 与其他 EntryFilter、feature result 和旧本地质量结果共用唯一 `activeFilter`、当前筛选状态栏及循环/重试/清除控件；独立 `activePart`、专用词性 action/监听和进入筛选前的视图快照已删除。清除或替换筛选保留当前搜索和排序，词性也复用普通查询窗口、缓存身份和定位；旧本地质量结果临时在已有 ID 集合上与当前搜索求交。下一步可扩展稳定条件草稿并把 `activeFilter` 内部明确区分为 entry/feature/legacy-quality；F5-3 只需替换旧质量结果 adapter，不重做这套 UI。
   - S0 样式解耦及后续皮肤职责拆分已完成：`theme-classic.css`、`theme-layered-glass.css` 与 `theme-liquid-glass.css` 分别完整拥有同一套标准颜色、材质与圆角 token，失去职责的 `theme-tokens.css` 及根级启动浅色默认已删除；`styles.css` 只保留布局、组件、状态、响应式规则和 token 消费。五种角色圆角由各皮肤独立定义，当前仍保持等值的标准控件、移动控件、面板、浮层和圆头几何；局部小圆角、液态导航专属几何和 Lab 保持独立。皮肤选择器的公共菜单与缩略图框架留在共享组件样式，经典、层叠玻璃和液态玻璃的候选图形分别由对应皮肤文件以无当前皮肤作用域的规则拥有，确保任意皮肤下同时显示全部候选。无消费者的 warning soft、普通 tooltip muted、旧 dialog overlay 与预留网络标签 filter 已删除。样式契约持续验证加载顺序、完整皮肤所有权、角色圆角消费者、候选预览所有权和文件责任边界；具体契约见 `docs/STYLE_SKIN_PLAN.md`。
   - 层叠玻璃 LG-1–LG-4C 已完成：`theme-layered-glass.css` 在 `body[data-ui-skin="layered-glass"]` 下覆盖现有明暗 token，`uiSkin` 支持即时切换；导航底部现使用衣服图标和注册表驱动的顶层悬浮选择菜单，按钮显示当前皮肤，桌面展开栏、窄轨与移动抽屉不再依赖二态循环。LG-4A 降低内容表面的不透明度但继续禁止重复表面逐项 blur。固定双层线性反射经对照后仅保留在互斥显示的 `.entry-display` 与 `#entryForm` 当前词条工作区外壳；navigation、navigation-drawer、mobile-bar、floating 和 overlay-panel 保持无固定渐变。LG-4C 局部指针响应只用于能够容纳光标移动的搜索/筛选浮层、来源建议、右键菜单、皮肤选择菜单、信息与确认弹窗和词汇网络面板；查看/编辑外壳和 toast 均不进入 allowlist。桌面与移动导航也保持退出 allowlist，并统一使用经典导航基色的不透明底面且关闭 backdrop blur；移动抽屉通过独立遮罩、边缘和阴影表达覆盖关系，两种布局继续共享导航控件状态高光。查看态基础信息直接位于外壳，内部栏目与编辑态字段保持近实色且无 blur，窄屏进一步提高外壳不透明度并降低 blur。所有玻璃角色提供 blur 不可用、减少动态、减少透明度和强制高对比降级；触摸输入不启用动态镜面。主背景环境视差试验已回滚；动态折射、形状融合、设备方向响应和滚动适应均不纳入当前计划。具体规范见 `docs/LAYERED_GLASS_SKIN_SPEC.md`。
   - 液态玻璃 LQ-1–LQ-3 的阶段记录保留，但旧视觉实现已由 LQ-6 收束：页面级 scale 6/14 soft/strong filter、固定 `feTurbulence`、青紫 inset 色边、五层焦散、四边距离变量和旧 pointer data attribute 均已从产品源码删除。LQ-1 的材质 token、普通 blur、无 blur/减少透明度/强制高对比实色降级继续作为长期基础。只读 20k 视图的既有有界渲染结论保持有效。
   - 液态玻璃 LQ-4–LQ-6 已完成，第一优先级光学校正、可读性与圆角法线连续性修正也已收束，LQ-7 尚未实施：几何/Worker/filter registry/LRU 引擎通过唯一角色清单服务正式表面；位移图按真实尺寸与圆角生成，第二张贴图编码 X/Y 法线和 rim。Q3 先归一化实际圆角，正式内容表面消费液态皮肤自有的标准角色圆角，液态导航另有只服务浮动外壳结构的私有圆角；continuous/focus/floating/modal 使用 `44/46/36/52px` 请求 bezel；精确外轮廓距离继续服从组件圆角，位移图与 normal/rim 图共享从真实边界法线平滑过渡到四边全支撑有理势场的连续方向，光学带外写入中性法线。桌面展开/rail 导航、移动顶栏与抽屉均内嵌于视口，四边全部暴露并使用唯一完整轮廓模型，旧贴边导航所需的仅右边/仅下边模式已经删除。尺寸开始变化时立即释放旧滤镜并暂回 Q1，稳定后才生成新尺寸贴图；effective bezel 小于 `4px` 时也稳定走 Q1。连续四边势场负责消除硬截断 influence 和 medial-axis 在两张贴图中的斜向分区，生成器以单份有界折射 LUT 避免逐像素重复计算 Snell 幂运算；折射位移沿负法线从表面内侧取样，外向法线只供 specular 使用，避免把组件外侧深色背景拉成宽黑卷边；折射轮廓复用参考项目的 128 采样 convex-squircle 截面与 Snell 路径，在完整 effective bezel 内连续衰减，specular 同样覆盖完整 effective bezel，并连续衰减，不保留独立百分比限宽。缓存键包含 effective bezel、尺寸和材质参数；贴图只存在于页面内存，皮肤停用或页面关闭即清空，不维护格式版本字段。Q3 资源就绪时只消费动态 URL filter，先按 continuous/focus/floating/modal 使用 `3/4/5.5/7px` 光学模糊，再分别位移并重组 R/G/B；方向性表现只来自 SVG 内按默认环境光向量合成的 specular。导航、抽屉、移动栏、当前词条或互斥显示的 `#entryForm`、浮层、结构化 tooltip、按显示周期显式注册的 toast、modal 与网络面板使用角色级中性 tint，不再叠加 Q1 的大半径 blur；rich tooltip 的主次文字使用独立的主题感知 token。组件假渐变、固定方向色边/明暗边、CSS radial/conic 假光、局部液态指针调度和 settle 生命周期均已删除；引擎内部 `setLightVector()` 只作为后续正确坐标模型的能力保留。产品背景只保留连续低饱和色场，不绘制交叉纤维参照，诊断网格继续独立存在。资源等待、尺寸变化、生成失败、表面过小或无 URL filter 使用 Q1 普通 blur；正式表面统一映射质量无关的 surface tint 与角色化 Q1 filter，pending/fallback 由单一规则消费，Q3 ready 只替换动态 filter。减少透明度和强制高对比使用 Q0 实色。主体内旧 `?liquid-glass-diagnostics=1` 开发表面已经删除；根目录独立静态 `liquid-glass-lab.html` 统一承担诊断，提供互相隔离的 Product Engine、Reference Baseline 与 SDF Baseline。Product 可在不重建贴图或清空缓存的情况下独立旁路动态光学、中性 tint、边框与外部阴影。三条路径共享背景、拖动场景以及唯一一组宽度/高度/圆角/外轮廓模型/超椭圆指数控件；角部模型的指数 `2` 复用 Round 快速路径，更大值启用 Product/SDF 超椭圆角，全局模型以整张表面的 Lamé 方程生成轮廓且 `n=2` 为椭圆。圆角只受共享短边一半约束，Product/SDF 全局模型不消费但保留其值；切换路径和恢复模型默认值不会改变当前几何；它们均不调用 API、不持久化参数，也不进入产品导航，两条 Baseline 不接入生产角色和缓存。SDF 的二值 Alpha 与方形贴图特征按来源保留，需由人工 Lab 对照确认角部锯齿、折射宽度和 quality 成本后，才能提出生产算法替换；之后再单独讨论 Q2、动态光源坐标模型与 LQ-7 验收范围，micro 控件和 Q2 当前定义均未改动。完整边界见 `docs/LIQUID_GLASS_SKIN_SPEC.md` 第 13 节。
   - 无再分发许可的逐行 Reference Baseline 已从全部可达 Git 历史移除，原路径继续由 `.gitignore` 保留为本机研究材料；生产引擎和 MIT SDF Baseline 随仓库分发。此前一并清理的四张参考背景已通过 Google Lens 找到独立原始来源：三张为 Unsplash、一张为 Pexels；它们按内容语义改名后从当前版本重新纳入跟踪，逐张作者、原始页面和许可记录见 `assets/liquid-glass-lab/README.md`。干净克隆仍因缺少本机 Reference 源码而允许该渲染路径初始化失败。
   - 液态玻璃工具导航已收束为“唯一内嵌浮动 continuous 光学卡片＋平面工具行＋非光学 active 胶囊＋分隔线工具组”：桌面内容画布延伸到导航下方，并以安全内边距避让浮动卡片；展开、rail、移动顶栏和抽屉均不贴视口边，四边参与折射，也不为每个目的地或工具组绘制固定渐变、多层阴影或嵌套玻璃。工具行不注册 backdrop surface，pressed 不位移，减少动态关闭状态 transition；经典与层叠玻璃保持原样。后续若实验共享移动指示器，必须单独复评共享 DOM/JavaScript、焦点语义和 reduced-motion，不得把它实现成嵌套玻璃。
   - 评估语料库是否先拆为块/单元级 changeset，再决定何时 SQL 分表。
   - 液态玻璃 P0 尺寸/缓存/异步提交修复已实装：统一使用不受 transform 影响的布局 border-box；缓存键与规范化后的精确生成参数一致，不再只量化键。隐藏、注销与参数失效统一更新 generation；提交复核注册身份、可见性和当前资源键。相同参数继续共享在途任务和 LRU，0×0 恢复即时查询缓存，真实非零尺寸变化保留 80ms 防抖。下一批仍是生成与持续合成的独立性能测量；本批没有简化滤镜、改变材质参数或实现 Q2。
   - 词条工作区已改为仅液态皮肤启用 Mail 布局：共享控制器 `lib/entry-workspace-layout.js` 独立配置皮肤→布局映射，移动/恢复原控件而不复制业务状态；经典和层叠玻璃保持原布局。搜索框与工具胶囊撑满列表宽度，分别用 `.entry-mail-search-surface` / `.entry-mail-tools-surface` continuous 装饰叶节点；父层不能过滤或裁切。搜索/筛选面板独立定宽 340px，排序菜单 248px，均限于视口内且不继承胶囊宽度。排序是一个六态图标按钮，菜单是平面文字行而不是独立材质按钮。词根批量操作临时扩充同一工具栏，窄屏内部换行；筛选状态在胶囊外。复用角色参数、移动栏材质及 Q1/Q0；布局改变后重新测量虚拟列表。后续接入其他皮肤只扩展布局映射并验收其材质，不新增偏好或耦合光学引擎。隔离浏览器检查覆盖三皮肤、中英文、明暗、五档宽度、控件恢复、展开状态/弹层尺寸、六态排序/键盘操作与 Q3/Q1/辅助模式；未读取或写入真实词典数据。
5. 旧 JSON 词典当前通过词典管理界面的 JSON 导入功能手动迁入 SQLite；不要在未设计备份、报告和回滚前加入启动时自动迁移。
6. 增量保存稳定后，再基于目标对象的 `updatedAt` 做轻量冲突检查；短期不引入词典级 revision。
7. 不要在同一批改动里同时进行产品内自动迁移、例句语料迁移和大规模前端模块化。

每一阶段独立提交，`CHANGELOG.md` 的 `New` 节随实现更新；重大用户可见行为、运行方式、数据存储或快捷键变化需要检查 README。
