# 审计未解决问题清单

这是长期维护的唯一待处理问题清单，收录代码审计、安全审计和技术债复查中仍未解决的问题。交接文档只保留入口，不再另列这些条目。

- **来源**：
  - 2026-09-26 外部网页端审计报告，以及此前的阶段审计与安全审计（报告未入库）；
  - 2026-09-27 代码审查；
  - 2026-09-29 前端完整快照检查；
  - 2026-09-30 过度防御与重复代码复查（Claude 两轮扫描，GPT 复核并实测部分条目）；
  - 2026-10-19 代码冗余、过度防御与计算复杂度复查；
  - 2026-10-21 SQLite schema 字段与索引复查；
  - 2026-10-22 词条增量持久化与形态模板时间戳补充复核。
- **复核**：2026-10-01 对照当前代码（基准提交 `4618aad`）复核。文中“已复现”指当时的隔离或临时测试，不表示本次重新做了所有动态测试；未操作真实 `data/`。
- **本轮范围与证据（2026-10-19，基准 `e5bcd11`）**：重点检查 `app.js`、共享形态／标签／搜索模型、SQLite 读取与保存、查询及功能结果缓存、质量结果服务；新增 A15–A19、C11–C12。A15 用抽取原函数的 VM 表单桩复现；A16 用真实共享模型计数和计时；A17 用真实质量服务与缓存、内存 repository 桩复现；A18 用抽取原函数的 VM 桩计数和计时；A19 用临时 SQLite 实测。计时环境为本机 Node 26.3.1，仅表示这些隔离夹具的耗时，不等于浏览器帧耗时或端到端请求耗时；A17 的字节数来自缓存自身的估算器，不是 RSS。`node scripts/check-all.js` 全部通过，但未覆盖这些新增场景。本轮未修改应用代码、未操作真实 `data/`，未做浏览器交互、堆快照或完整词典规模压测；旧条目不视为全部重新动态验证。
- **本轮范围与证据（2026-10-21，基准 `0d401d9`）**：只读检查 `lib/sqlite-dictionary-repository.js` 的 `SQLITE_SCHEMA`、各列的读写点、查询使用的索引和连接 PRAGMA，以及 `app.js` 对相关 DTO 字段的消费；新增 C13–C14、R09–R11。结论全部来自代码阅读，未做 `EXPLAIN QUERY PLAN`、计时或大词典压测，未修改代码，也未操作真实 `data/`。
- **补充范围与证据（2026-10-22，基准 `0d401d9`）**：复核 `patchEntries()`、`writeEntryProjection()`、两类词条搜索投影写入，以及模板表单采集、形态写入计划和时间戳落库；新增 A20，补充 C13。均为代码路径确认，未测量 SQL 写入量、保存延迟或大词典性能；仅更新文档，未修改应用代码或操作真实 `data/`。
- **不在范围内**：
  - 皮肤与液态玻璃问题（含 LQ-7 待实测风险）、待视觉审查事项，见交接文档；
  - 已有专题计划的功能工作，见各计划文档。
- **原报告中不计入的判断**：已修复的词根共享祖先／循环分组问题不列入。未确认的 SQL 注入、存储型 XSS、缺少某种测试框架、强制迁移链等原报告判断，不作为已确认问题计入。

编号规则：A 为行为或安全问题，C 为代码质量与清理，R 为待测量或待决定的风险。编号不复用；条目解决后删除，不重新编号。行号会随代码变化，接手时按函数名定位。

## 1. 保存与数据一致性

### A04：docs＋corpus 联合自动保存可能部分提交

- **现状**：`POST /api/dictionaries/:id/autosave` 依次调用 `saveDocs()` 和 `saveCorpusChanges()`，两者各自开启并提交事务（`lib/api-routes.js` 约 144–163 行）。
- **影响**：docs 成功而 corpus 失败时，请求报错但 docs 已保存，结果既不是全部成功，也不是全部失败。
- **证据级别**：路由和事务边界已确认；日常界面是否显示错误状态不能仅由此推断。该端点也用于退出时的 beacon／keepalive 保存，验收需覆盖这种调用方式。
- **定位**：上述路由；repository 的 `saveDocs()`、`saveCorpusChanges()`；`app.js` 的 `flushAutomaticModuleSaves()`。
- **处理方向**：先明确联合请求的成功契约，再选择单事务保存或拆成两个独立请求；响应和前端状态必须能表达实际结果。

### A05：普通编辑没有版本条件，多窗口旧草稿会覆盖新修改

- **现状**：普通词条 PUT 不比较客户端的编辑基准版本，直接写入完整词条并生成新的 `updatedAt`。
- **影响**：两个窗口从同一版本开始编辑，后保存的旧草稿会静默覆盖先保存的修改。SQLite 事务只保证单次写入完整，不能识别草稿是否过期。
- **证据级别**：普通 PUT 和 `saveEntry()` 都已确认没有条件更新。“新建来源并绑定”的专用路径有 `expectedUpdatedAt`，但不保护普通编辑，不能视为已解决。
- **定位**：`lib/api-routes.js` 的普通 entries PUT（约 411 行）；repository 的 `saveEntry()`（约 2707 行）。
- **处理方向**：先做目标词条级的 `updatedAt` 条件和明确的冲突反馈，模块保存随后按模块处理；短期不引入词典级 revision。
- **计划**：词条部分与 A20 合并设计，见 [Entry Incremental Save Plan](ENTRY_INCREMENTAL_SAVE_PLAN.md)（草案，未实施）。

### A15（P2）：形态模板组备注的旧值兜底使清空无效

- **现状**：`app.js` 的 `collectMorphologyTemplateGroups()`（约 14168 行）用 `textarea.value || groupCard.dataset.groupNotes || ""` 采集备注；`createMorphologyGroupEditor()` 把已保存备注写入 dataset，而且始终渲染备注输入框。
- **影响**：用户把非空备注清成空串后，采集结果恢复旧备注。`morphologyTablesFormIsDirty()` 因而可能认为没有修改；直接保存、离开确认和添加／调整表格时的表单重建都读取这一采集结果，清空不能生效。
- **证据**：在 VM 中执行原采集函数，textarea 为 `""`、dataset 为 `"saved notes"` 时，输出备注仍是 `"saved notes"`。未做浏览器交互复现。
- **处理方向**：直接采集保证存在的备注控件的 `.value`，保留空串；清理无消费者的 dataset 镜像。验收覆盖单独清空、保存后重读、离开确认，以及调整表格时不恢复旧备注。

## 2. 规则执行与算法

### A10：IPA 前后文条件：语义缺陷、静默降级与执行时间失控

`lib/ipa-model.js` 的 `conditionMatches()`（约 160 行）把用户写的前后文条件直接当作原生正则执行，同一模型在前端和后端都会运行。四个问题出在同一处，必须一起决定，不能分开修：

1. **锚点只约束一个分支**：前文拼成 `${condition}$`，后文拼成 `^${condition}`。含 `|` 的合法条件里只有一个分支受锚点约束：前文 `ac` 配条件 `a|b`、后文 `cb` 配条件 `a|b` 都被判为匹配（已实测）。用了“或”的规则会在错误位置生效，影响自动 IPA 结果。
2. **无效正则静默降级**：语法错误的条件（如 `[`）会被接受，并退回按字面匹配开头或结尾；保存时也不校验。规则含义在用户不知情时被改变。
3. **执行时间失控（ReDoS）**：此前用嵌套重复条件配约 30 个重复字符做隔离测试，1.5 秒内未结束，由测试超时终止。这不是常规规则的典型耗时，但恶意导入或意外复杂的规则都可能卡住页面或 Node 服务。
4. **每次调用重新编译**：批量生成时开销明显。

- **归属**：2026-10-01 决定由交接文档路线图第 3 阶段“音系与形态规则引擎”（IPA 模块重写）处理，旧模块不再扩展功能；开工前可选先给锚点加非捕获分组止血，需用户确认。
- **处理顺序**：
  1. 先决定规则能力：继续支持完整正则并加可终止的执行边界，还是改为受限的条件语法。捕获语法错误、复用编译结果都解决不了第 3 点；只用于排队、没有超时终止的 Worker 也不算解决。
  2. 再按选定方案一起修锚点分组、错误提示（保存时和沙盒中）以及编译复用。
- 先单独修第 1、2 点再改语法，会让用户规则迁移两次。
- 改动会改变已有规则的生成结果，需在 CHANGELOG 说明；如果改为受限语法，还需要设计已有规则的转换或提示。

### A16（P1）：形态生成逐格重新规范化整套模板，形成平方级工作

- **定位**：`lib/morphology-model.js` 的 `morphologyCellDefaultValue()`（约 324 行）、`morphologyTemplateGroups()` 与 `resolveCanonicalEntryMorphologyGroups()`；调用方包括 `morphologySearchValueRecords()`、repository 的形态搜索 projection 写入和前端 `renderMorphologyDisplay()`／覆写预览。
- **现状**：每个非空且未覆写的单元格只需要函数配置，却调用 `normalizeMorphology(dictionary.morphology).functions`，复制全部模板组、表和单元格。自动匹配路径在解析模板组时还额外复制两次，尽管传入的是已规范化的当前模型。
- **复杂度**：设全词典模板共有 T 格、当前词条生成 C 格，仅这部分重复遍历为 O(C×T)；一张全非空表且 C=T 时为 O(C²)，批量处理 N 个同类词条再乘 N。无关模板也会放大当前词条的生成成本。
- **证据**：使用 `{lemma}s`、自动匹配、无覆写的已规范化模型，通过 `functions` getter 统计整套规范化次数：100／400／1600 格分别为 102／402／1602 次；预热后 3 次运行的中位数约为 0.99／32.38／471.21 ms。这里只调用一个词条的 `morphologySearchValueRecords()`，不含 SQLite 写入与 DOM。
- **处理方向**：在输入边界规范化，内部解析与逐格求值共享同一份模板和函数配置；批量 projection 复用一次准备的上下文。无需先引入跨请求全局缓存。验收除生成值一致外，应断言批次内准备次数不随生成格数增长，并复测多模板及批量写入。

## 3. 无关的全量工作

A13（局部保存后整本重新规范化）与 A14（前端完整词典快照）已于 2026-10-19 处理，见 `CHANGELOG.md`。以下为本轮发现的其他路径。

### A17（P2）：功能结果视图增长未计入缓存字节预算

- **定位**：`lib/feature-result-session-cache.js` 的 `getOrCreate()`／`set()`（约 67、94 行），`lib/analysis-feature-service.js` 的 `orderedViewIds()`（约 349 行），`lib/quality-result-service.js` 的 `orderedView()`（约 189 行）。
- **现状**：会话在 `viewCache` 为空时只估算一次 `estimatedBytes`，加入缓存后，两个服务继续原地添加最多 12 个完整有序 ID／issue 索引数组，却不更新会话或全局 `totalBytes`。缓存访问只检查 TTL，不重新估算这些新增数据。
- **影响**：实际按同一估算器计量的缓存内容能超过默认 32 MiB 上限而不触发驱逐，统计值也持续偏小。12 个视图限制仍有效，因此不能据此称为无限内存泄漏。
- **证据**：真实 `QualityResultService`＋默认缓存，内存 repository 提供 40000 个各缺 IPA 的词条；构建后记账 16037990 字节，再用 all／low severity／ipa module 与四种合法排序构造 12 个词条视图。记账仍是 16037990 字节，但 `estimateValueBytes(session)` 已为 35938958 字节，超过 33554432 字节上限，会话仍被保留。此测试隔离了 repository，不代表数据库查询耗时或进程真实内存。
- **处理方向**：视图增删应同步计入所属缓存的预算，并按更新后的总量驱逐；或给视图单独建立有字节预算的缓存。避免每次热命中都重新遍历整个会话。验收同时覆盖视图增加、替换、驱逐后的计数和两个服务的调用路径。

### A18（P2）：语料关联编辑器重复线性成员查找，并为每层生成全量候选

- **定位**：`app.js` 的 `renderCorpusLinkedUnits()`（约 13743–13767 行），由 `renderCorpusBlockEditor()` 为直属单元调用一次、再由每个 `renderCorpusLayerEditor()` 各调用一次。
- **现状**：每次重新建立全部 U 个语料单元的 Map，并用 `corpus.units.filter(unit => !unitIds.includes(unit.id))` 求候选；当前父级有 L 个关联时，这一项为 O(U×L)。之后把所有候选写成 `<option>`，直属父级与每层分别重复；左侧语料列表的虚拟滚动不覆盖这个编辑区。
- **证据**：抽取原函数，在 U=L=4000／8000／16000 的完整关联夹具中，等价成员查找的比较计数为 8002000／32004000／128008000；使用原生 `includes`、简化名称与转义桩时，预热后的 3 次运行中位数约 8.21／27.83／98.15 ms。这里只生成字符串，未计浏览器解析 DOM 和布局。源码还确认，20 个空层加直属父级、10000 个单元会生成 210000 个候选 option（不含占位项）。
- **处理方向**：短期在一次渲染中共享单元索引，用当前父级 ID Set 做成员查找；大候选列表按搜索／选择时加载的方向单独设计，保持移动单元的现有语义。可与语料工作区计划协调，但不必等待存储拆表才消除 O(U×L)。验收需包含多层与大候选集合的真实浏览器渲染；现有隔离计时不能视为 UI 验收。

### A19（P2）：词条关系读取逐个重建完整衍生词，随后仅返回摘要

- **定位**：`lib/sqlite-dictionary-repository.js` 的 `directDerivedEntries()`（约 2225 行）和 `getEntryRelations()`（约 2451–2461 行）。
- **现状**：一次查出全部直属衍生词后，对每行调用 `entryFromRow()`，每个词条分别读取 definitions（含例句、备注）、tags、sources、形态组和覆写，共五条 SQL。`getEntryRelations()` 随后只用 `entrySummary()`，丢弃上述大部分字段。已绑定来源也逐个完整重建后再取摘要。同文件已有批量 `entrySummariesFromRows()`，实际只需 tags 和 definition previews。
- **证据**：临时 SQLite 中，单独调用 `directDerivedEntries()`，100／1000 个直属衍生词分别执行 501／5001 条 prepare／查询，耗时约 24.69／237.89 ms；不含拓扑构建与整个关系请求的其他工作。
- **处理方向**：关系读取批量构造摘要，复用现有摘要路径并保留排序、来源顺序与消歧字段；不要把完整详情读出来再裁剪。这与 R03 的极大家族响应体积不同：不改变“返回全部”的语义也能消除逐词条的五次详情查询。验收比较 DTO 和排序，并统计批量查询次数。

### A20（P2）：词条局部提交仍整条重建子记录与搜索投影

- **定位**：`lib/sqlite-dictionary-repository.js` 的 `patchEntries()`、`batchUpdateEntries()`、`writeEntryProjection()`、`writeEntrySearchProjection()` 与 `writeEntryMorphologySearchProjection()`。
- **现状**：保存已收窄到词条／模块级，但词条内部还没有按修改范围写入。`patchEntries()` 即使只接收 `pronunciation` 或 `tags`，仍先读取完整词条并合并，再调用通用 `writeEntryProjection()`。后者无条件删除并重插当前词条的 definitions、tags、sources、形态组和 override，重写全部核心字段，并重建该词条的静态搜索投影及形态搜索投影。普通完整 PUT 也走同一路径；批量生成 IPA／整理标签对每个目标词条重复这套流程。
- **影响与边界**：单字段修改的工作量受该词条全部子记录和生成词形数量影响，产生无关写入与形态计算；形态计算还可能叠加 A16。范围是当前词条，不是每次重建整本词典；词形改名时更新引用方显示文本及其搜索投影属于必要的关联更新，不能一并取消。当前没有确认本项导致数据丢失；未来释义链接的级联风险另见 R11。
- **证据级别**：上述调用和无条件 DELETE／INSERT 已由代码确认，未做 SQL 计数、计时或端到端压测，不把额外工作直接表述为已复现的交互卡顿。
- **处理方向与验收**：先按字段依赖明确主表、子表和两类搜索投影的更新范围；局部 patch 只写受影响部分，完整 PUT 可按旧新值比较，保留未变子记录并按稳定身份增删改。无需先增加子对象 HTTP 端点或改变 schema。验收应同时检查保存后的 DTO／搜索结果，以及无关子表不执行写入、无依赖变化时不重新生成形态；覆盖单字段修改、释义排序与删除、词形改名的引用同步、批处理和事务失败回滚。与 R11 的释义外键设计协调，但无需等到阶段 C 才处理现有多余写入。
- **计划**：与 A05 合并设计，见 [Entry Incremental Save Plan](ENTRY_INCREMENTAL_SAVE_PLAN.md)（草案，未实施）。

## 4. 代码质量与清理

### C09：剩余未逐个检查的读取兜底

C09（数据库非空列与静态 DOM 兜底）与 C10（前端对服务端响应重复校验）已于 2026-10-19 处理，见 `CHANGELOG.md`。以下是当时有意留下、尚未逐个判断的部分：

- `app.js` 中约 46 处 `String(x || "")`，多数作用于本地状态和表单值，少数可能是服务端字段；
- 前端本地筛选描述的整形（如 `variant.resultCount` 的 `Math.max(0, Number(…) || 0)`、`percentText` 的 `Number(value) || 0`），输入来自前端自己构造的 action，不是服务端响应；
- 液态玻璃引擎的能力检测，按设计保留。

处理方式同 C10：按数据来源判断，来自已校验的内部状态或服务端契约的兜底删除，外部输入与契约中的可选字段保留。

### C11（P3）：前端仍为已迁出的分析构造旧形态表投影

- **定位**：`app.js` 的 `normalizeMorphology()`（约 2482 行）、`legacyMorphologyTableViews()`（约 2516 行）、本地 `normalizeMorphologyCell()`。
- **现状**：共享模型规范化后，前端额外生成 `morphology.tables`，把每个单元格从 `{sourceText}` 再复制为旧 `{mode, value}` 结构。注释声称数据分析仍在使用它，但当前分析读取服务端 feature result；检查 `app.js` 的全部表读取、页面脚本引用和测试后，没有找到这个扁平 tables 的消费者，实际读取均是 `templateGroups[].tables`。
- **影响**：加载词典、形态保存响应、模板表单快照及重绘相关规范化，都产生无用的 O(T) 投影；形态保存序列化时还携带这份服务端会忽略的重复内容。旧字段和过时注释也掩盖了当前模型边界。
- **处理方向**：移除无人消费的扁平投影和转换函数；本地 `normalizeMorphologyCell()` 在规则输入渲染中还有一个缺格兜底调用，不能直接按死函数删除，应改用当前单元格契约。旧 JSON 导入兼容继续留在 legacy migration，不因本项删除受支持的导入边界。验收模板编辑、保存、显示和分析结果。

### C12（P3）：前端残留 19 个未调用的形态／IPA 函数

- **定位与证据**：检查 `app.js` 的标识符引用、`index.html` 和脚本调用后，下列本地函数只有定义，无调用或事件绑定；同名共享模块的方法仍有生产或测试用途，不属于本项删除范围。
- **形态 5 个**：`normalizeMorphologyOverrides`、`applyMorphologyRuleSyntax`、`morphologySearchStrings`、`extractMorphologyReferences`、`extractMorphologyFunctionCalls`。
- **IPA 14 个**：`splitKeyboardSymbols`、`normalizeOnsetClusters`、`displayIpaStage`、`applyIpaMappings`、`ruleMatchesAt`、`conditionMatches`、`splitIntoSyllables`、`tokenizePhonemeUnits`、`matchingCodaCluster`、`matchingOnsetCluster`、`middleTokenBreak`、`syllabifyIpaOutput`、`defaultStressIndex`、`resolveIpaStressIndex`。
- **影响与方向**：除未调用的旧 overrides 实现外，多数只是转调共享模块的包装，增加重复维护入口。删除这些本地定义即可；保留正在使用的 `ipaPipelinePreview`、规则表单规范化和共享模块 API，不为证明删除而增加墓碑测试。

### C13（P3）：SQLite 中只写不读或无消费者的列

- **定位**：`lib/sqlite-dictionary-repository.js` 的 `SQLITE_SCHEMA`、`writeEntryProjection()`、`writeDictionaryToDatabase()`、`entriesFromRows()`；`app.js` 的 `collectMorphologyEntryState()`（约 11260 行）与 `renderEntrySearchSnippets()`（约 8187 行）。
- **只写不读，可直接删除**：
  - `definitions.updated_at`：写入值恒为所属词条的 `updatedAt`，没有任何查询读取，也不进入 DTO。
  - `module_blobs.updated_at`：读取只选 `module, value_json`；词典级时间已由 `dictionary_meta.updated_at` 表达。
- **只是数据往返，没有实际意义**：
  - `entry_morphology_groups.created_at / updated_at`：进入词条 DTO，但前端 `collectMorphologyEntryState()` 采集可见形态组时不带这两个字段，服务端随即回填为词条自身的 `createdAt / updatedAt`；只有自动模式下未显示的旧 overlay 组会原样保留。编辑一次后它基本只是词条时间的副本，也没有显示或排序用途。删除时需同步词条 DTO、`docs/API_CONTRACT.md` 和 legacy migration 的输出。
- **有契约、暂无消费者**：
  - `entry_search_values.source_id`：作为 `searchHits[].sourceId` 返回，契约写明用于定位原始对象，但 `app.js` 只用 `sourceType` 和 `sourcePosition`。保留与否取决于是否打算用它定位，先不删。
  - `morphology_template_groups / tables` 的 `created_at / updated_at`：前端只通过 dataset 原样带回，不显示也不排序。2026-10-22 补充复核：`collectMorphologyTemplateGroups()` 不生成新时间；`planMorphologyWrite()` 比较并传递旧时间，`writeMorphologyPlan()` 对非空 `updatedAt` 原样写入，只在空值时回填本次模块保存时间。因而已有非空更新时间的组／表即使修改名称或标题，也不会得到本次更新时间；只改单元格源码时，计划只更新 cell，所属组／表的时间也不会更新。`created_at` 同样原样保存，空值不会在此补成创建时间。这些列不能可靠代表当前模板的创建／修改历史。
- **处理方向**：前两项直接删除。由于 `CREATE TABLE IF NOT EXISTS` 不会改动旧库，旧数据库仍保留这些列，但按列名插入不受影响，不需要重建表。第三项连同 DTO 和契约一起删除。`source_id` 等定位需求明确后再定；模板时间戳需先决定是否承诺对象级历史语义：没有需求则连同 DTO／dataset 清理，有需求则明确组、表和单元格变化如何更新时间并增加对应契约测试，不把原样往返视为已实现时间追踪。

### C14（P3）：被主键前缀覆盖或没有查询使用的索引

- **定位**：`SQLITE_SCHEMA` 末尾的 `CREATE INDEX` 列表。
- **被主键前缀完全覆盖**：`idx_entry_morphology_groups_entry_id`（主键 `(entry_id, template_group_id)`）、`idx_entry_morphology_overrides_group`（主键以 `(entry_id, template_group_id, …)` 开头）、`idx_morphology_template_cells_table_id`（主键以 `(table_id, …)` 开头）。
- **没有查询使用**：`idx_entries_lemma`。代码中没有 `lemma = ?` 一类的条件，所有排序都以 `sort_key` 或时间列开头。
- **影响**：只增加写入和空间成本，不带来查询收益。
- **处理方向**：从 schema 中移除，并在打开数据库时用 `DROP INDEX IF EXISTS` 清理旧库。这是无损操作，不需要迁移链。可以与 R09 的新索引一起做；先用 `EXPLAIN QUERY PLAN` 确认没有查询依赖它们。

## 5. 待测量或待决定的风险

以下保留为后续评估，不标成已复现的数据丢失，也不作为必须立即重写的架构缺陷。

| 编号 | 当前依据 | 未确认部分与下一步 |
| --- | --- | --- |
| R01：同步重型任务阻塞 HTTP 服务 | 使用 `DatabaseSync`；fuzzy UDF 同步回调 JS，导入、projection 重建、拓扑和完整分析也同步执行。 | 需重新测量各冷路径耗时与 event-loop delay；旧的 3–6 秒词根基准不能代表修复后的拓扑（30k 压测词典当前约 108ms）。按实测决定隔离哪些任务，不整体替换存储层。 |
| R02：大 JSON 导入的内存峰值与重叠导入 | 请求体最高 64 MiB；过程中同时存在字节块、拼接 buffer、字符串、解析／转换／规范化对象和 projection 工作。 | 峰值 RSS、前端内存和并发导入的影响未测。先用临时大数据测量，再决定互斥或流式边界；请求体字节限制不等于内存峰值限制。 |
| R03：极大的单个词根家族响应 | `serializeRootGroupEntries()` 一次返回全部衍生词摘要，组内没有分页。 | 极端家族的响应体积、延迟和内存未压测。组内返回全部是当前产品语义，不默认判为缺陷，也不擅自截断改变结果。 |
| R04：长期保存的数据库兼容与升级 | 初始化使用当前 schema，项目明确不设计运行期迁移链。 | 正式发布前需决定不兼容数据库的识别、备份、显式转换及失败恢复；`schema_migrations` 不是必选方案，不因本清单引入自动升级。 |
| R05：缓存 `index.json` | `requireDictionary()`（24 处调用）每个请求都读取并解析 `data/index.json`，并检查数据库文件是否存在。 | 本地开销小。索引一致性修复保留逐次读取，不加缓存；后续如需缓存，先测量收益并设计写入失败、增删词典和外部修改后的刷新语义。 |
| R07：移动端适配：Mail 工具栏按钮尺寸 | 手机视口（<800px）下条目列表是宽 `min(380px, 100vw-32px)` 的抽屉，7 个 40px 按钮约需 336px 工具栏宽度，视口约 412px 以下就会换行；现按分组整体换行（菜单／词根／新建）。 | 可选方向：360–412px 区间用 `clamp` 把按钮缩到约 34–38px；把展开与收起合并为一个随状态变化的切换按钮（6 个按钮）。最小点击目标和相邻误触未用真机测过；Android 视口宽度不固定，需要真机或 DevTools 设备模拟的调试流程。 |
| R08：同一数据目录的多个服务进程 | 索引修改只在单进程内串行，见 [索引写入与失败恢复](SQLITE_BACKEND_SPEC.md#索引写入与失败恢复)。Electron 外壳没有单实例锁，连开两次即有两个写者；外壳目前不维护。 | 记为运行约束：一个数据目录同一时间只允许一个服务进程写入。外壳恢复维护时评估单实例锁；不在服务端加跨进程锁文件。 |
| R09：默认排序缺少复合索引 | 默认排序为 `sort_key, lemma, position, id`（`sqlOrderClause()`），但 `sort_key` 没有索引，不带筛选的词条列表每翻一页都要全表排序后再 `LIMIT/OFFSET`。按时间排序为 `created_at／updated_at, sort_key, lemma, position, id`，现有单列时间索引只覆盖首列。 | 先用临时大词典测量分页耗时和 `EXPLAIN QUERY PLAN`，再决定是否新增 `entries(sort_key, lemma, position, id)`，并把时间单列索引换成同序复合索引（活动日区间筛选仍可使用）。索引可以在打开数据库时用 `CREATE INDEX IF NOT EXISTS` 无损补建。深分页的 OFFSET 线性成本需改 keyset 游标才能消除，属于 API 改动，另行评估。 |
| R10：约束与空值约定收紧 | ① `entry_tags` 主键为 `(entry_id, position)`，但 `normalizeTagList()` 已保证同一词条内标签不重复，数据库层没有对应的 `UNIQUE(entry_id, tag)`。② `morphology_template_tables.group_id`、`morphology_template_cells.table_id` 没有外键，父子删除靠 `writeMorphologyProjection()` 手工排序完成。词条形态组和 override 指向模板的 ID 允许悬空，由引用失效检测流程处理，不属于本项。③ `pronunciation`、`notes`、`created_at` 等列允许 NULL，但写入一律写空串，读取又到处 `COALESCE(x, '')`。④ 以复合主键为身份的子表（`entry_tags`、`entry_sources`、两张搜索投影、`entry_morphology_cell_overrides`、`morphology_template_cells`）可用 `WITHOUT ROWID`；运行时 SQLite 3.53.1 也支持 `STRICT`。⑤ 连接只设置 `foreign_keys = ON`，默认 rollback journal。 | ①–④ 都会改变表定义，旧库需显式重建表，按 AGENTS.md 须先取得用户确认，并与 R04 的数据库兼容方案一起决定。⑤ 单进程同步访问用不上 WAL 的并发优势，可能的收益只在自动保存这类高频小事务的 fsync 次数，实测后再定。 |
| R11：释义拆行与阶段 C 例句链接 | 性能上，释义拆行目前只服务存在性和计数统计，没有按释义 ID 的独立查询或局部写入。阶段 C（[计划](EXAMPLE_CORPUS_LINK_PLAN.md)）的链接表可以用 `definitions(id)` 作外键目标，由数据库保证不指向已删除的释义。但 `writeEntryProjection()` 每次保存都对 `definitions` 整删重插：链接表若用 `ON DELETE CASCADE`，每次保存都会删光例句链接；若用 RESTRICT，保存会失败。语料仍是整块 blob（R06），单元一侧暂时没有外键落点。 | 阶段 C 复评时一起决定：释义写入改为按 ID diff／upsert，链接表的外键与级联策略，以及单元一侧的完整性由语料拆表还是后端检查保证。在此之前不要把 `definitions` 收回 blob。 |
| R06：语料保存粒度 | 语料作为整块 JSON 保存。后端语料保存只检查内部 ID 重复；单元父级关系（多父级、引用不存在的单元、重复链接）只由前端语料编辑器校验（`corpusMultipleParents`、`corpusMissingUnit`、`corpusDuplicateLink`）。 | 评估是否先拆为块／单元级 changeset，再决定何时拆成 SQL 表；阶段 D 前定。拆表时父级关系由外键和唯一约束保证，不拆表则届时决定是否在后端补模块内父级检查。 |

## 6. 已评估、不处理

- `RootTopologyCache` 的类型与参数检查：成本很低，且能明确报告调用错误。
- `entries.position`：只记录导入／创建顺序，不进入 DTO，但用作所有排序的平局键、完整导出顺序，以及分析和质量 issue 的稳定顺序。旧 JSON 导入的 `createdAt` 可能为空或重复，不能替代它。隐式 rowid 目前与它几乎等价：新建取 max+1，导入按插入顺序分配，upsert 保存不改 rowid。但 SQLite 对没有 `INTEGER PRIMARY KEY` 的表不保证 VACUUM 后 rowid 不变。代码目前不执行 VACUUM，风险来自两处：外部工具对词典文件执行压缩，以及将来重建表（如 R10）时没有按 `position` 保序复制。改用 rowid 会让导出和质量 issue 顺序隐式依赖一个 SQLite 不承诺的值。保留。
- `morphology_template_tables.row_count / column_count`：可以由 labels 数组长度推出，但写入时已保证一致，删除收益很小。保留。
- 普通词条与词根组的分窗加载函数（`loadEntryQueryWindowPage`、`loadRootGroupsWindowPage`）：结构约一半相同，但定位与展开细节差异较大，暂不合并。

## 7. 建议处理顺序

1. **A15、A16**：分别修复空备注保存与形态逐格全量规范化；互相独立，避免捆绑规则语法重写。
2. **A17、A19**：修正视图缓存预算和关系读取的重复详情查询；**A18** 先做局部集合查找优化，候选控件方案另行复评。
   **A20** 单独处理词条内部的增量持久化，与 A16 的重复形态计算及 R11 的释义链接边界协调；先测量代表性单字段保存与批处理，再决定实施顺序。
3. **C11、C12**：清理无消费者的形态投影和本地死函数；**C09** 剩余部分随相关工作清理。**C13、C14** 删除冗余列和索引，可与 R09 的排序索引测量一起做。
4. **A10**：仍由第 3 阶段规则引擎处理，可选锚点止血；**A04／A05** 先明确联合保存与多窗口冲突契约。R 类按测量结果或发布目标决定。

## 8. 维护规则

- 新的审计、复查或技术债发现写入本文，交接文档只保留入口。
- 条目解决后，依据代码和相称验证删除；只完成了计划、规则或文档更新时，条目保留，并注明对应计划。
- 具体修复记录写 CHANGELOG。
- 本文是待处理问题清单，不是实装授权，也不是新增的强制规范。
