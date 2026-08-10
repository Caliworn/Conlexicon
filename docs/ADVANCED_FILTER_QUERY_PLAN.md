# Advanced Filter Query Plan

本文记录高级筛选查询化的范围、语义边界和实施顺序。它只描述运行期查询与结果集，不改变 SQLite schema，也不承担数据分析或质量检查本身的算法设计。

## 1. F0 结论

当前前端把多数统计入口统一压成：

```js
{
  title,
  entryIds,
  variants,
  issueMap,
  meta
}
```

F0 时，进入高级筛选后前端会以 `entryIds` 扫描当前完整词典快照。该实现曾绕过 `/entries` 查询会话、窗口读取和目标定位；除标签与质量问题外，多数筛选刷新时也只会移除已经不存在的词条 ID。F3 已迁移其中可稳定表达为 SQL 的条件；F4a 又让轻量统计直接返回 descriptor，F4b-1 至 F4b-3 已迁移 IPA 与形态 feature result。当前剩余本地 ID 结果主要属于暂缓的 Gloss 和 F5 quality result，不能继续视为一种会话类型。

F0 清点确认，现有入口必须分成三类：

1. **Entry filter**：稳定、可序列化、可由 repository 查询的词条条件。
2. **Feature result source**：必须运行数据分析、IPA、Gloss、形态或质量算法才能得到的结果集。
3. **Navigation action**：仅跳转页面或定位单条词条，不属于筛选。

不能把第二、三类强行包装成普通 SQL predicate。后续目标是让词条列表消费规范化的 entry filter 或服务端 feature result session，不再由前端长期保存完整匹配 ID 集合。

## 2. 查询边界

筛选条件、搜索、排序和窗口参数必须分开：

```js
{
  filter,
  search: {
    text,
    fields,
    fuzzyFields
  },
  sort,
  page: {
    cursor,
    windowOffset,
    limit
  }
}
```

- `filter` 只回答“哪些词条符合条件”。
- `search` 负责自由文本搜索和命中字段。
- `sort` 和 `page` 只影响结果顺序与窗口；列表响应固定使用摘要 DTO。
- UI 标题、本地化文本、循环按钮位置和问题 tooltip 不属于查询身份。
- 第一版不引入通用递归 `and/or/not` AST。多个稳定条件默认按 AND 组合；标签自身保留 `any/all`。只有出现真实的组合筛选 UI 后，才重新评估逻辑树。

## 3. 已有稳定查询与直接 SQL 条件

| 当前入口 | 当前语义 | 目标 | 备注 |
| --- | --- | --- | --- |
| 自由文本搜索 | `q + fields + fuzzyFields` | 保留为 `search` | 已接 `/entries`、projection、查询会话和定位 API，不属于高级 filter。 |
| 词性、无词性 | 只有当前词典显式配置的词性标签会被识别；配置为空时全部词条均为无词性 | `part` filter | 已并入统一 EntryQuery 和唯一当前筛选状态，不再保留独立 `activePart`。 |
| 单标签 | 词条包含指定原始标签 | `tag` filter | 已有 SQLite `entry_tags` 查询；descriptor 必须保存原始标签，不能保存显示替换，也不应沿用自由文本模糊规范化。 |
| 有/无释义 | 至少一条非空 `definition.meaning` | `presence(definition)` | 可直接查询 `definitions`。 |
| 有/无例句 | 至少一条非空 `definition.example` | `presence(example)` | 当前例句仍存于 definition；未来语料链接升级时由 query 层保持语义。 |
| 有/无备注 | 当前实现只检查词条级 `entry.notes` | `presence(entryNote)` | 不得模糊命名为所有备注；是否扩展到释义/形态备注需另行产品决策。 |
| 有/无来源 | `entry_sources` 至少一条记录 | `presence(source)` | 可直接 SQL 查询。 |
| 有/无 IPA | `entries.pronunciation` 是否非空 | `presence(ipa)` | 可直接 SQL 查询。 |
| 总览“衍生词”卡片 | 当前计数语义为“具有至少一个来源” | 复用 `presence(source)` | 不再维护名称不同但结果相同的独立 ID 列表。 |
| 多来源词条 | 来源数量大于 1 | `sourceCount(min: 2)` | 可按 `entry_sources` 聚合。 |
| 新增日期 | `createdAt` 的 UTC 日期桶 | `activityDay(created)` | 可直接查询，但必须固定现有 UTC `YYYY-MM-DD` 语义。 |
| 编辑日期 | `updatedAt` 的 UTC 日期桶 | `activityDay(updated)` | 同上。 |
| 当前搜索字段命中量 | 当前查询在指定字段至少命中一个独立值的唯一词条数 | 列表字段管理面板直接读取 `searchSummary` | 不再属于数据分析或高级筛选；字段开关和 strict/fuzzy 保持运行期配置，词典级设置只作为新会话默认值。 |

以上结构项目应优先进入统一 EntryQuery，不需要由数据分析页面预先计算完整 ID 数组。搜索字段范围由列表字段管理面板直接调整；命中量随当前 EntrySearch 查询返回。

## 4. 需要投射或语义整理的统计条件

这些入口可以最终成为稳定 filter，但不能在 F1 中直接照搬当前显示标签：

| 当前入口 | 当前算法 | 阻断点 | 暂定归属 |
| --- | --- | --- | --- |
| 标签集合 | 按无序完整原始标签集合聚合；单标签集合表示词条仅有该标签 | 显示替换不参与身份，碰撞只由展示层消歧；无标签作为独立状态而非空集合排行项 | 已接 `tagSetDistribution`；非空集合 action 使用 `tags.mode: "exact"`，有/无标签使用 `presence.tag`，多标签使用 `tagCount.min: 2`。 |
| 词长 | `Array.from(lemma).length` | 保持 Unicode code point 语义 | 已接 `orthographyDistribution` 与普通 `orthography.length` filter。 |
| 首字符 | `Array.from(lemma.trim())[0]` | 共享模型固定 JS trim 与 code point 语义 | 已接 `orthography.initial` filter。 |
| 正写法字符 | 按 Unicode 空白切分后统计非空白 code point | 同时区分出现次数和贡献词条数 | 已接 `orthography.character` filter，筛选结果按唯一词条计算。 |
| 正写法双字符组合 | 只统计同一非空白片段内相邻 code point | 不跨空白形成组合 | 已接 `orthography.bigram` filter；暂不新增持久化 projection。 |
| IPA 音位、首音、尾音 | 依赖 complex phoneme tokenization | 不是普通字符串包含关系 | 适合 IPA projection 或 feature result source。 |
| 音节数 | 依赖当前 IPA 清理和分隔规则 | 规则随 IPA 设置变化，需要明确失效 | 适合 IPA projection 或 feature result source。 |

为这些统计建立 projection 前，必须证明它们会被高频筛选或能显著减少重复计算；不能只因为“可以分表”就新增 SQL 表。

## 5. Feature result source

以下入口需要功能算法，不应由通用 repository SQL filter 隐式重算：

| 当前入口 | 负责模块 | 原因 |
| --- | --- | --- |
| IPA 自动生成一致、宽松不一致、严格不一致 | IPA analysis/service | 依赖当前 IPA 规则生成和两种比较语义。 |
| Glossed 例句 | Gloss/语料 analysis | 需要解析 Gloss 结构；未来还会迁移到语料链接。 |
| 已/未分配形态组 | `morphologyAnalysis` feature result | 按共享 morphology model 解析出的实际模板组判断；F4b-3 前后端与列表窗口均已接线。 |
| 指定形态模板组、自动/手动模式 | `morphologyAnalysis` feature result | 使用模式或模板组 ID descriptor，不保存成员 ID。 |
| 有/无当前生效或未应用的覆写 | `morphologyAnalysis` feature result | 按 nested override 单元格及其所属组是否当前已分配判断；inactive 不表达质量问题。 |
| 质量问题：全部、高、中、低 | QualityService | 需要完整规则报告及问题详情。 |
| 质量模块：词形、标签、IPA、词源、Gloss、其他 | QualityService | 同一词条还需携带一个或多个 issue badge/detail，不能只返回布尔条件。 |

Feature result source 应由对应 service 产生可重建的查询身份，并在服务端会话中保存有序匹配 ID 和必要详情。词条列表只按窗口读取；刷新时重新执行 feature query。它不是把 `entryIds` 从前端机械搬到 API 响应中。

质量结果尤其不能被实现为 repository 看到 `{ type: "quality" }` 后自行扫描完整词典。QualityService 可以消费 repository/query layer，但 repository 不得反向依赖 QualityService。

## 6. 明确不属于筛选的入口

| 当前入口 | 正确行为 |
| --- | --- |
| 词条总数、当前搜索命中 | 返回词条浏览页并保留对应普通查询状态。 |
| 词根家族排行 | 定位相应词根条目；若未来需要“查看该家族”，使用词根组查询和定位 API。 |
| Override 排行 | 定位单条词条。 |
| 数据分析中的词性行 | 使用标准词性 filter，不创建高级筛选结果集。 |
| 标签频率中的词性标签 | 同样使用标准词性 filter。 |

## 7. 当前实现边界

- F3 已让稳定条件保存 filter descriptor，并复用普通 `/entries` 的窗口、查询会话、cursor、定位、排序、SWR 和搜索；这些条件不再经过 `filteredEntries()` 或保存匹配 ID 数组。
- 查询型循环变体保存结构 `filter`、可选 `searchScope` 和初始搜索文本，不再用同一个 `available` 同时表达结构候选与当前搜索命中。前端按词典版本和规范化 filter 缓存 `unknown / available / empty` 结构事实；循环按钮只消费该事实。
- 进入高级筛选、结构事实失效或词条写入后，前端通过批量 `/entries/filter-facts` 自动补齐未知事实。搜索输入只重查当前 `Filter ∩ Search`，不会为其他变体重复 strict/fuzzy 探测。稳定结构筛选和 IPA feature 筛选正常时不显示刷新按钮；当前远程查询失败时才将该按钮作为重试入口，并且不强制重验已有结构事实。
- IPA 自动生成比较、音素单元、首音、尾音、音节数以及形态分配/覆写均已消费 feature result query/location，不再保存前端结果 ID；统计桶以 source/view descriptor 进入词条列表，并继续叠加运行期搜索、排序、窗口与定位。当前仍保留本地问题结果的是暂缓的 Gloss 和 F5 质量检查，不是普通 filter 的兜底。
- 筛选标题使用独立于查询身份的语义化 `titleDescriptor`：固定标题保存主 i18n key，字段值标题保存 label key 及原始值或 value key，循环变体不保存已翻译字符串。语言切换只通过主 i18n 重新渲染标题，不失效列表或 facts 缓存；尚未迁移的本地质量筛选只为带本地化文本的 issue map 定向重建。标签 descriptor 保存原始标签，并使用结构键精确语义。
- 形态“使用情况/覆写”页面已消费 `morphologyAnalysis` 的分配、模式、模板组及 active/inactive override descriptor；旧临时形态视图、生成数、空单元、子表使用排行和固定 ID 结果已经删除。
- “词根/孤立词根”需要与共享词根拓扑保持重复 lemma、未解析来源和递归来源语义一致；在来源 ID 化或关系结果会话落地前，不新增一套仅供高级筛选使用的直接 SQL 判断。

## 8. 后续阶段

### F1：EntryQuery 模型（已完成）

- `lib/entry-query-model.js` 已建立浏览器/Node 可复用、可序列化、可校验和稳定排序的 EntryQuery/EntryFilter 模型。
- 现有 GET 平铺查询参数会先归一化为 `{ filter, search, sort, page }`；repository 不再维护另一份平铺的内部查询语义。
- 查询 descriptor、cursor digest 和缓存键直接使用 `entryQueryIdentity()`，自动排除 `limit/cursor/windowOffset` 等不改变结果身份的字段；无搜索文本时也不再让搜索字段配置制造无效会话分叉。
- `part`、原始精确标签、presence、sourceCount 和 UTC activity day 已进入统一 filter，并具有严格 descriptor 与冲突校验。

### F2：普通筛选接线（已完成）

- repository 已将词性、标签、字段存在性、来源数量和 UTC 活动日期编译为稳定 SQLite 条件。
- `/entries` 查询、窗口读取和 `/entries/:entryId/location` 使用同一个结构化 filter；查询会话、cursor 和定位结果不会再各自解释筛选条件。
- HTTP transport 新增 JSON `filter` 参数，作为 F3 前端状态的正式入口；既有平铺参数继续服务当前普通列表，但不能与结构化 `filter` 混用。
- F2 当时只完成查询模型、transport 和 repository 接线，高级筛选 UI 仍保存完整 ID 数组；标签、覆盖率、多来源、日期和当前搜索字段入口随后已由 F3 迁移到 descriptor。

### F3：前端状态收敛（已完成）

- 高级筛选状态保存结构 descriptor、搜索字段范围、视图级搜索文本、当前循环变体和语义化标题 descriptor，不保存已翻译标题或完整匹配 ID。
- 普通筛选复用现有查询 SWR、窗口化、自动展开和目标定位。
- 移除已迁移筛选的本地完整快照扫描。
- 查询型高级筛选允许继续输入自由文本；数据分析的当前搜索字段入口已经脱离高级筛选，改为更新列表运行期字段/fuzzy profile。
- UTC 日期改为 `[dayStart, nextDayStart)` 范围条件，来源数量上下界只执行一次计数。
- 旧 search-aware probe 已由 filter-only facts 取代；结构事实按 generation 缓存，重复 filter 不再执行 SQL。strict/fuzzy 搜索只由用户实际打开的当前变体查询，并继续复用普通查询会话。

### F4a：轻量分析查询（已完成）

- `POST /api/dictionaries/:id/analysis/query` 已实现 `entryCount`、`lexiconSummary`、`coverageBreakdown`、`partDistribution`、`tagFrequency`、`tagSetDistribution`、`orthographyDistribution`、`activityPreview`、`activityDistribution` 和 `rootFamilyRanking`；请求规范化限制 widget 数量、ID、类型及允许使用 limit 的类型。
- 最小 widget planner 将这些 widgets 合并为 `entryStats`、`partStats`、`tagStats`、`tagSetStats`、`orthographyStats`、`activityStats` 和 `rootTopology`；同一任务只执行一次，筛选 action 返回 EntryFilter descriptor，不返回完整 ID 数组。`tagFrequency` 在聚合层排除显式词性标签。
- F4a 使用同步、按需 API；前端以异步状态加载总览，并提供 loading/error/retry。数据分析页未打开时不请求该端点，也没有引入通用后台任务、进度轮询或持久化 job 表。
- 前端总览、“词汇 > 标签”的完整词性/其他标签/标签集合分布、“正写法”的词长/首字符/字符/双字符分布、“编辑进度”的完整新增/编辑日期，以及词根家族排行均已消费结构化 widget DTO。标签集合使用无序 raw-tag 身份和 exact filter；正写法使用共享模型与普通结构筛选；词根家族直接消费稳定 topology。旧本地 report/analysis slice 已删除。
- repository contract 已覆盖请求规范化、planner 任务合并、widget DTO、筛选 action 和词典写入后的 generation/cacheKey 失效；实现路径直接查询 SQLite 聚合表，不导出完整 snapshot。10k 临时 SQLite 词典中，四个总览 widget 的 5 次定向请求约 56–60 毫秒，响应约 5 KiB。

### F4b：Feature result session

- F4b-0 已完成清点、独立复评和契约冻结，详细设计见 [Feature Result Session Plan](FEATURE_RESULT_SESSION_PLAN.md)。
- 只有必须运行 IPA、Gloss 或形态算法的派生结果进入 feature service；词根家族排行改为直接消费稳定后端拓扑，正写法统计走确定性 summary/facet，质量检查留给独立 F5 API。
- feature service 接受可重建的 result source descriptor，并返回摘要、窗口 DTO 和可选轻量 detail，而不是完整 ID 数组或只能依赖进程内状态解释的裸 `sessionId`。
- 基础会话绑定词典 generation、算法版本、功能相关设置和引擎摘要；分类、搜索、排序和窗口只生成查询视图，不重复运行功能算法。
- F4b-1 已以 IPA 自动生成比较完成试点，经可替换音系引擎 adapter 包装当前简易模型；自动生成 IPA 不持久化。
- F4b-2 已让 IPA 分布/音位分析页异步共享 `ipaDistribution` summary，并把音素、首尾音和音节数高级筛选迁入 feature query/location；旧本地 IPA slice 与固定 ID action 已删除。
- F4b-3 已完成 `morphologyAnalysis` 的统计、feature query、source adapter、repository 最小读取、异步分析页和 source/view 高级筛选接线；旧形态功能结果 ID 已删除。
- 先同步构建并复用运行时会话。只有 10k/30k 基准或可观察交互证明单次计算需要脱离请求生命周期时，才增加进程内后台状态；近期不增加持久化任务队列。

### F5：质量 API 与剩余迁移

- F5-0 已完成，详细契约见 [Quality Result Plan](QUALITY_RESULT_PLAN.md)：冻结 12 类稳定 issue code、严重度/模块、详情参数、issue/entry/global 计数，以及独立 `/quality/query` 和 `/quality/location` 的 source/view/window 形状。
- 简单缺失规则允许复用普通 EntryFilter 或合并 SQL facts，Gloss/重音使用 fact scan，重复词形/近似标签使用 aggregation，来源问题使用稳定 topology；这些只是内部执行原语，质量 code、政策和结果汇总仍由 QualityService 拥有。
- F5-1 实装 `/quality/query` 与 QualityService，只复用 F4b 的内部会话/cache/cursor 原语，不与分析 API 混成一种 endpoint。
- 暂缓的 Gloss 在例句/语料链接边界明确后接入对应 feature service；质量结果只进入独立 QualityService，不让 analysis planner、repository 和质量算法互相反向调用。
- F5-2/F5-3 依次迁移质量页面和词条筛选，删除剩余 `activeFilter.entryIds`、`issueMap` 和本地完整 report 桥接。

## 9. F0 验收结果

- F0 曾覆盖所有本地分析 action 入口；正写法统计迁移后，其词长、首字符、字符和双字符入口已改为结构化 `orthography` filter，不再依赖本地 `entryIds` 聚合 helper。
- 已区分标准词性筛选、普通高级筛选、功能结果集和非筛选导航。
- 标签集合、Unicode 正写法和新形态语义已经冻结并完成接线；备注范围仍保持词条级 `entry.notes` 的显式边界。
- 已确定 F1 不引入 SQLite schema 变更、不引入通用布尔 DSL、不保留新的前端 ID 兜底。

## 10. F1 验收结果

- 平铺 transport 参数与规范化对象会生成相同查询身份，标签、presence 和日期条件按稳定顺序序列化。
- 查询分页大小和窗口位置不进入会话身份；filter、搜索字段、fuzzy 字段或排序变化会改变身份。
- 现有严格、fuzzy、窗口定位与查询会话 repository contract 全部通过；F1 没有修改 SQLite schema 或前端高级筛选状态。

## 11. F2 验收结果

- 结构化 `filter` 可经 URL JSON transport 往返，并拒绝非法 JSON、非对象 payload 以及与旧平铺筛选参数混用的歧义请求。
- 正向和负向字段存在性、来源数量区间、UTC 创建/修改日期和组合标签条件均由 SQLite 契约测试覆盖。
- `/entries` 与 `/entries/:entryId/location` 对同一结构化 filter 返回一致结果；F2 没有修改 SQLite schema，也没有提前加入前端旧状态兼容层。

## 12. F3 验收结果

- 标签、释义/例句/词条备注/来源/IPA 有无、多来源和创建/修改日期入口生成 filter descriptor；当前搜索字段入口生成运行期 profile 动作。分析 slice 不再为这些入口保存匹配 ID 集合。
- 查询型高级筛选直接使用普通词条的 200 条数据窗口、查询会话、cursor、远端定位、SWR、排序与搜索；标签点击提供的目标词条也可在未加载窗口中定位。
- 刷新只使当前 entries/feature 查询及其定位页面的前端缓存失效，保留同词典的其他查询、词根窗口和 facets；结构事实由 filter-only 批量请求独立重新验证。正常搜索、循环和有效的非当前响应会继续沉淀到查询页缓存、结构事实缓存或可重建 feature session。
- 日期契约仍是 UTC `YYYY-MM-DD`，SQLite 实现使用半开范围并可利用创建/修改时间索引；来源数量的最小/最大边界共享一次相关计数。
- repository 契约覆盖结构筛选叠加搜索、远端定位以及 UTC 日末记录；F3 未引入旧状态兼容或新的完整 ID 兜底。

## 13. F4 验收状态

- F4a 与 F4b-0 至 F4b-3 的核心迁移已经完成：轻量 widgets、IPA 自动比较、IPA 分布、形态分配/覆写、正写法、标签集合、完整活动日期和词根家族均已接线。
- 数据分析不再保留本地 analysis slice 或固定匹配 ID；稳定条件进入普通 EntryFilter，功能结果进入可重建 source/view，会话之外的词根排行消费稳定 topology。
- 词典级活跃标签身份快照已由 `/facets` 提供，并由总览、标签详情、标签集合、词条列表/详情、词性菜单和高级筛选标题共同消费；显示替换碰撞不再由各 widget 的局部结果自行推断。
- F4 浏览器验收已完成：覆盖中英文、明暗主题、320/480/768/1024/1440px、长标签、全部分析子页，以及标签集合和词根家族的筛选跳转；未发现横向溢出、卡片重叠、滞留加载状态或控制台错误。
- Gloss 与质量检查不属于未完成的 F4 分析迁移：Gloss 等待例句/语料链接边界，质量检查进入 F5 `/quality/query`。

## 14. 筛选统一化

- 第一阶段的可见外壳已完成：列表控制栏以统一“筛选”按钮打开筛选面板，原词性下拉作为首个可编辑条件移入面板；词性、EntryFilter、feature result 和旧本地质量结果共用同一当前筛选状态栏，不再向用户区分“词性筛选”和“高级筛选”。
- 当前筛选状态栏只显示一个筛选上下文；循环只用于已有变体，刷新只在失败时作为重试，清除使用图标按钮且不恢复进入筛选前的搜索、排序或根模式快照。筛选替换与清除均保留当前搜索，旧本地质量结果在 F5 前临时对已有 ID 集合执行相同前端搜索交集。
- 第一阶段没有伪造跨 source 求交：面板目前只编辑词性，普通 EntryFilter、feature result 与旧质量结果仍整体替换当前筛选。词性已迁入 `EntryFilter.part`，运行期只保留唯一 `activeFilter`；下一步扩展稳定条件草稿，并把该状态明确区分为 entry/feature/legacy-quality 类型。
