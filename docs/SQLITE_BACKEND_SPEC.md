# SQLite 后端规范

本文是 Conlexicon 当前 SQLite 数据层的规范：存储形态、repository 分层、schema、搜索 projection、查询会话与结果缓存，以及在基准证明前暂缓的优化。HTTP 请求、响应和错误码见 [API Contract](API_CONTRACT.md)；尚未实装的接口与分层设想见 [API Drafts](API_DRAFTS.md)；旧 JSON 导入、导出 profile 和目录迁移见 [导入导出规范](IMPORT_EXPORT_SPEC.md)。

## 1. 原则

- SQLite 是唯一的正式运行期主存储，不是 JSON 文件的旁路缓存。
- 前端只依赖 HTTP API 和结构化响应，不感知底层存储实现。
- 完整 JSON 导入/导出保留为交换、备份和迁移入口；普通运行期保存、查询、分析和质量检查不读取或导出完整词典快照。
- 词根模式、词汇网络、数据分析和质量检查共享同一套查询语义和稳定词根拓扑。

## 2. 非目标

- 不长期双写 JSON 与 SQLite。双写会制造两个真相来源，失败恢复也复杂。
- 不保留第二套 JSON runtime repository。旧 JSON 只通过 conversion service、legacy migration 和显式目录迁移脚本进入 SQLite。
- 不预建最终索引、FTS 或派生缓存；按真实查询需求和基准增量加入。

## 3. 存储形态

当前采用“每个词典独立文件”：

```text
data/index.json
data/dictionaries/<dictionary-id>.sqlite
```

`index.json` 当前只保存：

- 当前词典 ID。
- 全局界面偏好，例如语言和主题。
- 词典 ID 列表。

词典名称、语言、描述及 summary 由各 `.sqlite` 文件查询；每本词典的 `entryCount` 和严格 `rootCount` 都使用轻量 SQL，其中 `rootCount` 是没有任何 `entry_sources` 行的词条数。它们不写入 `index.json` 或 metadata，也不因启动或打开词典管理页建立拓扑。每个 `.sqlite` 文件保存一个词典的内容、配置、文档、语料和派生索引。

### 索引写入与失败恢复

- 同一服务进程的 repository 实例用一条 Promise 队列串行执行索引的全部读取与“读 → 判断 → 修改 → 写入”，覆盖默认索引创建、新建、导入、删除、激活、偏好更新与缺失词典剪除。某项操作失败仍向调用方抛出，后续排队任务继续执行。读取也排队，防止 Windows 上本进程的读取句柄阻止原子替换。
- 公开读取通过 `readIndex()` 获取锁；`requireDictionary()`、`hasDictionary()` 与 `exportDictionary()` 通过它读索引。普通更新通过 `updateIndex(mutator)`，mutator 只做纯计算并返回完整索引。锁内只用 `readIndexFile()`、`writeIndexFile()` 和接收给定索引的 `requireDictionaryInIndex()`；不得调用 `readIndex()`、`requireDictionary()`、`updateIndex()` 等再次取锁的方法，以免自己等待自己。写入时不再回读旧文件补全字段，不添加重入检测或超时。
- `writeIndexFile()` 先写同目录固定文件 `index.json.tmp`，对文件句柄 `sync()` 并关闭，再 `rename` 替换 `index.json`。发布前失败时旧索引保持完整，临时文件留待下次覆盖；不加重试，Windows 不做目录 fsync。其他进程占用导致的替换失败继续向调用方报错。
- 索引仍逐次读文件、不缓存。`readState()` 整体在一次锁内完成读取、文件检查、元数据加载，以及需要时的剪除与当前词典改选；不在锁外预读再回写旧快照。
- 新建与导入在锁内判断 ID 冲突，包括已登记 ID 和已有库文件；覆盖与重新生成 ID 的确认规则不变。先登记并设为当前词典，再打开数据库和执行 SQLite 写入事务；登记失败不创建或修改库。写库失败时恢复之前的完整索引，仅对本次新建的库关闭连接并删除文件；覆盖导入的旧数据由 SQLite 事务回滚保留。
- 上述补偿各自尝试执行；任何补偿失败都用 `AggregateError` 同时保留原始错误和补偿错误，不报告成功。数据库初始化失败时关闭尚未缓存的连接，以便新库清理；关闭也失败时同样保留两项错误。
- 删除保持“关闭连接 → 删除文件 → 失效缓存 → 更新索引”的顺序；最后一步失败会报错，遗留登记由下次 `readState()` 剪除，不另做删除补偿。
- HTTP API 路径、请求与响应结构、错误码不变；索引写入等未分类失败仍按现有契约返回 500。离线 JSON 目录迁移脚本先用仓储的 `normalizeUiLanguage`、`normalizeUiTheme`、`normalizeUiSkin` 规范化三项偏好，再通过 `updateIndex()` 写入完整索引。
- **运行约束：一个数据目录同一时间只允许一个服务进程写入。** 进程内队列不解决多个进程的丢更新；不引入跨进程锁或索引缓存。新建与导入的补偿针对可捕获的操作失败，不提供掉电或强制终止后的跨文件事务恢复。

导入/导出使用完整 JSON，属于交换路径，不被普通编辑保存复用。启动状态与词典列表只返回轻量 metadata 和 summary（见 [API Contract](API_CONTRACT.md#启动与词典索引)）。

## 4. Repository 分层

当前分层：

```text
HTTP 路由（lib/api-routes.js）
  ↓
功能服务
  AnalysisFeatureService（feature result）、QualityResultService（质量结果）
  ↓
SqliteDictionaryRepository
  SQL 读写与事务、搜索 projection、轻量分析 planner（/analysis/query）、
  QuerySessionCache、RootTopologyCache
  ↓
data/dictionaries/<dictionary-id>.sqlite

离线：dictionary-conversion-service、legacy-dictionary-migration、目录迁移脚本
```

- repository 只提供最小事实读取、候选窗口和 DTO 组装，不导入或调用 feature/quality 服务，也不理解 IPA、形态或质量类型；不接受 `{ type: "quality" }` 之类的条件自行扫描词典。
- 功能服务可以消费 repository 查询和稳定词根拓扑；轻量分析 planner 只合并确定性聚合与拓扑任务，不反向调用重型 feature service。
- API 返回结构表达功能语义，不泄露存储形状；保存端点不返回完整词典，前端也不依赖“保存后返回完整词典”刷新状态。
- SQLite repository 跑完整当前主契约；旧 JSON 转换和目录迁移使用独立定向检查，不存在第二套运行期 repository 契约。
- 跨功能共享的查询上下文与更细的服务拆分是未实装设想，见 [API Drafts](API_DRAFTS.md)。

### 模块读取与 JSON 错误

- SQLite 中已存在的模块 blob 和形态模板标签列直接用 `JSON.parse` 读取；无效 JSON（包括空字符串）向调用方抛错，HTTP 层沿用 `system_json_parse`，不以默认值掩盖损坏。依赖该数据的保存会在写入前失败，保留原值。
- 模块记录缺失时保留当前默认值；合法的 `{}` 仍可读取与保存。不对合法 JSON 新增顶层类型校验，也不缓存模块解析结果。
- 词条关系、facets，以及轻量分析的 `partStats`／`tagStats`／`tagSetStats` 只依赖词典 ID 与 settings，通过 `dictionaryQueryContext()` 获取配置；docs、corpus 或形态模块损坏不影响这些只读结果。完整快照与导出读取全部模块，损坏时显式失败。
- 普通保存只读取 settings 与实际用到的模块：词条保存、批量 patch 和 settings 保存读取形态配置（用于形态校验与形态搜索 projection），形态保存读取形态配置，语料保存读取 corpus；metadata、IPA、docs 保存和删除词条只读 settings。docs 或 corpus 损坏不影响词条保存。
- 普通保存不扫描无关实体类型，只在数据库无法拒绝的提交范围内检查重复：词条保存不做 ID 检查，义项 ID 重复由主键约束失败并整体回滚；形态保存在生成写入计划之前拒绝提交内重复的组／表 ID（写入计划按 ID 建索引，重复会被静默合并）；语料保存检查语料内部 ID 重复。重复返回 `duplicate_entity_ids_scoped`。全局唯一由服务端生成 ID（新建词条只走 `POST`，`PUT` 只更新已有词条）、导入边界的完整检查和数据库主键共同保证。
- `NOT NULL` 列、主键和 `COUNT` 结果按写入值直接读取，不在读取处补默认值；可空列（如 `pronunciation`、`notes`、释义字段、`target_entry_id`、时间戳）保留 `NULL` → `""` 的转换。形态子表的 `row_count`／`column_count` 由写入前的形态规范化保证不小于 1（保存与导入都经过它），读取和写入计划都不再兜底。

### 共享数据规则

- 前后端相同的纯数据规范化只有一份实现：`lib/dictionary-data-model.js`（UMD，浏览器全局 `ConlexiconDictionaryData`）。它覆盖 settings（含 gloss 样式、工具导航顺序、词条区域顺序）、docs、corpus 与各级语料实体、definition、词条字段整形、全局界面偏好，以及缺失实体 ID 的补齐（`ensureEntityId`，用 `globalThis.crypto.randomUUID`，不扫描已有 ID）；依赖已有的 tag、IPA、entry-search、morphology 共享模型，不复制它们。
- 词条字段整形接收调用方处理好的来源：`dictionary-model.js` 严格校验，重复目标与自引用以 `apiError` 拒绝；`app.js` 以 `allowDuplicateTargets` 宽松读取，使早期数据库中的重复引用仍可见、可删除后保存。共享模块不带“严格／宽松”参数。
- `dictionary-model.js` 只保留 Node 侧内容：错误包装、完整词典入口、实体 ID 唯一性检查与导入；`app.js` 保留本地化默认名称、summary、显示视图（如形态的临时扁平表格视图）和前端状态入口。
- settings 保留未知字段，显式 `false`、空字符串与空集合不被默认值替换；`toolNavOrder` 与 `entrySectionOrder` 保留合法项的顺序，去掉重复与未知项并补齐缺项。导出的默认数组冻结，规范化结果总是新对象。
- 契约检查为 `scripts/check-dictionary-data-model.js`，其中按 `index.html` 的脚本顺序在 VM 中加载到 `app.js` 之前，确认浏览器全局和依赖可用。
- 前端只在词典进入状态时规范化一次：首次加载与切换词典的完整快照、模块保存响应、词条保存与删除响应、批量 patch 都经 `normalizeDictionary`（`replaceDictionaryInState`／`replaceLoadedDictionarySource`）。读取已加载词典的配置一律用 `dictionarySettings(dictionary = activeDictionary())`，不再对状态中的 settings 或其中单个字段重复规范化；新增的状态入口必须同样经过规范化，不在读取处兜底。
- 没有活动词典、或词典只是 metadata 占位（未加载，没有 `settings`）时，`dictionarySettings` 返回一份深度冻结的默认设置，只供读取；表单收集和排序逻辑需要修改时先复制。表单从 DOM 收集的原始输入（如 `ipaSettingsFromForm`）仍在边界规范化。

## 5. 当前 SQLite schema

本节记录当前 `SqliteDictionaryRepository` 实际创建的 schema：词条核心、释义、标签、来源、形态模板组、形态子表、词条形态组和 override 已经关系化；低频或尚未定型的模块继续放在 `module_blobs` 中。schema 变更只更新当前规范，不保存 schema 版本、不建 migration 表，也不在启动时升级旧库；开发中的旧数据库经 JSON 在新结构数据库中重新导入。正式发布前的旧库兼容方案见[审计清单](AUDIT_OPEN_ISSUES.md) R04。

### 5.1 词典 metadata 与模块 blob

```text
dictionary_meta(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  language TEXT,
  description TEXT,
  created_at TEXT,
  updated_at TEXT
)

module_blobs(
  module TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT
)
```

`module_blobs` 是 SQLite 主库里的 JSON 扩展位，不是把设置 SQL 化。它保存低频或结构复杂的模块，例如 `settings`（含 IPA 规则）、`docs`、暂未拆表的语料，以及形态学当前 v1 DSL 的 `leftV/rightV` 函数对象设置。只有当某个模块需要独立查询、筛选、排序、索引或局部保存时，才再拆出关系表。

词典 metadata 与各模块分别通过模块级端点保存，响应只返回变更对象和更新时间，不返回完整词典（端点见 [API Contract](API_CONTRACT.md#词典元数据与模块级保存)）。

### 5.2 词条核心

```text
entries(
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL DEFAULT 0,
  lemma TEXT NOT NULL,
  pronunciation TEXT,
  notes TEXT,
  etymology_description TEXT,
  morphology_mode TEXT NOT NULL DEFAULT 'auto' CHECK(morphology_mode IN ('auto', 'manual')),
  created_at TEXT,
  updated_at TEXT,
  sort_key TEXT
)

definitions(
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  meaning TEXT,
  example TEXT,
  notes TEXT,
  updated_at TEXT
)

entry_tags(
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY(entry_id, position)
)

entry_sources(
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  target_entry_id TEXT REFERENCES entries(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(entry_id, position)
)

```

schema 不含 `entries.entry_json`：SQLite 不保存完整词条 JSON 副本，而是从 `entries`、`definitions`、`entry_tags`、`entry_sources` 和形态学结构化表组装 entry object。

SQL 列名沿用表语义：`entries.notes` 映射词条对象的 `entry.notes`，`definitions.notes` 映射单条释义对象的 `definition.note`。运行期对象只使用 `note`，不接受旧 `definition.notes` 别名；旧字段转换仅由 legacy migration 处理。

普通词条编辑走单词条 `POST` / `PUT` / `DELETE`；删除在同一事务中级联删除释义、标签、来源、词条形态组和 override。词条写入目前仍整条重建子记录与搜索投影，按变化范围写入的设计见审计 A20 与 [Entry Incremental Save Plan](ENTRY_INCREMENTAL_SAVE_PLAN.md)。JSON 导入写入这些 SQL 表，JSON 导出从 SQL 表重新组装完整词典对象。子对象需要独立编辑或更强一致性时，继续在 SQL 主结构上扩展，不恢复完整词条 JSON 存储。

### 5.3 暂缓 SQL 化的模块

不为 IPA、形态学 DSL 函数库、文档和语料预建关系表。当前边界：

- IPA 规则：保存在 `settings` 模块内的 `ipa`，由 IPA 模块端点单独替换。
- 形态学旧 `leftV/rightV` 函数对象设置：暂时继续放 `module_blobs("morphology")`；后续 DSL v2 函数库落地时再移除。
- 形态学模板组、子表、单元格、词条形态组和 override：已经拆为 SQL 结构化表。
- 语言文档：`module_blobs("docs")`。
- 语料库：`module_blobs("corpus")`；不预先建一套未使用的 corpus schema。

约束：

- 自动 IPA 和形态学配置是模块级保存。
- 搜索继续通过共享 IPA/形态模块解释规则；缓存的生成结果（如形态搜索 projection）必须在词条、标签、规则或 override 变化时失效。
- 批量 IPA 生成和标签排序走明确的 `entries/batch` 端点，由服务端按已保存设置执行并返回目标数。

语料库最终仍应 SQL 化，因为大语料必须分页、局部保存和排序；这作为语料升级阶段的单独设计（见第 11 节）。

### 5.4 形态学结构化 schema

形态学 SQL 化必须继续遵守“先判断必要性”的原则：结构性主数据可以 SQL 化，语言规则源码保持文本化，派生结果只作为缓存或索引。不要为了“完全关系化”把 DSL 函数、集合、AST、诊断或生成结果拆成主表。

当前判断：

- 形态模板组、模板组内子表、子表单元格、词条使用的模板组实例和词条级单元格 override 是结构性主数据，适合 SQL 化。
- 函数和集合更像规则库源码，应保存为一段文本，供 parser 派生函数列表、集合列表、依赖图和诊断；不要把每个函数参数、条件分支或输出拆成 SQL 主数据。
- 生成出的形态形式、解析 AST、错误诊断、函数引用关系可以后续做缓存或索引，但都不是用户数据真相来源。
- 形态表格不需要 Excel 化；只保存子表标题、大小、行列标签和单元格规则文本，不预设样式、合并单元格、行高列宽等电子表格能力。
- 词条的 `morphology_mode` 是必要的结构字段，取值仅为 `auto` 或 `manual`：自动模式由匹配规则决定展示组，`entry_morphology_groups` 是按真实模板组 ID 查询的 overlay，`position` 不参与自动展示排序；手动模式按显式组列表排序，空列表即明确不使用形态。

当前已落地的 schema：

```text
morphology_template_groups(
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  match_tags_json TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT,
  updated_at TEXT
)

morphology_template_tables(
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  column_count INTEGER NOT NULL,
  row_labels_json TEXT NOT NULL,
  column_labels_json TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
)

morphology_template_cells(
  table_id TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  column_index INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  PRIMARY KEY(table_id, row_index, column_index)
)

entry_morphology_groups(
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  template_group_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT,
  updated_at TEXT,
  PRIMARY KEY(entry_id, template_group_id)
)

entry_morphology_cell_overrides(
  entry_id TEXT NOT NULL,
  template_group_id TEXT NOT NULL,
  template_table_id TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  column_index INTEGER NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY(entry_id, template_group_id, template_table_id, row_index, column_index),
  FOREIGN KEY(entry_id, template_group_id)
    REFERENCES entry_morphology_groups(entry_id, template_group_id) ON DELETE CASCADE
)
```

字段边界说明：

- `morphology_template_groups.notes` 保留，因为模板组级说明很快会成为前端 UI 需求。
- `entry_morphology_groups.title` 保留，因为一个词条未来可手动配置多个形态模板组，词条级显示标题需要独立于模板组名称；`notes` 保留用于说明该词条采用此形态组时的特殊信息。模板组自身的 `notes` 不应自动显示在词条详情或词条编辑中。
- 同一词条不能重复实例化同一个模板组，因此词条形态组不分配独立 UUID，而以 `entry_id + template_group_id` 作为组合主键；override 使用同一组合外键。
- `entries.morphology_mode` 取值为 `auto` 或 `manual`；`template_group_id` 只保存真实模板组 ID，不使用 `auto` / `none` 伪值。手动模式按 `entry_morphology_groups.position` 排序，空列表即明确不使用形态；自动模式的排序来自自动分配规则，overlay position 没有业务语义。
- `morphology_template_cells` 暂不设独立 `id`、`mode`、`ast_json`、`diagnostics_json` 或 cell 级时间戳；单元格由 `table_id + row_index + column_index` 定位，规则文本是主数据。
- `entry_morphology_cell_overrides` 暂不设独立 `id`、`mode`、`notes` 或单条 override 时间戳；存在记录即表示手动覆盖，不存在则走模板规则自动生成。
- `match_tags_json`、`row_labels_json`、`column_labels_json` 暂时保持 JSON 字段，因为它们当前不需要独立筛选、排序或局部引用。

旧数据迁移语义：

- 旧 JSON 字段迁移入口是 `lib/legacy-dictionary-migration.js`；核心 `dictionary-model` 与共享 `morphology-model` 只处理当前形状规范化。旧形态结构到新形态结构的迁移归迁移模块负责；SQLite repository 直接消费共享模型规范化后的模板组/词条形态组并写入 SQL projection。
- 旧版单个 `morphology.tables[n]` 迁移为一个 `morphology_template_group`，其中包含一个 `morphology_template_table`。
- 旧版 `table.cells` 迁移为 `morphology_template_cells.source_text`。
- 旧版 `entry.morphology` 迁移为一个 `entry_morphology_group`。
- 旧版 `overrides_json` 迁移为 `entry_morphology_cell_overrides`；在模板组和子表已经 SQL 化后，不再继续用复杂 JSON key 保存 override。
- 旧版本 JSON 导入时必须迁移到新形态结构；但不要为了旧前端数据形状额外维护临时兼容层。形态前端应直接迁到新模板组/子表/词条形态组模型，前端因此暴露的问题应在前端修复。
- SQLite repository 只重建当前 `templateGroups` / `morphologyGroups`，不回吐旧 `morphology.tables` 或 `entry.morphology`。前端 `normalizeMorphology()` 仍额外生成一份已无消费者的扁平 `tables` 投影（审计 C11）；清理时删除前端投影，不在 repository 中恢复旧输出。

## 6. 索引与派生表

当前索引：

```text
idx_entries_lemma                        entries(lemma)
idx_entries_created_at                   entries(created_at)
idx_entries_updated_at                   entries(updated_at)
idx_entry_tags_tag_entry                 entry_tags(tag, entry_id)
idx_entry_sources_target_entry_id        entry_sources(target_entry_id)
idx_entry_search_values_field            entry_search_values(field, entry_id)
idx_definitions_entry_id                 definitions(entry_id)
idx_morphology_template_tables_group_id  morphology_template_tables(group_id)
idx_morphology_template_cells_table_id   morphology_template_cells(table_id)
idx_entry_morphology_groups_entry_id     entry_morphology_groups(entry_id)
idx_entry_morphology_overrides_group     entry_morphology_cell_overrides(entry_id, template_group_id)
```

当前的搜索派生表：

```text
entry_search_values(entry_id, field, source_type, source_id, source_position, value_type, raw_value, normalized_value)
entry_morphology_search_values(entry_id, position, template_group_id, template_table_id, row_index, column_index, raw_value, normalized_value)
```

新增派生索引、关系表或结果缓存表，必须由真实查询需求和基准证明，并满足 `AGENTS.md` 的 SQL 化必要性判断。数据分析、功能结果和质量结果当前只使用进程内会话缓存（见第 7 节），不建 SQLite 派生结果表。冗余索引与默认排序复合索引的待定事项见[审计清单](AUDIT_OPEN_ISSUES.md) C14、R09。

## 7. 查询会话与结果缓存

运行时查询会话、结果缓存和数据窗口只为性能服务，不是新的数据真相来源：不新增 SQLite cache 表，不把派生结果写入词典或导出，不缓存完整 snapshot 或完整词条对象，也不引入持久化 revision、保存冲突协议或多进程一致性机制。cursor、窗口、定位和 stale 错误的 HTTP 语义见 [API Contract](API_CONTRACT.md#词条列表查询)；feature result 与质量结果的会话身份见 API Contract 对应各节。

### 7.1 三层职责

```text
前端 QueryPageCache（lib/query-page-cache.js）
  可渲染窗口状态 + in-flight Promise
        ↓ HTTP
后端 QuerySessionCache（lib/query-session-cache.js）
  查询身份 + 有序结果身份 + 命中定位索引
        ↓
SqliteDictionaryRepository
  主数据、projection、排序和页面 DTO 组装
```

- **前端页面缓存**保存 `{ items, pageInfo, searchSummary }`（词根组首窗另带 `windowMetrics`），不保存完整词典或完整详情。key 由词典 ID、`dictionary.updatedAt`、查询种类、规范化查询 descriptor、cursor 和 limit 组成，不跨 `updatedAt` 命中。只缓存成功响应；已被当前界面 `requestId` 淘汰的迟到响应，只要词典版本和查询 key 仍匹配，仍可写入缓存。同 key 请求共享一个 Promise。成功写入、词典覆盖或删除后按词典清空。单条完整详情使用独立的同类缓存，保存响应直接更新其中的当前词条。
- **后端会话**缓存结果身份而不缓存词条：完整规范化 descriptor、有序结果（entries 为 `orderedIds` 与 `entryIndexById`；词根组为组身份、匹配标记与 `groupIndexByRootId`）、同一轮 projection 匹配聚合的 `searchSummary`、`total` 和 `estimatedBytes`。`searchHits` 与页面 DTO 按当前窗口从 projection 和主表回读，不长期驻留内存。只有 digest 无法恢复字段、fuzzy 配置和命中定位语义，因此会话必须保留完整 descriptor。
- **repository** 负责规范化、结构筛选、projection 匹配、稳定排序和 DTO 组装，成功写入后通知缓存失效。缓存模块不复制搜索、词性、标签或形态语义；缓存 miss 必须与无缓存查询产生完全相同的顺序、`total`、`searchHits` 和 DTO。

### 7.2 查询身份

会话 key 由单一后端函数 `entryQueryIdentity()` 从规范化 EntryQuery 生成：数组去重并稳定排序，默认值显式补齐；`cursor`、`limit`、`windowOffset` 和界面语言不进入身份，无搜索文本时搜索字段配置也不制造会话分叉。API route、repository 和缓存不各自拼接字符串。前端可以生成语义相同的页面 key，但服务端身份以该函数为准。

### 7.3 物化策略

| 查询 | 策略 | 原因 |
| --- | --- | --- |
| `/entries` 无搜索结构筛选 | 前端页缓存；后端直接 SQL count/page，定位在数据库内计算 | SQL 已能直接分页，物化全部 ID 得不偿失 |
| `/entries` 严格或 fuzzy 搜索 | 后端会话 | 首次扫描 projection 形成有序命中 ID；总数、后续窗口和定位复用同一结果 |
| `/root-groups`（含搜索） | `RootTopologyCache` + 后端会话 | 拓扑按独立 relation generation 构建一次并维护 `entryId → rootIds`、`rootId → group` 索引；会话只保存排序/匹配后的组视图；带搜索时只读取去重命中 ID 再映射到拓扑 |
| `/facets`、`/entries/filter-facts` | 按 generation 的小型响应/事实缓存 | payload 小，不需要分页会话 |
| feature result、质量结果 | 各自独立的 `FeatureResultSessionCache` 实例 | 身份与视图见 API Contract |

### 7.4 失效

- 服务端为每个词典维护纯运行时 `cacheGeneration`。词条、模块、metadata、批处理、完整导入/覆盖和词典删除成功写入后，先递增 generation，再清除该词典会话；no-op 保存不写入、不失效，失败或回滚的事务不得使仍然有效的会话失效。基准证明必要之前不按模块收窄失效范围。
- `cacheGeneration` 只保证本进程内缓存与 cursor 的正确性：不写入 SQLite、不随导出、不参与保存冲突判断，也不是业务 revision。`updatedAt` 用于前端页面 key 和诊断；两次写入落在同一毫秒时，generation 仍能区分。
- 词根拓扑使用独立 relation generation：只有词条增删、来源目标变化、完整导入覆盖和词典删除使其失效（拓扑不依赖 lemma）。lemma 改名等普通保存和 `patchEntries()` 只同步缓存中的排序字段并清除排序视图，metadata、settings、IPA、docs、形态和语料保存不触碰拓扑。
- 外部进程直接改写 `.sqlite` 不属于支持场景；服务重启自然清空全部运行时会话。

### 7.5 cursor 与重建

cursor 由 `lib/result-window-cursor.js` 编码，绑定 process epoch、`cacheGeneration`、descriptor（或 feature 视图）digest 和 offset，客户端不得解析。缓存只是加速器，不是 cursor 正确性的必要状态：会话被 TTL/LRU 淘汰，或单项因超过容量从未缓存时，只要 epoch、generation 和 descriptor 仍匹配，就按 descriptor 重算并从 offset 继续。只有服务重启、成功写入或 descriptor 不匹配才返回 `query_cursor_stale`，前端从首窗重建查询并按列表锚点恢复位置。

### 7.6 容量与并发

- 当前参数：`QuerySessionCache` 每词典 8 个会话、全局约 64 MiB、空闲 2 分钟；`FeatureResultSessionCache` 默认每词典 4 份、约 32 MiB、空闲 2 分钟；前端页面缓存 4 项、约 16 MiB，单条详情缓存 12 项、约 12 MiB。它们是实现参数而非 API 语义，应按 `estimatedBytes` 和实际命中率调整。
- 每个缓存同时受数量、全局估算字节、idle TTL 和 LRU 限制。单项超过上限时直接不缓存，但正常返回结果；淘汰只影响性能，不改变查询结果，也不使有效 cursor 失效。功能结果视图增长尚未计入字节预算，见[审计清单](AUDIT_OPEN_ISSUES.md) A17。
- 同 key 的并发构建合并为一个 in-flight Promise；失败的 Promise 不留在缓存中。

### 7.7 可观测性与检查

开发期统计 hit、miss、eviction、invalidation、构建耗时 `buildMs`、会话数、`estimatedBytes` 和查询种类，不记录查询正文或词条内容。检查应覆盖：

1. 参数顺序不同但语义相同的请求命中同一 descriptor；不同词典、字段、fuzzy 设置和排序不串用结果。
2. 严格及 fuzzy 的重复查询不再执行完整候选扫描。
3. 成功写入立即失效，no-op 与失败写入不失效。
4. TTL、LRU 和容量淘汰只导致重算；缓存开启与关闭的顺序、总数和命中详情完全一致。
5. 写入、服务重启或 descriptor 不匹配时 stale cursor 返回稳定错误码，不混合两个词典版本。
6. 并发相同请求共享一次构建，失败 Promise 不留在缓存中。
7. 折叠词根组不携带子项，展开时一次读取整组；父级窗口淘汰不丢失全局展开或单组例外状态。

## 8. Repository 能力边界

下表是 `SqliteDictionaryRepository` 各能力当前是否仍需组装完整词典，以及已知的后续方向。

| 范围 | 当前实现 | 是否组装完整词典 | 后续方向 |
|---|---|---|---|
| Schema 初始化 | `.sqlite` 文件、`dictionary_meta`、`module_blobs`、`entries`、`definitions`、`entry_tags`、`entry_sources`、两张搜索 projection、`morphology_template_groups/tables/cells`、`entry_morphology_groups/cell_overrides` 和第 6 节索引；`entries` 投影 `etymology_description`，不含 `entry_json` | 否 | 旧库兼容见审计 R04；冗余列与索引见 C13、C14 |
| JSON 导入 / 导出 | 受支持当前字段的 JSON → SQLite projection/blob 写入，以及 SQLite → 当前 JSON profile 导出 | 是，这是预期的交换能力；未知字段不承诺 roundtrip | 保留为导入、导出和迁移边界 |
| 词典生命周期 | 创建、导入、导出、激活、删除、偏好保存、`hasDictionary()`、`requireDictionary()` | 仅导入和导出 | 产品内迁移入口暂缓，见[导入导出规范](IMPORT_EXPORT_SPEC.md) |
| `readState()` / `listDictionaries()` / `getDictionaryMeta()` | 只返回 `dictionary_meta` 与 summary；`entryCount` 和严格 `rootCount` 由轻量 SQL 计算，不写入 metadata | 否，也不建立词根拓扑 | — |
| `getDictionaryWorkspace()` / `getDictionarySnapshot()` | `GET /api/dictionaries/:id` 只读元数据、模块 blob、形态结构与 summary，不读词条（30k 压测词典约 1 ms、8.6 KiB）；`getDictionarySnapshot()` 组装含全部词条的完整快照，只供导出与测试 | 前者否，后者是 | 不提供完整快照 PUT；普通保存使用元数据、模块、单词条或批量端点，整词典改写使用 `entries/batch` |
| `updateMetadata()` | 直接更新 `dictionary_meta` 并返回 metadata payload | 否 | — |
| `updateSettings()` / `updateIpaSettings()` | 直接更新 `module_blobs.settings`，IPA 只替换 settings 内的 `ipa`；IPA 映射为无 ID 的顺序文本规则，返回 `{ id, updatedAt, settings }` | 否 | 如增加 IPA 搜索/质量索引，再同步刷新 |
| `saveDocs()` | 直接更新 `module_blobs.docs` 并返回 `{ id, updatedAt, docs }` | 否 | — |
| `saveMorphology()` | 保留形态语法校验；旧 `leftV/rightV` 函数对象设置写入 `module_blobs.morphology`，模板组/子表/单元格写入 SQL 表；同一事务内按受影响范围重建形态搜索 projection（第 10 节），并做提交内实体 ID 检查 | 否；只返回 `{ id, updatedAt, morphology }` | DSL v2 时移除旧函数对象设置 |
| `saveCorpusChanges()` | 直接更新 `module_blobs.corpus` 并返回 `{ id, updatedAt, corpus }`；检查语料内部 ID 重复 | 否；语料内容整块保存 | 不提供伪细粒度读取；语料升级阶段按正式 SQL 模型设计 HTTP API（审计 R06） |
| `saveEntry()` / `deleteEntry()` / `patchEntries()` | 按词条写入目标 entry、definitions、tags、sources、词条形态组/override 和两张搜索 projection，删除经外键级联；`patchEntries()` 可附带 settings；返回 `{ id, updatedAt, entry }`、`{ id, updatedAt }` 或 `{ id, updatedAt, entries, settings? }` | 否 | 词条内部仍整条重建子记录与搜索投影（审计 A20） |
| `getEntry()` | 按 `entries.id` 读取 SQL 表并组装完整 entry | 否 | — |
| `queryEntries()` | 始终返回摘要 DTO 分页对象。无搜索时完全下推到 SQL：词性与标签 `any/all` 由 `(tag, entry_id)` 索引驱动的候选集合实现，无词性反向查询复用标签候选集；词性只由词典显式配置的词性标签决定，不读取标签位置；活动日期使用 UTC 半开范围，来源数量上下界共享一次计数 | 否；完整词条只通过 `getEntry()` 按需读取 | 按真实基准继续优化查询形状；默认排序索引见审计 R09 |
| 严格 / fuzzy / 形态搜索 | 按字段读取两张 projection（第 9、10 节），首次查询建立有序命中 ID 会话，总数、窗口和定位复用同一结果；统一返回 `searchHits`；fuzzy 通过连接级确定性函数复用共享评分 | 否；fuzzy 线性扫描所选 projection records | 候选索引见第 11 节 |
| `getEntryFacets()` | SQL 聚合活跃标签身份、词性、标签频率和无词性计数 | 否 | — |
| `getEntryRelations()` | 用 `entry_sources`/`entries` 查询来源和直接衍生，并复用稳定词根拓扑的反向索引组装同根组 | 否 | 衍生词逐个读取完整详情再取摘要（审计 A19） |
| `queryRootGroups()` | 词根拓扑按 relation generation 稳定缓存，查询只生成排序/匹配视图，搜索命中直接读取两张 projection | 否 | 极大单个家族的响应体积见审计 R03 |
| 数据分析 / 功能结果 / 质量检查 | `/analysis/query` 直接查询 SQLite 聚合与稳定拓扑；IPA 与形态 feature result、质量结果分别由服务从最小事实读取（如 `qualityInputRecords()`）构建会话 | 否 | 30k 质量冷构建的同步读取约阻塞 380 ms，复评门槛见 API Contract |
| 契约测试 | SQLite repository 跑完整当前 repository contract；模型、旧 JSON 转换和目录迁移分别运行定向检查 | 否 | — |
| 主服务接入 | 运行期只使用 SQLite repository，无 JSON runtime repository 或存储后端 feature flag；`scripts/check-default-repository.js` 覆盖 SQLite 服务启动 | 否 | — |

## 9. 静态逐值检索 projection

共享搜索模型定义带来源定位的 value record，`/entries` 的 `searchHits` 形状见 [API Contract](API_CONTRACT.md#逐值检索与命中定位契约)。静态字段 records 写入：

```sql
CREATE TABLE entry_search_values (
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL DEFAULT '',
  source_position INTEGER NOT NULL,
  value_type TEXT NOT NULL,
  raw_value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  PRIMARY KEY (
    entry_id,
    field,
    source_type,
    source_position,
    value_type
  )
);
```

该表是可从当前主数据重建的派生 projection，不分配独立实体 ID，也不进入跨实体 ID 防撞。它只包括 `lemma`、`pronunciation`、`tags`、`definitions`、`examples`、`notes`、`etymology`；`morphology` 使用下节的独立派生表和失效边界。

写入与失效边界：

- 导入和整库覆盖同步写入；`saveEntry()` / `patchEntries()` 只重建目标词条的 records，删除词条通过外键级联删除。
- 标签显示替换变化时重建 `tags` records。
- NFC、case folding 或自定义等价规则变化时，在同一事务内重建全部静态 `normalized_value`。
- 搜索字段启用状态和 fuzzy 开关只影响查询，不影响 projection 内容，切换它们不需要重建。
- 该 projection 不替代原始表，也不参与 JSON 导出；`raw_value` 只用于返回命中摘要和来源定位。不做 schema 版本检测、回填或查询 fallback。

严格查询按独立 value 执行 `instr(normalized_value, ?)`，覆盖非 ASCII、NFC、Unicode case folding 和自定义等价规则；任意子串 `instr` 不能仅靠普通 B-tree 索引获得完整加速。

## 10. 形态搜索 projection

```sql
CREATE TABLE entry_morphology_search_values (
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  template_group_id TEXT NOT NULL,
  template_table_id TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  column_index INTEGER NOT NULL,
  raw_value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  PRIMARY KEY (
    entry_id,
    template_group_id,
    template_table_id,
    row_index,
    column_index
  )
);
```

该表不分配独立 ID，不参与 JSON 导出，也不替代模板、词条形态组或 override 主数据。共享 `morphologySearchValueRecords()` 按真实自动/手动形态语义生成带模板组、子表、行列坐标和全局求值顺序的 records；空值不写入。

- 导入和整库覆盖在写入形态主数据后全量生成。
- `saveEntry()` 和 `patchEntries()` 随目标词条局部重建；`deleteEntry()` 通过外键级联删除。
- `saveMorphology()` 保持完整模块替换契约，但比较规范化前后状态：名称、说明和不参与生成的表格标签只增量更新模板行；规则、函数、表结构与自动匹配变化先定位受影响模板组，再只重建显式使用该组或自动分配发生变化的词条。自动分配定位只扫描轻量的词条 ID、模式和标签，不执行全词典形态求值；完全相同的 payload 不更新时间、模板行或 projection。
- 删除模板组、删除或移动子表、缩小表格尺寸前先检查 `entry_morphology_groups` 与 override 坐标；可能留下悬空引用时返回 `morphology_references_in_use` 并拒绝保存，不静默删除词条配置。
- NFC、case folding 或自定义等价规则变化时全量重建 `normalized_value`；标签显示替换不影响形态值，不触发重建。

查询形状（静态与形态 projection 相同）：没有结构筛选时直接扫描所选 projection；存在词性、标签或其他结构条件时，把 SQL 条件编译为物化 `candidates` 关系，以候选为外层连接两张 projection，不把候选 ID 传回 JavaScript 求交，也不使用经验分批阈值。严格字段执行 `instr()`，fuzzy 字段调用连接级 `conlexicon_fuzzy_match()`；首次查询保存最终有序命中 ID 与反向下标，repository 只为当前窗口回读命中 records。词根模式搜索复用同一匹配 SQL，但只读取去重命中 ID，再映射到稳定拓扑。两条路径都不导出完整 snapshot 或逐词条动态生成形态。

## 11. 暂缓

以下在真实需求或基准出现前不做；它们可以受益于 SQLite，但不应和无关改动混在一起：

- **候选索引**（FTS、ngram 等）：fuzzy 仍线性扫描所选 projection records，只有真实词典基准确认它成为主要瓶颈后再选型。
- **语料 SQL 化**：语料库进入独立升级阶段（[阶段 D](CORPUS_WORKSPACE_PLAN.md)）后，再把 `module_blobs.corpus` 拆成正式 SQL 表及块/单元级 API；保存粒度的待定事项见审计 R06。
- **例句语料链接**：见[阶段 C 计划](EXAMPLE_CORPUS_LINK_PLAN.md)；义项外键与级联策略见审计 R11。
- 自定义滚动条、首字母/全局导航地图和 marker/overview 交互；现有原生滚动条、数据窗口与虚拟列表继续保留。
- 高级形态分析或自动 gloss 系统。
- 面向多窗口实时协同的 revision 机制；单词条条件保存见审计 A05 与 [Entry Incremental Save Plan](ENTRY_INCREMENTAL_SAVE_PLAN.md)。
