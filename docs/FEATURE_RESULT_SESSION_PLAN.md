# Feature Result Session Plan

本文记录 F4b 的功能结果源与运行时会话设计。F4b-0 已完成现状清点、独立复评和契约冻结；F4b-1 已实装 IPA 自动生成比较的 API、运行时缓存和前端窗口消费，后续阶段继续沿此边界迁移 IPA 分布与正式形态分析。

## 1. F4b-0 结论

剩余前端 `entryIds` 入口不能统一迁入一种结果会话。按当前算法与已有后端能力，应拆成四类：

1. **Feature result**：必须运行 IPA、Gloss 或形态算法才能得到的派生结果，由 F4b feature service 负责。
2. **Topology summary**：词根家族排行直接消费现有稳定词根拓扑，不建立 feature session。
3. **Deterministic summary/facet**：词长、首字母、字符和双字符组合先统一 Unicode 语义，再由轻量 projection 或 summary query 提供。
4. **Quality result**：质量检查需要问题分类和详情，F5 使用独立 `/quality/query`，只复用 F4b 的内部会话原语。

F4b 不建设通用分析任务平台，不把功能结果伪装成普通 `EntryFilter`，也不把前端 `entryIds` 机械搬进 HTTP 响应。

首个实装试点是 **IPA 自动生成比较**。它具有明确的三类结果、当前已有算法和可观察的设置失效边界，适合验证会话契约。当前简易 IPA 模型经可替换的音系引擎适配层接入；不新增自动生成 IPA 的持久化列，也不等待外部正写法/音系模块完成。

## 2. 当前实现清点

当前数据分析除总览 F4a 外仍从活动词典完整快照构建前端 slice；质量检查仍构建完整前端 report。两个 cache 在命中前都要序列化 O(N) 词条字段，首次 miss 仍运行完整算法。

| 页面/入口 | 当前数据来源 | 当前结果动作 | F4b-0 归类 | 目标边界 |
| --- | --- | --- | --- | --- |
| IPA 自动生成一致/宽松不一致/严格不一致 | F4b-1 `ipaAutoCompare` adapter 与运行时会话 | summary 驱动的 feature query 变体 | Feature result（已迁移） | 保持当前 query/location 契约，外部引擎接入后重跑基准 |
| IPA 音位、首音、尾音、音节数 | 当前 IPA 清理、complex phoneme tokenization 与分隔规则 | 每个桶保存固定 `entryIds` | Feature result | F4b-2 `ipaDistribution`，与比较结果分开按需构建 |
| Glossed 例句 | 解析 `definition.example` 中的 `\gla/\glb/\glc/\ft` | 固定 `entryIds` | Feature result，但模型即将变化 | 暂缓到例句/语料链接边界明确后迁移 |
| 形态覆盖与表格使用 | 前端临时旧单表适配 `resolveEntryMorphologyTable()` | 固定有/无 ID 与桶 ID | 错误模型上的临时结果 | F4b-3 改用共享 morphology model 后重新定义 |
| 形态生成数与空单元 | 临时旧表格逐单元求值 | 固定问题 ID | Feature result | F4b-3 使用真实多组、多子表、nested override |
| Override 排行 | 前端扫描词条并计数 | 定位单条词条 | Navigation summary | 与形态 summary 一并迁移，不建立结果筛选 |
| 词根家族排行 | 前端 `dictionary-query-model` 重建 relation index | 定位词根 | Topology summary | 直接查询 `RootTopologyCache` 的 `{ rootId, lemma, derivedCount }` |
| 词长、首字母、字符、双字符组合 | 前端按 JS code point 和 `\s` 规则统计 | 每桶固定 `entryIds` | Deterministic summary/facet | 先固定 Unicode/空白语义，再选择 SQL 函数或轻量 projection |
| 标签组合 | 显示替换后的标签按原顺序拼接 | 每组合固定 `entryIds` | 语义未定 | 明确 raw tag、顺序和重复语义前不迁移 |
| 完整活动日期分布 | 前端扫描日期 | 日期行已是 EntryFilter | Summary/navigation | 扩展 F4a activity query，不建立 feature session；按修改时间浏览复用词条列表排序 |
| 质量优先级与模块 | `quality-model` 完整扫描，问题带 entry、severity、module、detail | 固定 ID、问题详情和循环变体 | Quality result | F5 `/quality/query` |

已完成的覆盖率、词性、标签、来源数量、日期和运行期搜索字段范围继续使用 F4a/EntryFilter/EntrySearch，不得回退到 feature result。

## 3. 独立复评

### 3.1 不采用仅返回 `sessionId` 的创建式 API

一次性的 `sessionId` 在 TTL/LRU 淘汰或服务重启后无法自行重建，客户端还需要额外保存创建参数，反而产生两套身份。

替代方案是让客户端始终携带规范化、可序列化的 result source descriptor。服务端用 descriptor、词典 generation、算法版本和相关设置摘要建立内部 cache key。缓存 miss 透明重建；cursor 失效时客户端用原 descriptor 从首窗重试。

### 3.2 不采用通用 predicate 或分析 DSL

`ipaAutoCompare`、形态空单元和 Gloss 解析具有不同输入、分类与详情。把它们压成 repository predicate 会让 repository 反向依赖功能算法，也无法表达算法 provenance。

替代方案是 feature service 调用 repository 的读取和窗口能力；repository 只理解通用的内部候选关系，不理解 IPA、形态或质量类型。

### 3.3 不把所有统计放进 feature session

词根排行已有稳定拓扑；正写法分布是确定性 summary；活动日期已有 SQL 聚合。为统一形式而建立结果会话只会增加内存、失效和 API 数量。

替代方案分别使用 topology query、summary/facet query 和已有 EntryFilter。

### 3.4 不预建持久化任务队列

当前没有基准证明这些本地计算需要跨请求或跨重启存活。持久化 job 会引入恢复、取消、版本迁移和垃圾回收语义。

替代方案先同步构建并使用有界运行时缓存。只有基准和交互观测达到第 9 节的升级条件时，才增加进程内 deferred execution。

### 3.5 不提前持久化自动生成 IPA

外部正写法/音系模块预计后续接入，其模型和复杂度尚未稳定。现在新增生成列会提前固定 provenance、更新时机、人工值与派生值优先级及迁移规则。

替代方案是保存可重建的运行时结果，并从第一版开始携带引擎与配置 provenance。未来若真实读取成本证明需要 projection，再独立设计持久化派生列或缓存表。

## 4. Result source 契约

F4b 计划新增：

```text
POST /api/dictionaries/:id/analysis/features/query
```

items 请求分为不变的结果源、可变化的视图和窗口：

```js
{
  source: {
    type: "ipaAutoCompare",
    version: 1,
    options: {}
  },
  responseMode: "items",
  view: {
    category: "looseMismatch",
    search: {
      text: "",
      fields: ["lemma", "pronunciation"],
      fuzzyFields: []
    },
    sort: "lemmaAsc"
  },
  page: {
    limit: 200,
    cursor: null,
    windowOffset: 0
  }
}
```

- `source` 描述要执行的功能算法，是基础结果会话身份的一部分。
- `responseMode` 默认为 `items`；设为 `summary` 时只允许携带 `source`，返回全局 source 摘要并跳过视图、窗口、EntrySummary 和 cursor。
- `view.category` 选择算法产物中的分类，不触发算法重算。
- `view.search` 与 `view.sort` 只改变候选结果上的查询视图；搜索继续复用 EntrySearch 规范化和 projection。
- `page` 不进入基础结果身份，只控制窗口。
- UI 标题、语言、当前 tab 和 tooltip 不进入计算身份；算法返回稳定 code，前端负责本地化。

响应返回摘要、窗口 DTO 和必要的轻量功能元数据，不返回完整 ID 数组：

```js
{
  dictionaryId: "dict-1",
  generation: 12,
  resultKey: "...",
  source: {
    type: "ipaAutoCompare",
    version: 1,
    options: {}
  },
  summary: {
    inputTotal: 9400,
    outcomes: [
      { key: "exactMatch", count: 8100 },
      { key: "normalizedOnlyMatch", count: 300 },
      { key: "mismatch", count: 900 },
      { key: "unavailable", count: 80 },
      { key: "failed", count: 20 }
    ],
    views: [
      { key: "match", count: 8100 },
      { key: "looseMismatch", count: 900 },
      { key: "strictMismatch", count: 1200 }
    ]
  },
  items: [
    {
      entry: {
        id: "entry-1",
        lemma: "example",
        pronunciation: "..."
      },
      feature: {
        outcome: "mismatch",
        generated: "..."
      }
    }
  ],
  pageInfo: {
    total: 900,
    windowOffset: 0,
    limit: 200,
    nextCursor: "...",
    windowCursor: "..."
  },
  diagnostics: {
    cache: "miss",
    elapsedMs: 18
  }
}
```

具体 EntrySummary 字段复用普通词条列表 DTO，不在 feature API 内定义第二种卡片模型。`feature` 只携带当前页面需要的稳定 code 和轻量详情；大量诊断文本或多问题详情以后通过按词条 detail query 读取。

分析卡片进入词条列表时使用：

```js
{
  type: "advanced-filter",
  variants: [{
    resultSource: { type: "ipaAutoCompare", version: 1, options: {} },
    category: "looseMismatch",
    resultCount: 900
  }]
}
```

循环变体只替换 `category`。各视图可用性来自同一 `summary.views`，不再为每个变体执行存在性探针。

`ipaAutoCompare` 的内部 outcome 必须互斥，避免把当前重叠数组误当成互斥分类：

| Outcome | 语义 |
| --- | --- |
| `exactMatch` | 生成值与已存 IPA 完全相同。 |
| `normalizedOnlyMatch` | 原文不同，但经现有宽松比较规范化后相同。 |
| `mismatch` | 宽松比较后仍不同。 |
| `unavailable` | 引擎正常返回但无法为该输入生成非空值。 |
| `failed` | 引擎抛错、超时或返回无效结果。 |

现有三个 UI 视图由 outcome 组合：`match = exactMatch`，`looseMismatch = mismatch`，`strictMismatch = normalizedOnlyMatch + mismatch`。因此 UI 分类允许重叠，但基础 outcome 不重叠；`unavailable` 和 `failed` 必须进入 summary/diagnostics，不能像当前实现一样静默从三类中消失。

## 5. 服务端分层

```text
Analysis route
  -> AnalysisFeatureService
       -> feature adapter (IPA / morphology / Gloss)
       -> FeatureResultSessionCache
       -> repository candidate-window adapter
            -> EntrySearch projection
            -> EntrySummary DTO

Quality route (F5)
  -> QualityService
       -> shared session/cache primitives
       -> repository reads and stable root topology
```

- AnalysisFeatureService 负责 descriptor 验证、算法选择、摘要和分类。
- feature adapter 只产生稳定 code、候选成员和算法详情，不生成本地化 HTML。
- FeatureResultSessionCache 保存可重建的基础产物、分类索引和必要详情。
- repository 提供最小读取与候选窗口能力，不导入或调用 feature/quality service。
- F4a analysis planner 保持轻量 widget 职责，不反向调用重型 feature service。
- QualityService 可以消费稳定词根拓扑和 repository query，但保持独立 API 与规则版本。

## 6. 会话身份与失效

基础结果 cache key 至少绑定：

```text
dictionaryId
dictionary generation
source type + source schema version + normalized options
feature implementation version
relevant settings digest
engine id + engine version + engine config digest
```

以下只属于查询视图，不触发基础算法重算：

```text
category
runtime search profile and search text
sort
window offset / limit
UI language
```

第一版允许使用现有较宽的 dictionary generation 失效；这可能因无关模块保存多重算一次，但语义安全。只有基准证明必要时才按依赖收窄 generation。算法版本、IPA/形态设置或引擎配置改变必须失效；旧响应不能作为新 generation 的成功结果。

cursor 绑定服务进程 epoch、dictionary generation、result source digest 和 view digest。LRU/TTL 淘汰只导致透明重建；服务重启、generation 或 view 改变时返回可区分的 cursor 失效错误，前端用原 descriptor 请求首窗。

## 7. 缓存与搜索复用

- 基础会话按词典和 descriptor 合并 in-flight 构建，避免同一页面的多个分类重复运行算法。
- 内部可以保存有序 entry ID、分类位集/索引和 detail map；这些都属于可丢弃派生缓存，不进入 HTTP 完整响应或 SQLite 正式数据。
- 缓存必须同时受每词典数量、全局估算字节数、idle TTL 和 LRU 限制；具体默认值由 F4b-1 基准确定。
- 分类切换复用基础会话；搜索、排序与窗口复用 candidate relation，不重新执行 feature adapter。
- 第一版可以在内存中保存候选成员，但不得重新引入前端 ID 求交、分批大型 `IN (...)` 或完整词典 snapshot。
- 单条词条写入后先按 dictionary generation 整体失效；增量更新 session 只有在重建成本成为真实瓶颈后再设计。

## 8. 音系引擎边界

F4b-1 在 feature service 与具体 IPA 生成器之间建立 Promise 兼容的 adapter：

```js
{
  id: "conlexicon-simple-ipa",
  version: "1",
  generate({ lemma, settings }) {
    return {
      value: "...",
      diagnostics: [],
      provenance: {
        engineId: "conlexicon-simple-ipa",
        engineVersion: "1",
        configDigest: "...",
        inputDigest: "..."
      }
    };
  }
}
```

- 当前 adapter 包装现有 `ipa-model.generateIpaFromLemma()`。
- feature service 只依赖 adapter contract，不直接绑定现有规则对象。
- 外部模块可在以后提供新的 adapter；同步或异步实现都不改变 result source 的页面语义。
- 单个词条无法生成时进入 `unavailable`；抛错、超时或无效返回进入 `failed` 并携带稳定诊断 code。两者都不能静默归入 mismatch 或从总数中消失。
- provenance 第一版只随派生结果存在，不写入词条。若以后批量写入自动 IPA，另行定义人工值、生成值、引擎版本和 stale 状态。

## 9. 同步与后台升级条件

F4b-1 默认在请求内同步构建，记录冷/热耗时、扫描词条数、缓存估算字节数和 event-loop delay。使用临时 10k 压力词典，并补充 30k 专项观测。

满足任一条件时才独立复评进程内后台执行：

- 代表性 10k 数据上冷构建 p95 持续超过 500 ms。
- 主线程 event-loop delay 持续超过 100 ms，明显影响同进程保存或查询请求。
- 外部音系引擎只能以长时 Promise、子进程或远程调用形式工作。
- 用户可观察到页面导航或取消后仍必须等待无用计算结束。

升级时只增加进程内 `deferred/running/failed` 状态、取消/去重和轮询或推送；进程重启后由 descriptor 重提。不增加持久化 job 表，除非未来出现必须跨重启完成的明确产品任务。

## 10. 实施阶段

### F4b-0：设计与清点（已完成）

- 清点全部剩余固定 ID 入口和完整快照算法。
- 完成 feature、topology、summary/facet 与 quality 分类。
- 冻结 result source、视图、窗口、失效和音系引擎边界。

### F4b-1：会话核心与 IPA 自动比较（已完成）

- 已实装 descriptor normalization、FeatureResultSessionCache、query/location route。
- query 支持全局 `summary` 响应模式；IPA 自动检查页首次加载不再用 `limit: 1` 建立无用的 match 排序视图和首条 DTO。
- 已建立当前简易 IPA engine adapter；生成循环每 128 项让出事件循环。
- 已迁移三类自动生成比较及循环变体，删除对应前端 ID 数组。
- 已建立定向契约检查；10k/30k 冷热基准由 `scripts/benchmark-feature-result-session.js` 执行。

### F4b-2：IPA 分布

- 独立 `ipaDistribution` source，避免只看音位分布时顺带执行自动生成。
- 迁移音位、首音、尾音和音节数桶；设置摘要覆盖 complex phoneme 和分隔规则。

### F4b-3：形态分析

- 使用 `morphology-model.resolveEntryMorphologyGroups()` 与 `morphologyCellValue()`。
- 按真实多组、多子表和 nested override 定义覆盖、表格使用、生成数与空单元。
- 删除 `app.js` 的 `resolveEntryMorphologyTable()`、旧 `entry.morphology` 和旧 `morphology.tables` 分析适配。

### 并行但不属于 feature session

- 词根家族排行改用稳定 RootTopologyCache 的 summary/window query。
- 正写法统计先冻结 Unicode 语义，再选择轻量 projection 或 summary query。
- Gloss 结果等待阶段 C 的例句/语料链接读取边界，避免为即将删除的 `definition.example` 建长期契约。
- F5 建立独立质量 API，复用内部会话原语并删除剩余质量 ID/issue bridge。

## 11. F4b-1 验收门槛

- 页面未打开时不构建 feature session。
- 首次请求不读取或导出完整词典 snapshot；只读取算法需要的字段。
- 同 source 的不同分类、搜索、排序和窗口不重复执行 IPA 生成。
- HTTP 响应、前端 state 和 action 中没有完整匹配 ID 数组。
- 写入、IPA 设置、引擎版本或配置变化后旧结果失效；无关 UI 语言变化不重算算法。
- LRU/TTL 淘汰后可由 descriptor 透明重建；陈旧 cursor 不读取错误 generation。
- IPA 生成失败具有稳定 code 和可见错误状态，不被算作 match/mismatch。
- 当前三类循环按钮的计数与可用性来自一次 summary，搜索只作用于当前分类窗口。
- summary 请求不接受 view/page，不构建 category/search/sort 视图，也不返回 items/pageInfo。
- Node 契约覆盖 descriptor normalization、cache/in-flight、失效、窗口、搜索、排序、cursor 和 adapter provenance。
- 浏览器检查覆盖 loading/error/retry、分类循环、中英文、浅色/深色及 320–1440px 关键宽度。

当前实现文件：

- `lib/phonology-engine.js`：当前简易模型 adapter。
- `lib/feature-result-query-model.js`：source/view/page 与 location 规范化。
- `lib/feature-result-session-cache.js`：有界 TTL/LRU 和 in-flight 合并。
- `lib/analysis-feature-service.js`：互斥 outcome、summary、视图窗口和 cursor。
- `scripts/check-feature-result-session.js`：规范化、缓存、失效、分类、搜索、窗口、定位与 cursor 契约。

2026-07-24 临时 SQLite 基准中，10k 词条冷构建约 79 ms、热视图约 2 ms；30k 冷构建约 246 ms、热视图约 2 ms，分类切换约 28 ms，带搜索的新视图约 33 ms。当前实现每 128 项让出事件循环，暂不增加 `deferred/running` 轮询状态；更复杂的外部音系引擎接入后须重新测量。

## 12. 明确暂缓

- 自动生成 IPA 的持久化列、派生表和历史版本。
- 通用后台任务框架、持久化 job queue 和跨重启恢复。
- 通用分析 DSL 或任意布尔 feature expression。
- 标签组合的 raw/display/order 语义。
- Gloss 与未来语料单元之间的最终存储和反向引用契约。
- feature session 的增量单词条维护。
