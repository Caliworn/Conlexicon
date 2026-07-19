# SQLite 后端现状与后续设计

本文记录 Conlexicon 当前 SQLite 数据层的真实状态与后续设计。它用于说明已稳定的 API 边界，以及哪些 JSON 专用优化不应再继续加码。正式迁移、JSON 兼容导入/导出和 export profile 的设计见 [SQLite Migration Plan](SQLITE_MIGRATION_PLAN.md)。

运行时查询会话、结果缓存、失效边界及其与后续数据窗口化的关系见 [Query Session Cache Plan](QUERY_SESSION_CACHE_PLAN.md)。

## 1. 目标

- SQLite 已是正式运行期主存储，而不是 JSON 文件的旁路缓存。
- 前端只依赖 HTTP API 和结构化响应，不感知底层存储实现；正式运行期主路径以 SQLite repository 为准。
- 保留完整 JSON 导入/导出能力，作为交换格式、备份格式和迁移入口。
- 普通运行期保存、查询、分析和质量检查逐步摆脱完整词典快照。
- 语料库、词根模式、词汇网络、数据分析和未来诊断修复共享同一套查询语义。

## 2. 非目标

- 不长期双写 JSON 与 SQLite。双写会制造两个真相来源，失败恢复也复杂。
- 不保留第二套 JSON runtime repository。旧 JSON 只通过 conversion service、legacy migration 和显式目录迁移脚本进入 SQLite。
- 不在 SQLite 迁移时顺手重做例句语料链接、高级形态分析或大规模前端模块化。
- 不要求第一版 SQLite 一次实现所有最终索引；可以先覆盖核心读写，再增量加入 FTS、派生索引和分析缓存。

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

词典名称、语言、描述及 entry/root summary 由各 `.sqlite` 文件查询；`entryCount` 是直接 SQL count，`rootCount` 复用可缓存的稳定词根拓扑。它们不写入 `index.json` 或 metadata，但冷启动首次构建拓扑仍可能有可观测成本。每个 `.sqlite` 文件保存一个词典的内容、配置、文档、语料和派生索引。

反推 API 契约：

- `GET /api/state` 不应长期返回完整词典数组；应拆成轻量启动状态、词典列表、当前词典 summary 和按需读取。
- 词典管理列表只需要轻量 metadata，不应要求读取每个词典完整内容。
- 导入/导出仍使用完整 JSON，但这属于交换路径，不应被普通编辑保存复用。

## 4. Repository 分层

目标分层：

```text
HTTP API
  ↓
Feature Services
  AnalysisService / QualityService / RelationService / EntrySearchService / CorpusService
  ↓
DictionaryQueryContext
  统一查询、索引、聚合和事务上下文
  ↓
DictionaryRepository
  SqliteDictionaryRepository
  Legacy JSON conversion / directory migration (offline only)
```

SQLite 化后，`DictionaryQueryContext` 应从“请求级临时 Map/Set”自然切换为“SQL 查询、索引表、视图或临时表”，但上层 service 的返回语义不变。

反推 API 契约：

- API 返回结构应表达功能语义，而不是泄露当前 JSON 对象形状。
- 前端不能依赖“保存后返回完整词典 JSON”来刷新所有状态。
- SQLite repository 跑完整当前主契约；旧 JSON 转换和目录迁移使用独立定向检查，不存在第二套运行期 repository 契约。

## 5. 当前 SQLite schema

本节记录当前 `SqliteDictionaryRepository` 实际创建的 schema。它已经不再只是初始草案：词条核心、释义、标签、来源、形态模板组、形态子表、词条形态组和 override 已经关系化；低频或尚未定型的模块继续放在 `module_blobs` 中。开发期 SQLite schema 中间态不承诺兼容迁移，测试库不匹配时从 JSON 重新生成。当前开发线不保存 schema 版本或 migration 表；下一个正式 release 才应引入带有明确升级脚本的版本化 migration 机制。

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

`module_blobs` 是 SQLite 主库里的 JSON 扩展位，不是把设置 SQL 化。第一版可用它保存低频或结构复杂的模块，例如 `settings`、`ipa`、`docs`、暂未拆表的语料配置，以及形态学当前 v1 DSL 的 `leftV/rightV` 函数对象设置。只有当某个模块需要独立查询、筛选、排序、索引或局部保存时，才再拆出关系表。

反推 API 契约：

- 词典 metadata 保存应独立于词典内容保存。
- 设置、IPA、形态学、文档配置等低频模块保存应是模块级端点，但第一版可以写入 `module_blobs`。
- 保存端点应返回 `{ dictionaryId, updatedAt, ...changedObject }` 或轻量 summary，而不是完整词典。

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
  source_key TEXT NOT NULL,
  PRIMARY KEY(entry_id, position)
)

```

当前 schema 已明确移除 `entries.entry_json`。SQLite 不再保存完整词条 JSON 副本，而是从 `entries`、`definitions`、`entry_tags`、`entry_sources` 和形态学结构化表组装 entry object。

SQL 列名沿用表语义：`entries.notes` 映射词条对象的 `entry.notes`，`definitions.notes` 映射单条释义对象的 `definition.note`。运行期对象只使用 `note`，不接受旧 `definition.notes` 别名；旧字段转换仅由 legacy migration 处理。

反推 API 契约：

- `GET /entries` 必须支持分页、稳定排序、搜索、词性筛选、无词性筛选、标签筛选、来源派生筛选和字段选择。
- `GET /entries/:entryId` 返回单条词条详情。
- `PUT /entries/:entryId` / `POST /entries` / `DELETE /entries/:entryId` 是普通词条编辑的主路径。
- 局部编辑可以暂时仍是“词条级增量”，但 API 契约要允许未来升级为 definition/tag/source 子对象 patch。
- 删除词条必须由后端在事务中删除定义、标签、来源、词条形态组、形态 override 等子对象。

当前 SQLite 开发线中，`entries`、`definitions`、`entry_tags`、`entry_sources` 和形态学结构化表是词典主结构；不再用 `entries.entry_json` 保存完整词条副本。JSON 导入会写入这些 SQL 表，JSON 导出则从 SQL 表重新组装完整词典对象。后续如果某个子对象需要独立编辑或更强一致性，应继续在 SQL 主结构上扩展，而不是恢复完整词条 JSON 存储。

### 5.3 暂缓 SQL 化的模块

第一版不要盲目为 IPA、形态学 DSL 函数库、文档和语料预建关系表。当前真实边界是：

- IPA 规则：先放 `module_blobs("ipa")`。
- 形态学旧 `leftV/rightV` 函数对象设置：暂时继续放 `module_blobs("morphology")`；后续 DSL v2 函数库落地时再移除。
- 形态学模板组、子表、单元格、词条形态组和 override：已经拆为 SQL 结构化表。
- 语言文档：先放 `module_blobs("docs")` 或后续单独文本表。
- 语料库：后续进入语料升级时再正式 SQL 化；不要在第一版 SQLite 主存储里预先建一套未使用的 corpus schema。

反推 API 契约：

- 自动 IPA 和形态学配置必须是模块级保存。
- 搜索 API 必须继续通过共享 IPA/形态模块解释规则；如果后续缓存生成结果，必须在词条、标签、规则或 override 变化时失效。
- 批量 IPA 生成和标签排序这类批量操作应走明确 batch endpoint，返回影响数量和失败项。

语料库最终仍然应该 SQL 化，因为大语料必须分页、局部保存和排序；但这应作为语料升级阶段的单独设计，而不是第一版词条查询 SQLite 化的一部分。

### 5.4 形态学结构化 schema

形态学 SQL 化必须继续遵守“先判断必要性”的原则：结构性主数据可以 SQL 化，语言规则源码保持文本化，派生结果只作为缓存或索引。不要为了“完全关系化”把 DSL 函数、集合、AST、诊断或生成结果拆成主表。

当前判断：

- 形态模板组、模板组内子表、子表单元格、词条使用的模板组实例和词条级单元格 override 是结构性主数据，适合 SQL 化。
- 函数和集合更像规则库源码，应保存为一段文本，供 parser 派生函数列表、集合列表、依赖图和诊断；不要把每个函数参数、条件分支或输出拆成 SQL 主数据。
- 生成出的形态形式、解析 AST、错误诊断、函数引用关系可以后续做缓存或索引，但都不是用户数据真相来源。
- 形态表格不需要 Excel 化；第一版只保存子表标题、大小、行列标签和单元格规则文本，不预设样式、合并单元格、行高列宽等电子表格能力。
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
- SQLite repository 已只重建当前 `templateGroups` / `morphologyGroups`，不会回吐旧 `morphology.tables` 或 `entry.morphology`。前端数据分析仍在 `app.js` 内临时派生旧式单表视图；待分析模块升级为直接使用共享 morphology model 后，应删除该前端适配，而不是在 repository 中恢复旧输出。

## 6. 索引与派生表

第一批 SQLite 索引重点服务当前已经暴露或确定要暴露的 API：

```text
idx_entries_lemma
idx_entries_updated_at
idx_entry_tags_tag
idx_entry_sources_source_key
idx_entry_search_values_field
idx_definitions_entry_id
idx_morphology_template_tables_group_id
idx_morphology_template_cells_table_id
idx_entry_morphology_groups_entry_id
idx_entry_morphology_overrides_group
```

当前已落地的搜索派生表包括：

```text
entry_search_values(entry_id, field, source_type, source_id, source_position, value_type, raw_value, normalized_value)
entry_morphology_search_values(entry_id, position, template_group_id, template_table_id, row_index, column_index, raw_value, normalized_value)
```

后续是否增加以下派生索引或缓存，必须由查询需求和基准决定：

```text
entry_part_index(entry_id, part_tag)
entry_relation_index(root_entry_id, derived_entry_id, depth)
analysis_cache(cache_key, value_json, updated_at)
quality_cache(cache_key, value_json, updated_at)
```

反推 API 契约：

- 词条搜索必须明确字段参数，当前 `fields` / `fuzzyFields` 方向是对的。
- 词性筛选应通过 `facets` 或 query index 返回，不应让前端自己扫全量词条。
- 词根模式、词汇网络、数据分析 relation slice、质量检查词源问题必须共享来源关系索引。
- 数据分析和质量检查可以有缓存，但缓存键必须来自词典版本、相关设置版本、语言和请求参数，而不是 UI 临时状态。

## 7. 关键 API 契约反推

以下契约优先级高于继续做 JSON 专用优化。

### 7.1 启动与词典列表

需要稳定：

```text
GET /api/app
GET /api/dictionaries
GET /api/dictionaries/:id/summary
GET /api/dictionaries/:id/settings
```

理由：SQLite 下启动不应加载完整词典；词典列表也不应打开每个数据库的全部内容。

### 7.2 词条列表窗口化

当前 `/entries` 应继续收束为未来的主查询入口：

```text
GET /api/dictionaries/:id/entries?q=&part=&tags=&tagMode=&fields=&fuzzyFields=&sort=&cursor=&limit=
```

必须明确：

- 返回 `items`、`pageInfo`、`total` 或可解释的 `estimatedTotal`。
- 排序必须稳定，cursor 不能因同值排序漂移。
- 搜索命中字段、标签显示替换和词性识别使用共享模块语义。
- 前端高级筛选应最终收束为可序列化 filter descriptor，而不是只传一组本地 ID。

### 7.3 facets

```text
GET /api/dictionaries/:id/facets?q=&fields=&fuzzyFields=&activeFilter=
```

必须明确：

- 词性 facets 使用当前词典设置识别出的词性标签。
- “无词性”是标准 facet 值，而不是前端临时特殊项。
- 后续标签频率、标签组合、质量问题分类也应能挂到 facets 或 query summary 上。

### 7.4 词根与词汇网络

```text
GET /api/dictionaries/:id/root-groups
GET /api/dictionaries/:id/entry-relations/:entryId
```

必须明确：

- `root-groups` 需要 `total`、分页/窗口参数，并固定返回摘要 DTO。
- “展开全部”使用前端全局状态意图；父级首窗返回每个窗口的组数和衍生词总数，用于完整高度估算，组内内容仍按可见范围懒加载，因此不要求所有父级结果同时驻留。
- 关系解析以 lemma/source key 语义为准，并处理同名 lemma 的既有规则。
- 未解析来源属于质量检查，不应塞进诊断修复。

### 7.5 数据分析 query

需要将草案推进为真实契约：

```text
POST /api/dictionaries/:id/analysis/query
```

请求以 widgets/slices 表达需求，而不是要求完整 report：

```js
{
  widgets: [
    { id: "entryCounts" },
    { id: "coverageBreakdown" },
    { id: "partDistribution", limit: 12 },
    { id: "topRootFamilies", limit: 12 }
  ],
  filter,
  locale
}
```

必须明确：

- 总览页只是若干 widgets 的组合，不是固定完整分析报告。
- planner 合并共享 scan；SQLite 下则改用 SQL 聚合或索引表。
- root family、coverage、part distribution、activity preview 都应能单独请求。

### 7.6 质量检查 query

质量检查应成为独立 API，而不是数据分析的附属 slice：

```text
POST /api/dictionaries/:id/quality/query
```

必须明确：

- 支持按优先级、模块、问题类型查询。
- 返回问题摘要、匹配词条 ID 和必要详情。
- 质量高级筛选可以用同一个 filter descriptor 进入词条列表。
- 质量检查缓存与数据分析缓存分离。

### 7.7 保存返回值

普通保存端点不应返回完整词典：

```js
{
  ok: true,
  dictionaryId,
  updatedAt,
  entry,
  summaryPatch
}
```

必须明确：

- 前端更新本地状态时只更新变更对象和必要 summary。
- 保存失败使用结构化错误码。
- 重复 ID、格式错误、对象不存在、版本冲突、导入覆盖等应有稳定 code。

### 7.8 诊断与修复

未来诊断修复可以共享 query 层，但边界应不同于质量检查：

- 诊断修复处理结构错误、迁移错误、重复 ID、孤儿对象、顺序缺失、可自动补齐字段。
- 质量检查处理语言学内容质量，例如 IPA 缺失、未解析来源、标签缺失等。

反推 API 契约：

```text
GET /api/dictionaries/:id/diagnostics
POST /api/dictionaries/:id/diagnostics/fix
```

修复必须返回 dry-run 预览和实际应用结果。

## 8. 当前状态与后续优先级

SQLite repository 的核心读写、schema、迁移脚本和 smoke 已经落地，`server.js` 已默认使用 SQLite；静态和形态搜索 projection 也已进入主查询路径。当前优先级是读取稳定性与剩余查询下推：

1. 查询缓存 Q1–Q4 已完成前端查询缓存、严格/fuzzy entries 与 root groups 后端运行时会话、summary DTO、按需详情、词根组子项懒加载、版本化 cursor 和纯滚动数据窗口；普通词条和父级词根组采用小窗口，单个词根组展开后一次读取全部衍生词，子端点不分页。词根拓扑使用独立 relation generation，搜索条件和无关保存不再触发关系重建。
2. 两段式 stale-while-revalidate、词条切换局部渲染和详情关系 API/缓存接线均已实装；选择词条不再重建当前虚拟列表窗口或前端全词典词源关系索引。失败继续走明确错误状态，不用旧内容掩盖失败。
3. 将高级筛选、数据分析和质量检查逐步接入查询 API/query planner；词汇网络已复用稳定拓扑的 `entryId → rootIds`、`rootId → group` 反向索引，质量检查中的词源查询后续接入同一层。
4. 候选索引是否采用 FTS/ngram 由真实词典基准决定；语料 SQL 化留到语料升级阶段。
5. 旧 JSON 仅维持导入、导出和离线目录迁移价值，不参与运行期查询与保存。

当前状态摘要：`lib/sqlite-dictionary-repository.js` 已使用 `node:sqlite` 初始化 `.sqlite` 文件、`dictionary_meta`、`module_blobs`、词条 projection 表、静态逐值 `entry_search_values`、形态派生 `entry_morphology_search_values`、形态学结构化表和第一批索引；`entries.entry_json` 与 `entry_tags.normalized_tag` 均已移除。标签、词性和自动形态匹配按原始标签精确比较；词源 `source_key` 仍是暂时的宽松文本关系键。开发期不保存 schema 版本或 migration 表；下一个正式 release 才应引入带升级脚本的版本化迁移。`saveEntry()`、`deleteEntry()`、`patchEntries()`、metadata/settings/docs/corpus/morphology/IPA 模块保存都已改为 SQL 级写入。单条读取、列表读取、导出快照、词源关系、facets、形态模板 projection、词根分组以及 `/entries` 的严格与 fuzzy 搜索已从 SQL 表读取或组装；`queryRootGroups()` 的稳定关系拓扑按独立 relation generation 复用，搜索条件直接查询静态/形态 projection。`server.js` 运行期只使用 SQLite repository；旧 JSON runtime repository 已移除。

### 8.1 SQLite repository 当前状态审计

这张表记录的是 `SqliteDictionaryRepository` 当前实现状态。`server.js` 运行期只使用 SQLite repository；旧 JSON 只作为转换和迁移格式。

| 范围 | 当前 SQLite 实现状态 | 是否仍依赖完整 JSON/JS 全量逻辑 | 后续处理 |
|---|---|---|---|
| Schema 初始化 | 已实现 `.sqlite` 文件、`dictionary_meta`、`module_blobs`、`entries`、`definitions`、`entry_tags`、`entry_sources`、`entry_search_values`、`entry_morphology_search_values`、`morphology_template_groups/tables/cells`、`entry_morphology_groups/cell_overrides` 和第一批索引；当前开发期 schema 已投影 `etymology_description`，并移除 `entry_json` | 否 | 测试库不匹配时从 JSON 重迁；下一个正式 release 再引入版本化 migration 与升级脚本 |
| JSON 导入 / 导出 | 已实现受支持当前字段的 JSON → SQLite projection/blob 写入，以及 SQLite → 当前 JSON profile 导出 | 导出本身需要组装完整 JSON，这是预期交换能力；未知字段不承诺 roundtrip | 保留为导入、导出和迁移边界 |
| 词典生命周期 | 创建、导入、导出、激活、删除、偏好保存、`hasDictionary()`、`requireDictionary()` 已实现 | 导入和导出会组装完整词典，这是预期兼容能力 | 后续接主服务时补正式迁移和备份流程 |
| `readState()` / `listDictionaries()` / `getDictionaryMeta()` | 只返回 `dictionary_meta` 与 summary；`entryCount` 用 SQL count，`rootCount` 复用稳定词根拓扑，这些派生统计不写入 metadata | 不重建完整词典，但冷启动 `rootCount` 可能触发一次拓扑构建 | 前端已改为轻量 payload + active dictionary snapshot；后续可单独评估启动期拓扑预热或更轻 summary，而不是把计数写回 metadata |
| `getDictionarySnapshot()` | 按需组装当前词典完整快照，供当前词典启动加载使用；JSON 导出走独立 `exportDictionary()` 边界 | 是 | 不提供完整快照 PUT；普通保存使用元数据、模块、单词条或批量端点 |
| `updateMetadata()` | 已直接更新 `dictionary_meta` 并返回 metadata payload | 否 | 写入与响应均已收窄 |
| `updateSettings()` / `updateIpaSettings()` | 已直接更新 `module_blobs.settings`，IPA 只替换 settings 内的 `ipa`；IPA 映射为无 ID 的顺序文本规则，返回 `{ id, updatedAt, settings }` | 否 | 后续如增加 IPA 搜索/质量索引，再同步刷新索引 |
| `saveDocs()` | 已直接更新 `module_blobs.docs` 并返回 `{ id, updatedAt, docs }` | 否 | 写入与响应均已收窄 |
| `saveMorphology()` | 已保留形态语法校验；旧 `leftV/rightV` 函数对象设置继续写入 `module_blobs.morphology`，形态模板组/子表/单元格写入 SQL projection；形态保存会在同一事务内全量重建形态搜索 projection，并仍做局部实体 ID 校验 | 否；事务提交后只返回 `{ id, updatedAt, morphology }` | 后续 DSL v2 时移除旧函数对象设置，并考虑按模板组/子表进一步收窄写入和失效范围 |
| `saveCorpusChanges()` | 直接更新 `module_blobs.corpus` 并返回 `{ id, updatedAt, corpus }`；语料保存仍做局部实体 ID 校验 | 语料内容仍是 blob | 当前不提供伪细粒度读取方法；真正大语料阶段按正式 SQL 模型设计 HTTP API |
| `saveEntry()` | 已改为 SQL 增量写入，只更新目标 entry、definitions、tags、sources、entry morphology groups/overrides projection 和词典更新时间 | 否；repository 返回 `{ id, updatedAt, entry }`，API 返回保存后的词条 | 写入侧和普通 API 响应已达当前目标 |
| `deleteEntry()` | 已改为 SQL 增量删除目标 entry 及其 definitions/tags/sources/entry morphology groups/overrides projection | 否；repository 返回 `{ id, updatedAt }`，API 返回 `{ updatedAt }` | 写入侧和普通 API 响应已达当前目标 |
| `patchEntries()` | 已改为 SQL 增量更新目标词条 projection；携带 settings 时直接更新 settings blob，并只返回 `{ id, updatedAt, entries, settings? }` | 否 | 写入与 repository/API 响应均已收窄 |
| `getEntry()` | 已按 `entries.id` 读取 SQL 表并组装完整 entry | 否 | 可继续保留 |
| `queryEntries()` | 无参数和带参数请求都返回摘要 DTO 分页对象；无全文搜索时已下推到 SQL，覆盖词性、标签、字段存在性、来源数量、活动日期、排序和窗口读取。P0 已将正向词性及标签 `any/all` 从逐词条相关 `EXISTS` 改为标签索引驱动的候选 ID 集合；手动词性/普通标签使用 `(tag, entry_id)`，自动首标签词性使用 `WHERE position = 0` 的部分索引 | 否 | 完整词条只通过 `getEntry()` 按需读取；无词性反向查询继续复用 `(entry_id, position)` 主键或标签候选集；下一步按实测处理来源数量和日期条件 |
| 全文 / fuzzy / 动态形态搜索 | 严格及 fuzzy 查询均按字段读取 `entry_search_values` 与 `entry_morphology_search_values`，首次查询建立有序命中 ID 会话，后续窗口、总数和定位复用同一结果；形态单字段和静态+形态混合查询均返回统一 `searchHits`；fuzzy 通过连接级确定性函数复用共享评分 | 不再依赖完整 snapshot、逐词条动态形态生成或重复的严格 `COUNT`/页面/排名；fuzzy 仍需线性扫描所选 projection records | 继续以真实基准评估查询形状和候选索引 |
| `getEntryFacets()` | 已改为 SQL 聚合，覆盖词性、标签频率和无词性计数 | 否 | 后续如增加筛选上下文 facets，再扩展 SQL |
| `getEntryRelations()` | 已使用 `entry_sources`/`entries` 查询来源和直接衍生，并复用稳定词根拓扑的 `entryId → rootIds`、`rootId → group` 反向索引组装同根组 | 否；前端词条详情和词汇网络均消费该 API | 质量检查中的词源问题后续接入同一关系层；不再把词汇网络列为待接线项 |
| `queryRootGroups()` | 词根与衍生词 ID 拓扑按独立 relation generation 稳定缓存；无搜索和带搜索查询只生成排序/匹配视图，搜索命中直接读取静态与形态 projection | 否；不再导出完整 snapshot 或重复构建关系；无关保存只刷新轻量排序记录 | fuzzy projection 仍是线性扫描，可继续结合真实基准评估候选索引；质量检查后续复用同一拓扑 |
| 质量检查 / 数据分析 | 还没有直接接 SQLite repository 查询层；数据分析已有 24 项 slice cache，质量检查已有独立的单 report cache。数据分析“词根家族”仍在前端 `dictionary-query-model` 中从完整词典重新建立关系索引和词根分组，没有消费后端 `RootTopologyCache` | 仍依赖完整活动词典；两类缓存 key 都会序列化 O(N) 的相关词条字段，miss 时运行完整前端/共享 JS 算法；词根家族与后端词根模式重复计算关系拓扑；数据分析形态统计另有临时旧单表视图 | 后续做按需 API + SQL/query planner；词根家族排行直接消费稳定后端拓扑，形态统计直接复用共享 morphology model，并删除旧视图 |
| 契约测试 | SQLite repository 已跑通当前完整 repository contract | 否 | 主路径语义变化验证 SQLite contract；模型、旧 JSON 转换和目录迁移分别运行定向检查 |
| 主服务接入 | 运行期只使用 SQLite repository，旧 JSON runtime repository 和后端 feature flag 已移除；SQLite 路径已完成 API/UI smoke；`scripts/check-default-repository.js` 覆盖 SQLite 服务启动 | 否；旧 JSON 词典通过单文件导入或只读目录迁移工具迁入 SQLite | 继续做真实词典实测；后续再设计产品内自动迁移向导 |

### 8.2 S3 静态逐值检索 projection

S3.1 已在共享搜索模型中定义带来源定位的 value record，并固定后续 `/entries` 的 `searchHits` 形状；具体字段见 [API Contract](API_CONTRACT.md)。S3.2 已把静态字段 records 写入 SQLite，当前表结构为：

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

已接入的写入与失效边界：

- `saveEntry()` / `patchEntries()` / `deleteEntry()` 只重建或删除目标词条的 records。
- 标签显示替换变化时重建 `tags` records。
- NFC、case folding 或自定义等价规则变化时，在同一受控流程中重建全部静态 `normalized_value`。
- 搜索字段启用状态和 fuzzy 开关只影响查询，不影响 projection 内容，因此切换它们不需要重建。
- 该 projection 不替代原始表，也不参与 JSON 导出；`raw_value` 只用于返回命中摘要和来源定位。

当前导入、整库覆盖、`saveEntry()` 和 `patchEntries()` 会同步写入 projection，删除词条通过外键级联删除；相关设置变化在同一事务内重建静态 records。没有增加 schema 版本、旧 SQLite 检测、回填或查询 fallback；开发中间态数据库仍应从 JSON 重新生成。

S3.3 已把静态严格查询切换到该表：按独立 value 执行 `instr(normalized_value, ?)`，避免导出完整 snapshot，并为当前页返回 `searchHits`。严格搜索现在与 fuzzy 共用有序命中 ID 会话，总数、后续窗口和定位不再重复执行投射扫描。该路径覆盖非 ASCII、NFC、Unicode case folding 和自定义等价规则；前端直接消费命中定位生成摘要。任意子串 `instr` 仍不能仅靠普通 B-tree 索引获得完整加速。

### 8.3 S4 形态搜索 projection

S4 已新增并接入独立的 `entry_morphology_search_values`：

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

该表不分配独立 ID，不参与 JSON 导出，也不替代模板、词条形态组或 override 主数据。共享 `morphologySearchValueRecords()` 负责按真实自动/手动形态语义生成带模板组、子表、行列坐标和全局求值顺序的 records；空值不写入 projection。

- 导入和整库覆盖会在写入形态主数据后全量生成。
- `saveEntry()` 和 `patchEntries()` 随目标词条 projection 局部重建。
- `deleteEntry()` 通过 `entries` 外键级联删除。
- `saveMorphology()` 在模板/函数写入后全量重建。
- NFC、case folding 或自定义等价规则变化时全量重建 `normalized_value`。
- 标签显示替换不影响形态值，因此不会触发形态 projection 重建。

严格及 fuzzy 查询在没有结构筛选时直接扫描所选静态/形态 projection；存在词性、标签或其他结构条件时，则把现有 SQL 条件编译为物化 `candidates` 关系，并以候选为外层连接 `entry_search_values` / `entry_morphology_search_values`。搜索会话冷构建不再把候选 ID 传回 JavaScript，也不再采用“每 500 个 ID 分批、超过 1000 个则全投射扫描后由 JS 求交”的固定阈值。严格字段执行 `instr()`，fuzzy 字段通过连接级 `conlexicon_fuzzy_match()` 复用共享评分；首次查询保存最终有序命中 ID 与反向下标，repository 只为当前窗口回读完整命中 records。10k 与临时 30k 形态压力词典的同进程交替 A/B 中，约 14% 候选的静态/形态严格与 fuzzy 搜索提升约 1.9–3.3 倍，约 2% 候选提升约 1.0–1.5 倍，无结构筛选提升约 1.1–1.9 倍；接近全量且带结构条件的形态严格查询仍可能与旧全投射扫描持平或慢约 5%，暂不为该边缘形状重新引入经验阈值。两条路径均不再导出完整 snapshot 或逐词条动态生成形态，并返回与共享 record 契约一致的 `searchHits`。fuzzy 仍需对实际候选 records 线性运行评分，后续是否加入真正候选索引应由真实词典基准决定。

## 9. 当前下一批优化建议

按当前依赖关系建议依次处理：

1. 高级筛选 F1/F2 的统一 EntryQuery/EntryFilter 与稳定条件 SQL 编译已完成；词性/标签 P0 查询计划也已改为索引驱动候选集。下一步按 F3 将前端可查询筛选从完整 ID 数组迁入现有 `/entries` 会话、窗口与定位。分析/质量类结果使用独立 result session。
2. 把数据分析和质量检查推进为按需 API + query planner。数据分析词根家族 slice 应直接消费 `currentRootTopology()`：只返回 `{ rootId, lemma, derivedCount }` 和必要的窗口信息，不返回全部 `derivedIds`；可配置 Top N 通过 `limit` 表达。全局衍生词数量不得累加各家族数量，以免多来源词条重复计数。迁移后删除前端重复的关系索引/词根分组，以及未被 UI 消费的 `rootFamilies[].derivedEntryIds`。质量检查中的词源查询也应复用同一稳定拓扑。
3. 数据分析升级时直接消费当前 morphology model，删除前端临时旧单表视图；不要在 repository 恢复旧形态输出。
4. 仅在基准表明确认线性扫描成为主要瓶颈后，再选择 FTS、ngram 或其他候选索引。
5. 语料库进入独立升级阶段后，再把 `module_blobs.corpus` 拆成正式 SQL 表及块/单元级 API。

## 10. 需要暂缓的事情

- 自定义滚动条、首字母/全局导航地图和 marker/overview 交互；现有原生滚动条、数据窗口与虚拟列表继续保留。
- 数据分析所有 slice 的终极缓存策略。
- 语料例句链接的大功能迁移。
- 高级形态分析/自动 gloss 系统。
- 面向多窗口实时协同的复杂 revision 机制。

这些都可以受益于 SQLite，但不应和第一批 SQLite 主存储迁移混在一起。
