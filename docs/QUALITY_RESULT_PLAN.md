# Quality Result Plan

本文记录质量检查 F5 的领域契约、结果会话和实施记录。F5 已全部完成（F5-0 冻结契约；F5-1 实装后端 `QualityResultService` 与 HTTP API；F5-2／F5-3 于 2026-10-18 让质量页面和质量筛选改为消费该 API，前端不再计算质量结果）。现行 API 契约见 [API Contract](API_CONTRACT.md#quality-result-queryf5-1-已实装)。

## 1. F5-0 结论

质量检查的基本单位是 **issue**，不是布尔筛选条件。简单质量规则可以复用普通 `EntryFilter` 或 SQLite 条件作为执行原语，但规则 code、严重度、模块、详情参数、问题级汇总和规则版本由 `QualityService` 负责，repository 不拥有质量政策。

```text
Repository.qualityInputRecords()
  一次同步读取最小事实：词条、有序标签、义项、有序来源
        ↓
quality-model 规则构建（前后端共用，分批让出事件循环）
  生成 issue；来源循环复用 etymology-graph-model 的强连通分量
        ↓
QualityResultService
  issue 身份、摘要、问题窗口、词条窗口与 location
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

“首选执行原语”是 F5-0 的候选，不是公开 API 身份。F5-1 复评后全部规则改由一次合并的最小事实读取加纯规则模块执行（见第 8 节）；不得为了表面统一而让 repository 接受 `{ type: "quality" }` 并自行生成上述 code。

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
- 服务端只返回稳定字段；前端（`app.js` 的 `qualityIssueText()`）按 code 与 params 生成标题和详情，UI 语言不进入请求。
- 同一词条可以产生多个 issue，同一义项、标签或来源也可以分别产生 issue。
- `near_duplicate_tags` 是一个全局 issue，`entryId` 为空；服务端会话内部保存受影响词条集合，使未来的标签模块 `entryCount` 和“查看词条”包含相关词条，但 HTTP 不返回完整 `relatedEntryIds` 数组。
- issue `id` 在 F5-1 由规则集版本、code、entryId 和稳定参数派生并散列；不持久化，也不承诺跨规则集版本相同。

## 4. 已冻结的边界行为

### 4.1 本地化与规范化

UI 语言不属于质量计算身份。中文和英文只改变标题、详情和标签，不改变 issue code、参数、数量或成员。词形、标签和来源匹配使用固定的服务端关系规范化基线，不读取自由文本搜索的 NFC、case folding 或自定义等价设置。

语言切换只重新渲染已取回的结果，不重新请求、不失效基础会话。

### 4.2 Gloss

规则集 v1 继续读取当前 `definitions.example` 中的 `\\gla / \\glb / \\glc / \\ft`。它只冻结质量检查语义，不为暂缓的 Gloss 分析筛选或未来例句—语料链接建立长期存储契约。存储模型变化时必须升级输入 adapter 或规则集版本。

### 4.3 来源循环

保持当前行为：如果某个词条的来源链最终进入循环，该词条也产生 `source_cycle`，即 issue 不只属于循环参与者。`cycleEntryIds / cycleLemmas` 只记录实际循环见证，并重复首节点闭合路径。

F5-1 起用一次强连通分量计算和记忆化传播实现，O(V+E)：

- 每个循环分量（成员数大于 1；词条不能引用自身）只有一条规范见证：从分量内 ID 最小的成员出发，按来源位置顺序在分量内深度优先，第一条回到起点的边闭合见证。
- 循环分量的成员都引用本分量的见证；其他词条按自身来源位置顺序，取第一个能到达循环的来源所继承的见证。
- 见证只取决于词条集合与来源边，不取决于词条排列顺序。到达同一循环的 issue 共用同一个 params 对象，调用方不得修改。
- 与 F5-0 的逐词条 DFS 相比，部分 `cycleEntryIds` 及其 issue `id` 会变化；服务端 issue 不持久化，属于可接受的调整（[词源图计划](ETYMOLOGY_GRAPH_PLAN.md)第 7 节决策 2）。

### 4.4 近似标签

一个规范化紧凑形式对应多个不同 raw tag 时只产生一个全局 `near_duplicate_tags`。规则参数按稳定遇见顺序保存唯一 `forms`，受影响词条按唯一 ID 计数。F5-3 起词条列表的质量筛选消费远程 entry view，全局近似标签问题的关联词条会出现在列表中并带问题标记，旧前端“问题可见但词条数为零”的不一致已消除。

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

## 6. API 契约

F5-1 已实装 `POST /api/dictionaries/:id/quality/query` 与 `/quality/location`；请求、响应、selector、两种视图、location 与错误码以 [API Contract](API_CONTRACT.md#quality-result-queryf5-1-已实装) 为准，本文不再重复。HTTP 响应、前端 action 和持久化状态都不携带完整匹配 ID 数组。

## 7. Repository 与会话边界

repository 只提供 `qualityInputRecords()` 的最小事实，以及已有的词条排序、搜索窗口和 EntrySummary；空目标 ID 的来源为未绑定文本，运行期不按词形猜测关系。基础会话保存可丢弃的 issues、按词条索引、各视图有序成员和摘要，绑定 dictionary generation、source、规则集版本及实现版本（`QUALITY_IMPLEMENTATION_VERSION`）。首版使用现有较宽 generation 失效；UI 语言、selector、搜索、排序和窗口不进入基础身份。近期不新增 SQLite 派生表、持久化 job 或增量单词条维护。

## 8. 实施阶段

### F5-0：规则与契约冻结（已完成）

- 为 12 个稳定 code、严重度、模块、范围和详情参数建立共享定义。
- 冻结 summary 的 issue/entry/global 计数语义。
- 冻结本地化独立、Gloss v1、来源链进入循环和全局近似标签行为。
- 新增 `scripts/check-quality-model.js`，覆盖全部 code、参数、循环见证、全局关联成员、计数和本地化不改变身份。

### F5-1：QualityService 与 API（已完成，2026-10-18）

实装前按 `AGENTS.md` 对本节原方案做了独立复评，结论：

- **收窄**：不建按规则选择执行原语的 planner。12 条规则都只需同一组最小事实，逐条 SQL 会多次扫描同一批表，planner 抽象没有当前调用方；改为一次合并读取加纯规则模块。
- **单一实现**：规则从 `buildQualityReport` 中抽出为 `buildQualityIssues`／`buildQualityIssuesAsync`，前端现有质量页的本地报告也改由同一模块生成，所以 A11 的指数级循环检测在前端同时消失，两条路径的结果由同一 fixture 断言一致。前端报告在 F5-2 删除。
- **补充**：issue 视图的 item 附带主词条的 EntrySummary（全局问题为 `null`），F5-2 渲染词形时不需要额外请求；全局近似标签问题附加到其关联词条的 entry 视图项上，与 summary 的 `entryCount` 一致。
- **复用**：cursor 编码与校验从 `AnalysisFeatureService` 抽到 `lib/result-window-cursor.js` 共用；会话缓存复用 `FeatureResultSessionCache` 的独立实例。

验收：`scripts/check-quality-model.js` 覆盖规范见证、顺序无关、2000 词条共享祖先（旧算法按斐波那契数增长）、5 万成员长循环和同步／异步结果一致；`scripts/check-quality-result-session.js` 覆盖请求校验、与本地报告一致、不读取 snapshot、summary 不读取查询上下文、各视图共用一次构建、窗口与 cursor、保存后失效与重建、location、HTTP 不含关联 ID 数组和未知词典。

基准（`node scripts/benchmark-quality-result.js`，本机，合成词典：每词条引用两个更早的词条，含少量环、空字段、Gloss 和未解析来源，各 5 次冷构建）：

| 规模 | issue 数 | 冷构建 p50 / p95 | 冷构建期间 event-loop 最大阻塞 | 已建会话上的窗口请求 |
| --- | --- | --- | --- | --- |
| 10k | 3917 | 88 / 114 ms | 68 ms | 9–11 ms |
| 30k | 11744 | 609 / 630 ms | 379 ms | 15–61 ms |

10k 低于第 9 节的复评门槛。30k 的主要阻塞是 `qualityInputRecords()` 的同步读取（稳定状态约 170 ms，紧跟导入或 GC 时更高）：它刻意保持为一个同步块，以读到同一个数据库状态；规则阶段每 256 个词条、索引阶段每 1024 个 issue 让出一次，最长间隔约 20 ms。若真实 30k 词典上该阻塞影响交互，再评估进程内 deferred execution 或缩小读取列。

### F5-2／F5-3：质量页面与词条筛选迁移（已完成，2026-10-18）

实装前复评，结论：

- **合并实施**：原计划把页面（F5-2）和词条筛选（F5-3）分开，但前端只有质量页会产生“固定词条 ID 列表”筛选，删除本地报告而不迁移筛选，“在词条列表查看”就无数据可用。两步一起完成，并删除整条本地 ID 筛选路径（`filteredEntries`、`activeFilterAction`、`issueMap`、刷新重建与语言切换桥），这也消掉了 A14 中“服务端已有能力的本地后备”一项。
- **复用筛选族**：质量筛选不另建一类，而是作为 feature-result 筛选的又一种 source（`resultSource.type: "dictionaryQuality"`，`category` 为 selector 分组 `all / severity / module`，`value` 为分组值），分窗、cursor、定位、计数和变体循环沿用现有实现；只有请求体与端点按 source 类型分支。
- **有界列表**：问题子页每次取 200 条，“再显示 N 项”按 cursor 追加，与标签集合列表一致；不引入虚拟列表。追加时若词典已在别处变化（cursor 过期），从第一页重新取。
- **其余**：Gloss 解析抽到 `lib/gloss-model.js`，前端不再加载 `quality-model.js`（它改为仅服务端的 CommonJS 模块，也不再由静态服务公开）。页面打开时才请求 summary 与问题窗口；同一 key（词典 ID 加 `updatedAt`）只请求一次，失败显示重试按钮，不会在每次重绘时重复请求。

验收：`node scripts/check-all.js` 通过。在临时数据实例（4174）中用 455 条问题的测试词典检查：summary 与各分组计数、按 code 本地化的标题与详情（含循环路径和全局近似标签）、“再显示”从 200 到 400 再到 455 且问题 ID 不重复、切换子页、“在词条列表查看”经质量 entry 窗口加载并显示问题标记（全局问题的两个关联词条均出现）、变体循环、语言切换无新请求且标记与筛选标题随之切换、保存词条后 summary 按新 `updatedAt` 重新请求并反映变化、控制台无错误、320px 宽度无横向溢出。

## 9. 验收门槛

以下门槛均已满足（2026-10-18）；最后一条的 30k 数据见 F5-1 一节。

- 页面未打开时不建立质量会话；首次请求不调用 snapshot/export 路径。
- 同 source 的 summary、严重度、模块、问题窗口、词条窗口、搜索、排序和 location 只构建一次基础规则结果。
- 中英文得到相同 code、参数、计数和成员；语言切换不失效基础会话。
- 保存成功后旧 generation/cursor 不再作为新结果使用；淘汰后由 source descriptor 透明重建。
- HTTP、前端 state 和 action 中没有完整 ID 数组；问题页与词条页均保持有界窗口。
- 10k 冷构建 p95 持续超过 500 ms 或 event-loop delay 持续超过 100 ms 时，才复评进程内 deferred execution；近期不增加持久化 job。
