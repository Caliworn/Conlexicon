# API Contract

本文记录 Conlexicon 当前本地 HTTP API 的稳定约定。它描述前端可依赖的接口边界，而不是底层文件结构；后端运行期只使用 SQLite repository。旧 JSON 仅通过转换服务作为导入、导出和目录迁移格式，不再提供 JSON runtime repository。SQLite 后端见 [SQLite 后端规范](SQLITE_BACKEND_SPEC.md)；JSON 兼容导入/导出和迁移见 [导入导出规范](IMPORT_EXPORT_SPEC.md)。

前端页面缓存、后端运行时查询会话和结果缓存的身份、失效、容量与重建规则见 [SQLite 后端规范](SQLITE_BACKEND_SPEC.md#7-查询会话与结果缓存)。尚未实装的 API 设想放在 [API Drafts](API_DRAFTS.md)，不属于本文契约。

## 通用约定

- 所有业务 API 位于 `/api/` 下。
- 请求体和成功响应默认使用 JSON。
- 失败响应使用结构化错误：

```json
{
  "error": {
    "code": "duplicate_entity_ids",
    "message": "Duplicate dictionary entity IDs: ...",
    "details": {
      "duplicates": [{ "id": "shared-id", "types": ["entry", "corpusUnit"] }]
    }
  }
}
```

- `code` 是前端本地化和分流处理的稳定字段。
- `message` 保留技术信息，主要用于控制台、诊断和未来错误详情页；普通 toast 不应直接依赖英文 `message`。
- `details` 可选。重复实体 ID 错误固定返回 `details.duplicates: Array<{ id, types }>`，前端使用应用内弹窗本地化展示；其他错误详情主要用于调试。
- 前端应继续在控制台保留原始错误对象；普通错误 toast 不直接展示英文 `message`。

### 本地 HTTP 访问边界

服务默认只监听 `127.0.0.1`，启动日志保持 `Conlexicon running at http://localhost:<port> (sqlite repository)`。只有 `CONLEXICON_LAN_DEBUG=1` 才监听 `0.0.0.0`，其他值均关闭；该开关供手机等真机调试，不在 Electron 外壳提供入口。

入口在路由执行与正文读取前依次检查：

1. 所有 API 与静态请求的 Host 必须是 `localhost:<port>`、`127.0.0.1:<port>` 或 `[::1]:<port>`，使用实际监听端口，比较不区分大小写。LAN 调试开启时，额外允许启动时读取的本机非内部 IPv4 地址加该端口，不接受任意主机名或其他设备的地址。
2. 非 GET／HEAD 的 `/api/` 请求若携带 Origin，必须严格等于 `http://` 加已通过校验的 Host；`null` 也不允许。不带 Origin 的命令行或脚本请求放行。
3. 同类写请求的媒体类型必须为 `application/json`，忽略参数和大小写；无正文的 POST、DELETE 也必须携带该类型。前端 `api()`、JSON Blob beacon 与 fetch 兜底均使用同一规则。

| 情况 | 状态码 | 响应 |
| --- | --- | --- |
| Host 缺失或不在白名单 | 403 | API 路径为 JSON `forbidden_host`，其他路径为纯文本。 |
| 写 API 的 Origin 存在但不同源 | 403 | JSON `forbidden_origin`。 |
| 写 API 的媒体类型缺失或不是 JSON | 415 | JSON `unsupported_media_type`。 |
| 静态资源不在公开清单 | 404 | 纯文本。 |
| 静态请求使用 GET／HEAD 以外的方法 | 405 | 纯文本。 |

静态公开清单维护在 `lib/static-server.js`：主页面、Lab 页面、应用脚本与样式、HTML 引用的前端模块、液态玻璃贴图 worker（含它 `importScripts` 的几何模块），以及五张 Lab 图片；`/` 映射到 `index.html`。按 URL pathname 精确匹配，区分大小写，不解码路径、不开放整个目录。清单与引用保持双向一致：公开的 HTML、JS、CSS 中出现的静态文件路径（页面脚本按站点根目录解析，worker 内按 worker 自身位置解析）必须在清单中，清单中除两个入口页外的文件也必须被某个公开文件引用；由 `scripts/check-http-access.js` 扫描校验，不按加载方式逐类列举。GET 返回文件，HEAD 返回相同类型与长度但不带正文；清单中的文件读取失败照常抛出。

LAN 调试的来源和媒体类型规则不变。开启时启动日志另打印本机可用的局域网地址与警告：局域网内任何设备均可读写该数据目录，建议使用临时数据目录。

### 畸形请求 URL

请求 URL 使用固定可信基准解析，不使用未经校验的 Host。URL 无法解析时，在进入路由前返回 HTTP 400 和纯文本 `Invalid request URL`；服务继续处理后续请求。畸形 Host 按上述白名单返回 403，不再参与 URL 解析。

### 请求体大小限制

- 普通单对象与设置端点最多接受 5 MiB 请求体，包括全局偏好、新建词典、词典 metadata、普通设置、IPA 设置以及单词条新建/保存。
- 模块级或批量保存端点最多接受 32 MiB，包括 `autosave`、语言文档、语料库、形态学和批量词条 patch。
- JSON 导入端点最多接受 64 MiB。该上限只控制 HTTP 请求边界；导入仍会经历 JSON 解析、legacy migration 和规范化，不能据此推断峰值内存等于文件大小。
- 后端会用合法的 `Content-Length` 提前拒绝明显超限请求，同时继续按实际收到的字节流累计检查；缺失、伪造或偏小的声明长度不能绕过上限。超限统一返回 `request_body_too_large`，并在 `details.limitBytes` 中给出当前端点的字节上限。

## 当前端点

### 应用状态与全局偏好

| 方法 | 路径 | 用途 | 响应 | 备注 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/state` | 读取轻量应用状态 | `{ activeDictionaryId, dictionaries, uiLanguage, uiTheme, uiSkin }` | `dictionaries` 只包含 metadata 和 summary；所有词典都通过轻量 SQL 返回 `entryCount` 和严格的 `rootCount`。前端把它当轻量索引，并按需读取当前词典的工作区；未加载词典不会因此建立词根拓扑。`uiSkin` 为 `classic`、`layered-glass` 或 `liquid-glass`。 |
| `PUT` | `/api/preferences` | 保存全局界面偏好 | `{ uiLanguage, uiTheme, uiSkin }` | 支持独立更新 `uiLanguage`、`uiTheme` 和 `uiSkin`；皮肤与明暗主题正交。未知皮肤值不会写入，并返回 `invalid_ui_skin`。 |

### 导入、导出与词典生命周期

新建与导入先登记索引，再执行数据库事务；可捕获的写库失败会恢复原索引并清理本次新库，覆盖导入保留旧数据。补偿失败仍报错，不报告成功。删除在文件已删而索引更新失败时，由下次列表读取剪除残留登记。请求、响应和错误码沿用下表；持久化边界见 [索引写入与失败恢复](SQLITE_BACKEND_SPEC.md#索引写入与失败恢复)。

| 方法 | 路径 | 用途 | 响应 | 备注 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/export?dictionaryId=&format=&profile=` | 导出数据 | 当前支持 JSON 完整词典 payload | 默认 `format=json&profile=legacy-json`；`profile=portable-json` 当前只是同结构兼容别名，不代表已有独立 portable 格式。原生 SQLite 与 XLSX 导出尚未实装。 |
| `POST` | `/api/import?overwrite=&regenerateId=&profile=` | 导入 JSON | 应用状态 | 默认 `profile=legacy-json`；完整快照导入会通过转换服务执行 legacy 兼容解析、搜索自定义规则检查、规范化和实体 ID 检查。`regenerateId=true` 生成新的词典 UUID，按非覆盖方式新建，忽略 `overwrite`。 |
| `POST` | `/api/dictionaries` | 新建词典 | 完整词典 JSON | 后端生成词典 UUID，并使用非覆盖式创建；ID 已存在时返回 `dictionary_id_exists`。创建成功后设为当前词典。 |
| `GET` | `/api/dictionaries/:id` | 读取当前词典工作区 | `{ id, name, language, description, settings, docs, corpus, morphology, createdAt, updatedAt, summary }`，不含 `entries` | 前端启动或切换当前词典时加载；模块为存储中的原样，前端在进入状态时规范化。词条只经 `/entries`、单词条、关系和各查询端点读取，前端不保存整本词条。完整词典（含词条）只经 `/api/export` 导出。 |
| `POST` | `/api/dictionaries/:id/activate` | 切换当前词典 | 应用状态 | 只改 `index.json` 中的当前词典。 |
| `DELETE` | `/api/dictionaries/:id` | 删除词典 | 应用状态 | 删除词典文件并更新索引。 |

### 词典元数据与模块级保存

| 方法 | 路径 | 用途 | 响应 | 校验范围 |
| --- | --- | --- | --- | --- |
| `PUT` | `/api/dictionaries/:id/meta` | 保存词典名称、语言、描述 | 词典 metadata payload | 不做实体 ID 检查；响应包含 `id/name/language/description/createdAt/updatedAt`。 |
| `PUT` | `/api/dictionaries/:id/settings` | 保存其他设置 | `{ id, updatedAt, settings }` | 不做实体 ID 检查；会保留既有 IPA 设置。`settings.search` 含字段级 `enabled/fuzzy`、`etymologyAutocomplete.fuzzy`，以及 `normalization: { unicodeNormalization: "none" | "nfc", caseFolding: boolean, customRules: { canonical, variants[] }[] }`。规范化默认严格关闭；自定义规则按最长变体优先且单次应用。前端据此生成读取 API 参数，并同步用于词根模式、搜索摘要/高亮、字段命中计数和词源自动补全。`settings.tagListSeparatorStyle` 支持 `commaSpace`、`fullwidthComma`、`ideographicComma`，只控制标签列表输入框重新显示时的分隔符。`settings.search.normalization.customRules` 必须是数组，每条规则须有非空的 `canonical` 和非空的 `variants`，同一变体不能对应不同的标准形式；任何一条不合规都整次拒绝，返回 400 `invalid_search_normalization_rule`（规则无效时运行期会忽略全部自定义规则，所以不接受部分保存）。`settings.toolNavOrder` 与 `settings.entrySectionOrder` 由服务端保留合法项顺序、去掉重复与未知项并补齐缺项；未知 settings 字段原样保留。 |
| `PUT` | `/api/dictionaries/:id/docs` | 保存语言文档 | `{ id, updatedAt, docs }` | 不做实体 ID 检查。 |
| `PUT` | `/api/dictionaries/:id/corpus` | 保存语料库模块 | `{ id, updatedAt, corpus }` | 检查语料内部实体 ID 重复，不查词条与形态。 |
| `PUT` | `/api/dictionaries/:id/morphology` | 保存自动形态学模块 | `{ id, updatedAt, morphology }` | 请求仍表示完整替换形态模块；后端检查提交内组与表 ID 不重复（不查词条与语料）、规则语法和函数配置，并按稳定组/表 ID 增量写入模板。纯名称、说明、表格标题或行列标签变化不重建生成投影；规则、函数、表结构或自动分配变化只重建实际受影响词条的形态搜索 projection。完全相同的规范化 payload 作为 no-op 返回既有 `updatedAt`。删除组、删除/移动表格或缩小表格会使既有词条形态组或覆写悬空时返回 `morphology_references_in_use`。 |
| `PUT` | `/api/dictionaries/:id/settings/ipa` | 保存自动 IPA 设置 | `{ id, updatedAt, settings }` | IPA 映射是按顺序保存的纯文本规则 `{ from, to, before, after }`，没有实体 ID，也不参与实体 ID 防撞。`syllable.vowels`、`onsetClusters`、`codaClusters`、`complexPhonemes` 都是字符串数组；写入字符串或含分隔符的数组项时，按空白、逗号、顿号拆开。 |
| `POST` | `/api/dictionaries/:id/autosave` | 页面卸载时保存文档/语料草稿 | `{ id, updatedAt, docs?, corpus? }` | 当前只分发 `docs` 和 `corpus`；请求至少须携带其中一个有效对象，否则返回 `invalid_autosave_payload`。 |

### 词条读取与保存

| 方法 | 路径 | 用途 | 响应 | 校验范围 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/dictionaries/:id/entries` | 读取词条列表 | `{ items, pageInfo, searchSummary }`，其中 `items` 固定为词条摘要 DTO | 支持结构化 JSON `filter`，以及现有 `q`、`fields`、`fuzzyFields`、`part`、`tags`、`tagMode`、`sort`、`cursor`、`windowOffset`、`limit`。结构化 `filter` 不得与平铺筛选参数混用。无参数请求也使用默认排序和窗口大小，不返回完整词条数组。 |
| `POST` | `/api/dictionaries/:id/entries/filter-facts` | 批量读取结构筛选是否存在候选 | `{ dictionaryId, generation, facts }` | 最多接受 16 个 filter descriptor；只返回按请求 ID 对应的 `available` 布尔值，不接受搜索、排序或分页语义。 |
| `GET` | `/api/dictionaries/:id/entries/:entryId/location` | 定位词条在当前查询中的窗口 | `{ items, pageInfo, searchSummary, location }` | 接受与 `/entries` 相同的查询 descriptor 和 `limit`，但不接受客户端 cursor；目标存在但被查询排除时返回 `location.found: false`。 |
| `POST` | `/api/dictionaries/:id/entries` | 新建词条 | `{ entry, summary }` | 客户端不得携带词条 ID；后端为每次请求生成一次 UUID，并在 `entry.id` 返回。新建为非覆盖式写入，ID 已存在时返回 409 `duplicate_entity_ids_scoped`；不做其他实体 ID 检查，释义 ID 冲突由主键约束拒绝并整体回滚。`summary` 是写入后的轻量词典计数。 |
| `GET` | `/api/dictionaries/:id/entries/:entryId` | 读取单个词条 | 词条 JSON | 未找到返回 `entry_not_found`。 |
| `PUT` | `/api/dictionaries/:id/entries/:entryId` | 保存已有词条 | `{ entry, summary }` | 只更新已有词条，词条不存在时返回 404 `entry_not_found`，不按客户端 ID 新建。不做实体 ID 检查：释义 ID 重复（无论同一词条内还是撞到其他词条）由主键约束失败并整体回滚。`summary` 是写入后的轻量词典计数。 |
| `DELETE` | `/api/dictionaries/:id/entries/:entryId` | 删除单个词条 | `{ updatedAt, summary }` | 不因无关历史重复 ID 阻断删除；`summary` 是删除后的轻量词典计数。 |
| `PATCH` | `/api/dictionaries/:id/entries` | 批量更新词条字段 | `{ id, updatedAt, entries, settings? }` | 当前仅允许 patch `tags`（词条级标签）和 `pronunciation`，不接受释义标签；`entries` 只包含本次更新的词条；可附带 `settings` 与本次更新一并保存，附带时与 `PUT /settings` 一样检查搜索自定义规则。 |
| `POST` | `/api/dictionaries/:id/entries/batch` | 按已保存设置批量改写整本词典 | 试运行：`{ operation, targetCount, dryRun: true }`；执行：`{ id, updatedAt, operation, targetCount, dryRun: false, summary }` | 见下方“整词典批处理”。 |

### 读取侧查询

| 方法 | 路径 | 用途 | 响应 | 备注 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/dictionaries/:id/tag-registry` | 读取标签登记表与使用数 | `{ id, generation, tags }` | 见[标签登记表](#标签登记表)。 |
| `POST` | `/api/dictionaries/:id/tag-registry/changes` | 修改标签登记表，一次一个操作 | `{ id, updatedAt, tagRegistry }` | 见[标签登记表](#标签登记表)。 |
| `GET` | `/api/dictionaries/:id/entry-relations/:entryId` | 读取词源/衍生/同根关系 | `{ entryId, sources, derivedEntries, rootGroup }` | SQLite 路径复用稳定词根拓扑的反向索引，并按需读取关系 DTO；来源只按精确目标 ID 匹配，不按同名 lemma 猜测。 |
| `POST` | `/api/dictionaries/:id/source-candidates/query` | 来源补全候选（只读） | `{ items, total, limit }`，其中 `items` 固定为词条摘要 DTO | 请求体 `{ q, ownerEntryId?, excludeEntryIds?, limit? }`。复用 lemma 搜索 projection、查询规范化和共享 matcher，由 `settings.search.etymologyAutocomplete.fuzzy` 决定是否启用 fuzzy；不使用 cursor，详见[输入、补全与唯一性](#输入补全与唯一性)。 |
| `GET` | `/api/dictionaries/:id/root-groups` | 读取词根模式分组 | `{ items, pageInfo, searchSummary }` | 支持 `q`、`fields`、`fuzzyFields`、`sort`、`cursor`、`windowOffset`、`limit`。前端词根模式正常路径以该 API 为准，并按窗口加载。 |
| `GET` | `/api/dictionaries/:id/root-groups/location` | 定位词条所属的父级词根窗口 | `{ items, pageInfo, searchSummary, location }` | 必须传 `entryId`；可传 `preferredRootId` 消除多来源词条的父级歧义，其余参数沿用 `/root-groups` descriptor。 |
| `GET` | `/api/dictionaries/:id/root-groups/:rootId/entries` | 按需读取单个词根组的全部衍生词 | `{ items }`，其中 `items` 固定为词条摘要 DTO | 支持与词根组查询相同的搜索、排序和字段参数，但不分页；折叠组不预载衍生词，展开后一次读取整组。 |
| `POST` | `/api/dictionaries/:id/analysis/query` | 按需读取轻量分析 widgets | `{ dictionaryId, generation, cacheKey, widgets, diagnostics }` | 同步聚合端点；多个 widget 由 planner 合并为共享 SQLite 任务，不读取或返回完整词典 snapshot。 |
| `POST` | `/api/dictionaries/:id/analysis/features/query` | 读取派生功能结果摘要或窗口 | summary 模式返回 `{ dictionaryId, generation, resultKey, source, summary, diagnostics }`；items 模式另带 `{ items, pageInfo, searchSummary }` | 当前支持 `ipaAutoCompare`、`ipaDistribution` 和 `morphologyAnalysis` v1；基础算法结果保存在有界进程缓存中，分类、搜索、排序和窗口不触发功能算法重算。 |
| `POST` | `/api/dictionaries/:id/analysis/features/location` | 定位词条在派生结果视图中的窗口 | feature query 响应加 `{ location }` | 请求额外携带 `entryId`；目标不属于当前分类或搜索结果时返回 `location.found: false`。 |
| `POST` | `/api/dictionaries/:id/quality/query` | 读取质量检查摘要、问题窗口或受影响词条窗口 | summary 模式返回 `{ dictionaryId, generation, resultKey, source, summary, diagnostics }`；items 模式另带 `{ view, searchSummary, items, pageInfo }` | 详见 [Quality result query](#quality-result-query)；不读取完整 snapshot，问题 DTO 只含稳定字段。 |
| `POST` | `/api/dictionaries/:id/quality/location` | 定位词条在质量 entry 视图中的窗口 | quality items 响应加 `{ location }` | 只接受 `itemKind: "entry"`，请求额外携带 `entryId`。 |

#### `GET /api/dictionaries/:id/entries` 查询参数补充

- transport 参数统一归一化为内部 `{ filter, search, sort, page }` EntryQuery；查询会话、cursor digest 和缓存键使用同一个稳定 identity。`limit`、`cursor` 和 `windowOffset` 不改变匹配集合，因此不进入 identity。既有 `part`、`tags`、`tagMode` 平铺筛选参数仍可单独使用；新的 `filter` 参数接收 URL 编码后的 JSON 对象，并且不能与这些平铺筛选参数混用。
- 结构化 `filter` 的规范形状为：

  ```js
  {
    part: "n",
    partCount: { min: 2 },
    partSet: ["adj", "n"],
    tags: { values: ["motion"], mode: "any" },
    presence: [
      { field: "definition", present: true },
      { field: "ipa", present: false }
    ],
    sourceCount: { min: 1, max: 2 },
    tagCount: { min: 2 },
    activityDays: [{ field: "updated", day: "2026-07-17" }],
    orthography: { category: "bigram", value: "ab" }
  }
  ```

  所有字段均可省略。所有标签条件（`part`、`partCount`、`partSet`、`tags`、`presence.tag`、`tagCount`）都按词条的**有效标签**判断，即词条标签与全部释义标签的并集，见[释义标签与有效标签](#释义标签与有效标签)；标签挂在哪一层不影响结果。`tags.mode` 为 `any`、`all` 或 `exact`；`exact` 要求词条包含全部指定标签且不含任何额外标签。`presence.field` 支持 `definition`、`example`、`entryNote`、`source`、`derivedEntries`、`ipa`、`tag`；`source` 表示词条有任何来源记录（已绑定或纯文本），`derivedEntries` 表示有其他词条以已绑定来源引用它（即它有衍生词）；`tag` 表示词条是否至少有一个有效标签。`sourceCount`、`tagCount` 与 `partCount` 都是包含边界的非负整数区间，`max` 可省略；`sourceCount` 统计来源记录，`tagCount` 统计不同有效标签的数量，`partCount` 统计词条的词性集合大小（有效标签中出现在 `settings.partOfSpeechTags` 里的不同标签）。`partSet` 是至少两个不同词性的数组，要求词条的词性集合恰好等于它，非词性标签不受限制；单个词性用 `part`。`partSet` 含未配置为词性的值时结果为空，与 `part` 处理未配置词性的方式相同；没有配置词性时 `partCount` 按 0 计算。`partCount` 区间非法返回 `invalid_entry_filter_part_count`，`partSet` 不是字符串数组或去重后只有一个值时返回 `invalid_entry_filter_part_set`。`activityDays.field` 支持 `created`、`updated`，日期按 UTC `YYYY-MM-DD` 的 `[dayStart, nextDayStart)` 半开范围比较。同一 presence 或日期字段不得给出冲突条件。`orthography` 是单一正写法结构条件，category 支持 `length`、`initial`、`character`、`bigram`；长度按整个 lemma 的 Unicode 码点数计算，首字符先 trim，字符忽略 Unicode 空白，双字符只统计空白分隔片段内部的相邻码点。该条件不执行 NFC、搜索规范化或字素簇合并。当前 `entryNote` 只表示词条级备注，不包含释义备注或形态组备注。
- `fields`：逗号分隔的搜索字段白名单；当前支持 `lemma`、`pronunciation`、`tags`、`definitions`、`examples`、`notes`、`etymology`、`morphology`。为空或全部无效时搜索全部字段。
- `fuzzyFields`：逗号分隔的字段级模糊匹配白名单；仅对同时出现在 `fields` 中的字段生效。
- 基础搜索逐个独立字段值匹配：一条释义、一个标签、一个来源或一段备注必须自行包含查询文本，查询不会跨多个值拼接命中；`notes` 中的词条备注、释义备注和每个词条形态组备注也分别作为独立值。多标签组合等条件应使用高级筛选。自由文本按当前词典的 `settings.search.normalization` 处理。SQLite 的严格及 fuzzy 查询均直接读取静态 `entry_search_values` 和按需读取形态 `entry_morphology_search_values`；fuzzy 通过连接级确定性函数复用共享搜索模型的评分语义。该路径支持 NFC、Unicode case folding 和自定义等价规则。结构键和词源关系键不套用该自由文本配置。
- 词源自动补全由独立的 `settings.search.etymologyAutocomplete.fuzzy` 控制，候选通过复用 `/entries` projection 的后端端点获取（见[输入、补全与唯一性](#输入补全与唯一性)），不再扫描前端词典快照。

#### `POST /api/dictionaries/:id/entries/batch`：整词典批处理

前端不保存整本词条，需要遍历全部词条的编辑由服务端按**已保存**的设置完成。请求体：

- `{ operation: "generateIpa", mode: "missing" | "all", dryRun? }`：为词形非空（去首尾空白后）的词条生成发音，`missing` 只处理发音为空的词条，`all` 覆盖全部；生成规则与前端相同，均由 `ipa-model` 的 `generateIpaFromLemma` 按 `settings.ipa` 计算。

`dryRun: true` 只返回将写入的词条数 `targetCount`，不写入；前端用它在确认前判断是否无事可做。目标数为 0 时同样不写入，返回 `dryRun: false` 且不带 `updatedAt`／`summary`。实际写入复用批量 patch 的单事务路径（含搜索投影与词根拓扑排序记录的更新）。`operation` 不在上述两种、`generateIpa` 缺少合法 `mode` 或 `dryRun` 不是布尔值时返回 400 `invalid_entry_batch_payload`。

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

- 实体 ID 由类型前缀加随机 UUID 组成，由服务端生成：新建词条和创建来源的 `POST` 不接受客户端 ID（`entry_id_not_allowed`），`PUT` 只更新已有词条。规范化只补齐缺失的 ID，不扫描已有 ID 防撞，也不重试。
- 导入（含旧 JSON 转换）在边界执行全量实体 ID 唯一性检查，跨类型重复同样视为冲突，返回 `duplicate_entity_ids`。
- 普通保存只检查数据库键无法拒绝的提交范围，重复返回 `duplicate_entity_ids_scoped`：
  - 词条保存不做 ID 检查：释义 ID 重复由主键约束失败并整体回滚；新建撞上已有词条 ID 时返回 409，不覆盖。
  - 形态保存在生成写入计划前拒绝提交内重复的组／表 ID：写入计划按 ID 建索引，重复会被静默合并。
  - 语料保存检查语料块、层和单元之间的重复：语料存为整块 JSON，没有主键约束。
  - IPA 映射没有实体 ID；元数据、普通设置和语言文档保存不做 ID 检查。
- 全量重复 ID 诊断和自动修复属于未来诊断/修复模块，不应混入普通保存路径。

## 当前错误码

| code | 含义 |
| --- | --- |
| `request_body_too_large` | 请求体超过当前端点限制；`details.limitBytes` 给出字节上限。 |
| `forbidden_host` | Host 缺失或不在本地服务的允许清单中，HTTP 403。 |
| `forbidden_origin` | 写请求的 Origin 与已校验 Host 不同源，HTTP 403。 |
| `unsupported_media_type` | 写请求未携带 `application/json` 媒体类型，HTTP 415。 |
| `invalid_json_body` | 请求体不是合法 JSON。 |
| `invalid_ui_language` | 全局界面语言值无效。 |
| `invalid_ui_theme` | 全局主题值无效。 |
| `invalid_ui_skin` | 全局皮肤值无效。 |
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
| `entry_id_not_allowed` | 新建词条 POST 携带了只能由后端生成的词条 ID。 |
| `invalid_entry_updates_payload` | 批量词条更新请求格式无效。 |
| `invalid_entry_batch_payload` | 整词典批处理的 operation、mode 或 dryRun 无效。 |
| `entry_not_found` | 词条不存在或已被删除。 |
| `invalid_entry_morphology` | 词条携带的当前形态组或覆盖项结构无效。 |
| `invalid_entry_location_target` | 词根窗口定位请求未提供目标词条 ID。 |
| `invalid_root_context` | `preferredRootId` 不是目标词条的可用词根上下文。 |
| `root_group_not_found` | 请求的词根组不存在于当前查询结果。 |
| `invalid_settings_payload` | 设置请求体格式无效。 |
| `invalid_search_normalization_rule` | 设置保存、带 settings 的批量 patch 或导入中的搜索自定义规则无效，整次拒绝。`details.errors` 为 `{ index, variantIndex?, variant?, code }[]`，`code` 为 `invalid_rules`（规则列表不是数组）、`invalid_rule`、`invalid_canonical`、`empty_canonical`、`invalid_variants`、`empty_variants`、`invalid_variant`、`empty_variant` 或 `conflicting_variant`，与设置表单的本地检查相同，前端复用同一组提示。 |
| `invalid_docs_payload` | 语言文档请求体格式无效。 |
| `invalid_corpus_payload` | 语料请求体格式无效。 |
| `invalid_autosave_payload` | autosave 请求未携带有效 docs 或 corpus 对象。 |
| `invalid_query_window_offset` | 查询窗口 offset 不是非负安全整数。 |
| `invalid_entry_query_limit` | 词条、feature-result 或质量查询 limit 不在 1–200 范围内。 |
| `invalid_root_group_query_limit` | 父级词根组查询 limit 不在 1–100 范围内。 |
| `invalid_entry_filter_json` | 结构化 `filter` 参数不是合法 JSON。 |
| `invalid_entry_filter_payload` | 结构化 `filter` 的顶层不是对象。 |
| `conflicting_entry_filter_transport` | 同一请求同时使用结构化 `filter` 与旧平铺筛选参数。 |
| `invalid_entry_filter_presence` | 字段存在性条件使用了不支持的字段。 |
| `conflicting_entry_filter_presence` | 同一字段同时要求存在与不存在。 |
| `invalid_entry_filter_source_count` | 来源数量边界无效，或最大值小于最小值。 |
| `invalid_entry_filter_tag_count` | 标签数量边界无效，或最大值小于最小值。 |
| `invalid_entry_filter_part_count` | 词性数量边界无效，或最大值小于最小值。 |
| `invalid_entry_filter_part_set` | 词性集合不是字符串数组，或去重后只有一个词性。 |
| `invalid_entry_filter_activity_day` | 活动日期字段或 UTC 日期值无效。 |
| `conflicting_entry_filter_activity_day` | 同一活动日期字段指定了不同日期。 |
| `invalid_entry_filter_orthography` | 正写法筛选类别或值无效。 |
| `query_cursor_required` | 非零窗口 offset 未附带版本化 cursor。 |
| `query_cursor_stale` | cursor 已因服务进程、词典写入或查询条件变化而失效；`details.reason` 标明原因。 |
| `invalid_morphology_payload` | 形态学请求体格式无效。 |
| `morphology_references_in_use` | 形态模板结构变化会使既有词条形态组或单元格覆写失效；`details.referenceCount/references` 返回受影响引用摘要。 |
| `invalid_ipa_settings_payload` | IPA 设置请求体格式无效。 |
| `unsupported_entry_patch_fields` | 批量词条 patch 包含不支持字段。 |
| `entry_patch_tags_invalid` | 批量标签 patch 值不是数组。 |
| `entry_patch_pronunciation_invalid` | 批量 IPA patch 值不是字符串。 |
| `system_file_permission` | 文件权限不足。 |
| `system_disk_full` | 磁盘空间不足。 |
| `system_file_busy` | 文件被占用。 |
| `system_file_missing` | 目标文件缺失。 |
| `system_json_parse` | 本地数据损坏或无法解析，包括 SQLite 中的模块配置和形态标签 JSON。 |
| `sqlite_runtime_unavailable` | 当前 Node.js 运行时不提供项目所需的 SQLite 能力。 |
| `unknown_error` | 未归类错误。 |

## 扩展原则

- 普通保存优先增加细粒度端点，不再回退到完整词典 PUT。
- `GET /api/state` 是轻量启动状态入口；普通启动只应读取词典 metadata/summary，再通过 `GET /api/dictionaries/:id` 或专用读取端点按需加载当前词典内容。
- 新的分析与功能结果走 repository 查询、`/analysis/query`、feature result 或质量服务，不让前端扫描大型完整快照；Gloss 分析在例句—语料链接边界确定后再接入。
- 当前不引入词典级 revision。对象级乐观锁与语料细粒度 changeset 的设想见 [API Drafts](API_DRAFTS.md)。

## 读取 API

本节规定 `/entries`、`/tag-registry`、`/entry-relations`、`/root-groups`、EntryFilter、`/analysis/query`、feature result 与质量查询的形状，以及它们共用的窗口、cursor 和目标定位语义。运行期后端只有 SQLite；新增读取能力优先考虑 SQLite 索引、SQL 查询或现有 repository 查询边界。

### 启动与词典索引

`GET /api/state` 是轻量启动状态和词典索引入口（更细的拆分设想见 [API Drafts](API_DRAFTS.md)）。

SQLite repository 的 `readState()` / `listDictionaries()` 只返回词典 metadata 和 summary；前端启动流程始终将 `/api/state` 的 `dictionaries` 当作 metadata，再按需加载 active dictionary。每本词典都通过轻量 SQL 返回 `entryCount` 和 `rootCount`，不会在启动、词典切换或打开词典管理页时建立词根拓扑。

基础关系统计按来源记录是否存在严格分类：没有任何 `entry_sources` 行的词条计入 `rootCount`，至少有一行的词条计入 `derivedCount`，两类互斥。词根模式的分组按下文“词根拓扑语义”计算：只有未解析来源的词条和无外部祖先的循环成员也会各自成组，但不改变基础分类，因此 `/root-groups` 的分组总数不保证等于 `rootCount`。

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
  - `tags`：词条标签和释义标签的原始值与显示替换值（词性也是标签）；
  - `definitions`：释义文本；
  - `examples`：当前词条内嵌例句；后续例句升级为语料链接后，该字段应继续表示“与词条关联的例句文本”，来源可包含嵌入字段和链接语料；
  - `notes`：词条备注、释义备注和词条形态组备注；
  - `etymology`：词源描述和来源文本；
  - `morphology`：按当前形态表设置动态生成的形态形式，以及词条级形态 override。
- `fuzzyFields`：逗号分隔的字段级模糊匹配白名单；仅对 `fields` 中的字段生效。
- `part`：词性筛选；按去除边缘空白后的原始标签精确匹配有效标签，特殊值 `__conlexicon_no_part__` 表示有效标签中没有词性。
- `tags`：逗号分隔的原始标签列表；按去除边缘空白后的原始标签精确匹配有效标签。
- `tagMode`：`any`、`all` 或 `exact`，默认 `any`；`exact` 用于完整标签集合匹配。
- `sort`：`lemmaAsc`、`lemmaDesc`、`updatedAsc`、`updatedDesc`、`createdAsc`、`createdDesc`。
- `cursor`：不透明查询游标，前端不得解析。顺序分页使用响应的 `pageInfo.nextCursor`；随机窗口读取使用 `pageInfo.windowCursor`。
- `windowOffset`：可选的结果窗口起点。非零值必须与同一查询返回的有效 `windowCursor` 一起发送；省略时沿用 cursor 自身的位置。该参数用于纯滚动列表直接读取远端窗口，不是 UI 页码。
- `limit`：分页大小，必须为 1–200；超限返回 `invalid_entry_query_limit`。

前端普通列表以每窗 200 条读取，最多保留 5 个已加载窗口；未加载和已淘汰窗口使用等高占位，从而让原生滚动条始终代表完整结果集。请求失败时显示失败状态，不回退到前端完整词典快照。基准和诊断使用同一产品窗口，通过会话 `buildMs`、缓存统计和 cursor 窗口分别测量匹配构建与响应开销，不开放大页旁路。

前端以 `QueryPageCache` 缓存成功的窗口响应（key 含词典 `updatedAt` 与规范化查询，只缓存成功响应，迟到但仍属于当前词典版本的响应也写入缓存），成功写入后按词典清空；单条详情 `/entries/:entryId` 使用独立的小型缓存，保存响应直接更新其中的当前词条。查询首窗或词条详情请求进行中采用两段式 stale-while-revalidate：开始后 200 ms 内保持旧内容，但旧详情立即设为 `inert`，不可再通过鼠标、键盘或辅助技术操作；超过 200 ms 后详情显示遮罩，列表保留旧内容并轻微变淡，二者用同一套覆盖式“正在更新”提示。首次加载没有旧内容时直接显示加载状态；滚动补载后续窗口只使用窗口局部占位。请求失败直接进入错误状态，不重试、不回滚，也不把旧内容冒充为成功结果；成功提交新内容后立即清除更新状态。词条切换只更新选中态、详情、词汇网络状态和必要的滚动状态，不重建未变化的列表窗口。

编辑器选择状态不通过完整词典 snapshot 预检目标 ID。没有当前选择时，普通列表首窗的第一项可作为初始选择；搜索或筛选排除当前词条时仍保留既有详情。显式导航直接读取 `/entries/:entryId`，`entry_not_found` 时恢复导航前选择并提示。删除当前词条只从虚拟列表已加载顺序选择下一项或上一项，没有已加载候选时等待刷新后的普通首窗；删除未选中词条不改变选择。词汇网络内部导航只消费已加载节点 DTO，不为选择目标扫描完整词典。

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
      tags,            // 词条标签，与详情 DTO 的 tags 含义相同
      effectiveTags,   // 有效标签，见“有效标签的顺序”
      definitionPreviews: [
        { id, position, meaning, parts }  // parts：该释义自己的词性
      ],
      createdAt,
      updatedAt,
      parts            // effectiveTags 中的词性
    }
  ],
  searchSummary: {
    matchedEntryCount: 27,
    fields: [
      { field: "lemma", matching: "strict", entryCount: 12 },
      { field: "definitions", matching: "fuzzy", entryCount: 19 }
    ]
  },
  pageInfo: {
    nextCursor,
    windowCursor,
    hasMore,
    total
  }
}
```

带 `q` 的普通词条、词根组及 feature items/location 响应在顶层返回同一 `searchSummary`；无 `q` 时为 `null`。`fields` 只包含本次查询实际启用的字段，`matching` 固定为 `strict` 或 `fuzzy`，`entryCount` 按“该字段至少有一个独立值命中”的唯一词条数计算。同一词条在同一字段命中多个值仍只计一次，但可以同时计入多个字段，因此字段计数之和可以大于 `matchedEntryCount`。统计复用生成当前结果集合的同一轮 projection 匹配，不按字段追加查询，也不因打开前端字段面板重新请求。

普通列表和 feature result 的 `matchedEntryCount` 等于搜索及候选条件相交后的唯一词条总数。词根模式仍统计直接命中搜索的唯一词条，不统计可见词根组数，也不把“词根命中后随组展示但自身未命中”的衍生词计入；因此它可以与 `pageInfo.total` 不同。location 响应复用相同查询会话中的摘要，即使目标不在结果内也不重新计算。

#### 逐值检索与命中定位契约

搜索不把一个词条或同一字段的多个值拼成全文字符串。共享搜索模型先把词条展开为独立 value record：

```js
{
  field,           // lemma / pronunciation / tags / definitions / examples / notes / etymology / morphology
  value,           // 原始显示文本，不是规范化文本
  sourceType,      // entry / tag / definitionTag / definition / morphologyGroup / etymologySource / morphology
  sourceId,        // 有稳定 ID 时填写；词条标签为空字符串，释义标签为所属释义 ID
  sourcePosition,  // 该来源在所属词条中的零基位置；释义标签为它在所属释义内的位置
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

`searchHits` 只返回当前查询实际命中的独立 records；同一来源定位与 `valueType` 的同一值最多返回一次，但不同释义包含相同文本时仍分别返回。它用于选择命中摘要、显示释义序号及定位原始对象，不代替前端基于共享 normalizer 的原文范围映射。无 `q` 时省略该字段；严格、fuzzy 和形态命中都通过该字段返回。

`/root-groups` 带搜索时复用相同的静态/形态 projection 匹配 SQL，但只消费去重命中 ID，不执行普通词条列表所需的排序；命中集合随后映射到独立缓存的稳定词根拓扑。该路径不接受或物化一份来自拓扑的全词典候选 ID 数组。

未来例句迁移为语料链接后，`examples` record 仍以对应释义作为列表展示定位；语料单元 ID 的返回字段随阶段 C 的关系 API 一并确定，当前 record 形状不预留。

形态搜索不是简单读取持久化字段。词条使用 `morphologyMode: "auto" | "manual"`：`auto` 先按自动分配规则得出有序模板组，再按真实 `templateGroupId` 合并该词条的 overlay；`manual` 按词条形态组 position 使用显式模板组，空列表表示明确不使用形态。随后遍历组内全部子表，逐格读取以真实子表 ID 分层的 override；没有 override 时用词形、形态规则和形态函数动态生成默认形式。`templateGroupId` 不再接受 `"auto"` 或 `"none"` 伪值；旧 JSON 的转换只发生在导入迁移。

上述结果写入独立的 `entry_morphology_search_values` 派生 projection。它保存真实模板组、子表和单元格坐标以及原始/规范化值，不进入 JSON，也不替代形态主数据。词条 lemma、形态匹配标签、模式、显式组或 override 变化时局部重建；形态模板/函数变化或搜索规范化变化时全量重建。严格及 fuzzy 的形态单字段查询以及静态+形态混合查询均直接读取两张 projection，并把形态单元格映射为 `sourceType: "morphology"`、`sourceId: <templateTableId>`、`sourcePosition: <求值顺序>`、`valueType: "generated"`。每个 SQLite 连接注册确定性的 `conlexicon_fuzzy_match(normalized_value, normalized_query)`，使 fuzzy projection 查询复用共享 matcher。带结构筛选的词条搜索在同一 SQL 中将候选关系连接到两张 projection；无结构条件时直接扫描目标 projection。SQL 只返回最终命中 ID，不再读取完整 snapshot、动态生成形态、把所有候选 records 返回 Node.js，或在 JavaScript 中对候选集合与投射命中集合求交。

### 标签登记表

登记表是标签信息的唯一来源：是否为词性、显示名、颜色和顺序都存在这里。它分词性区和普通区，词性区永远排在前面；放进词性区的标签就是词性。

#### 不变量

- 词条标签和释义标签的每个值都已登记，由外键保证。运行期写入在写标签行之前把新值登记到普通区末尾，同一次写入里的多个新标签按输入顺序：词条标签在前，然后按释义顺序。新标签一律进普通区。
- 除了 `delete` 操作，任何操作都不删除登记行；不再被使用的标签留在表中，`entryCount` 为 0。
- 标签身份是去首尾空白后的原始字符串，逐字符比较，不做大小写折叠或 Unicode 规范化。
- 语料块、语料层、语料单元的标签不进入登记表。形态模板组的 `matchTags` 不写入登记表，也不计入使用数。

#### 读取

`GET /api/dictionaries/:id` 的响应带 `tagRegistry`，按排名排列（数组顺序即顺序，不暴露内部位置）：

```js
tagRegistry: [{ tag, partOfSpeech, displayLabel, color, displayAmbiguous }]
```

`displayLabel` 为空表示显示原始值；与标签自身相同的显示名按空保存。`color` 是颜色名，空表示默认样式，当前合法值只有 `red`。`displayAmbiguous` 表示另一行显示相同的文本（显示名或原始值），在整张登记表范围内计算，含未使用的行。

`GET /api/dictionaries/:id/tag-registry` 返回 `{ id, generation, tags }`，行与上述字段相同，另加 `entryCount`：有效标签中含该标签的唯一词条数，同一标签同时挂在词条和释义上、或挂在多条释义上时，该词条只计一次。标签配置随词典状态给出；使用数随每次词条保存变化，按查询会话 generation 缓存。

词条列表控制栏中的具体词性选项是词性区中 `entryCount > 0` 的行，以该接口的成功响应为唯一数据源。加载中、请求失败或后端不可用时，前端不得扫描完整活动词典生成本地词性集合；若用户已有当前词性筛选，可以暂时保留这一个运行期选择，待成功响应返回后再按最新集合校验。

#### 修改

`POST /api/dictionaries/:id/tag-registry/changes`，请求体是单个操作，返回 `{ id, updatedAt, tagRegistry }`，`tagRegistry` 的行与读取端点相同，含 `entryCount`：

| 操作 | 请求体 | 说明 |
| --- | --- | --- |
| 添加 | `{ op: "add", tag, partOfSpeech }` | 加到该区末尾 |
| 移动 | `{ op: "move", tag, partOfSpeech, before }` | `before` 为目标区的另一个标签，`null` 表示该区末尾；跨区移动即改变是否为词性 |
| 修改 | `{ op: "update", tag, displayLabel?, color? }` | 只改给出的字段，至少给出一个 |
| 删除 | `{ op: "delete", tag }` | 只允许删除没有词条使用的标签 |

| 错误码 | 状态 | 含义 |
| --- | --- | --- |
| `invalid_tag_registry_change` | 400 | 请求体格式无效，包括不合法的颜色名 |
| `tag_registry_invalid_tag` | 400 | 添加的标签为空或含半角逗号、全角逗号、顿号 |
| `tag_registry_tag_exists` | 409 | 添加的标签已登记 |
| `tag_registry_tag_not_found` | 404 | 标签未登记 |
| `tag_registry_anchor_not_found` | 404 | `before` 不在目标区 |
| `tag_registry_tag_in_use` | 409 | 删除在用标签，`details.entryCount` 为使用词条数 |

每次修改都推进词典 `updatedAt`，不改写任何词条。添加、删除、移动和修改显示名使查询会话失效；只改颜色不失效，因为颜色只影响前端显示。修改显示名时，同一事务内更新用到该标签的词条的搜索记录，不重建整个投影。

#### 其他端点

词条写入类端点（`POST` / `PUT /entries`、`PATCH /entries`、`POST /entries/create-source`）在本次写入登记了新标签时，响应额外带 `tagRegistry`（不含 `entryCount`），前端整体替换状态中的登记表；没有新标签时不带。

### 释义标签与有效标签

释义可以带标签。词条标签描述这个词，释义标签描述那条释义；释义不继承词条标签。需要"整个词"的答案时，取词条的**有效标签**：词条标签与全部释义标签的并集。词性放在哪一层是使用约定：要么只挂在词条上，要么挂在每条释义上（多词性词条原则上放在各条释义上）。程序不强制、不迁移，但质量检查报告不符合约定的释义（见质量规则的"标签层级"）。

- **存储与写入**：详情 DTO 的 `definitions[]` 带 `tags: string[]`；`POST` / `PUT /entries` 与 JSON 导入在边界把它按标签列表规范化（去首尾空白、去空、去重并保持顺序，非数组按空列表），缺省为 `[]`。一条释义可以只有标签，释义文字（`meaning`）、例句和备注都为空也合法，导入时不会被当作空释义丢弃。`PATCH /entries` 不接受释义标签。
- **DTO**：详情 DTO 与摘要 DTO 的 `tags` 都只表示词条标签。摘要 DTO 另带 `effectiveTags`，`parts` 从它计算；摘要的 `definitionPreviews[]` 只多带 `parts`（该释义自己的标签中的词性），供列表与悬浮卡片在每条释义前显示它自己的词性，不带其他标签。
- **规范序**：标签在词条和释义中是集合，不存储顺序。响应里的标签数组（详情、摘要、保存响应、`PATCH` 响应）一律按标签值的二进制序，`effectiveTags` 是词条标签后接各释义新增的标签，保存响应与之后读取的结果相同。规范序没有业务含义，不用于显示。
- **显示顺序**：标签的先后只由登记表决定：词性区在前，区内按登记顺序。比较函数是共享模型的 `tagRank`，前端在渲染时用 `arrangeTags` 排列所有标签，已保存词条和草稿共用；服务端只在需要最终顺序的地方用它，即 JSON 导出和分析页的组合。这样登记表移动后，前端已缓存的列表页不会显示过期的顺序。尚未登记的标签（只在未保存的草稿中出现）排在所有已登记标签之后，保持输入顺序。
- **使用范围**：EntryFilter 的全部标签条件、`/tag-registry` 的使用数、分析页的词性与标签统计、`missing_tags` 质量规则、`allowEmptyTags` 保存校验和自动形态匹配都按有效标签。`near_duplicate_tags` 与 `tag_too_long` 同时检查两层标签；`duplicate_definition_tag`、`mixed_part_of_speech_levels` 与 `missing_definition_part_of_speech` 检查两层之间的关系。标签显示替换与红色强调对两层同样生效。
- **自动形态**：模板组匹配把有效标签作为唯一输入，规则不变（任一标签与组的 `matchTags` 相同即匹配，只取最前的组）。这是在形态分配重做（见 [Morphology Assignment Plan](MORPHOLOGY_ASSIGNMENT_PLAN.md) 的 D6）决定匹配上下文之前的默认行为；释义都没有标签时，结果与只用词条标签相同。
- **搜索**：`tags` 字段同时投影释义标签，命中的 `sourceType` 为 `definitionTag`，`sourceId` 为释义 ID，`sourcePosition` 为该标签在释义内的位置。

### 词源与词根关系

#### 来源编辑与操作契约

##### 编辑布局与顺序

- 完整编辑与词源局部编辑使用同一套规则。已绑定来源卡片放在纯文本输入框上方，不放进输入框；卡片标签不可逐字修改，只能整项移除。
- 仅已绑定卡片互相拖拽排序：除删除按钮外，卡片任何区域均可起拖，不设专用抓手。落点使用卡片间隙或左右边缘的插入线，不高亮整张目标卡片。删除按钮平时显示灰色 ×，悬停/键盘聚焦时显示淡红底与红色 ×，不使用常驻方框，也不触发拖动。
- 聚焦卡片后按 Alt+方向键排序，作为不依赖拖拽的操作方式。纯文本始终留在普通输入框内编辑，不生成卡片、不提供拖拽，不与卡片混排。
- 纯文本沿用半角逗号、全角逗号、顿号分项，去除项首尾空白并忽略空项；编辑中不因一次输入或失焦而把文本搬出输入框。
- 统一线性顺序为“全部已绑定来源（卡片顺序）＋全部纯文本来源（输入顺序）”。保存、重开编辑、浏览展示、关系响应和导出采用同一顺序；浏览态先显示可跳转的引用，再显示未绑定文本，未绑定文本可以保留明确的“创建来源”入口。
- 沿用 `{ entryId, text }[]` 和已有位置字段，不新增第二套持久化列表。对既有交错数组作稳定分组，各组内部相对顺序不变；读取/展示不得暗中写库，写入时再规范化顺序。分组本身不应制造虚假的未保存更改。
- 删除引用目标后仍保留来源文本，作为未绑定项进入纯文本组；其他项按上述稳定分组规则保持相对顺序。改名不改变引用身份或卡片顺序。

##### 输入、补全与唯一性

补全由后端候选端点与前端补全 controller 实现（单行候选、旧列表立即失效、输入法处理及下述键盘行为）；来源卡片同样改用词条 summary：已存来源取自 `entry-relations` 的 `matchedEntry`，新选来源取自候选项；同一输入框内有两张以上同形卡片时显示“词性 首条释义”区分信息（首条释义相同则改用第一条不同的释义，再无差异则用发音），悬停或聚焦卡片显示与词汇网络相同的词条摘要浮层（列出全部释义），界面不展示 ID，卡片标签不再读取前端快照。浏览态来源链接沿用同一浮层与同形区分规则；浏览态和完整编辑态的衍生词卡片也显示该浮层，完整编辑态卡片可聚焦但不跳转。

`POST /api/dictionaries/:id/source-candidates/query` 只读，不创建词条、不保存草稿、不更新词典时间：

- `q`（必填字符串）：光标所在分隔项的文本，去首尾空白后按词典 `settings.search.normalization` 规范化；为空时返回 `{ items: [], total: 0, limit }`，不枚举词典。
- `ownerEntryId`（可选字符串）：已存词条自身，候选中排除；不存在时返回 404 `entry_not_found`。新建草稿传空串或省略。
- `excludeEntryIds`（可选字符串数组）：当前草稿已选卡片的目标 ID，按精确 ID 排除；不存在的 ID 忽略。
- `limit`（可选整数，1–50，默认 50）。超出上限的匹配只计入 `total`，由前端提示继续输入，不提供分页。
- 匹配只读取 `entry_search_values` 中 `field = 'lemma'` 的记录：`etymologyAutocomplete.fuzzy` 开启时与 `/entries` 的 lemma fuzzy 查询使用同一 `conlexicon_fuzzy_match`，关闭时与 lemma 严格查询同为“包含”匹配。命中集合与只启用 lemma 字段的 `/entries` 相同。
- 排序由共享 `rankLemmaCandidates()` 完成：完全相等、前缀（长度差小者优先）、包含（位置靠前、长度差小者优先）、其余 fuzzy（分数降序），同层按原始词形与精确 ID 稳定排序。`items` 顺序即排序结果。
- `items` 为词条摘要 DTO（与 `/entries` 列表项及 `entry-relations` 的 `matchedEntry` 同构），不附加字段；`total` 为排除后的全部匹配数，同形不同 ID 分别计数。
- 请求体不是对象、字段类型错误或 `limit` 越界返回 400 `invalid_source_candidate_query`；词典不存在返回 404 `dictionary_not_found`；请求体超限沿用 413 `request_body_too_large`。
- 不使用 cursor、翻页或查询会话缓存：候选随每次输入作废，固定上限加 `total` 提示即可。复用的是 `/entries` 下层的 projection、规范化和 matcher，不在列表端点上叠加补全特例；补全 fuzzy 开关独立于列表的逐字段 fuzzy 设置。

前端补全 controller（每个来源输入框一个，替代共享的全局候选下标）：

- 输入防抖 100 ms（30k 词条实测单次查询约 50–86 ms，连续输入不会在服务端排队）；输入期间保留上一批候选原位显示，请求超过 200 ms 才显示加载状态。加载中、失败可重试与无匹配是不同状态，失败不显示为无匹配，也不回退扫描本地数据。
- 新请求取消旧请求；响应到达时核对请求序号、词典、草稿身份和当前文本项（以文本项位置区分相同文本的多次出现），过期响应丢弃。弹层关闭、词条切换、完整/局部编辑销毁时取消请求并释放 controller。
- 候选每项一行：词形、弱化的词性和截断的首条释义，不显示 ID、发音或标签。当前可见候选中有词形与首条释义均相同的项时，这些项改为显示各自第一条不同的释义，仍无差异时显示发音；判断在前端基于候选 summary 完成，不发额外请求。列表限高可滚动，`total` 超过已返回项时底部提示“共 N 项，继续输入以缩小范围”。
- 输入框采用 combobox／listbox 语义，维护 `aria-expanded`、`aria-controls`、`aria-activedescendant`；当前项以 `aria-selected` 作为唯一高亮，不另设 `:hover` 高亮，只有真实的指针移动（坐标确有变化、非触屏）才改变当前项，过期列表不响应悬停。点击、触屏与键盘确认走同一确认函数，确认前再次核对草稿、文本项与已选集合。

- 点击来源标题、卡片之间或输入区域空白，只能聚焦输入，不得删除、重排或转换来源。删除仅由明确的删除操作触发；不得把删除按钮隐式关联为整个区域的 label 控件。
- 从补全中选定词条时，只消费光标所在的对应文本项，将该目标引用追加到卡片组末尾，其他文本项及已有卡片顺序不变。只输入词形或失焦不等于确认绑定。
- 候选列表打开时不预选任何项，且只有一个当前项：真实的指针移动与方向键更新同一当前项（列表在静止指针下打开不预选，方向键从悬停项继续），它也是唯一的高亮。方向键到两端停止不循环；Enter 只确认明确选中且所在列表未过期的候选，没有选中项时保留纯文本，且在来源输入框内始终不提交整个表单；Tab 只移动焦点，不绑定候选；Esc 关闭列表但保留文本和词条草稿。输入内容、光标所在文本项或已选卡片变化后，旧列表立即失效，新结果到达前不能确认其中的项；输入法组字期间不查询、不拦截确认键。
- 同一词条的来源列表内，同一非空目标 `entryId` 最多出现一次；不同 ID 的同形词条可以同时存在。候选应排除或禁用已选目标，添加操作和保存层均须再次校验，不能只依赖界面过滤。
- 重复目标的运行期保存返回 HTTP 400 `duplicate_source_target` 并保持原数据。JSON 导入在旧字符串转换后按目标 ID 保留首次出现的位置，在 `report.repairs` 记录移除的重复引用；结构化 JSON 同样适用。不同 ID 的同形词条与纯文本不合并。此前已存储的重复引用允许读取、展示并手动移除，但在重复消除前不能重新保存；读取不静默写库清理。
- 不对纯文本去重，也不把相同文本与引用视为同一身份；未绑定文本不能凭词形自动转成引用。
- 补全按词形匹配，候选以词形、可用的发音、词性和简短释义帮助消歧，界面不展示 ID；选择始终绑定精确 ID。候选不再固定截断为六项：每次最多返回 50 项，超出时提示继续输入以缩小范围，不提供分页。候选不按发音匹配。

##### 创建来源与新建衍生词

- 从 A 的某一纯文本来源发起“创建来源 B”，须保留发起词典、A 的身份及该来源项的定位/冲突检查信息，不能只传递词形，也不能按相同文本批量替换。
- 成功时创建 B，并将 A 的指定纯文本项转换为 B 的 ID 引用，追加到 A 的卡片组末尾；A 的其他来源保持不变。创建与绑定应作为一个原子操作，不能向用户报告成功却只完成创建。
- 取消、校验失败或保存失败不改变原来源；原来源被修改、删除或发起词条不再存在时，明确报告冲突，不按过期位置覆盖其他项。端点见下方“创建并绑定来源”。
- 普通新建同名词条不自动关联其他纯文本来源；上述回填只来自显式的“创建此来源”意图。
- 从 A 新建衍生词 B，则在 B 草稿中直接预填 A 的 ID 引用卡片。取消草稿不写入；保存时校验目标与唯一性。A 的衍生词由反向关系查询得到，不另存一份反向列表。
- 新建、跳转、文本修改、添加/删除引用和排序均遵守已有完整/局部编辑的保存、放弃、取消规则；取消导航必须保留草稿与顺序。

#### 数据与查询接口

##### 创建并绑定来源

`POST /api/dictionaries/:id/entries/create-source`

```js
{
  entry: { /* 普通新建词条字段，不允许客户端指定 id */ },
  sourceBinding: {
    ownerEntryId,
    sourcePosition, // 点击时原 sources 数组中的零基位置
    expectedUpdatedAt,
    expectedSources: [{ entryId, text }] // 点击时的完整有序来源列表
  }
}
```

服务端生成新词条 ID，在同一事务内创建词条、核验原词条的更新时间及来源列表，再替换指定未绑定项。仅替换该次出现；即使相同纯文本出现多次也不批量替换。新引用追加在已有引用后，其余纯文本保持相对顺序并置于引用之后；新词条的最终 lemma（可在草稿中修改）作为引用 text。

成功返回 201 `{ entry, ownerEntry, summary }`，前端同时刷新两条详情/摘要并使关系和查询缓存失效。格式错误返回 400 `invalid_source_binding`；原词条不存在、版本/来源列表不符、位置不存在或该项已绑定返回 409 `source_binding_conflict`；普通词条校验错误沿用现有错误码。失败时整次事务回滚，不遗留新词条或半完成绑定。重复提交过期上下文同样返回冲突，不再创建第二条。此端点不是普通同名词条自动关联机制。

创建意图只保存在当前前端草稿中，取消编辑或放弃草稿会丢弃它；保存失败保留草稿供用户处理。切换为普通新建前须先处理未保存编辑，不提供绕过该流程的清空入口。未保存导航继续沿用当前设置。新建衍生词仍使用普通 `POST /entries`，预填来源 ID；无需额外回写来源词条或持久化反向列表。

##### 来源数据

词条详情、保存和 JSON 导出的 `etymology.sources` 统一为有序 `{ entryId: string, text: string }[]`。非空 `entryId` 是显式引用，空 ID 表示未绑定文本；两者不能同时为空。运行期保存不接受旧字符串数组（400 `invalid_source_reference`），目标 ID 必须存在（400 `invalid_source_target`，整次写入回滚）。禁止目标 ID 等于词条自身 ID，保存及 JSON 导入均返回 400 `self_source_reference`，不写入；旧 JSON 转换后形成自引用也拒绝导入，不静默丢弃来源。不同词条之间的循环仍允许保存，由质量检查报告。

完整/局部编辑候选排除自身，添加操作再次校验；同形不同 ID 的词条和与自身词形相同的纯文本不属于自引用。此前已存储的自引用仍可读取并手动移除，读取不自动改写数据库。

单个词条不能重复引用同一非空目标 ID；保存违反该约束返回 400 `duplicate_source_target`，响应遵循 `{ error: { code, message } }`，不部分写入。前端按错误码显示中英文提示。唯一性比较使用修剪首尾空白后的精确 ID，不按词形或大小写折叠合并。

绑定来源的 `text` 由 repository 按目标当前词形规范化；目标改名同步刷新引用文本与搜索投射，关系仍按 ID 保持。删除目标通过外键置空保留最后文本，并更新引用方搜索投射。新建同名词条不自动重新绑定。来源数量包含绑定与未绑定项，关系边仅包含绑定项。旧 JSON 字符串仅在 conversion/legacy migration 导入边界转换：精确 ID 优先，否则仅唯一规范化词形命中才绑定，歧义或缺失保留文本并返回警告。结构化来源不再按文本猜测绑定。

```text
GET /api/dictionaries/:id/entry-relations/:entryId
```

返回当前词条的来源匹配、衍生词和同根组：

```js
{
  entryId,
  sources: [
    { sourceText, targetEntryId, matchedEntryId, matchedLemma, matchedEntry }
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

`targetEntryId` 是来源保存的目标 ID（未绑定时为空字符串）；`matchedEntry` 是该 ID 对应的 summary DTO，未绑定时为 `null`。词条详情和词汇网络直接消费 DTO，不回到完整活动词典扫描；同名词条不参与猜测匹配，`matchedEntryId` 只来自精确目标 ID。

词汇网络详情视图和词根模式均已接入后端关系/词根读取端点。词根模式和词汇网络同根组复用 SQLite repository 的稳定词根拓扑；词典摘要的严格 `rootCount` 独立按无来源词条轻量计算。来源匹配与直接衍生词仍由相同 repository 关系边界返回，不再由前端扫描完整活动词典。

词根拓扑语义（由 `lib/etymology-graph-model.js` 计算）：

- 以“词条 → 已解析来源”为边建图；指向不存在词条的来源和纯文本来源不构成边，同一目标只算一次。
- 没有外部祖先的强连通分量是源分量，其所有成员都是词根：没有已解析来源的词条是自身的词根；无外部祖先的循环中每个成员各自为根，并互为衍生词。
- 其他词条属于其全部祖先源分量的词根组；共享祖先（菱形）不会使中间词条成为词根，有外部词根的循环成员也不单独成组。
- 词根不出现在自己组的衍生词中，`derivedCount` 不计词根自身。
- 分组只取决于词条集合和来源目标，与来源顺序、lemma 和排序无关；排序只影响组和组内衍生词的顺序。

无外部祖先的循环选择“每个成员各自为根”：它对称，不需要任意挑选代表，与多来源词条出现在多个组中的语义一致，循环后代因此会在多个组中重复出现。按 ID 选唯一代表对用户没有语言学意义，按 lemma 选代表会让改名触发拓扑重建；让循环成员不出现在词根模式中则会使词条从列表消失。循环本身是数据错误，由质量检查的 `source_cycle` 报告。

`etymology-graph-model` 是无 I/O 的共享模块（UMD）：`stronglyConnectedComponents` 用迭代版 Tarjan，不做递归，长来源链不会栈溢出；`buildEtymologyGraph` 按分量拓扑序传播词根集合。消费方为 repository 的词根拓扑（`rootTopologyFromDatabase`）、`scripts/root-groups-reference.js` 的 `rootModeGroups`（repository contract 中 `/root-groups` 的期望值，应用本身不加载）和质量模型的来源循环规则。模块不产出质量 code、见证路径或本地化文本，也不反向依赖质量模型。算法正确性由 `scripts/check-etymology-graph.js` 的固定用例、顺序无关、暴力可达性对照和 5 万节点深链覆盖。

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
  searchSummary,
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

父级词根组 `limit` 必须为 1–100；超限返回 `invalid_root_group_query_limit`。普通查询与定位端点使用相同上限。

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

性能与缓存边界：

- repository 以独立 relation generation 缓存与搜索条件无关的 `rootId -> derivedIds` 稳定拓扑，并同时维护 `entryId -> rootIds`、`rootId -> group` 反向索引；词根查询会话进一步维护 `rootId -> resultIndex`。`/root-groups`、组内子项和 `/entry-relations/:entryId` 复用该拓扑，词典摘要计数不依赖它。拓扑组和查询结果位置的定位均为 O(1)，关系响应仍需按实际返回条目数读取并构建 DTO。词条增删、来源目标变化、整库替换和词典删除会使其失效；lemma 改名及其他普通词条保存/patch 仅同步轻量排序记录，其他模块保存不触碰拓扑。查询 session/cursor 的 cache generation 仍按查询一致性要求独立失效。
- `/root-groups` 搜索直接从 `entry_search_values` / `entry_morphology_search_values` 获取命中 ID，再筛选稳定拓扑，不导出完整词典 snapshot。`entry-relations/:entryId` 复用同一拓扑的反向索引。质量检查的来源循环不读取该缓存，而是在自己的最小事实读取上调用同一 `etymology-graph-model`。
- SQLite 后端用 `entry_sources(target_entry_id)` 索引支持词根分组和词汇网络查询；`source_text` 保留显示/搜索文本，旧 JSON conversion 与 migration 不参与运行期查询。
- 前端词根模式正常路径以 `/root-groups` 为准；请求失败时显示失败状态，不回退前端本地完整分组。父级未加载窗口以 `pageInfo.total` 和 `windowMetrics` 建立占位，因此滚动条可在折叠、搜索自动展开及全局展开状态下代表完整词根组集合。全局展开采用状态意图：父级页进入可见范围后才加载各组衍生词；单组收起作为例外保留到重新展开或“全部收起/全部展开”重置。组内衍生词不建立第二层分页窗口。

### 分析、功能结果与质量查询

分层边界：

- 稳定的标签、词性、字段存在性、来源有无与数量、日期和正写法条件通过 EntryFilter/EntrySearch 进入词条窗口；必须运行 IPA、形态或质量规则才能得到的结果属于 feature result 或质量 source。两者都由词条列表窗口消费，但 repository 不为普通 filter 反向调用分析或质量模块。各入口的归属见下文 [Filter descriptor](#filter-descriptor)。
- 词根家族、基础关系统计和窗口读取由 SQLite repository 提供；不重新引入 repository 之外的完整词典扫描查询上下文作为兜底，也不恢复前端 materialized ID 列表。旧 JSON conversion 与 migration 不参与运行期查询。
- 词典标题和词典管理的 `rootCount` 按“没有来源记录”计算，不依赖来源解析或拓扑。
- 未解析来源和来源循环属于质量检查，不归入未来的诊断修复模块。

#### Analysis widget query

数据分析总览通过 widget 声明请求所需切片；后端 planner 合并 widget 依赖，避免多个卡片重复统计。当前端点为：

`POST /api/dictionaries/:id/analysis/query`

支持 `entryCount`、`lexiconSummary`、`coverageBreakdown`、`partDistribution`、`partSetDistribution`、`tagFrequency`、`tagSetDistribution`、`orthographyDistribution`、`activityPreview`、`activityDistribution` 和 `rootFamilyRanking`。这些 widgets 在一次同步 HTTP 请求内完成；前端异步加载并显示独立的 loading/error/retry 状态。数据分析页未打开时不发起请求。

请求：

```js
{
  widgets: [
    { id: "lexicon", type: "lexiconSummary" },
    { id: "coverage", type: "coverageBreakdown" },
    { id: "parts", type: "partDistribution", limit: 7 },
    { id: "activity", type: "activityPreview", limit: 5 },
    { id: "families", type: "rootFamilyRanking" }
  ],
  options: {
    includeActions: true
  }
}
```

- `widgets` 必须为非空数组，最多 16 项；`id` 在一次请求中必须唯一，只允许字母、数字、点、下划线和连字符，最长 80 字符。
- `partDistribution`、`partSetDistribution`、`tagFrequency` 和 `tagSetDistribution` 的行只带原始标签和计数（`part`／`parts`／`tag`／`tags`、`entryCount`、`action`），显示名、歧义和是否为词性由前端查[标签登记表](#标签登记表)。组合行里的标签按登记表排名排列。`partDistribution` 列出词性区全部标签，使用数为 0 的行不带 `action`，`partTypeCount` 只计使用数大于 0 的词性。
- 这四个 widget 接受可选 `limit`，范围为 1–50；省略时返回完整排行。`activityPreview` 的 `limit` 默认为 6，范围同样为 1–50。`activityDistribution` 返回完整日期桶且不接受 `limit`；包括 `rootFamilyRanking` 在内的其他 widget 同样不接受 `limit`。
- `options.includeActions` 默认为 `true`。设为 `false` 时省略 action descriptor。

响应返回结构化 widget data，不返回 HTML：

```js
{
  dictionaryId: "dict-1",
  generation: 4,
  cacheKey: "...",
  widgets: {
    "lexicon": {
      type: "lexiconSummary",
      entryCount: 10000,
      rootEntryCount: 6400,
      derivedEntryCount: 3600,
      multiSourceEntryCount: 180,
      isolatedRootEntryCount: 900,
      action: { type: "view", target: "editor" },
      rootAction: {
        type: "entryFilter",
        resultCount: 6400,
        filter: { presence: [{ field: "source", present: false }] }
      },
      derivedAction: {
        type: "entryFilter",
        resultCount: 3600,
        filter: { presence: [{ field: "source", present: true }] }
      },
      multiSourceAction: {
        type: "entryFilter",
        resultCount: 180,
        filter: { sourceCount: { min: 2 } }
      },
      isolatedRootAction: {
        type: "entryFilter",
        resultCount: 900,
        filter: { presence: [{ field: "source", present: false }, { field: "derivedEntries", present: false }] }
      }
    },
    "coverage": {
      type: "coverageBreakdown",
      entryTotal: 10000,
      rows: [
        {
          field: "ipa",
          coveredEntryCount: 9400,
          missingEntryCount: 600,
          ratio: 0.94,
          action: {
            type: "entryFilter",
            resultCount: 9400,
            filter: { presence: [{ field: "ipa", present: true }] }
          },
          missingAction: {
            type: "entryFilter",
            resultCount: 600,
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

| Widget | 任务 |
| --- | --- |
| `entryCount` | `entryStats` |
| `lexiconSummary` | `entryStats` |
| `coverageBreakdown` | `entryStats` |
| `partDistribution` | `partStats` |
| `partSetDistribution` | `partSetStats` |
| `tagFrequency` | `tagStats` |
| `tagSetDistribution` | `tagSetStats` |
| `orthographyDistribution` | `orthographyStats` |
| `activityPreview` | `activityStats` |
| `activityDistribution` | `activityStats` |
| `rootFamilyRanking` | `rootTopology` |

同一任务在一次请求中只执行一次；只有 `activityPreview` 时使用请求中的最大 limit 读取日期桶，再分别裁剪；请求包含 `activityDistribution` 时读取完整日期桶，并继续按各自 limit 裁剪预览 widget。`lexiconSummary.rootEntryCount` 严格表示没有任何来源记录的词条数，`derivedEntryCount` 表示至少有一条来源记录的词条数；`isolatedRootEntryCount` 是词根中没有任何词条以已绑定来源引用它的部分（孤立词根），对应的 `isolatedRootAction` 筛选为 `presence: [{ field: "source", present: false }, { field: "derivedEntries", present: false }]`。三者都按来源记录严格计算，不建立词根拓扑：只有纯文本来源的词条算衍生词，既不是词根也不是孤立词根（词根模式的拓扑把它当作词根）。`partDistribution.rows[].entryCount`、`tagFrequency.rows[].entryCount`、`tagSetDistribution.rows[].entryCount`、`orthographyDistribution` 各分布行和两类活动 widget 的 `created/updated[].entryCount` 均为唯一词条数。词性、其他标签和标签集合行同时返回来自活跃标签身份快照的 `displayLabel` 与 `displayAmbiguous`，不同 widget 不得按自身截断后的局部行重新推断显示碰撞。所有词性与标签统计都按[有效标签](#释义标签与有效标签)计算，标签挂在词条上还是释义上，结果相同。`partDistribution` 另返回 `partTypeCount`、`noPartOfSpeechCount`、`multiPartEntryCount`（词性集合至少有两个词性的词条数，没有配置词性时为 0）和对应的 `noPartAction`、`multiPartAction`（`partCount.min: 2`）；多词性词条会在多个词性行中各计一次，`multiPartEntryCount` 解释行计数之和为何大于词条数。`partSetDistribution` 只统计至少两个词性的词性集合（单个词性的分布由 `partDistribution` 给出），返回 `partSetCount`、与 `partDistribution` 相同的 `multiPartEntryCount` 和 `rows: [{ parts: [{ value, displayLabel, displayAmbiguous }], entryCount, action? }]`；行内词性按 `tagSortOrder` 排序，行按词条数降序、同数时按以 ` + ` 连接的显示名排序；行 action 使用 `{ partSet }` 筛选，因此带非词性标签的词条也会计入，但带额外词性的不会。`partSetDistribution` 当前只由"词汇 > 标签"页请求。`tagFrequency` 从共享标签身份快照排除当前 `partOfSpeechTags` 中的所有标签，并返回 `tagTypeCount` 及结构化标签筛选 action。`tagSetDistribution` 以无序的完整原始标签集合为身份，返回非空集合的 `tagSetCount`、`taggedEntryCount`、`untaggedEntryCount`、`multiTagEntryCount` 和结构化 `tags`；`taggedAction`、`untaggedAction`、`multiTagAction` 分别使用 `presence.tag: true`、`presence.tag: false`、`tagCount.min: 2` 进入普通词条查询。无标签词条不作为空集合混入排行，集合种类没有词条结果 action。显示替换和显示顺序不改变集合身份，每个非空集合行的 action 使用 `tags.mode: "exact"`，因此单标签集合表示“仅有该标签”，多标签集合也不会把带额外标签的超集纳入结果。`orthographyDistribution` 从最小 `id + lemma` 输入返回 `lemmaEntryCount`、`wordLengths`、`initials`、`characters` 和 `bigrams`；字符与双字符行同时返回 `occurrenceCount` 和 `entryCount`，每行 action 使用相同共享模型生成的单一 `orthography` 结构筛选。所有 `entryFilter` action 使用 `resultCount` 表示目标结果词条数。`coverageBreakdown.rows[].field` 支持 `definition`、`example`、`entryNote`、`ipa`；每行使用 `coveredEntryCount`、`missingEntryCount`，释义和例句行另带项目单位的 `itemCount`。词性分布 action 使用 `{ part }` descriptor，无词性行使用保留值 `__conlexicon_no_part__`。

`rootFamilyRanking` 按衍生词数量降序、词根词形升序返回全部非空词根家族，同时返回家族总数 `familyCount`。每行固定为 `{ rootId, lemma, derivedEntryCount, action? }`，其中 action 定位词根词条；不会返回家族成员或 `derivedIds`。该任务直接消费与 `/root-groups`、词汇网络共享的稳定 `RootTopologyCache`，同一词典的拓扑已存在时不重新解析来源关系；多来源词条可以分别计入其所属家族，因此不能累加排行得到全局衍生词数量。

当前总览固定消费四个 widget，分别渲染词汇规模、资料覆盖、词性分布和编辑活动；编辑活动使用 `activityPreview`。进入“词汇 > 标签”后同一次请求完整的 `partDistribution`、`tagFrequency` 与 `tagSetDistribution`；标签集合不再由前端扫描完整词典。集合卡片首批渲染 100 行，继续展开只消费已经返回的 widget rows，不追加请求。进入“编辑进度”详情后另行请求 `activityDistribution`，进入“词根家族”详情后另行请求 `rootFamilyRanking`。资料覆盖只表达释义、例句、IPA 与备注；来源存在性由 `lexiconSummary` 的词根/衍生词构成和对应筛选表达，不在 `coverageBreakdown` 中重复返回。词根家族不属于首屏轻量总览。总览“词汇构成”卡片在词根下显示孤立词根数，点击进入对应筛选。

请求验证失败使用 `invalid_analysis_query_payload`、`invalid_analysis_widgets`、`invalid_analysis_widget`、`invalid_analysis_widget_id`、`unsupported_analysis_widget`、`invalid_analysis_widget_limit` 或 `duplicate_analysis_widget_id`。

#### Feature result query

IPA 自动比较（`ipaAutoCompare`）、IPA 分布（`ipaDistribution`）和形态分析（`morphologyAnalysis`）三个 source 共用以下端点，由 `AnalysisFeatureService`（`lib/analysis-feature-service.js`）实现，分析页与高级筛选都消费它：

```text
POST /api/dictionaries/:id/analysis/features/query
POST /api/dictionaries/:id/analysis/features/location
```

请求默认使用 `responseMode: "items"`，并分成可重建的 `source`、可变的 `view` 和 `page`。当前窗口查询规范形状为：

```js
{
  source: { type: "ipaAutoCompare", version: 1, options: {} },
  responseMode: "items",
  view: {
    category: "match" | "looseMismatch" | "strictMismatch",
    search: {
      text: "",
      fields: ["lemma", "pronunciation"],
      fuzzyFields: []
    },
    sort: "lemmaAsc"
  },
  page: {
    limit: 200,
    cursor: "",
    windowOffset: null
  }
}
```

只读取整个 result source 摘要时使用：

```js
{
  source: { type: "ipaAutoCompare", version: 1, options: {} },
  responseMode: "summary"
}
```

summary 模式不接受 `view` 或 `page`，其统计不受 category、搜索、排序或窗口影响。服务端建立或复用基础会话后直接返回 `summary`，不建立有序结果视图、不读取 EntrySummary，也不生成 `items`、`pageInfo` 或 cursor。IPA 自动检查页以及 IPA 分布/音位分析页首次加载使用该模式；分布与音位子页共享同一份 `ipaDistribution` summary。

`ipaAutoCompare` summary 使用 `inputEntryCount` 表示参与比较的词条总数；`outcomes` 和 `views` 的每行固定为 `{ key, entryCount }`。outcome 互斥，view 可以组合多个 outcome，因此 view 的词条数由其包含的 outcome 相加得到。

`source` 绑定功能类型、契约版本和算法 options；items 模式的 `view` 选择 category、EntrySearch 与 sort，`page` 使用普通列表相同的窗口语义和 1–200 硬上限。服务端按词典 generation、source、算法版本和 IPA 设置摘要复用内部会话。搜索复用词典的运行期规范化配置和现有 SQLite search projection；只回读当前页 EntrySummary 与 search hits。

IPA 分布使用以下 source 和 view：

```js
{
  source: { type: "ipaDistribution", version: 1, options: {} },
  responseMode: "items",
  view: {
    category: "unit" | "initial" | "final" | "syllableCount",
    value: "t͡s", // syllableCount 使用规范化后的正整数字符串
    search: {
      text: "",
      fields: ["lemma", "pronunciation"],
      fuzzyFields: []
    },
    sort: "lemmaAsc"
  },
  page: { limit: 200, cursor: "", windowOffset: null }
}
```

summary 模式同样只传 `source` 与 `responseMode: "summary"`。`summary.distributions` 一次返回 `units`、`initials`、`finals` 和 `syllableCounts` 全部桶，每行形如 `{ value, occurrenceCount, entryCount }`。音素单元的 `occurrenceCount` 是总出现次数，`entryCount` 是至少包含一次该单元的唯一词条数；其余三类每个词条只贡献一次，因此两者相同。summary 另含全部词条数 `dictionaryEntryCount`、实际参与 IPA 分布的非空 IPA 词条数 `ipaEntryCount`、`unitOccurrenceCount`、`syllableEntryCount`、`syllableOccurrenceCount` 和按两位小数舍入的数值型 `averageSyllablesPerIpaEntry`。

分布解析先移除 IPA 包裹符和重音符，再按空白、传统 `.` 及当前 IPA 设置中的音节分隔符切分；音素单元切分复用 `ipa-model` 的 `tokenizePhonemeUnits`：连续的调字母算一个单元，其余按 `phonemeUnits`（`complexPhonemes` 与多字符元音）最长优先。桶查询的搜索语义为 `Distribution(category, value) ∩ EntrySearch`，不会重跑分布计算。items 中的 source-specific feature 为 `{ category, value, occurrenceCount }`；其中 unit 的 `occurrenceCount` 是该词条内出现次数，其余类别为 1。

形态分析使用以下 source 和 view：

```js
{
  source: { type: "morphologyAnalysis", version: 1, options: {} },
  responseMode: "items",
  view: {
    category: "assignment" | "mode" | "group" | "override" | "overrideGroup" | "overrideTable",
    value: "assigned",
    scope: "any" | "active" | "inactive", // 仅 overrideGroup/overrideTable；默认 any
    search: {
      text: "",
      fields: ["lemma", "morphology"],
      fuzzyFields: []
    },
    sort: "lemmaAsc"
  },
  page: { limit: 200, cursor: "", windowOffset: null }
}
```

category/value 组合固定为：`assignment + assigned|unassigned`、`mode + auto|manual`、`group + templateGroupId`、`override + any|active|inactive`、`overrideGroup + templateGroupId + scope`、`overrideTable + templateTableId + scope`。`scope` 在后两类中省略时规范化为 `any`，其他 category 不接受 scope。不存在于当前 result source 的模板组或子表 ID、缺少 value、非法枚举和非法 scope 返回 `invalid_feature_result_value`。

`morphologyAnalysis` summary 固定形状为：

```js
{
  inputEntryCount,
  assignment: { assignedEntryCount, unassignedEntryCount },
  modes: [
    { mode: "auto", entryCount, assignedEntryCount, unassignedEntryCount },
    { mode: "manual", entryCount, assignedEntryCount, unassignedEntryCount }
  ],
  groups: [
    { groupId, name, assignedEntryCount, tableCount }
  ],
  overrides: {
    entryCount,
    storedCellCount,
    activeEntryCount,
    activeCellCount,
    inactiveEntryCount,
    inactiveCellCount,
    topEntries: [
      { entryId, lemma, storedCellCount, activeCellCount, inactiveCellCount }
    ]
  },
  overrideGroups: [
    { groupId, name, entryCount, activeEntryCount, activeCellCount, inactiveEntryCount, inactiveCellCount }
  ],
  overrideTables: [
    { groupId, tableId, groupName, title, entryCount, activeEntryCount, activeCellCount, inactiveEntryCount, inactiveCellCount }
  ]
}
```

assignment 的两个计数互斥且和为 `inputEntryCount`；每个 mode 行的 assigned/unassigned 之和等于该行 `entryCount`。手动词条可以属于多个模板组，所以 `groups[].assignedEntryCount` 不可相加推导总数。override 的 active/inactive 词条集合允许重叠，`entryCount` 表示至少保存一个非空 override 单元格的唯一词条数；单元格计数满足 `storedCellCount = activeCellCount + inactiveCellCount`。`topEntries` 最多 12 项，按 `storedCellCount` 降序并以现有稳定 `lemmaAsc + entryId` 顺序打破平局；模板组和子表数组按当前配置顺序返回，不携带成员 ID 集合。空 override 值以及只保存标题或备注的 dormant overlay 不增加这些单元格计数。

`morphologyAnalysis` items 的 feature 固定为 `{ mode, assignedGroupIds, activeOverrideCellCount, inactiveOverrideCellCount }`。形态覆盖只表示至少解析到一个模板组；该 source 不执行单元格生成，不统计生成形式、空单元、失败或必需形式缺失，也不把未分配或 inactive override 解释为质量问题。

基础 outcome 为互斥的 `exactMatch`、`normalizedOnlyMatch`、`mismatch`、`unavailable`、`failed`。三个 UI category 分别映射为 `exactMatch`、`mismatch`、`normalizedOnlyMatch + mismatch`。响应中的 `summary.outcomes` 和 `summary.views` 一次返回全部计数，因此循环按钮不执行额外存在性探针。

`ipaAutoCompare` items 形如 `{ entry: EntrySummary, feature: { outcome, generated, diagnostics } }`；`ipaDistribution` items 的 feature 形如 `{ category, value, occurrenceCount }`；`morphologyAnalysis` items 的 feature 形状见上。HTTP 响应和前端高级筛选 action 都不携带完整匹配 ID。`pageInfo` 返回 `total/limit/windowOffset/nextCursor/windowCursor/hasMore`。location 请求沿用同一 source/view/page，并增加 `entryId`；响应增加 `{ found, index, windowIndex, windowOffset }`。

会话使用每词典最多 4 份、全局估算 32 MiB、空闲 2 分钟的有界进程缓存，并合并相同 descriptor 的并发构建。写入或 source 变化会产生新会话；`ipaAutoCompare` 另受完整 IPA 设置与引擎 ID/版本影响，`ipaDistribution` 只受多字符音位、多字符元音和音节分隔符影响，不调用音系引擎，也不因映射、重音或其他生成设置变化而产生不同 descriptor。`morphologyAnalysis` 只消费当前 generation 下的模板组元数据和词条形态分配/覆写事实，不依赖音系引擎、搜索 projection 或单元格生成配置摘要。淘汰或进程重启后由 descriptor 透明重建。cursor 绑定进程 epoch、generation、result key 和视图 identity，陈旧 cursor 返回 `query_cursor_stale`。当前简易 IPA 模型由 adapter 包装；自动生成值仍是可重建的运行时结果，不新增持久化列。

音系引擎 adapter（`lib/phonology-engine.js`）是 `ipaAutoCompare` 与具体 IPA 生成器之间的唯一边界，feature service 只依赖它的契约，以后接入外部模块时只替换 adapter，同步或异步实现都不改变 source 的页面语义：

```js
{
  id: "conlexicon-simple-ipa",
  version: "1",
  generate({ input: { orthography }, profile: { ipaSettings } }) {
    return { status: "generated" | "unavailable", primary, alternatives: [], diagnostics: [] };
  },
  compare({ generated, observed, profile }) {
    return { exact, equivalent };
  }
}
```

- 引擎正常返回但无法生成非空值时归入 `unavailable`；`generate` 或 `compare` 抛错、返回无效结果时归入 `failed`，并分别携带稳定诊断 code `phonology_engine_failed`、`invalid_phonology_engine_result` 或 `invalid_phonology_engine_comparison`。两者都进入 summary，不得归入 match/mismatch 或从总数中消失。
- 引擎 ID 与版本进入 source 的基础会话身份；provenance 只随运行时结果存在，不写入词条。以后若批量写入自动 IPA，需另行定义人工值、生成值、引擎版本和 stale 状态。
- 构建每 128 项让出一次事件循环。

feature result 与质量结果都在请求内同步构建。只有满足任一条件时，才独立复评进程内 deferred execution（只增加 `deferred / running / failed` 状态、取消/去重和轮询或推送，进程重启后由 descriptor 重提）：代表性 10k 数据冷构建 p95 持续超过 500 ms；event-loop delay 持续超过 100 ms 并影响同进程保存或查询；外部音系引擎只能以长时 Promise、子进程或远程调用工作；用户导航或取消后仍须等待无用计算结束。`scripts/benchmark-feature-result-session.js` 测量 10k/30k 冷热耗时。

不做：自动生成 IPA 的持久化列、派生表或历史版本；通用后台任务框架、持久化 job queue 与跨重启恢复；通用分析 DSL 或任意布尔 feature expression；会话的单词条增量维护（写入后按 generation 整体失效，重建成本成为真实瓶颈后再设计）。Gloss 不作为 feature source：当前只由质量规则读取，例句迁移为语料链接后按阶段 C 计划升级输入。

source、version、options、response mode、category、分布 value、page 与搜索字段验证失败分别使用 `invalid_feature_result_source`、`unsupported_feature_result_source`、`invalid_feature_result_source_version`、`invalid_feature_result_source_options`、`invalid_feature_result_response_mode`、`invalid_feature_result_category`、`invalid_feature_result_value` 或既有 EntryQuery 校验码。summary 模式携带 `view` 或 `page` 时返回 `invalid_feature_result_summary_request`；location 缺少目标 ID 时返回 `invalid_feature_result_location_entry_id`。

#### Quality result query

质量检查的基本单位是 **issue**，不是布尔筛选条件。规则 code、严重度、模块、详情参数和问题级汇总由质量模型（`lib/quality-model.js`，仅服务端，不由静态服务公开）和 `QualityResultService`（`lib/quality-result-service.js`）负责；repository 只提供最小事实，不拥有质量政策。质量结果保持独立 API，不并入 `/analysis/features/query`，内部复用 feature result 的会话缓存与 cursor 原语。

前端质量页打开时才请求 summary 与 issue 窗口，同一词典 ID 加 `updatedAt` 只请求一次，失败显示重试；问题列表每次取 200 条，“再显示”按 cursor 追加，cursor 过期时从第一页重取。词条列表的质量筛选以 `resultSource: { type: "dictionaryQuality" }` 加 selector（`category` 为 `all / severity / module`，`value` 为分组值）作为 feature-result 筛选的一种，请求本端点的 entry 视图。端点：

```text
POST /api/dictionaries/:id/quality/query
POST /api/dictionaries/:id/quality/location
```

source 固定为 `{ type: "dictionaryQuality", version: 1, options: {} }`，`responseMode` 省略时为 `items`。

- **summary**：请求只接受 source，携带 `view` 或 `page` 返回 `invalid_quality_summary_request`。响应 `{ dictionaryId, generation, resultKey, source, summary, diagnostics }`；summary 区分 `inputEntryCount`、`issueCount`、`affectedEntryCount`、`globalIssueCount`，并按 severity（`high / medium / low`）和 module（`lemma / tags / ipa / network / gloss / other`）分别返回 `{ key, issueCount, entryCount }`。summary 不读取词典查询上下文，也不构建窗口。
- **items**：`view` 必填：

```js
{
  itemKind: "issue" | "entry",
  selector: { group: "all" } | { group: "severity", value: "high" } | { group: "module", value: "gloss" },
  search: { text: "", fields: ["lemma"], fuzzyFields: [] }, // 仅 entry
  sort: "lemmaAsc"                                          // 仅 entry
}
```

  `selector` 省略时为 `all`；`all` 不接受 value。`page` 沿用 EntryQuery 的 `{ limit, cursor, windowOffset }`，limit 为 1–200，默认 200。
- **issue 视图**：按稳定问题顺序分页（词条按 `position, id` 排列后各规则依次产出，与规则的构建顺序一致），可返回 `entryId` 为空的全局问题；携带 `search` 或 `sort` 返回 `invalid_quality_issue_view`。item 为 `{ issue, entry }`：`issue` 只含 `{ id, code, severity, module, entryId, params }`，不返回本地化 title/detail；`entry` 是该问题主词条的 EntrySummary，全局问题为 `null`。
- **entry 视图**：按唯一受影响词条分页，复用 EntrySearch、sort、EntrySummary、`searchSummary` 和 cursor。item 为 `{ entry, issues }`，`issues` 只含当前 selector 命中、且影响该词条的问题；全局近似标签问题会附加到其关联词条上，与 summary 的 `entryCount` 语义一致。
- 窗口响应在 summary 响应的字段之外附加 `{ view: { itemKind, selector }, searchSummary, items, pageInfo, diagnostics }`；`pageInfo` 与 feature result 相同。
- **location**：请求额外携带 `entryId`，只接受 entry 视图（issue 视图返回 `invalid_quality_item_kind`），返回 entry 窗口加 `location: { found, index, windowIndex, windowOffset }`；目标词条不在当前 selector 与搜索结果中时 `found: false`、`items` 为空。

基础会话以 `{ dictionaryId, generation, source }` 为身份，同一 generation 下的 summary、全部 selector、搜索、排序、窗口和 location 共用一次规则构建；UI 语言不属于请求或身份。会话放在独立的有界 `FeatureResultSessionCache` 实例中（TTL/LRU、in-flight 合并），写入使 generation 前进后旧会话不再命中，旧 cursor 返回 `query_cursor_stale`。每个视图的有序成员在会话内按 LRU 缓存最多 12 个。会话、issue `id` 和 cursor 都只在当前进程内有效（cursor 带进程纪元），规则改动随代码重启生效，因此身份里不带规则版本；以后若要把质量结果或 issue `id` 保存到进程之外，再另行设计版本或指纹。

规则输入由 repository 的 `qualityInputRecords()` 一次同步读取：词条 `id / lemma / pronunciation`、有序标签、释义 `id / meaning / example / tags`、有序来源 `entryId / text`（顺序与公开词条 DTO 相同）；紧接着由 `qualityInputSettings()` 读取规则用到的唯一设置 `partOfSpeechTags`。不读取备注、词源描述、形态、语料、语言文档或完整 snapshot；repository 不生成质量 code、严重度或详情。HTTP 响应不携带全局问题的关联词条 ID 数组或任何完整匹配 ID 数组。

source、version、options、response mode、item kind、selector 与 issue 视图字段验证失败分别返回 `invalid_quality_source`、`unsupported_quality_source`、`invalid_quality_source_version`、`invalid_quality_source_options`、`invalid_quality_response_mode`、`invalid_quality_view`、`invalid_quality_item_kind`、`invalid_quality_selector`、`invalid_quality_issue_view`；请求体不是对象时返回 `invalid_quality_query_payload` 或 `invalid_quality_location_payload`，location 缺少目标 ID 时返回 `invalid_quality_location_entry_id`，page 与搜索字段沿用既有 EntryQuery 校验码。未知词典返回 `dictionary_not_found`。

##### 规则

严重度顺序固定为 `high / medium / low`，模块顺序固定为 `lemma / tags / ipa / network / gloss / other`。

| Code | 严重度 | 模块 | 范围 | 稳定参数 |
| --- | --- | --- | --- | --- |
| `gloss_incomplete` | medium | gloss | entry/definition | `definitionId`、`definitionPosition`、`missingFields` |
| `gloss_alignment_mismatch` | medium | gloss | entry/definition | `definitionId`、`definitionPosition`、`glaCount`、`glbCount` |
| `duplicate_lemma` | high | lemma | entry/cross-entry | `lemmas`、`duplicateEntryCount` |
| `near_duplicate_tags` | low | tags | global | `forms`；会话内部另保存受影响词条集合 |
| `display_label_conflict` | low | tags | global | `displayLabel`、`forms`；会话内部另保存受影响词条集合 |
| `missing_lemma` | high | lemma | entry | 无 |
| `missing_tags` | high | tags | entry | 无；有效标签（词条标签与释义标签的并集）为空才报 |
| `missing_definition` | high | other | entry | 无 |
| `missing_ipa` | low | ipa | entry | 无 |
| `multiple_primary_stress` | medium | ipa | entry | `primaryStressCount` |
| `tag_too_long` | low | tags | global | `tag`、`codePointLength`、`limit`；会话内部另保存受影响词条集合 |
| `duplicate_definition_tag` | low | tags | entry/definition | `definitionId`、`definitionPosition`、`tag` |
| `mixed_part_of_speech_levels` | medium | tags | entry/definition | `definitionId`、`definitionPosition`、`part` |
| `missing_definition_part_of_speech` | medium | tags | entry/definition | `definitionId`、`definitionPosition` |
| `source_unresolved` | medium | network | entry/source | `sourceText`、`sourcePosition` |
| `source_cycle` | high | network | entry/graph | `cycleEntryIds`、`cycleLemmas` |

全部规则由一次最小事实读取加纯规则模块执行，不按规则分别下推 SQL，也不让 repository 接受 `{ type: "quality" }` 之类的条件自行生成 code。规则阶段每 256 个词条让出一次事件循环。

##### Issue 身份与本地化

- 同一词条可以产生多个 issue，同一释义、标签或来源也可以分别产生 issue。
- issue `id` 由 `code`、`entryId` 和稳定参数派生并散列；`severity / module` 由 code 决定，本地化 `title / detail` 不参与。`id` 不持久化，不承诺在规则改动后保持相同。
- 服务端只返回稳定字段；前端（`app.js` 的 `qualityIssueText()`）按 code 与 params 生成标题和详情。UI 语言不属于质量计算身份：中英文只改变标题、详情和标签，不改变 code、参数、数量或成员；切换语言只重新渲染已取回的结果，不重新请求、不失效会话。
- 词形、标签和来源匹配使用固定的服务端关系规范化基线，不读取自由文本搜索的 NFC、case folding 或自定义等价设置。

##### 规则边界行为

- **Gloss**：规则读取当前 `definitions.example` 中的 `\gla / \glb / \glc / \ft`（解析在 `lib/gloss-model.js`，前后端共用）。这只冻结质量检查语义，不为例句—语料链接建立存储契约；存储模型变化时必须同步修改输入 adapter。
- **来源循环**：来源链最终进入循环的词条也产生 `source_cycle`，issue 不只属于循环参与者；`cycleEntryIds / cycleLemmas` 只记录实际循环见证，并重复首节点闭合路径。实现消费 `etymology-graph-model` 的强连通分量，按分量拓扑序记忆化传播，O(V+E)：
  - 每个循环分量（成员数大于 1；保存校验拒绝自引用）只有一条规范见证：从分量内 ID 最小的成员出发，按来源位置顺序在分量内深度优先，第一条回到起点的边闭合见证；
  - 循环分量的成员都引用本分量的见证，其他词条按自身来源位置顺序，取第一个能到达循环的来源所继承的见证；
  - 见证只取决于词条集合与来源边，与词条排列顺序无关；到达同一循环的 issue 共用同一个 params 对象，调用方不得修改。
- **标签层级**：三条规则共用 `tagModel.definitionTagLayerStates()`，前端详情的标签状态标注也用它。标签按原值比较（与有效标签相同），是否为词性按标签是否在登记表词性区判断（与 `entryParts()` 相同）。
  - `duplicate_definition_tag`：释义上有与词条相同的标签，词性和非词性都算，每个重复标签一个 issue。
  - `mixed_part_of_speech_levels`：词条有词性，而释义有词条没有的词性，每个这样的词性一个 issue。词条和释义上有同一个词性时只报 `duplicate_definition_tag`。
  - `missing_definition_part_of_speech`：词条没有词性，这条释义也没有，每条释义一个 issue。
  - 合起来表达"词性要么只挂在词条上，要么挂在每条释义上"；词性区为空时后两条不检查。没有释义的词条不产生这三种 issue。
- **标签过长**：一个标签只产生一个全局 `tag_too_long`（`entryId` 为空），词条标签和释义标签一起检查。
- **显示相同**：登记表中显示文本相同的每组标签产生一个全局 `display_label_conflict`（`entryId` 为空），含未使用的标签；重复无法在词条保存时阻止（自动登记不能拒绝保存），所以由质量检查报告。
- **近似标签**：一个规范化紧凑形式对应多个不同 raw tag 时只产生一个全局 `near_duplicate_tags`（`entryId` 为空），词条标签和释义标签一起比较。`forms` 按稳定遇见顺序去重；受影响词条按唯一 ID 计入 tags 模块的 `entryCount`，并在 entry 视图中带问题标记出现，但 HTTP 不返回关联 ID 数组。

##### Summary 计数语义

- `issueCount` 按 issue 计数，同一词条的多个问题分别计数；各 severity/module 的 `issueCount` 加总等于全局 `issueCount`。
- `entryCount` 在当前分组内按唯一受影响词条计数，全局近似标签问题使用会话内部关联成员；因集合重叠，各组 `entryCount` 不可加总。
- `affectedEntryCount` 在所有问题上按唯一词条计数；`globalIssueCount` 只统计没有主 `entryId` 的 issue。

##### 构建边界与性能

页面未打开时不建立质量会话；首次请求不调用 snapshot/export 路径。会话结果可丢弃，近期不新增 SQLite 派生表、持久化 job 或单词条增量维护，当前沿用较宽的 generation 失效。

`node scripts/benchmark-quality-result.js` 在合成词典上测冷构建与窗口请求。冷构建期间最长的 event-loop 阻塞来自 `qualityInputRecords()` 的同步读取；该读取刻意保持为一个同步块，以读到同一个数据库状态。只有 10k 冷构建 p95 持续超过 500 ms 或 event-loop 阻塞持续超过 100 ms，或真实大词典上的阻塞影响交互时，才评估进程内 deferred execution 或缩小读取列。

#### Light / full 任务边界

为避免总览卡片触发重型计算，`/analysis/query` 只运行上文任务表中的确定性聚合、最小词形扫描和稳定 topology 任务；只有必须执行功能算法的派生结果进入 feature result 会话。各项归属：

```text
orthographyStats
  词长、首字符、字符和不跨空白的双字符分布

tagStats / tagSetStats
  其他标签频率与无序完整标签集合

rootTopology
  全部非空词根家族排行

ipaAutoCompare / ipaDistribution
  自动生成比较与 IPA 音位、首尾音、音节数 feature result

morphologyAnalysis
  形态 feature result：模板组分配覆盖、模式/模板组使用量，以及 active/inactive nested override 分布；不执行单元格生成

activityPreview
  少量创建/编辑日期桶

activityDistribution
  完整创建/编辑日期分布
```

`/analysis/query` 的 widgets 不返回后台任务状态。feature result 与质量结果先同步构建并缓存；只有 10k/30k 基准或可观察交互证明计算不适合停留在请求生命周期内时，API 才增加进程内 `deferred` / `running` / `failed` 状态。不要默认让总览触发所有 full 任务，也不要近期引入持久化 job 表。

#### Filter descriptor

分析与质量结果不传递大量 `entryIds`。分析 widget 的结果 action 使用 filter descriptor：

```js
{
  type: "entryFilter",
  resultCount: 608,
  filter: {
    presence: [
      { field: "ipa", present: false }
    ]
  }
}
```

点击分析行时，词条列表使用 descriptor 调用 `/entries` 获取匹配项。这样分析 API 只返回 `resultCount` 和可复用 filter spec，避免大词典下传递大量 ID。feature result 与质量结果改用可重建的 source descriptor 加 view，见上文两节。

入口归属：

| 类别 | 入口 | 结果 |
| --- | --- | --- |
| EntryFilter | 词性与无词性、多词性与词性组合、标签与标签集合、释义/例句/词条备注/来源/IPA/标签的有无、来源数量与多来源、标签数量、新增/编辑日期、正写法（词长、首字符、字符、双字符）、词根与孤立词根 | 结构 descriptor 进入普通 `/entries` 窗口、会话、cursor、定位、排序与搜索 |
| Feature result | IPA 自动比较、IPA 音素单元/首音/尾音/音节数、形态分配/模式/模板组/覆写 | `resultSource` 加 category/value 进入 feature query/location |
| 质量结果 | 全部、按严重度、按模块 | `dictionaryQuality` source 加 selector 进入质量 entry 视图 |
| 导航，不是筛选 | 词条总数与当前搜索命中、词根家族排行、override 排行 | 返回词条浏览页并保留普通查询状态，或定位单条词条 |

数据分析中的词性行与标签频率中的词性标签使用标准 `part` filter，不创建另一种结果集。词根（没有任何来源记录）与孤立词根（另要求 `presence.derivedEntries: false`）与总览计数同一口径，与词根模式按拓扑分组的口径有意不同：只有纯文本来源的词条在拓扑里成组，在这里算衍生词。

查询边界：

- `filter` 只回答“哪些词条符合条件”；自由文本搜索、排序和窗口分别属于 `search`、`sort` 和 `page`，列表响应固定使用摘要 DTO。UI 标题、本地化文本、循环按钮位置和问题 tooltip 不属于查询身份。
- 多个稳定条件按 AND 组合，标签自身保留 `any / all / exact`；不引入通用递归 `and/or/not` 表达式，出现真实的组合筛选界面后再评估。不能跨 source 求交：EntryFilter、feature result 与质量结果整体替换当前筛选。
- 标签 descriptor 保存原始标签并按结构键精确比较，不保存显示替换，也不沿用自由文本的模糊规范化。

前端筛选状态（`app.js`）：

- 运行期只有一个 `activeFilter`：EntryFilter descriptor（可带 `searchScope`），或 `resultSource` 加 category/value（质量为 selector）。不保存匹配 ID、已翻译标题或问题 map；词性筛选同样是 `EntryFilter.part`，不再有独立的词性状态。
- 标题使用独立于查询身份的语义化 `titleDescriptor`：固定标题保存 i18n key，字段值标题保存 label key 与原始值或 value key。切换界面语言只重新渲染标题，不失效列表、事实或功能结果缓存。
- 循环变体只替换 filter 或 category/value。EntryFilter 变体的可用性来自按词典版本与规范化 filter 缓存的 `unknown / available / empty` 结构事实：进入筛选、事实失效或词条写入后由批量 `/entries/filter-facts` 补齐未知项；无搜索首窗的总数可直接写入精确事实，有搜索且有命中可证明结构非空，搜索零命中不判定结构为空。feature 与质量变体的可用性来自同一份 summary，不发存在性探针。
- 搜索输入只重查当前 `Filter ∩ Search`，不为其他变体重复探测。刷新按钮只在当前远程查询失败时作为重试出现，只使当前查询及其定位缓存失效，保留同词典的其他查询、词根窗口和 facets。
- 替换或清除筛选都保留当前搜索；清除不恢复进入筛选前的搜索、排序或词根模式快照。
