# SQLite 后端草案与 API 契约反推

本文记录 Conlexicon 已确定 SQLite 化之后的数据层设计草案。它不是立即迁移清单，而是用来反推当前 API 层哪些契约必须尽早稳定、哪些 JSON 专用优化可以停止加码。

## 1. 目标

- 将 SQLite 作为未来主存储，而不是 JSON 文件的旁路缓存。
- 前端只依赖 HTTP API 和结构化响应，不感知底层是 JSON repository 还是 SQLite repository。
- 保留完整 JSON 导入/导出能力，作为交换格式、备份格式和迁移入口。
- 普通运行期保存、查询、分析和质量检查逐步摆脱完整词典快照。
- 语料库、词根模式、词汇网络、数据分析和未来诊断修复共享同一套查询语义。

## 2. 非目标

- 不长期双写 JSON 与 SQLite。双写会制造两个真相来源，失败恢复也复杂。
- 不把当前 JSON repository 优化成准数据库。JSON repository 只需维持 API 契约兼容和迁移前可用。
- 不在 SQLite 迁移时顺手重做例句语料链接、高级形态分析或大规模前端模块化。
- 不要求第一版 SQLite 一次实现所有最终索引；可以先覆盖核心读写，再增量加入 FTS、派生索引和分析缓存。

## 3. 存储形态

推荐仍然采用“每个词典独立文件”：

```text
data/index.json
data/dictionaries/<dictionary-id>.sqlite
```

`index.json` 继续保存：

- 当前词典 ID。
- 全局界面偏好，例如语言和主题。
- 词典列表的轻量索引：ID、名称、语言、描述、存储类型、文件路径、最后打开时间等。

每个 `.sqlite` 文件保存一个词典的内容、配置、文档、语料和派生索引。

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
  JsonDictionaryRepository / SqliteDictionaryRepository
```

SQLite 化后，`DictionaryQueryContext` 应从“请求级临时 Map/Set”自然切换为“SQL 查询、索引表、视图或临时表”，但上层 service 的返回语义不变。

反推 API 契约：

- API 返回结构应表达功能语义，而不是泄露当前 JSON 对象形状。
- 前端不能依赖“保存后返回完整词典 JSON”来刷新所有状态。
- 同一组契约测试必须能同时跑在 JSON repository 和 SQLite repository 上。

## 5. 初始 schema 草案

第一版 SQLite 不必过度范式化，但必须拆出会被独立查询、独立保存或建立索引的对象。

### 5.1 词典 metadata 与模块 blob

```text
dictionary_meta(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  language TEXT,
  description TEXT,
  schema_version INTEGER NOT NULL,
  created_at TEXT,
  updated_at TEXT
)

module_blobs(
  module TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT
)
```

`module_blobs` 是 SQLite 主库里的 JSON 扩展位，不是把设置 SQL 化。第一版可用它保存低频或结构复杂的模块，例如 `settings`、`ipa`、`morphology`、`docs` 和暂未拆表的语料配置。只有当某个模块需要独立查询、筛选、排序、索引或局部保存时，才再拆出关系表。

反推 API 契约：

- 词典 metadata 保存应独立于词典内容保存。
- 设置、IPA、形态学、文档配置等低频模块保存应是模块级端点，但第一版可以写入 `module_blobs`。
- 保存端点应返回 `{ dictionaryId, updatedAt, ...changedObject }` 或轻量 summary，而不是完整词典。

### 5.2 词条核心

```text
entries(
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  lemma TEXT NOT NULL,
  pronunciation TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT,
  sort_key TEXT,
  entry_json TEXT NOT NULL
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
  normalized_tag TEXT NOT NULL,
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

反推 API 契约：

- `GET /entries` 必须支持分页、稳定排序、搜索、词性筛选、无词性筛选、标签筛选、来源派生筛选和字段选择。
- `GET /entries/:entryId` 返回单条词条详情。
- `PUT /entries/:entryId` / `POST /entries` / `DELETE /entries/:entryId` 是普通词条编辑的主路径。
- 局部编辑可以暂时仍是“词条级增量”，但 API 契约要允许未来升级为 definition/tag/source 子对象 patch。
- 删除词条必须由后端在事务中删除定义、标签、来源、形态 override 等子对象。

第一版 SQLite 中，`entries.entry_json` 保存完整词条 JSON，`definitions`、`entry_tags` 和 `entry_sources` 是查询 projection。这样可以先保证 JSON 导入/导出无损，同时让词条查询、facets 和来源关系获得 SQL 索引。后续如果某个子对象需要独立编辑或更强一致性，再把对应 projection 升级为主数据表。

### 5.3 暂缓 SQL 化的模块

第一版不要盲目为 IPA、形态表、文档和语料预建关系表。更稳妥的做法是：

- IPA 规则：先放 `module_blobs("ipa")`。
- 形态学配置和表格：先放 `module_blobs("morphology")`。
- 语言文档：先放 `module_blobs("docs")` 或后续单独文本表。
- 语料库：后续进入语料升级时再正式 SQL 化；不要在第一版 SQLite 主存储里预先建一套未使用的 corpus schema。
- 词条级形态 override：如果短期搜索需要，可先包含在 entries 的导入/导出 JSON 映射里；只有当 override 需要高频查询或局部保存时，再拆出 `entry_morphology_overrides`。

反推 API 契约：

- 自动 IPA 和形态学配置必须是模块级保存。
- 搜索 API 必须继续通过共享 IPA/形态模块解释规则；如果后续缓存生成结果，必须在词条、标签、规则或 override 变化时失效。
- 批量 IPA 生成和标签排序这类批量操作应走明确 batch endpoint，返回影响数量和失败项。

语料库最终仍然应该 SQL 化，因为大语料必须分页、局部保存和排序；但这应作为语料升级阶段的单独设计，而不是第一版词条查询 SQLite 化的一部分。

## 6. 索引与派生表

第一批 SQLite 索引重点服务当前已经暴露或确定要暴露的 API：

```text
idx_entries_lemma
idx_entries_updated_at
idx_entry_tags_tag
idx_entry_tags_normalized_tag
idx_entry_sources_source_key
idx_definitions_entry_id
```

后续可选派生表：

```text
entry_search_index(entry_id, field, text, normalized_text)
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
GET /api/dictionaries/:id/entries?derivedFrom=:entryId
```

必须明确：

- `root-groups` 需要 `total`、分页/窗口参数和可选 include。
- “展开全部”只有在结果完整或后端支持分页展开时可用。
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

## 8. 当前阶段应该继续做什么

既然已确定 SQLite 化，当前 B 阶段后续优先级应调整为：

1. 收紧 API 契约与 query/service 边界。
2. 继续移除前端本地双算和完整快照依赖。
3. 将数据分析、质量检查、词根关系和 facets 逐步接到可替换 query 层。
4. 停止新增复杂 JSON-only 性能补丁；只保留安全阀和兼容实现。
5. 建立 repository 契约测试，使同一批测试未来可跑 JSON 与 SQLite 两套实现。
6. 再进入 SQLite schema、迁移器和 `SqliteDictionaryRepository` 的第一批实装。

当前已开始落地第 5 项：`scripts/repository-contract.js` 提供 repository/API 契约测试 runner，`scripts/check-repository.js` 只是 JSON repository 的实例入口。后续新增 SQLite repository 时，应优先接入同一套 runner，而不是另写一套独立 smoke。

当前也已开始落地第 6 项的第一小步：`lib/sqlite-dictionary-repository.js` 提供未接入主流程的 SQLite repository 骨架，使用 `node:sqlite` 初始化 `.sqlite` 文件、schema migrations、核心词条表、`module_blobs` 和第一批索引；`scripts/check-sqlite-repository.js` 只在临时目录验证 schema 初始化、JSON ↔ SQLite 往返、最小词典生命周期方法（创建、导入、导出、激活、删除、偏好保存和 state 读取）、skeleton 级词条 CRUD、metadata/settings/docs/corpus/morphology/IPA 模块保存、`queryEntries()` 的搜索/筛选/排序/分页语义、`getEntryFacets()`、`getEntryRelations()` 和 `queryRootGroups()`。`scripts/repository-contract.js` 已支持早停阶段，`scripts/check-sqlite-contract.js` 目前让 SQLite repository 跑通共享契约到 `entryCrud`。当前词条 CRUD 和模块保存仍通过导出当前词典、修改对应对象、再重写 projection/blob 的保守策略保证语义正确；带筛选的 `queryEntries()`、facets、词汇关系和词根分组目前也先复用共享 JS 语义读取完整词条 JSON，尚未改为真正 SQL 查询。该骨架尚未接入主服务。

## 9. 第一批 SQLite 实装建议

不要一开始迁移全部功能。推荐顺序：

1. 建立空 SQLite repository 骨架、schema 初始化和迁移版本表。
2. 实现 JSON 导入到 SQLite、SQLite 导出为 JSON。（最小无损往返已开始落地）
3. 实现词典 metadata、settings、entries、definitions、tags、sources 的核心 CRUD。
4. 用现有 repository 检查脚本抽出契约测试，同时跑 JSON 和 SQLite。
5. 将 `/entries`、`/facets`、`/entry-relations`、`/root-groups` 切到 repository 查询接口。
6. 再处理 IPA、形态、文档、语料和分析/质量 query。

## 10. 需要暂缓的事情

- 复杂自定义滚动条、完整窗口化虚拟列表与全局导航地图。
- 数据分析所有 slice 的终极缓存策略。
- 语料例句链接的大功能迁移。
- 高级形态分析/自动 gloss 系统。
- 面向多窗口实时协同的复杂 revision 机制。

这些都可以受益于 SQLite，但不应和第一批 SQLite 主存储迁移混在一起。
