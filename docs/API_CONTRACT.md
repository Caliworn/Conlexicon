# API Contract

本文记录 Conlexicon 当前本地 HTTP API 的稳定约定。它描述前端可依赖的接口边界，而不是底层文件结构；后端运行期只使用 SQLite repository。旧 JSON 仅通过转换服务作为导入、导出和目录迁移格式，不再提供 JSON runtime repository。SQLite 后端设计见 [SQLite Backend Plan](SQLITE_BACKEND_PLAN.md)；JSON 兼容导入/导出和迁移设计见 [SQLite Migration Plan](SQLITE_MIGRATION_PLAN.md)。

查询缓存 Q1–Q4 已实装前端紧凑页面缓存、后端运行时查询会话、版本化 cursor 和纯滚动数据窗口；缓存身份、失效及窗口淘汰约定见 [Query Session Cache Plan](QUERY_SESSION_CACHE_PLAN.md)。

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

### 请求体大小限制

- 普通单对象与设置端点最多接受 5 MiB 请求体，包括全局偏好、新建词典、词典 metadata、普通设置、IPA 设置以及单词条新建/保存。
- 模块级或批量保存端点最多接受 32 MiB，包括 `autosave`、语言文档、语料库、形态学和批量词条 patch。
- JSON 导入端点最多接受 64 MiB。该上限只控制 HTTP 请求边界；导入仍会经历 JSON 解析、legacy migration 和规范化，不能据此推断峰值内存等于文件大小。
- 后端会用合法的 `Content-Length` 提前拒绝明显超限请求，同时继续按实际收到的字节流累计检查；缺失、伪造或偏小的声明长度不能绕过上限。超限统一返回 `request_body_too_large`，并在 `details.limitBytes` 中给出当前端点的字节上限。

## 当前端点

### 应用状态与全局偏好

| 方法 | 路径 | 用途 | 响应 | 备注 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/state` | 读取轻量应用状态 | `{ activeDictionaryId, dictionaries, uiLanguage, uiTheme }` | `dictionaries` 只包含 metadata 和 summary；所有词典都返回 `entryCount`，只有当前词典返回 `rootCount`。前端把它当轻量索引，并按需读取当前词典快照；未加载词典不会因此建立词根拓扑。 |
| `PUT` | `/api/preferences` | 保存全局界面偏好 | `{ uiLanguage, uiTheme }` | 目前支持 `uiLanguage` 和 `uiTheme`。 |

### 导入、导出与词典生命周期

| 方法 | 路径 | 用途 | 响应 | 备注 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/export?dictionaryId=&format=&profile=` | 导出数据 | 当前支持 JSON 完整词典 payload | 默认 `format=json&profile=legacy-json`；`profile=portable-json` 当前只是同结构兼容别名，不代表已有独立 portable 格式。原生 SQLite 与 XLSX 导出尚未实装。 |
| `POST` | `/api/import?overwrite=&regenerateId=&profile=` | 导入 JSON | 应用状态 | 默认 `profile=legacy-json`；完整快照导入会通过转换服务执行 legacy 兼容解析、规范化和实体 ID 检查。 |
| `POST` | `/api/dictionaries` | 新建词典 | 完整词典 JSON | 创建空词典，并设为当前词典。 |
| `GET` | `/api/dictionaries/:id` | 读取当前词典完整快照 | 完整词典 JSON | 前端启动或切换当前词典时按需加载详情与尚未拆出的模块；普通列表、搜索、facets 和关系查询优先使用专用读取 API。 |
| `POST` | `/api/dictionaries/:id/activate` | 切换当前词典 | 应用状态 | 只改 `index.json` 中的当前词典。 |
| `DELETE` | `/api/dictionaries/:id` | 删除词典 | 应用状态 | 删除词典文件并更新索引。 |

### 词典元数据与模块级保存

| 方法 | 路径 | 用途 | 响应 | 校验范围 |
| --- | --- | --- | --- | --- |
| `PUT` | `/api/dictionaries/:id/meta` | 保存词典名称、语言、描述 | 词典 metadata payload | 不做实体 ID 检查；响应包含 `id/name/language/description/createdAt/updatedAt`。 |
| `PUT` | `/api/dictionaries/:id/settings` | 保存其他设置 | `{ id, updatedAt, settings }` | 不做实体 ID 检查；会保留既有 IPA 设置。`settings.search` 含字段级 `enabled/fuzzy`、`etymologyAutocomplete.fuzzy`，以及 `normalization: { unicodeNormalization: "none" | "nfc", caseFolding: boolean, customRules: { canonical, variants[] }[] }`。规范化默认严格关闭；自定义规则按最长变体优先且单次应用。前端据此生成读取 API 参数，并同步用于本地筛选、词根模式、搜索摘要/高亮、搜索字段分析和词源自动补全。 |
| `PUT` | `/api/dictionaries/:id/docs` | 保存语言文档 | `{ id, updatedAt, docs }` | 不做实体 ID 检查。 |
| `PUT` | `/api/dictionaries/:id/corpus` | 保存语料库模块 | `{ id, updatedAt, corpus }` | 检查语料范围内实体 ID 冲突。 |
| `PUT` | `/api/dictionaries/:id/morphology` | 保存自动形态学模块 | `{ id, updatedAt, morphology }` | 检查形态表实体 ID 冲突，并使用共享形态模块校验规则引用语法和函数对象配置；SQLite 事务提交后只重建并返回形态模块，不重建完整词典 snapshot。 |
| `PUT` | `/api/dictionaries/:id/settings/ipa` | 保存自动 IPA 设置 | `{ id, updatedAt, settings }` | IPA 映射是按顺序保存的纯文本规则 `{ from, to, before, after }`，没有实体 ID，也不参与实体 ID 防撞。 |
| `POST` | `/api/dictionaries/:id/autosave` | 页面卸载时保存文档/语料草稿 | `{ id, updatedAt, docs?, corpus? }` | 当前只分发 `docs` 和 `corpus`；请求至少须携带其中一个有效对象，否则返回 `invalid_autosave_payload`。 |

### 词条读取与保存

| 方法 | 路径 | 用途 | 响应 | 校验范围 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/dictionaries/:id/entries` | 读取词条列表 | `{ items, pageInfo }`，其中 `items` 固定为词条摘要 DTO | 支持结构化 JSON `filter`，以及现有 `q`、`fields`、`fuzzyFields`、`part`、`tags`、`tagMode`、`sort`、`cursor`、`windowOffset`、`limit`。结构化 `filter` 不得与平铺筛选参数混用。无参数请求也使用默认排序和窗口大小，不返回完整词条数组。 |
| `POST` | `/api/dictionaries/:id/entries/filter-facts` | 批量读取结构筛选是否存在候选 | `{ dictionaryId, generation, facts }` | 最多接受 16 个 filter descriptor；只返回按请求 ID 对应的 `available` 布尔值，不接受搜索、排序或分页语义。 |
| `GET` | `/api/dictionaries/:id/entries/:entryId/location` | 定位词条在当前查询中的窗口 | `{ items, pageInfo, location }` | 接受与 `/entries` 相同的查询 descriptor 和 `limit`，但不接受客户端 cursor；目标存在但被查询排除时返回 `location.found: false`。 |
| `POST` | `/api/dictionaries/:id/entries` | 新建词条 | 保存后的词条 | 检查当前词条及其子对象与全库实体 ID 冲突。 |
| `GET` | `/api/dictionaries/:id/entries/:entryId` | 读取单个词条 | 词条 JSON | 未找到返回 `entry_not_found`。 |
| `PUT` | `/api/dictionaries/:id/entries/:entryId` | 保存单个词条 | 保存后的词条 | 检查当前词条及其子对象与全库实体 ID 冲突。 |
| `DELETE` | `/api/dictionaries/:id/entries/:entryId` | 删除单个词条 | `{ updatedAt }` | 不因无关历史重复 ID 阻断删除；前端只用更新时间刷新本地词典状态。 |
| `PATCH` | `/api/dictionaries/:id/entries` | 批量更新词条字段 | `{ id, updatedAt, entries, settings? }` | 当前仅允许 patch `tags` 和 `pronunciation`；`entries` 只包含本次更新的词条；可附带 `settings` 用于标签排序设置保存。 |

### 读取侧查询

| 方法 | 路径 | 用途 | 响应 | 备注 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/dictionaries/:id/facets` | 读取词性和标签统计 | `{ parts, tags, noPartOfSpeechCount }` | 尊重当前词典的词性标签设置和标签显示替换。前端词性筛选选项正常路径以该 API 为准，不再每次本地统计完整词性集合做一致性校验。 |
| `GET` | `/api/dictionaries/:id/entry-relations/:entryId` | 读取词源/衍生/同根关系 | `{ entryId, sources, derivedEntries, rootGroup }` | SQLite 路径复用稳定词根拓扑的反向索引，并按需读取关系 DTO；同名 lemma 暂按排序后的第一条匹配，后续可由诊断模块报告歧义。 |
| `GET` | `/api/dictionaries/:id/root-groups` | 读取词根模式分组 | `{ items, pageInfo }` | 支持 `q`、`fields`、`fuzzyFields`、`sort`、`cursor`、`windowOffset`、`limit`。前端词根模式正常路径以该 API 为准，并按窗口加载。 |
| `GET` | `/api/dictionaries/:id/root-groups/location` | 定位词条所属的父级词根窗口 | `{ items, pageInfo, location }` | 必须传 `entryId`；可传 `preferredRootId` 消除多来源词条的父级歧义，其余参数沿用 `/root-groups` descriptor。 |
| `GET` | `/api/dictionaries/:id/root-groups/:rootId/entries` | 按需读取单个词根组的全部衍生词 | `{ items }`，其中 `items` 固定为词条摘要 DTO | 支持与词根组查询相同的搜索、排序和字段参数，但不分页；折叠组不预载衍生词，展开后一次读取整组。 |
| `POST` | `/api/dictionaries/:id/analysis/query` | 按需读取轻量分析 widgets | `{ dictionaryId, generation, cacheKey, widgets, diagnostics }` | F4a 同步聚合端点；多个 widget 由 planner 合并为共享 SQLite 任务，不读取或返回完整词典 snapshot。 |

#### `GET /api/dictionaries/:id/entries` 查询参数补充

- F1/F2 起，transport 参数会统一归一化为内部 `{ filter, search, sort, page }` EntryQuery；查询会话、cursor digest 和缓存键使用同一个稳定 identity。`limit`、`cursor` 和 `windowOffset` 不改变匹配集合，因此不进入 identity。既有 `part`、`tags`、`tagMode` 平铺筛选参数仍可单独使用；新的 `filter` 参数接收 URL 编码后的 JSON 对象，并且不能与这些平铺筛选参数混用。
- 结构化 `filter` 的规范形状为：

  ```js
  {
    part: "n",
    tags: { values: ["motion"], mode: "any" },
    presence: [
      { field: "definition", present: true },
      { field: "ipa", present: false }
    ],
    sourceCount: { min: 1, max: 2 },
    activityDays: [{ field: "updated", day: "2026-07-17" }]
  }
  ```

  所有字段均可省略。`tags.mode` 为 `any` 或 `all`；`presence.field` 支持 `definition`、`example`、`entryNote`、`source`、`ipa`；`sourceCount` 是包含边界的非负整数区间，`max` 可省略，同一查询只执行一次来源计数；`activityDays.field` 支持 `created`、`updated`，日期按 UTC `YYYY-MM-DD` 的 `[dayStart, nextDayStart)` 半开范围比较。同一 presence 或日期字段不得给出冲突条件。当前 `entryNote` 只表示词条级备注，不包含释义备注或形态组备注。
- `fields`：逗号分隔的搜索字段白名单；当前支持 `lemma`、`pronunciation`、`tags`、`definitions`、`examples`、`notes`、`etymology`、`morphology`。为空或全部无效时搜索全部字段。
- `fuzzyFields`：逗号分隔的字段级模糊匹配白名单；仅对同时出现在 `fields` 中的字段生效。
- 基础搜索逐个独立字段值匹配：一条释义、一个标签、一个来源或一段备注必须自行包含查询文本，查询不会跨多个值拼接命中；`notes` 中的词条备注、释义备注和每个词条形态组备注也分别作为独立值。多标签组合等条件应使用高级筛选。自由文本按当前词典的 `settings.search.normalization` 处理。SQLite 的严格及 fuzzy 查询均直接读取静态 `entry_search_values` 和按需读取形态 `entry_morphology_search_values`；fuzzy 通过连接级确定性函数复用共享搜索模型的评分语义。该路径支持 NFC、Unicode case folding 和自定义等价规则。结构键和词源关系键不套用该自由文本配置。
- 词源自动补全目前仍在前端当前词典快照上运行，并由独立的 `settings.search.etymologyAutocomplete.fuzzy` 控制；它复用搜索 normalizer 和原有 JS fuzzy 排序，但尚未接入 `/entries` projection 与普通列表查询路径。

#### `POST /api/dictionaries/:id/entries/filter-facts`

请求体为 `{ filters }`；`filters` 必须包含 1–16 项，每项形如 `{ id, filter }`。`id` 在请求内唯一，只允许字母、数字、点、下划线和连字符，最长 80 字符；`filter` 复用普通 EntryFilter 的规范化语义。端点拒绝 `search`、`sort`、`page`、`limit`、`cursor`、`windowOffset` 或 `offset`，避免把结构可用性重新解释为某次交互搜索的命中状态。

```js
{
  filters: [
    {
      id: "missing-ipa",
      filter: { presence: [{ field: "ipa", present: false }] }
    }
  ]
}
```

响应不包含 `items`、`total` 或 cursor：

```js
{
  dictionaryId: "dict-1",
  generation: 7,
  facts: {
    "missing-ipa": { available: true }
  }
}
```

结构条件使用 SQL `EXISTS`，不建立排序结果、搜索会话、命中详情或摘要 DTO。规范化后相同的 filter 在请求内及当前 dictionary generation 的轻量事实缓存中只执行一次；任何成功写入都会随查询 generation 一并失效。验证错误使用 `invalid_entry_filter_facts_payload`、`invalid_entry_filter_facts`、`invalid_entry_filter_fact`、`invalid_entry_filter_fact_id` 或 `duplicate_entry_filter_fact_id`。

## 实体 ID 校验约定

- 完整快照保存、导入和迁移必须执行全量实体 ID 唯一性检查。
- 增量保存只检查本次保存范围：
  - 词条保存检查该词条及其释义等子对象。
  - IPA 映射是无 ID 的文本配置，IPA 保存不执行实体 ID 检查。
  - 形态保存检查形态表。
  - 语料保存检查语料块、层和单元。
  - 元数据、普通设置和语言文档保存不应被无关历史重复 ID 阻断。
- 跨类型重复仍然视为冲突；后续引入索引后也应保留跨类型比较。
- 全量重复 ID 诊断和自动修复属于未来诊断/修复模块，不应混入普通保存路径。

## 当前错误码

| code | 含义 |
| --- | --- |
| `request_body_too_large` | 请求体超过当前端点限制；`details.limitBytes` 给出字节上限。 |
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
| `invalid_entry_morphology` | 词条携带的当前形态组或覆盖项结构无效。 |
| `invalid_entry_location_target` | 词根窗口定位请求未提供目标词条 ID。 |
| `invalid_root_context` | `preferredRootId` 不是目标词条的可用词根上下文。 |
| `root_group_not_found` | 请求的词根组不存在于当前查询结果。 |
| `invalid_settings_payload` | 设置请求体格式无效。 |
| `invalid_docs_payload` | 语言文档请求体格式无效。 |
| `invalid_corpus_payload` | 语料请求体格式无效。 |
| `invalid_autosave_payload` | autosave 请求未携带有效 docs 或 corpus 对象。 |
| `invalid_query_window_offset` | 查询窗口 offset 不是非负安全整数。 |
| `invalid_entry_query_limit` | 词条查询 limit 不是大于零的安全整数。 |
| `invalid_entry_filter_json` | 结构化 `filter` 参数不是合法 JSON。 |
| `invalid_entry_filter_payload` | 结构化 `filter` 的顶层不是对象。 |
| `conflicting_entry_filter_transport` | 同一请求同时使用结构化 `filter` 与旧平铺筛选参数。 |
| `invalid_entry_filter_presence` | 字段存在性条件使用了不支持的字段。 |
| `conflicting_entry_filter_presence` | 同一字段同时要求存在与不存在。 |
| `invalid_entry_filter_source_count` | 来源数量边界无效，或最大值小于最小值。 |
| `invalid_entry_filter_activity_day` | 活动日期字段或 UTC 日期值无效。 |
| `conflicting_entry_filter_activity_day` | 同一活动日期字段指定了不同日期。 |
| `query_cursor_required` | 非零窗口 offset 未附带版本化 cursor。 |
| `query_cursor_stale` | cursor 已因服务进程、词典写入或查询条件变化而失效；`details.reason` 标明原因。 |
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
| `sqlite_runtime_unavailable` | 当前 Node.js 运行时不提供项目所需的 SQLite 能力。 |
| `unknown_error` | 未归类错误。 |

## 后续扩展原则

- 普通保存优先增加细粒度端点，不再回退到完整词典 PUT。
- `GET /api/state` 是轻量启动状态入口；普通启动只应读取词典 metadata/summary，再通过 `GET /api/dictionaries/:id` 或专用读取端点按需加载当前词典内容。
- 语料库下一步可从整份 corpus 模块保存拆成块、层、单元级 changeset。
- 搜索、词根模式、词汇关系读取及稳定 SQL 高级筛选已依赖 repository 查询/索引；数据分析、质量检查及 IPA/Gloss/形态功能结果集仍应继续迁移，不能长期让前端扫描大型完整快照。
- 短期不引入词典级 revision。等对象级增量端点稳定后，再基于目标对象 `updatedAt` 做轻量乐观锁。

## 读取 API 现状与后续草案

本节同时记录已经落地的读取契约和仍待实现的扩展草案。`/entries`、`/facets`、`/entry-relations`、`/root-groups`、窗口 cursor 与目标定位已经实装；拆分式启动端点、语料细粒度读取、分析/质量 query 和统一 EntryFilter 仍是后续设计。运行期后端只有 SQLite；新增能力应优先考虑 SQLite 索引、SQL 查询或共享 query layer。

### 启动与词典索引

当前 `GET /api/state` 已可作为轻量启动状态和词典索引入口；后续若继续收窄，可以再拆成更细的 app state、词典索引、summary 和模块读取：

```text
GET /api/app
GET /api/dictionaries
GET /api/dictionaries/:id/summary
GET /api/dictionaries/:id/settings
```

SQLite repository 的 `readState()` / `listDictionaries()` 已只返回词典 metadata 和 summary；前端启动流程始终将 `/api/state` 的 `dictionaries` 当作 metadata，再按需加载 active dictionary。`entryCount` 对每本词典使用轻量 SQL count；`rootCount` 只为当前词典返回并复用稳定词根拓扑。未加载词典不会在启动或打开词典管理页时建立拓扑，切换为当前词典后才会建立。

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
        rootCount // 仅当前词典存在
      }
    }
  ]
}
```

### 词条列表查询

`GET /api/dictionaries/:id/entries` 始终返回分页查询对象，词条详情由单词条端点按需读取：

```text
GET /api/dictionaries/:id/entries?filter=&q=&fields=&fuzzyFields=&part=&tags=&tagMode=&sort=&cursor=&windowOffset=&limit=
```

参数约定：

- `q`：搜索关键词；默认匹配全部搜索字段。
- `filter`：URL 编码后的结构化 EntryFilter JSON；用于字段存在性、来源数量和活动日期等组合条件。与下方平铺筛选参数互斥。
- `fields`：逗号分隔的搜索字段白名单；为空或全部无效时按默认全字段搜索。当前字段包括：
  - `lemma`：词形；
  - `pronunciation`：发音 / IPA；
  - `tags`：原始标签、显示替换标签和按当前设置识别出的词性标签；
  - `definitions`：释义文本；
  - `examples`：当前词条内嵌例句；后续例句升级为语料链接后，该字段应继续表示“与词条关联的例句文本”，来源可包含嵌入字段和链接语料；
  - `notes`：词条备注、释义备注和词条形态组备注；
  - `etymology`：词源描述和来源文本；
  - `morphology`：按当前形态表设置动态生成的形态形式，以及词条级形态 override。
- `fuzzyFields`：逗号分隔的字段级模糊匹配白名单；仅对 `fields` 中的字段生效。
- `part`：词性筛选；按去除边缘空白后的原始标签精确匹配，特殊值 `__conlexicon_no_part__` 表示无词性。
- `tags`：逗号分隔的原始标签列表；按去除边缘空白后的原始标签精确匹配。
- `tagMode`：`any` 或 `all`，默认 `any`。
- `sort`：`lemmaAsc`、`lemmaDesc`、`updatedAsc`、`updatedDesc`、`createdAsc`、`createdDesc`。
- `cursor`：不透明查询游标，前端不得解析。顺序分页使用响应的 `pageInfo.nextCursor`；随机窗口读取使用 `pageInfo.windowCursor`。
- `windowOffset`：可选的结果窗口起点。非零值必须与同一查询返回的有效 `windowCursor` 一起发送；省略时沿用 cursor 自身的位置。该参数用于纯滚动列表直接读取远端窗口，不是 UI 页码。
- `limit`：分页大小，后端可设置上限。

前端普通列表以每窗 200 条读取，最多保留 5 个已加载窗口；未加载和已淘汰窗口使用等高占位，从而让原生滚动条始终代表完整结果集。请求失败时显示失败状态，不回退到前端完整词典快照。repository 仍允许显式诊断和基准工具请求至多 10000 条，但产品 UI 不使用该大页路径。

当前搜索输入采用 250ms debounce，连续输入会重置计时；前端用递增请求 ID 忽略迟到的旧响应。后端所有排序以词条 ID 作为最终稳定键，避免同词形或同时间记录跨窗口边界漂移。`nextCursor` 表示顺序下一页，最后一页为空；`windowCursor` 始终绑定同一结果集合的起点，即使当前响应来自最后一页也可继续用于任意 `windowOffset`。两类 cursor 都绑定当前服务进程 epoch、词典查询缓存 generation 和规范化查询 descriptor；会话被 TTL/LRU 淘汰时后端可重建查询并继续读取，服务重启、成功写入或查询条件变化则返回 `query_cursor_stale`。前端收到 stale cursor 后从首窗重建查询。

目标词条位于尚未加载的窗口时，当前前端不会根据完整词典 snapshot 猜测页号，而会请求：

```text
GET /api/dictionaries/:id/entries/:entryId/location?filter=&q=&fields=&fuzzyFields=&part=&tags=&tagMode=&sort=&limit=
```

后端按同一 descriptor 计算目标结果下标，并直接返回包含目标的窗口。严格及 fuzzy 搜索共同复用查询会话的 `entryId -> resultIndex` 索引；无搜索的结构筛选仍在数据库内计算排序位置。目标词条不存在时返回 `entry_not_found`；词条存在但不属于当前查询结果时仍返回 200，`items` 为空且 `location` 为：

```js
{ found: false, entryId, reason: "not_in_results" }
```

成功定位时为：

```js
{
  found: true,
  entryId,
  resultIndex,  // 当前查询结果内的零基下标
  windowIndex,
  windowOffset
}
```

响应的 `pageInfo.windowCursor` 可供随后加载相邻窗口；定位请求自身不接收客户端 cursor，避免把旧结果集游标与新的定位 descriptor 混用。前端会把返回窗口直接写入当前窗口状态，再执行虚拟列表稳定滚动；查询 SWR 阶段保留的旧 DOM 不能被视为本次定位完成。

返回：

```js
{
  items: [
    {
      id,
      lemma,
      pronunciation,
      tags,
      definitionPreviews: [
        { id, position, meaning }
      ],
      createdAt,
      updatedAt,
      partOfSpeech,
      parts
    }
  ],
  pageInfo: {
    nextCursor,
    windowCursor,
    hasMore,
    total
  }
}
```

#### S3 逐值检索与命中定位契约

S3 不把一个词条或同一字段的多个值拼成全文字符串。共享搜索模型先把词条展开为独立 value record：

```js
{
  field,           // lemma / pronunciation / tags / definitions / examples / notes / etymology / morphology
  value,           // 原始显示文本，不是规范化文本
  sourceType,      // entry / tag / definition / morphologyGroup / etymologySource / morphology
  sourceId,        // 有稳定 ID 时填写；标签等无独立 ID 的对象为空字符串
  sourcePosition,  // 该来源在所属词条中的零基位置
  valueType        // lemma / raw / display / meaning / example / note / description / source / generated 等
}
```

`lib/entry-search-model.js` 的 `entrySearchValueRecords()` 是该结构的共享定义；现有 matcher 也由这些 records 重新聚合字段值，避免后续 SQL projection 与 JavaScript 搜索形成两套逐值边界。`morphology` record 由共享形态模型的 `morphologySearchValueRecords()` 生成，`sourceId` 使用真实子表 ID，`sourcePosition` 保留跨形态组/子表的单元格求值顺序。

SQLite projection 查询中，带 `q` 的分页结果会为每个命中词条附加：

```js
{
  // 既有 summary 或 full entry 字段
  searchHits: [
    {
      field,
      value,
      sourceType,
      sourceId,
      sourcePosition,
      valueType
    }
  ]
}
```

`searchHits` 只返回当前查询实际命中的独立 records；同一来源定位与 `valueType` 的同一值最多返回一次，但不同义项包含相同文本时仍分别返回。它用于选择命中摘要、显示义项序号及定位原始对象，不代替前端基于共享 normalizer 的原文范围映射。无 `q` 时省略该字段；严格及 fuzzy 查询都会返回该字段。S3.1 已固定 record/response 形状，S3.2 已写入 SQLite 静态 projection，S3.3 已启用静态严格查询与前端消费，S4 已把形态以及 fuzzy 命中纳入同一响应。

`/root-groups` 带搜索时复用相同的静态/形态 projection 匹配 SQL，但只消费去重命中 ID，不执行普通词条列表所需的排序；命中集合随后映射到独立缓存的稳定词根拓扑。该路径不接受或物化一份来自拓扑的全词典候选 ID 数组。

未来例句迁移为语料链接后，`examples` record 仍以对应释义作为列表展示定位；语料单元 ID 的返回字段随阶段 C 的关系 API 一并确定，不在 S3.1 提前固化。

形态搜索不是简单读取持久化字段。词条使用 `morphologyMode: "auto" | "manual"`：`auto` 先按自动分配规则得出有序模板组，再按真实 `templateGroupId` 合并该词条的 overlay；`manual` 按词条形态组 position 使用显式模板组，空列表表示明确不使用形态。随后遍历组内全部子表，逐格读取以真实子表 ID 分层的 override；没有 override 时用词形、形态规则和形态函数动态生成默认形式。`templateGroupId` 不再接受 `"auto"` 或 `"none"` 伪值；旧 JSON 的转换只发生在导入迁移。

S4 已将上述结果写入独立的 `entry_morphology_search_values` 派生 projection。它保存真实模板组、子表和单元格坐标以及原始/规范化值，不进入 JSON，也不替代形态主数据。词条 lemma、形态匹配标签、模式、显式组或 override 变化时局部重建；形态模板/函数变化或搜索规范化变化时全量重建。严格及 fuzzy 的形态单字段查询以及静态+形态混合查询均直接读取两张 projection，并把形态单元格映射为 `sourceType: "morphology"`、`sourceId: <templateTableId>`、`sourcePosition: <求值顺序>`、`valueType: "generated"`。每个 SQLite 连接注册确定性的 `conlexicon_fuzzy_match(normalized_value, normalized_query)`，使 fuzzy projection 查询复用共享 matcher。带结构筛选的词条搜索在同一 SQL 中将候选关系连接到两张 projection；无结构条件时直接扫描目标 projection。SQL 只返回最终命中 ID，不再读取完整 snapshot、动态生成形态、把所有候选 records 返回 Node.js，或在 JavaScript 中对候选集合与投射命中集合求交。

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
    { sourceText, matchedEntryId, matchedLemma, matchedEntry }
  ],
  derivedEntries: [
    { id, lemma, pronunciation, tags, definitionPreviews, createdAt, updatedAt }
  ],
  rootGroup: {
    rootKey,
    entries: [
      { id, lemma, pronunciation, tags, definitionPreviews, createdAt, updatedAt }
    ]
  }
}
```

`matchedEntry` 是已匹配来源的 summary DTO；未解析来源时为 `null`。词条详情和词汇网络应直接消费该 DTO，不应回到完整活动词典扫描 `matchedEntryId`。`matchedEntryId` 应由 repository 明确解析；如果同名 lemma 存在多条，当前阶段可选择排序后的第一条并在后续诊断模块中报告歧义。

词汇网络详情视图和词根模式均已接入后端关系/词根读取端点。词根模式、词汇网络同根组和词典摘要的词根数量复用 SQLite repository 的稳定词根拓扑；来源匹配与直接衍生词仍由相同 repository 关系边界返回，不再由前端扫描完整活动词典。

词根模式读取端点：

```text
GET /api/dictionaries/:id/root-groups?q=&fields=&fuzzyFields=&sort=&cursor=&windowOffset=&limit=
```

返回分页后的词根组，而不是向前端一次返回全部分组：

```js
{
  items: [
    {
      root: { id, lemma, pronunciation, tags, definitionPreviews, createdAt, updatedAt },
      derivedCount,
      matchedDerivedCount,
      rootMatches: true
    }
  ],
  pageInfo: {
    nextCursor,
    windowCursor,
    hasMore,
    total,
    windowMetrics: [{ groupCount, derivedCount }]
  }
}
```

`windowMetrics` 通常只在 offset 为 0 的父级响应中提供，按本次 `limit` 划分全部父级窗口；词根定位响应即使位于后续窗口也会携带它，以便前端直接重建完整父级占位。它只包含每窗词根组数和衍生词总数，不携带词条内容。前端用它在“全部展开”和搜索自动展开状态下估算尚未加载窗口的完整高度。普通后续窗口响应可以省略该数组。

目标词条所在父级窗口由以下端点定位：

```text
GET /api/dictionaries/:id/root-groups/location?entryId=&preferredRootId=&q=&fields=&fuzzyFields=&sort=&limit=
```

后端先通过稳定拓扑的 `entryId -> rootIds` 取得候选父级，再用查询会话的 `rootId -> resultIndex` 定位当前 descriptor 下的父级窗口；不会扫描所有词根组。多来源词条可传 `preferredRootId` 指定当前导航上下文。成功响应的 `location` 为：

```js
{
  found: true,
  entryId,
  rootId,
  groupIndex,
  windowIndex,
  windowOffset
}
```

目标存在但当前搜索/筛选排除了对应组时返回 200 和 `found: false`；无效的 `preferredRootId` 返回 `invalid_root_context`。返回的 `items` 是目标父级窗口，前端随后只需按需调用该组的 `/entries` 子端点即可展开并定位衍生词。

折叠的词根组不携带衍生词 DTO。展开某组时按需读取：

```text
GET /api/dictionaries/:id/root-groups/:rootId/entries?q=&fields=&fuzzyFields=&sort=
```

返回 `{ items }`；每个 `items` 元素是词条摘要 DTO，并额外含 `rootGroupMatch`，表示该衍生词是否直接命中当前词根查询。该端点与 `/root-groups` 共享同一个运行时关系会话，但不接受 `cursor`、`windowOffset` 或 `limit`，也没有 2000 条截断。当前前端只对父级词根组列表按每窗 100 组、最多 5 个已加载窗口进行窗口化；展开单组时一次读取并渲染全部衍生词。

性能优化方向：

- repository 已以独立 relation generation 缓存与搜索条件无关的 `rootId -> derivedIds` 稳定拓扑，并同时维护 `entryId -> rootIds`、`rootId -> group` 反向索引；词根查询会话进一步维护 `rootId -> resultIndex`。词典摘要计数、`/root-groups`、组内子项和 `/entry-relations/:entryId` 复用该拓扑。拓扑组和查询结果位置的定位均为 O(1)，关系响应仍需按实际返回条目数读取并构建 DTO。词条增删、lemma/来源变化、整库替换和词典删除会使其失效；普通词条保存/patch 仅同步轻量排序记录，其他模块保存不触碰拓扑。查询 session/cursor 的 cache generation 仍按查询一致性要求独立失效。
- `/root-groups` 搜索直接从 `entry_search_values` / `entry_morphology_search_values` 获取命中 ID，再筛选稳定拓扑，不导出完整词典 snapshot。`entry-relations/:entryId` 已复用同一拓扑的反向索引；后续质量检查中的词源问题仍应继续收敛到该关系查询层。
- SQLite 后端继续用 `entry_sources(source_key, entry_id)` 或等价表/索引支持词根分组和词汇网络查询；旧 JSON conversion 与 migration 不参与运行期查询。
- 前端词根模式正常路径以 `/root-groups` 为准；请求失败时显示失败状态，不回退前端本地完整分组。父级未加载窗口以 `pageInfo.total` 和 `windowMetrics` 建立占位，因此滚动条可在折叠、搜索自动展开及全局展开状态下代表完整词根组集合。全局展开采用状态意图：父级页进入可见范围后才加载各组衍生词；单组收起作为例外保留到重新展开或“全部收起/全部展开”重置。组内衍生词不建立第二层分页窗口。

### 共享查询索引与分析 planner 草案

数据分析 API 化不应只服务“数据分析”页面。词典标题、词典管理、词根模式、词汇网络、质量检查、高级筛选和未来诊断修复都会用到相同的统计、关系解析和索引能力。后续应先建立共享查询层，再在其上实现不同 UI 端点。

高级筛选查询化的完整入口清点与边界见 [Advanced Filter Query Plan](ADVANCED_FILTER_QUERY_PLAN.md)。稳定的标签、词性、字段存在性、来源有无/数量、日期条件和当前搜索字段已经通过 EntryFilter/EntrySearch 接入词条窗口；IPA 生成、Gloss、形态和质量问题仍属于 feature result source。两者最终都由词条列表窗口消费，但 repository 不应为了普通 filter 反向调用分析或质量模块。

建议分三层：

```text
Repository
  SqliteDictionaryRepository

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

当前已落地的 `lib/dictionary-query-model.js` 是浏览器/Node 可复用的内存查询模型，但运行期目前只由前端数据分析消费：它接管 `getEntryById()` / `getEntriesByIds()`、relation index、relation summary 和 root family 查询。它不是 SQLite repository 的查询层，也没有消除数据分析对完整活动词典的依赖。SQLite 侧的词根拓扑、反向索引和窗口查询由 repository 独立实现；覆盖率、标签、活动和 corpus placement 仍待后续 API/query planner 迁移。

SQLite 路径应逐步用 SQL、持久索引、视图或临时表实现相同接口。旧 JSON conversion 与 migration 不参与运行期查询，上层服务也不应重新引入完整 JSON 扫描后端。

#### 共享 relation/query 能力

以下能力应共享同一套 relation/index 语义：

- 词典标题的 `rootCount`。
- 数据分析 relation summary 与 root family widgets。
- `/root-groups` 词根模式。
- `/entry-relations/:entryId` 词汇网络详情。
- 质量检查中的词源网络问题。

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

directDerivedEntries
  source entry/key -> derived entries
```

`sourceResolution` 可被质量检查使用，但“未解析来源”和“来源循环”仍属于质量检查/词源网络问题，不归入诊断修复。

#### Analysis widget query（F4a 已实装）

数据分析总览通过 widget 声明请求所需切片；后端 planner 合并 widget 依赖，避免多个卡片重复统计。当前端点为：

`POST /api/dictionaries/:id/analysis/query`

F4a 支持 `entryCount`、`coverageBreakdown`、`partDistribution` 和 `activityPreview`。这些 light widgets 在一次同步 HTTP 请求内完成；前端异步加载并显示独立的 loading/error/retry 状态。数据分析页未打开时不发起请求。

请求：

```js
{
  widgets: [
    { id: "entry-count", type: "entryCount" },
    { id: "parts", type: "partDistribution", limit: 8 },
    { id: "coverage", type: "coverageBreakdown" },
    { id: "activity", type: "activityPreview", limit: 6 }
  ],
  options: {
    includeActions: true
  }
}
```

- `widgets` 必须为非空数组，最多 16 项；`id` 在一次请求中必须唯一，只允许字母、数字、点、下划线和连字符，最长 80 字符。
- `partDistribution` 和 `activityPreview` 接受 `limit`，默认分别为 12 和 6，范围为 1–50；其他 widget 不接受 `limit`。
- `options.includeActions` 默认为 `true`。设为 `false` 时省略 action descriptor。

响应返回结构化 widget data，不返回 HTML：

```js
{
  dictionaryId: "dict-1",
  generation: 4,
  cacheKey: "...",
  widgets: {
    "entry-count": {
      type: "entryCount",
      value: 10000,
      action: { type: "view", target: "editor" }
    },
    "coverage": {
      type: "coverageBreakdown",
      total: 10000,
      rows: [
        {
          field: "ipa",
          count: 9400,
          missingCount: 600,
          ratio: 0.94,
          action: {
            type: "entryFilter",
            count: 9400,
            filter: { presence: [{ field: "ipa", present: true }] }
          },
          missingAction: {
            type: "entryFilter",
            count: 600,
            filter: { presence: [{ field: "ipa", present: false }] }
          }
        }
      ]
    }
  },
  diagnostics: {
    computedTasks: ["entryStats", "partStats", "activityStats"],
    elapsedMs: 0
  }
}
```

`generation` 在成功写入后递增；`cacheKey` 绑定词典 ID、generation 和规范化请求，因此写入后同一声明会得到新的身份。当前 response 不承诺服务端结果缓存，`cacheKey` 用于稳定标识和后续缓存扩展。

Widget 通过以下任务依赖生成：

| Widget | F4a 任务 |
| --- | --- |
| `entryCount` | `entryStats` |
| `coverageBreakdown` | `entryStats` |
| `partDistribution` | `partStats` |
| `activityPreview` | `activityStats` |

同一任务在一次请求中只执行一次；多个 `activityPreview` 使用请求中的最大 limit 读取，再分别裁剪。`coverageBreakdown.rows[].field` 支持 `definition`、`example`、`entryNote`、`source`、`ipa`；释义和例句行另带 `itemCount`。词性分布 action 使用 `{ part }` descriptor，无词性行使用保留值 `__conlexicon_no_part__`。最近编辑行使用 `{ type: "entry", entryId }` action。

请求验证失败使用 `invalid_analysis_query_payload`、`invalid_analysis_widgets`、`invalid_analysis_widget`、`invalid_analysis_widget_id`、`unsupported_analysis_widget`、`invalid_analysis_widget_limit` 或 `duplicate_analysis_widget_id`。

#### Light / full 任务边界

为避免总览卡片触发重型计算，F4a 只实现上述三个轻量任务。以下仍是 F4b 的设计边界：

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

F4a 的 light widgets 不返回后台任务状态。F4b 接入重型 widget 后，可以先同步构建并缓存结果；只有真实基准证明计算不适合停留在请求生命周期内时，API 才增加 `status: "deferred" | "running" | "failed"` 或要求点击后计算。不要默认让总览触发所有 full 任务，也不要近期引入持久化 job 表。

#### Filter descriptor

分析卡片和质量卡片不应长期传递大量 `entryIds`。F4a 分析 widget 已使用 filter descriptor：

```js
{
  type: "entryFilter",
  count: 608,
  filter: {
    presence: [
      { field: "ipa", present: false }
    ]
  }
}
```

点击分析行时，词条列表使用 descriptor 调用 `/entries` 获取匹配项。这样总览 API 只返回 `count` 和可复用 filter spec，避免大词典下把大量 ID 塞进 dashboard 响应。F4b/F5 的功能结果仍需按各自会话边界迁移。

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

1. 已完成的基础继续保持：`listDictionaries()`/词典标题 root count、词根模式和词汇网络复用 SQLite 稳定词根拓扑。
2. F1–F3 已完成统一 EntryQuery/EntryFilter、SQLite 条件编译和前端 descriptor 迁移；稳定筛选继续复用 `/entries` 的窗口、cursor、缓存与定位。
3. F4a 已完成 `POST /analysis/query` 的四类 light widgets、最小 planner 和总览异步加载；总览不再为这些统计读取完整 snapshot。
4. F4b 为重型 IPA、Gloss、morphology、完整 root family 排名和质量问题建立独立 feature result session；先同步构建并缓存，异步后台状态由真实基准决定。
5. F5 建立独立 `/quality/query`，再让质量高级筛选消费该会话；repository 不反向调用质量算法。
6. 语料查询在独立服务边界稳定后按需接入，不恢复前端 materialized ID 或完整快照兜底。
