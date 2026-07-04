# API Contract

本文记录 Conlexicon 当前本地 HTTP API 的稳定约定。它描述前端可依赖的接口边界，而不是底层存储实现；后端目前使用 JSON repository，后续可替换或补充 SQLite repository，但前端不应直接依赖文件结构。

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
| `GET` | `/api/state` | 读取应用状态 | `{ activeDictionaryId, dictionaries, uiLanguage, uiTheme }` | 当前仍返回完整词典数组；这是启动兼容入口，不代表普通保存也应使用完整快照。 |
| `PUT` | `/api/preferences` | 保存全局界面偏好 | `{ uiLanguage, uiTheme }` | 目前支持 `uiLanguage` 和 `uiTheme`。 |

### 导入、导出与词典生命周期

| 方法 | 路径 | 用途 | 响应 | 备注 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/export?dictionaryId=` | 导出 JSON | 完整词典 JSON | 完整快照交换格式。 |
| `POST` | `/api/import?overwrite=&regenerateId=` | 导入 JSON | 应用状态 | 完整快照导入；执行全量规范化和实体 ID 检查。 |
| `POST` | `/api/dictionaries` | 新建词典 | 完整词典 JSON | 创建空词典，并设为当前词典。 |
| `POST` | `/api/dictionaries/:id/activate` | 切换当前词典 | 应用状态 | 只改 `index.json` 中的当前词典。 |
| `DELETE` | `/api/dictionaries/:id` | 删除词典 | 应用状态 | 删除词典文件并更新索引。 |

### 完整快照兼容层

| 方法 | 路径 | 用途 | 响应 | 使用限制 |
| --- | --- | --- | --- | --- |
| `PUT` | `/api/dictionaries/:id` | 保存完整词典快照 | 完整词典 JSON | 兼容层和低频管理入口。普通运行期保存不应走这里；不要在此端点上叠加复杂冲突合并逻辑。 |

### 词典元数据与模块级保存

| 方法 | 路径 | 用途 | 响应 | 校验范围 |
| --- | --- | --- | --- | --- |
| `PUT` | `/api/dictionaries/:id/meta` | 保存词典名称、语言、描述 | 完整词典 JSON | 不做实体 ID 检查。 |
| `PUT` | `/api/dictionaries/:id/settings` | 保存其他设置 | 完整词典 JSON | 不做实体 ID 检查；会保留既有 IPA 设置。 |
| `PUT` | `/api/dictionaries/:id/docs` | 保存语言文档 | 完整词典 JSON | 不做实体 ID 检查。 |
| `PUT` | `/api/dictionaries/:id/corpus` | 保存语料库模块 | 完整词典 JSON | 检查语料范围内实体 ID 冲突。 |
| `PUT` | `/api/dictionaries/:id/morphology` | 保存自动形态学模块 | 完整词典 JSON | 检查形态表实体 ID 冲突，并使用共享形态模块校验规则引用语法和函数对象配置。 |
| `PUT` | `/api/dictionaries/:id/settings/ipa` | 保存自动 IPA 设置 | 完整词典 JSON | 检查 IPA 规则和重音规则实体 ID 冲突。 |
| `POST` | `/api/dictionaries/:id/autosave` | 页面卸载时保存文档/语料草稿 | 完整词典 JSON | 当前只分发 `docs` 和 `corpus`；没有有效模块时返回词典快照。 |

### 词条级保存

| 方法 | 路径 | 用途 | 响应 | 校验范围 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/dictionaries/:id/entries` | 读取词条列表 | 无参数时为词条数组；带查询参数时为分页查询对象 | 支持 `q`、`fields`、`fuzzy`、`tagFuzzy`、`fuzzyFields`、`part`、`tags`、`tagMode`、`source`、`derivedFrom`、`sort`、`cursor`、`limit`、`include`。 |
| `POST` | `/api/dictionaries/:id/entries` | 新建词条 | 保存后的词条 | 检查当前词条及其子对象与全库实体 ID 冲突。 |
| `GET` | `/api/dictionaries/:id/entries/:entryId` | 读取单个词条 | 词条 JSON | 未找到返回 `entry_not_found`。 |
| `PUT` | `/api/dictionaries/:id/entries/:entryId` | 保存单个词条 | 保存后的词条 | 检查当前词条及其子对象与全库实体 ID 冲突。 |
| `DELETE` | `/api/dictionaries/:id/entries/:entryId` | 删除单个词条 | `{ id }` | 不因无关历史重复 ID 阻断删除。 |
| `PATCH` | `/api/dictionaries/:id/entries` | 批量更新词条字段 | 完整词典 JSON | 当前仅允许 patch `tags` 和 `pronunciation`；可附带 `settings` 用于标签排序设置保存。 |

### 读取侧查询

| 方法 | 路径 | 用途 | 响应 | 备注 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/dictionaries/:id/facets` | 读取词性和标签统计 | `{ parts, tags, noPartOfSpeechCount }` | 尊重当前词典的词性标签设置和标签显示替换。 |
| `GET` | `/api/dictionaries/:id/entry-relations/:entryId` | 读取词源/衍生/同根关系 | `{ entryId, sources, derivedEntries, rootGroup }` | 同名 lemma 暂按排序后的第一条匹配，后续可由诊断模块报告歧义。 |

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
- `GET /api/state` 可以继续作为启动兼容入口；若启动性能成为瓶颈，再拆成词典索引、当前词典摘要和按需模块读取。
- 语料库下一步可从整份 corpus 模块保存拆成块、层、单元级 changeset。
- 搜索、筛选、词源反查和数据分析后续应依赖 repository 查询/索引，不应让前端扫描大型完整快照。
- 短期不引入词典级 revision。等对象级增量端点稳定后，再基于目标对象 `updatedAt` 做轻量乐观锁。

## 计划中的读取 API

阶段 B3 的目标是先建立查询契约，不急于替换全部前端调用。JSON repository 可以暂时用内存扫描实现；后续 SQLite repository 应在不改变前端契约的前提下用索引或 SQL 实现同样语义。

### 启动与词典索引

后续可将当前 `GET /api/state` 拆成轻量启动状态和词典索引：

```text
GET /api/app
GET /api/dictionaries
GET /api/dictionaries/:id/summary
GET /api/dictionaries/:id/settings
```

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
    { id, name, language, description, entryCount, rootCount, updatedAt }
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

当前只有词汇网络详情视图接入了该 API。词根模式的列表渲染仍由前端根据完整词条数组本地计算，但词根组、来源解析和衍生关系语义已经抽入共享关系模块，后续 API 化时前后端应复用同一套语义。

词根模式后续可新增独立读取端点：

```text
GET /api/dictionaries/:id/root-groups?q=&fuzzy=&tagFuzzy=&fuzzyFields=&sort=&cursor=&limit=&include=
```

建议返回分页后的词根组，而不是向前端一次返回全部分组：

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

- repository 层为一次请求构建临时关系索引：`id -> entry`、`normalized lemma -> first entry`、`source key -> derived entries`，避免每个来源重复扫描全词条。
- `entry-relations/:entryId`、`root-groups`、`entries?derivedFrom=` 和后续质量检查中的词源问题应共享同一套关系索引。
- JSON 文件后端可先做请求级临时索引；如果后续切到 SQLite，则用 `entry_sources(source_key, entry_id)` 或等价表/索引支持 `derivedFrom`、词根分组和词汇网络查询。
- 前端保留本地 fallback，只有当 API 返回顺序和语义通过一致性检查后才可逐步替代本地 root mode 计算。

### 语料库读取

语料库读取后续再拆：

```text
GET /api/dictionaries/:id/corpus/blocks
GET /api/dictionaries/:id/corpus/blocks/:blockId
GET /api/dictionaries/:id/corpus/units?q=&blockId=&layerId=&orphan=&cursor=&limit=
GET /api/dictionaries/:id/corpus/units/:unitId
```

语料保存下一步可从整份 corpus 模块保存拆成块、层、单元级 changeset。

### 数据分析按需 summary

数据分析后续避免一次生成全量报告，逐步拆成：

```text
GET /api/dictionaries/:id/analysis/overview
GET /api/dictionaries/:id/analysis/tags
GET /api/dictionaries/:id/analysis/ipa
GET /api/dictionaries/:id/analysis/morphology
GET /api/dictionaries/:id/analysis/corpus
```

点击“在词条列表查看”时，应复用词条查询 filter spec，而不是向前端传递大量 entry IDs。
