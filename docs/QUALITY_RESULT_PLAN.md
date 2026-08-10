# Quality Result Plan

本文记录质量检查 F5 的领域契约、结果会话和迁移计划。F5-0 已完成规则清点、独立复评和契约冻结；F5-1 以后才接入后端 `QualityService`、HTTP API 和前端远程结果窗口。

## 1. F5-0 结论

质量检查的基本单位是 **issue**，不是布尔筛选条件。简单质量规则可以复用普通 `EntryFilter` 或 SQLite 条件作为执行原语，但规则 code、严重度、模块、详情参数、问题级汇总和规则版本由 `QualityService` 负责，repository 不拥有质量政策。

```text
Repository / DictionaryQueryContext
  提供普通筛选、最小事实、聚合和稳定来源拓扑
        ↓
Quality rule planner
  为每条规则选择 entryFilter / fact scan / aggregation / topology adapter
        ↓
QualityService
  生成 issue、摘要、问题窗口和词条窗口
        ↓
/quality/query 与 /quality/location
```

质量结果保持独立 API，不并入 `/analysis/features/query`；内部复用 generation、TTL/LRU、in-flight 合并、cursor 和 EntrySummary 窗口原语。

## 2. 规则集 v1

`QUALITY_RULESET_VERSION` 固定为 `1`。严重度顺序固定为 `high / medium / low`，模块顺序固定为 `lemma / tags / ipa / network / gloss / other`。

| Code | 严重度 | 模块 | 范围 | 首选执行原语 | 稳定参数 |
| --- | --- | --- | --- | --- | --- |
| `gloss_incomplete` | medium | gloss | entry/definition | Gloss fact scan | `definitionId`、`definitionPosition`、`missingFields` |
| `gloss_alignment_mismatch` | medium | gloss | entry/definition | Gloss fact scan | `definitionId`、`definitionPosition`、`glaCount`、`glbCount` |
| `duplicate_lemma` | high | lemma | entry/cross-entry | lemma aggregation | `lemmas`、`duplicateEntryCount` |
| `near_duplicate_tags` | low | tags | global | tag aggregation | `forms`；会话内部另保存受影响词条集合 |
| `missing_lemma` | high | lemma | entry | presence predicate | 无 |
| `missing_tags` | high | tags | entry | `presence.tag: false` | 无 |
| `missing_definition` | high | other | entry | `presence.definition: false` | 无 |
| `missing_ipa` | low | ipa | entry | `presence.ipa: false` | 无 |
| `multiple_primary_stress` | medium | ipa | entry | IPA fact scan | `primaryStressCount` |
| `tag_too_long` | low | tags | entry/tag | tag fact scan | `tag`、`codePointLength`、`limit` |
| `source_unresolved` | medium | network | entry/source | relation resolution | `sourceText`、`sourcePosition` |
| `source_cycle` | high | network | entry/graph | topology adapter | `cycleEntryIds`、`cycleLemmas` |

“首选执行原语”不是公开 API 身份。F5-1 planner 可以合并多条简单规则为一次中性事实查询；不得为了表面统一而让 repository 接受 `{ type: "quality" }` 并自行生成上述 code。

## 3. Issue 契约

服务端 issue 的规范形状为：

```js
{
  id: "opaque-deterministic-id",
  code: "missing_ipa",
  severity: "low",
  module: "ipa",
  entryId: "entry-1", // 全局问题为空
  params: {}
}
```

- 稳定问题身份由规则集版本、`code / entryId / params` 派生；`severity / module` 由 code 的规则定义决定，本地化 `title / detail` 不参与。
- 当前共享模型在 F5-0 期间继续返回 `title / detail` 以兼容现有前端；远程 API 只返回稳定字段，前端按 code 本地化。
- 同一词条可以产生多个 issue，同一义项、标签或来源也可以分别产生 issue。
- `near_duplicate_tags` 是一个全局 issue，`entryId` 为空；服务端会话内部保存受影响词条集合，使未来的标签模块 `entryCount` 和“查看词条”包含相关词条，但 HTTP 不返回完整 `relatedEntryIds` 数组。
- issue `id` 在 F5-1 由规则集版本、code、entryId 和稳定参数派生并散列；不持久化，也不承诺跨规则集版本相同。

## 4. 已冻结的边界行为

### 4.1 本地化与规范化

UI 语言不属于质量计算身份。中文和英文只改变标题、详情和标签，不改变 issue code、参数、数量或成员。词形、标签和来源匹配使用固定的服务端关系规范化基线，不读取自由文本搜索的 NFC、case folding 或自定义等价设置。

F5-0 已停止由当前前端把 UI locale normalizer 注入质量模型；现有报告仍因本地化文本在语言切换时重建，F5-2 改为 code 本地化后不再重算基础结果。

### 4.2 Gloss

规则集 v1 继续读取当前 `definitions.example` 中的 `\\gla / \\glb / \\glc / \\ft`。它只冻结质量检查语义，不为暂缓的 Gloss 分析筛选或未来例句—语料链接建立长期存储契约。存储模型变化时必须升级输入 adapter 或规则集版本。

### 4.3 来源循环

保持当前行为：如果某个词条的来源链最终进入循环，该词条也产生 `source_cycle`，即 issue 不只属于循环参与者。`cycleEntryIds / cycleLemmas` 只记录实际循环见证，并重复首节点闭合路径。F5-1 应用一次图计算和记忆化传播实现该语义，不保留逐词条重复 DFS 的成本。

### 4.4 近似标签

一个规范化紧凑形式对应多个不同 raw tag 时只产生一个全局 `near_duplicate_tags`。规则参数按稳定遇见顺序保存唯一 `forms`，受影响词条按唯一 ID 计数。当前旧前端仍不把全局问题加入固定 ID 筛选；F5-3 通过远程 entry view 修复问题可见但词条计数为零的不一致。

## 5. Summary 契约

质量摘要必须区分 issue 数与唯一受影响词条数：

```js
{
  inputEntryCount,
  issueCount,
  affectedEntryCount,
  globalIssueCount,
  severities: [
    { key: "high", issueCount, entryCount },
    { key: "medium", issueCount, entryCount },
    { key: "low", issueCount, entryCount }
  ],
  modules: [
    { key: "lemma", issueCount, entryCount },
    { key: "tags", issueCount, entryCount },
    { key: "ipa", issueCount, entryCount },
    { key: "network", issueCount, entryCount },
    { key: "gloss", issueCount, entryCount },
    { key: "other", issueCount, entryCount }
  ]
}
```

- `issueCount` 按 issue 计数，同一词条的多个问题分别计数。
- `entryCount` 在当前分组内按唯一受影响词条计数；全局近似标签问题使用会话内部关联成员。
- `affectedEntryCount` 在所有问题上按唯一词条计数。
- `globalIssueCount` 只统计没有主 `entryId` 的 issue。
- 各 severity/module 的 `issueCount` 分别加总为全局 `issueCount`；`entryCount` 因集合重叠不可加总。

## 6. F5 API 计划契约

F5-1 新增：

```text
POST /api/dictionaries/:id/quality/query
POST /api/dictionaries/:id/quality/location
```

summary 请求：

```js
{
  source: { type: "dictionaryQuality", version: 1, options: {} },
  responseMode: "summary"
}
```

items 请求：

```js
{
  source: { type: "dictionaryQuality", version: 1, options: {} },
  responseMode: "items",
  view: {
    itemKind: "issue" | "entry",
    selector: {
      group: "all" | "severity" | "module",
      value: "high"
    },
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

- `selector.group: "all"` 不接受 value；`severity` 只接受三种严重度；`module` 只接受六种模块。
- `itemKind: "issue"` 使用服务端稳定问题顺序，不接受 EntrySearch 或词条 sort，并可返回全局 issue。
- `itemKind: "entry"` 按唯一受影响词条分页，复用 EntrySearch、sort、EntrySummary 和 location；每个窗口项只附加当前 selector 命中的 issues。
- location 只接受 `itemKind: "entry"`，请求额外携带 `entryId`。
- summary 不接受 view/page，不构建问题或词条窗口。
- HTTP 响应、前端 action 和持久化状态都不携带完整匹配 ID 数组。

## 7. Repository 与会话边界

F5-1 repository 首版只提供：

- `id / lemma / pronunciation`；
- 有序 raw tags；
- `definition id / position / meaning / example`；
- `source text / key / position`；
- 稳定来源解析边和词条排序/搜索窗口能力。

不读取词条备注、词源描述、形态配置、语料、语言文档或完整词典 snapshot。简单 presence 规则可以复用现有 EntryFilter 编译器，或由一次合并事实读取产生相同结果；选择由基准决定，但两条路径必须共享 fixture。

基础会话保存可丢弃的 issues、按词条索引、selector 成员和摘要，绑定 dictionary generation、source、规则集版本及实现版本。首版使用现有较宽 generation 失效；UI 语言、selector、搜索、排序和窗口不进入基础身份。近期不新增 SQLite 派生表、持久化 job 或增量单词条维护。

## 8. 实施阶段

### F5-0：规则与契约冻结（已完成）

- 为 12 个稳定 code、严重度、模块、范围和详情参数建立共享定义。
- 冻结 summary 的 issue/entry/global 计数语义。
- 冻结本地化独立、Gloss v1、来源链进入循环和全局近似标签行为。
- 新增 `scripts/check-quality-model.js`，覆盖全部 code、参数、循环见证、全局关联成员、计数和本地化不改变身份。

### F5-1：QualityService 与 API

- 新增 quality query model、规则 planner、最小 repository 输入、服务端 builder 和 query/location route。
- 复用有界 session/cache/cursor 原语；问题构建循环按批次让出事件循环。
- 建立服务、repository、API 和“不调用完整 snapshot”的定向检查及 10k/30k 基准。

### F5-2：质量页面远程化

- 页面打开时才请求 summary，并提供 loading/error/retry。
- 问题子页消费 issue window，删除 `limit: Infinity`、前端完整 report 和 O(N) cache key。
- 按 code/params 在前端本地化；抽出 Gloss parser 供词条例句继续使用。

### F5-3：词条筛选迁移

- 旧质量 action 改存 source/selector，不保存 `entryIds` 或 `issueMap`。
- 词条列表 query/location 消费 quality entry view，并从当前窗口 DTO 渲染 issue badge。
- 删除质量专用本地筛选、刷新重建和语言切换问题正文桥。

## 9. 验收门槛

- 页面未打开时不建立质量会话；首次请求不调用 snapshot/export 路径。
- 同 source 的 summary、严重度、模块、问题窗口、词条窗口、搜索、排序和 location 只构建一次基础规则结果。
- 中英文得到相同 code、参数、计数和成员；语言切换不失效基础会话。
- 保存成功后旧 generation/cursor 不再作为新结果使用；淘汰后由 source descriptor 透明重建。
- HTTP、前端 state 和 action 中没有完整 ID 数组；问题页与词条页均保持有界窗口。
- 10k 冷构建 p95 持续超过 500 ms 或 event-loop delay 持续超过 100 ms 时，才复评进程内 deferred execution；近期不增加持久化 job。
