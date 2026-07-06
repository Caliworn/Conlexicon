# API Contract

本文记录 Conlexicon 当前本地 HTTP API 的稳定约定。它描述前端可依赖的接口边界，而不是底层存储实现；后端默认使用 SQLite repository，也可通过 `CONLEXICON_REPOSITORY=json` 显式启动 legacy/debug JSON repository，但前端不应直接依赖文件结构。SQLite 后端设计见 `SQLITE_BACKEND_PLAN.md`；JSON 兼容导入/导出和迁移设计见 `SQLITE_MIGRATION_PLAN.md`。

## 通用约定

- 所有业务 API 位于 `/api/` 下。
- 请求体和成功响应默认使用 JSON。
- 失败响应使用结构化错误：

```json
{
  "error": {
    "code": "duplicate_entity_ids",
    "message": "Duplicate dictionary entity IDs: ...",
    "details": {}
  }
}
```

- `code` 是前端本地化和分流处理的稳定字段。
- `message` 保留技术信息，主要用于控制台、诊断和未来错误详情页；普通 toast 不应直接依赖英文 `message`。
- `details` 可选，当前主要用于重复 ID 和不支持字段等调试信息；暂不承诺前端展示形态。
- 前端应继续在控制台保留原始错误对象，toast 只显示本地化短信息。

## 当前端点

### 应用状态与全局偏好

| 方法 | 路径 | 用途 | 响应 | 备注 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/state` | 读取轻量应用状态 | `{ activeDictionaryId, dictionaries, uiLanguage, uiTheme }` | `dictionaries` 可只包含词典 metadata 和 `summary.entryCount/rootCount`；前端启动后会按需读取当前词典完整快照。JSON repository 目前仍可返回完整词典。 |
| `PUT` | `/api/preferences` | 保存全局界面偏好 | `{ uiLanguage, uiTheme }` | 目前支持 `uiLanguage` 和 `uiTheme`。 |

### 导入、导出与词典生命周期

| 方法 | 路径 | 用途 | 响应 | 备注 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/export?dictionaryId=&format=&profile=` | 导出数据 | 当前支持 JSON 完整词典 payload | 默认 `format=json&profile=legacy-json`；`profile=portable-json` 当前仍输出兼容完整 JSON，后续由转换服务扩展。 |
| `POST` | `/api/import?overwrite=&regenerateId=&profile=` | 导入 JSON | 应用状态 | 默认 `profile=legacy-json`；完整快照导入会通过转换服务执行 legacy 兼容解析、规范化和实体 ID 检查。 |
| `POST` | `/api/dictionaries` | 新建词典 | 完整词典 JSON | 创建空词典，并设为当前词典。 |
| `GET` | `/api/dictionaries/:id` | 读取完整词典快照 | 完整词典 JSON | 前端启动、切换当前词典和兼容旧完整状态逻辑时按需调用；普通列表、搜索和 facets 仍优先使用专用读取 API。 |
| `POST` | `/api/dictionaries/:id/activate` | 切换当前词典 | 应用状态 | 只改 `index.json` 中的当前词典。 |
| `DELETE` | `/api/dictionaries/:id` | 删除词典 | 应用状态 | 删除词典文件并更新索引。 |

### 完整快照兼容层

| 方法 | 路径 | 用途 | 响应 | 使用限制 |
| --- | --- | --- | --- | --- |
| `PUT` | `/api/dictionaries/:id` | 保存完整词典快照 | 完整词典 JSON | 兼容层和低频管理入口。普通运行期保存不应走这里；不要在此端点上叠加复杂冲突合并逻辑。 |

### 词典元数据与模块级保存

| 方法 | 路径 | 用途 | 响应 | 校验范围 |
| --- | --- | --- | --- | --- |
| `PUT` | `/api/dictionaries/:id/meta` | 保存词典名称、语言、描述 | 词典 metadata payload | 不做实体 ID 检查；响应包含 `id/name/language/description/createdAt/updatedAt`。 |
| `PUT` | `/api/dictionaries/:id/settings` | 保存其他设置 | `{ id, updatedAt, settings }` | 不做实体 ID 检查；会保留既有 IPA 设置。 |
| `PUT` | `/api/dictionaries/:id/docs` | 保存语言文档 | `{ id, updatedAt, docs }` | 不做实体 ID 检查。 |
| `PUT` | `/api/dictionaries/:id/corpus` | 保存语料库模块 | `{ id, updatedAt, corpus }` | 检查语料范围内实体 ID 冲突。 |
| `PUT` | `/api/dictionaries/:id/morphology` | 保存自动形态学模块 | `{ id, updatedAt, morphology }` | 检查形态表实体 ID 冲突，并使用共享形态模块校验规则引用语法和函数对象配置。 |
| `PUT` | `/api/dictionaries/:id/settings/ipa` | 保存自动 IPA 设置 | `{ id, updatedAt, settings }` | 检查 IPA 规则和重音规则实体 ID 冲突。 |
| `POST` | `/api/dictionaries/:id/autosave` | 页面卸载时保存文档/语料草稿 | `{ id, updatedAt, docs?, corpus? }` | 当前只分发 `docs` 和 `corpus`；没有有效模块时只返回 `id/updatedAt`。 |

### 词条级保存

| 方法 | 路径 | 用途 | 响应 | 校验范围 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/dictionaries/:id/entries` | 读取词条列表 | 无参数时为词条数组；带查询参数时为分页查询对象 | 支持 `q`、`fields`、`fuzzy`、`tagFuzzy`、`fuzzyFields`、`part`、`tags`、`tagMode`、`source`、`derivedFrom`、`sort`、`cursor`、`limit`、`include`。前端普通词条列表正常路径以该 API 为准，不再每次本地筛选完整列表做一致性校验。 |
| `POST` | `/api/dictionaries/:id/entries` | 新建词条 | 保存后的词条 | 检查当前词条及其子对象与全库实体 ID 冲突。 |
| `GET` | `/api/dictionaries/:id/entries/:entryId` | 读取单个词条 | 词条 JSON | 未找到返回 `entry_not_found`。 |
| `PUT` | `/api/dictionaries/:id/entries/:entryId` | 保存单个词条 | 保存后的词条 | 检查当前词条及其子对象与全库实体 ID 冲突。 |
| `DELETE` | `/api/dictionaries/:id/entries/:entryId` | 删除单个词条 | `{ id, dictionaryId, updatedAt }` | 不因无关历史重复 ID 阻断删除。 |
| `PATCH` | `/api/dictionaries/:id/entries` | 批量更新词条字段 | `{ id, updatedAt, entries, settings? }` | 当前仅允许 patch `tags` 和 `pronunciation`；`entries` 只包含本次更新的词条；可附带 `settings` 用于标签排序设置保存。 |

### 读取侧查询

| 方法 | 路径 | 用途 | 响应 | 备注 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/dictionaries/:id/facets` | 读取词性和标签统计 | `{ parts, tags, noPartOfSpeechCount }` | 尊重当前词典的词性标签设置和标签显示替换。前端词性筛选选项正常路径以该 API 为准，不再每次本地统计完整词性集合做一致性校验。 |
| `GET` | `/api/dictionaries/:id/entry-relations/:entryId` | 读取词源/衍生/同根关系 | `{ entryId, sources, derivedEntries, rootGroup }` | 同名 lemma 暂按排序后的第一条匹配，后续可由诊断模块报告歧义。 |
| `GET` | `/api/dictionaries/:id/root-groups` | 读取词根模式分组 | `{ items, pageInfo }` | 支持 `q`、`fields`、`fuzzy`、`tagFuzzy`、`fuzzyFields`、`sort`、`cursor`、`limit`、`include`。前端词根模式正常路径以该 API 为准，不再用前端本地完整分组兜底。 |

#### `GET /api/dictionaries/:id/entries` 查询参数补充

- `fields`：逗号分隔的搜索字段白名单；当前支持 `lemma`、`pronunciation`、`tags`、`definitions`、`examples`、`notes`、`etymology`、`morphology`。为空或全部无效时搜索全部字段。
- `fuzzy`：兼容现有“词条搜索模糊匹配”开关；为真时对除 `tags` 外的搜索字段启用模糊匹配。
- `tagFuzzy`：兼容现有“标签模糊匹配”开关；为真时对 `tags` 字段启用模糊匹配。
- `fuzzyFields`：逗号分隔的字段级模糊匹配白名单。提供有效字段时覆盖 `fuzzy` / `tagFuzzy` 推导结果，用于后续“每个搜索字段单独配置模糊匹配”的界面扩展。

## 实体 ID 校验约定

- 完整快照保存、导入和迁移必须执行全量实体 ID 唯一性检查。
- 增量保存只检查本次保存范围：
  - 词条保存检查该词条及其释义等子对象。
  - IPA 保存检查 IPA 映射规则和重音规则。
  - 形态保存检查形态表。
  - 语料保存检查语料块、层和单元。
  - 元数据、普通设置和语言文档保存不应被无关历史重复 ID 阻断。
- 跨类型重复仍然视为冲突；后续引入索引后也应保留跨类型比较。
- 全量重复 ID 诊断和自动修复属于未来诊断/修复模块，不应混入普通保存路径。

## 当前错误码

| code | 含义 |
| --- | --- |
| `request_body_too_large` | 请求体超过当前限制。 |
| `invalid_json_body` | 请求体不是合法 JSON。 |
| `invalid_ui_language` | 全局界面语言值无效。 |
| `invalid_ui_theme` | 全局主题值无效。 |
| `invalid_import_payload` | 导入内容不是可识别词典。 |
| `unsupported_import_profile` | 导入 profile 暂不支持。 |
| `unsupported_export_format` | 导出格式暂不支持。 |
| `unsupported_export_profile` | 导出 profile 暂不支持。 |
| `invalid_dictionary_id` | 词典 ID 格式无效。 |
| `dictionary_not_found` | 词典不存在或已被删除。 |
| `dictionary_id_exists` | 导入词典 ID 已存在且未确认覆盖。 |
| `duplicate_entity_ids` | 完整词典存在重复实体 ID。 |
| `duplicate_entity_ids_scoped` | 当前保存范围存在重复实体 ID。 |
| `invalid_entry_payload` | 词条请求体格式无效。 |
| `entry_id_exists` | 新建词条 ID 已存在。 |
| `invalid_entry_updates_payload` | 批量词条更新请求格式无效。 |
| `entry_not_found` | 词条不存在或已被删除。 |
| `invalid_settings_payload` | 设置请求体格式无效。 |
| `invalid_docs_payload` | 语言文档请求体格式无效。 |
| `invalid_corpus_payload` | 语料请求体格式无效。 |
| `invalid_morphology_payload` | 形态学请求体格式无效。 |
| `invalid_ipa_settings_payload` | IPA 设置请求体格式无效。 |
| `unsupported_entry_patch_fields` | 批量词条 patch 包含不支持字段。 |
| `entry_patch_tags_invalid` | 批量标签 patch 值不是数组。 |
| `entry_patch_pronunciation_invalid` | 批量 IPA patch 值不是字符串。 |
| `system_file_permission` | 文件权限不足。 |
| `system_disk_full` | 磁盘空间不足。 |
| `system_file_busy` | 文件被占用。 |
| `system_file_missing` | 目标文件缺失。 |
| `system_json_parse` | 本地 JSON 文件无法解析。 |
| `unknown_error` | 未归类错误。 |

## 后续扩展原则

- 普通保存优先增加细粒度端点，不再回退到完整词典 PUT。
- `GET /api/state` 是轻量启动状态入口；普通启动只应读取词典 metadata/summary，再通过 `GET /api/dictionaries/:id` 或专用读取端点按需加载当前词典内容。
- 语料库下一步可从整份 corpus 模块保存拆成块、层、单元级 changeset。
- 搜索、筛选、词源反查和数据分析后续应依赖 repository 查询/索引，不应让前端扫描大型完整快照。
- 短期不引入词典级 revision。等对象级增量端点稳定后，再基于目标对象 `updatedAt` 做轻量乐观锁。

## 计划中的读取 API

阶段 B3 的目标是先建立查询契约，不急于替换全部前端调用。JSON repository 可以暂时用内存扫描实现；后续 SQLite repository 应在不改变前端契约的前提下用索引或 SQL 实现同样语义。

### 启动与词典索引

当前 `GET /api/state` 已可作为轻量启动状态和词典索引入口；后续若继续收窄，可以再拆成更细的 app state、词典索引、summary 和模块读取：

```text
GET /api/app
GET /api/dictionaries
GET /api/dictionaries/:id/summary
GET /api/dictionaries/:id/settings
```

SQLite repository 的 `readState()` / `listDictionaries()` 已只返回词典 metadata 和 summary；服务端默认使用 SQLite repository，`CONLEXICON_REPOSITORY=json` 仅作为 legacy/debug 回滚路径。前端启动流程已经改为“先读轻量索引，再按需加载 active dictionary”。

示例：

```js
GET /api/app
{
  activeDictionaryId,
  uiLanguage,
  uiTheme
}
```

```js
GET /api/dictionaries
{
  dictionaries: [
    {
      id,
      name,
      language,
      description,
      updatedAt,
      summary: {
        entryCount,
        rootCount
      }
    }
  ]
}
```

### 词条列表查询

`GET /api/dictionaries/:id/entries` 保持无参数时返回完整词条数组的兼容行为。带查询参数时返回分页查询对象：

```text
GET /api/dictionaries/:id/entries?q=&fields=&fuzzy=&tagFuzzy=&fuzzyFields=&part=&tags=&tagMode=&sort=&source=&derivedFrom=&cursor=&limit=&include=
```

参数约定：

- `q`：搜索关键词；默认匹配全部搜索字段。
- `fields`：逗号分隔的搜索字段白名单；为空或全部无效时按默认全字段搜索。当前字段包括：
  - `lemma`：词形；
  - `pronunciation`：发音 / IPA；
  - `tags`：原始标签、显示替换标签和按当前设置识别出的词性标签；
  - `definitions`：释义文本；
  - `examples`：当前词条内嵌例句；后续例句升级为语料链接后，该字段应继续表示“与词条关联的例句文本”，来源可包含嵌入字段和链接语料；
  - `notes`：词条备注和释义备注；
  - `etymology`：词源描述和来源文本；
  - `morphology`：按当前形态表设置动态生成的形态形式，以及词条级形态 override。
- `fuzzy`：兼容现有全局模糊搜索开关；对除 `tags` 外的字段启用模糊匹配。
- `tagFuzzy`：兼容现有标签模糊搜索开关；对 `tags` 字段启用模糊匹配。
- `fuzzyFields`：逗号分隔的字段级模糊匹配白名单；提供有效字段时覆盖 `fuzzy` / `tagFuzzy` 推导结果。
- `part`：词性筛选；特殊值 `__conlexicon_no_part__` 表示无词性。
- `tags`：逗号分隔的原始标签列表。
- `tagMode`：`any` 或 `all`，默认 `any`。
- `sort`：`lemmaAsc`、`lemmaDesc`、`updatedAsc`、`updatedDesc`、`createdAsc`、`createdDesc`。
- `source`：筛选具有指定来源文本的词条。
- `derivedFrom`：筛选从指定词条 ID 或 lemma 派生的词条。
- `cursor`：不透明分页游标，前端不得解析。
- `limit`：分页大小，后端可设置上限。
- `include`：`summary` 或 `full`，默认 `summary`。

前端普通词条列表当前直接使用该 API 返回的顺序；请求失败时显示失败状态。现阶段为避免未接入列表窗口化前截断 1k/10k 压测词典，前端会请求较大的 `limit`，后端临时上限为 10000。后续进入真正分页/窗口化后，应降低单次请求规模并用 `cursor` 拉取窗口，不应恢复前端本地全量筛选作为运行期兜底。

返回：

```js
{
  items: [
    {
      id,
      lemma,
      pronunciation,
      tags,
      definitionPreview,
      createdAt,
      updatedAt,
      partOfSpeech,
      parts
    }
  ],
  pageInfo: {
    nextCursor,
    hasMore,
    total
  }
}
```

形态搜索不是简单读取持久化字段。读取 API 必须使用共享形态模块按以下流程生成搜索对象：先根据词条 `morphology.tableId` 和形态表 `matchTags` 解析适用表格；再逐格读取词条 override；没有 override 时用词形、形态规则和形态函数动态生成默认形式。后续如果引入索引或 SQLite，也必须保持该语义，或在形态配置、词条 lemma、标签或 override 改变时更新对应索引。

### 词条 facets

```text
GET /api/dictionaries/:id/facets
```

返回当前词典设置语义下的词性和标签统计：

```js
{
  parts: [
    { tag, displayLabel, count }
  ],
  tags: [
    { tag, displayLabel, count, isPartOfSpeech }
  ],
  noPartOfSpeechCount
}
```

该接口必须尊重：

- 手动词性标签开关；
- 手动词性标签列表；
- 标签显示替换；
- 原始标签显示设置不改变统计键，但可影响前端展示策略。

### 词源与词根关系

```text
GET /api/dictionaries/:id/entry-relations/:entryId
```

返回当前词条的来源匹配、衍生词和同根组：

```js
{
  entryId,
  sources: [
    { sourceText, matchedEntryId, matchedLemma }
  ],
  derivedEntries: [
    { id, lemma, pronunciation, tags, definitionPreview, createdAt, updatedAt }
  ],
  rootGroup: {
    rootKey,
    entries: [
      { id, lemma, pronunciation, tags, definitionPreview, createdAt, updatedAt }
    ]
  }
}
```

`matchedEntryId` 应由 repository 明确解析；如果同名 lemma 存在多条，当前阶段可选择排序后的第一条并在后续诊断模块中报告歧义。

词汇网络详情视图已接入该 API。词根组、来源解析和衍生关系语义抽入共享关系模块，词根模式也通过独立读取端点预备接线。

词根模式读取端点：

```text
GET /api/dictionaries/:id/root-groups?q=&fields=&fuzzy=&tagFuzzy=&fuzzyFields=&sort=&cursor=&limit=&include=
```

返回分页后的词根组，而不是向前端一次返回全部分组：

```js
{
  items: [
    {
      root: { id, lemma, pronunciation, tags, definitionPreview, createdAt, updatedAt },
      derivedEntries: [
        { id, lemma, pronunciation, tags, definitionPreview, createdAt, updatedAt }
      ],
      matchedDerivedIds: [],
      rootMatches: true
    }
  ],
  pageInfo: { nextCursor, hasMore, total }
}
```

性能优化方向：

- repository 层为一次请求构建临时关系索引：`id -> entry`、`normalized lemma -> first entry`、`source key -> derived entries`，避免每个来源或衍生查询重复扫描全词条。
- `entry-relations/:entryId`、`root-groups`、`entries?derivedFrom=` 和后续质量检查中的词源问题应共享同一套关系索引。
- JSON 文件后端可先做请求级临时索引；如果后续切到 SQLite，则用 `entry_sources(source_key, entry_id)` 或等价表/索引支持 `derivedFrom`、词根分组和词汇网络查询。
- 前端词根模式当前正常路径以 `/root-groups` 为准；请求失败时显示失败状态，API 结果被分页截断时先渲染已返回页面并保留 `pageInfo`。后续分页/窗口化实装后，应继续用 `cursor` 拉取后续页面，而不是回退前端本地完整分组。
- 词根模式分页/窗口化 UI 暂时搁置到后端关系索引或 SQLite 评估之后；不要在现阶段用简单无限滚动冒充完整列表滚动条，因为那会让滚动条只代表已加载页面，而不是完整词根组集合。

### 语料库读取

语料库读取后续再拆：

```text
GET /api/dictionaries/:id/corpus/blocks
GET /api/dictionaries/:id/corpus/blocks/:blockId
GET /api/dictionaries/:id/corpus/units?q=&blockId=&layerId=&orphan=&cursor=&limit=
GET /api/dictionaries/:id/corpus/units/:unitId
```

语料保存下一步可从整份 corpus 模块保存拆成块、层、单元级 changeset。

### 共享查询索引与分析 planner 草案

数据分析 API 化不应只服务“数据分析”页面。词典标题、词典管理、词根模式、词汇网络、质量检查、高级筛选和未来诊断修复都会用到相同的统计、关系解析和索引能力。后续应先建立共享查询层，再在其上实现不同 UI 端点。

建议分三层：

```text
Repository
  JsonDictionaryRepository / future SqliteDictionaryRepository

DictionaryQueryContext
  请求级或持久化索引、基础查询和聚合能力

Feature Services
  AnalysisService / QualityService / DiagnosticsService / RelationService / EntrySearchService
```

`DictionaryQueryContext` 应提供稳定能力，而不是暴露 JSON 文件结构：

```js
{
  getDictionarySummary(),
  getEntryById(id),
  getEntriesByIds(ids),
  queryEntries(filter, options),
  getEntityIndex(),
  getRelationIndex(),
  getTagStats(options),
  getCoverageSummary(options),
  getActivitySummary(options),
  getCorpusPlacementIndex()
}
```

当前已落地最小共享实现：`lib/dictionary-query-model.js` 提供前后端可复用的 `createDictionaryQueryContext()`，第一批只接管 `getEntryById()` / `getEntriesByIds()`、relation index、relation summary 和 root family 查询；覆盖率、标签、活动和 corpus placement 仍按原模块逐步迁移。

JSON repository 阶段可为一次请求构建临时 `Map` / `Set` / prefix data；SQLite 阶段用 SQL、持久索引、视图或临时表实现相同接口。上层服务不应依赖底层是完整 JSON 扫描还是 SQLite 查询。

#### 共享 relation/query 能力

以下能力应共享同一套 relation/index 语义：

- 词典标题的 `rootCount`。
- 词典管理列表中的 `rootCount`。
- 数据分析 relation summary 与 root family widgets。
- `/root-groups` 词根模式。
- `/entry-relations/:entryId` 词汇网络详情。
- `/entries?derivedFrom=` 衍生词查询。
- 质量检查中的词源网络问题。
- 未来高级筛选的 relation filter descriptor。

建议拆分为可复用任务：

```text
relationSummary
  rootCount
  derivedCount
  isolatedRootCount
  multiSourceCount

rootFamilies
  top N root families
  paginated full root family ranking

entryRelations
  单个词条的来源、衍生词和同根组

sourceResolution
  source string -> matched entry / ambiguity / unresolved

derivedFrom
  source entry/key -> derived entries
```

`sourceResolution` 可被质量检查使用，但“未解析来源”和“来源循环”仍属于质量检查/词源网络问题，不归入诊断修复。

#### Analysis widget query

总览后续应作为可配置 dashboard，而不是固定页面报告。前端提交 widget 声明，后端 planner 合并 widget 依赖，避免多个卡片重复遍历词典。

建议端点：

```text
POST /api/dictionaries/:id/analysis/query
```

请求：

```js
{
  widgets: [
    { id: "entry-count", type: "entryCount" },
    { id: "parts", type: "partDistribution", limit: 8 },
    { id: "coverage", type: "coverageBreakdown" },
    { id: "roots", type: "topRootFamilies", limit: 12 },
    { id: "activity", type: "activityPreview", limit: 6 }
  ],
  options: {
    language: "zh",
    includeActions: true
  }
}
```

响应返回结构化 widget data，不返回 HTML：

```js
{
  dictionaryId,
  cacheKey,
  widgets: {
    "entry-count": {
      type: "metric",
      title: "词条",
      value: 10000,
      note: "8147 个词根",
      action: { type: "view", target: "editor" }
    },
    "coverage": {
      type: "barList",
      title: "覆盖率",
      rows: [
        { label: "IPA", value: 0.94, action: { type: "filter", filter: { kind: "coverage", field: "ipa", value: "present" } } }
      ]
    }
  },
  diagnostics: {
    computedTasks: ["relationSummary", "coverageStats", "tagStats", "activityPreview"],
    elapsedMs: 0
  }
}
```

Widget 不应直接绑定前端旧 report 字段；应通过任务依赖生成：

| Widget | 典型任务 |
| --- | --- |
| `entryCount` | `entrySummary`, `relationSummary` |
| `derivedCount` | `relationSummary` |
| `coverageBreakdown` | `coverageStats` |
| `partDistribution` | `tagStats` |
| `tagFrequency` | `tagStats` |
| `topRootFamilies` | `rootFamilies` |
| `activityPreview` | `activityStats` |
| `ipaAverageSyllables` | `ipaLightStats` |
| `ipaUnitFrequency` | `ipaFullStats` |
| `morphologyCoverage` | `coverageStats` |
| `morphologyGeneratedForms` | `morphologyFullStats` |

Planner 应把多个 widgets 合并为尽量少的任务。例如 `entryCount`、`coverageBreakdown` 和 `partDistribution` 可以共享一次基础 entry scan；`topRootFamilies` 和 `/root-groups` 可共享 relation index。

#### Light / full 任务边界

为避免总览卡片触发重型计算，任务应区分 light/full：

```text
ipaLightStats
  IPA 覆盖、平均音节等轻量信息

ipaFullStats
  音位频率、首音/尾音、自动生成一致性等完整统计

morphologyLightStats
  是否有形态表格、表格覆盖等轻量信息

morphologyFullStats
  生成形式数量、空单元、override 排行等重型统计

activityPreview
  最近 N 条和少量日期桶

activityFull
  完整最近修改列表和完整日期分布
```

用户将重型 widget 放入总览时，API 可以返回 `status: "deferred"` 或要求点击后计算；不要默认让总览触发所有 full 任务。

#### Filter descriptor

分析卡片和质量卡片不应长期传递大量 `entryIds`。建议逐步改成 filter descriptor：

```js
{
  type: "filter",
  count: 608,
  filter: {
    kind: "coverage",
    field: "ipa",
    value: "missing"
  }
}
```

点击“在词条列表查看”时，词条列表使用 descriptor 调用 `/entries` 或后续 query endpoint 获取匹配项。这样总览 API 只返回 `count` 和可复用 filter spec，避免大词典下把大量 ID 塞进 dashboard 响应。

#### 诊断修复边界

未来诊断修复可以共享 `DictionaryQueryContext`，但只处理结构、存储、迁移和可自动修复问题，例如：

- 重复 ID、缺失 ID、格式错误 ID。
- 词典索引与实际文件不一致。
- 引用已删除对象。
- 孤儿语料单元、多父级语料单元。
- 语料块、层、单元顺序缺失或重复。
- 批量修复前的影响范围预览。

以下仍属于质量检查，不应重复归入诊断修复：

- 未解析来源。
- 来源循环。
- 缺少释义、缺少标签、缺少 IPA。
- 多个主重音。
- Glossed 例句缺字段。
- 近似标签可能不一致。

#### 最小落地顺序

1. 抽出 repository 共享 query/index context，先用 JSON 请求级临时索引实现。
2. 将 `listDictionaries()`、词典标题 root count、数据分析 relation summary 统一到同一 relation summary helper。
3. 实装 `POST /analysis/query` 的 light widgets：`entryCount`、`coverageBreakdown`、`partDistribution`、`activityPreview`。
4. 总览切到 widget query；重型 IPA / morphology / root family widgets 后续按需接入。
5. 高级筛选逐步支持 filter descriptor，而不是只支持 materialized entry IDs。
