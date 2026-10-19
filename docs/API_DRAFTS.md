# API Drafts

**非现行契约。** 本文收纳 2026-10-19 从 [API Contract](API_CONTRACT.md) 移出的未实装草案：下列端点、接口和服务在当前代码中都不存在，前端不得依赖。草案保留原有设想供后续参考，不是实装授权；采用任何一项前，按 `AGENTS.md` 对照当时的代码重新复评，实装后把契约写入 API Contract，并从本文删除对应条目。

## 1. 启动与词典索引拆分

当前启动只用 `GET /api/state`（契约见 API Contract“应用状态与全局偏好”）。若以后要继续收窄，可以拆成更细的 app state、词典索引、summary 和模块读取：

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
  uiTheme,
  uiSkin
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

## 2. 共享查询上下文与功能服务分层

设想：数据分析、词典标题、词典管理、词根模式、词汇网络、质量检查、高级筛选和诊断修复共用一层统计、关系解析和索引能力，再在其上实现不同 UI 端点。

```text
Repository
  SqliteDictionaryRepository

DictionaryQueryContext
  请求级或持久化索引、基础查询和聚合能力

Feature Services
  AnalysisService / QualityService / DiagnosticsService / RelationService / EntrySearchService
```

`DictionaryQueryContext` 应提供稳定能力，而不是暴露存储结构：

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

现状：repository 直接提供各项查询，`AnalysisFeatureService` 与 `QualityResultService` 是仅有的两个功能服务；repository 中的 `dictionaryQueryContext()` 只是不含词条的设置快照，与上面的接口无关。

## 3. 共享关系任务

设想把关系数据拆成可复用任务：

```text
relationSummary
  rootCount
  derivedCount
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

现状：词根家族排行、词根模式和词汇网络都直接消费 repository 的 `RootTopologyCache`；来源只按精确目标 ID 匹配，运行期没有按文本解析来源的步骤，`sourceResolution` 的文本匹配目前只存在于旧 JSON 导入转换中。孤立词根已作为 `lexiconSummary` 的严格计数接入（2026-10-19），不依赖拓扑。

## 4. 诊断修复模块

未来的诊断修复只处理结构、存储、迁移和可自动修复问题，例如：

- 重复 ID、缺失 ID、格式错误 ID。
- 词典索引与实际文件不一致。
- 引用已删除对象。
- 孤儿语料单元、多父级语料单元。
- 语料块、层、单元顺序缺失或重复。
- 批量修复前的影响范围预览。

以下属于质量检查，不应重复归入诊断修复：未解析来源、来源循环、缺少释义／标签／IPA、多个主重音、Glossed 例句缺字段、近似标签可能不一致。

## 5. 语料与写入并发

- 语料库从整份 corpus 模块保存拆成块、层、单元级 changeset；语料查询在独立服务边界稳定后按需接入。
- 对象级增量端点稳定后，基于目标对象 `updatedAt` 做轻量乐观锁（当前不引入词典级 revision）。
