# 词源图与词根拓扑修复计划

状态：计划（2026-09-30），未实装。本计划位于质量检查 F5-1 之前：F5-1 的 `source_cycle` 规则应消费本计划产出的图分解，而不是另写一套 DFS。

## 1. 目标与范围

- 修复词根拓扑在共享祖先（菱形）和循环引用下的错误分组，并使结果与来源顺序、词条遍历顺序无关。
- 把“解析后的来源图 → 强连通分量 → 词根集合”抽成一个无 I/O 的共享模块，供 repository 拓扑、测试基准和 F5-1 共同使用。
- 不改 SQLite schema，不持久化拓扑，不改前端渲染逻辑，不改严格 `rootCount`（无任何 `entry_sources` 行的词条数）。

## 2. 现状（已由当前代码与复现脚本确认）

### 2.1 实现位置

- `lib/sqlite-dictionary-repository.js` 的 `rootTopologyFromDatabase(db)` 读取 `entries` 与 `entry_sources`，把 `target_entry_id` 解析为已存在词条并去重，再用递归 `sourceRootIds(entryId, seen)` 求每个词条的词根，产出 `{ entriesById, groups, groupsByRootId, rootIdsByEntryId, groupsBySort }`，由 `RootTopologyCache` 缓存。
- 消费者：`/root-groups` 查询会话与组内子项、`/root-groups/location`、`/entry-relations/:entryId` 的 `rootGroup`、分析任务 `rootTopology`（`rootFamilyRanking`）。
- `lib/entry-relations-model.js` 的 `sourceRootEntries` / `rootModeGroups` 是同一算法的快照版本。前端不再调用它们（`app.js` 无引用，前端只经由 `quality-model.js` 使用 `buildEntryRelationIndex` / `resolveSourceEntry`）；`rootModeGroups` 目前只作为 `scripts/repository-contract.js` 中 `/root-groups` 一致性检查的期望值。`rootCount`、`relationForEntry` 同样只剩测试或无调用方。

### 2.2 缺陷

`sourceRootIds` 在一次查询的所有分支间共享同一个 `seen` 集合。一个分支访问过的祖先在另一分支中被跳过，导致那条分支“找不到祖先”，于是把中间节点当成词根。循环时同理，且循环成员会出现在以自己为根的组里。

用当前 `rootModeGroups`（与 repository 算法相同）复现，格式为 `[词根, [衍生词]]`：

| 用例 | 来源关系（词条: 来源） | 当前结果 | 问题 |
| --- | --- | --- | --- |
| 菱形 | T: –；L: T；R: T；D: L, R | `R:[D]`、`T:[D,L,R]` | R 不是词根却成组 |
| 菱形（来源顺序互换） | 同上，D: R, L | `L:[D]`、`T:[D,L,R]` | 结果依赖来源顺序 |
| 长菱形 | T: –；A: T；B: A；C: A；D: B, C | `C:[D]`、`T:[A,B,C,D]` | 同上 |
| 双循环 | A: B；B: A | `A:[A]`、`B:[B]` | 组内含词根自身，`derivedCount` 多算 1 |
| 有外部词根的循环 | T: –；A: T, B；B: A | `A:[A]`、`B:[B]`、`T:[A,B]` | A、B 已有词根 T，仍各自成组 |
| 链入循环 | A: B；B: A；X: A | `A:[A]`、`B:[B,X]` | X 只归入 B，取决于遍历顺序 |
| 多词根 | T: –；U: –；A: T, U | `T:[A]`、`U:[A]` | 正确 |
| 未解析来源 | A: 文本来源；B: A | `A:[B]` | 正确（A 作为回退词根） |

补充：递归实现的深度等于来源链长度，超长单链存在栈溢出风险；30k 压测数据链较浅且没有菱形，因此现有检查未暴露问题（该数据下拓扑构建约 110ms）。

## 3. 目标语义

以“词条 → 其已解析来源”为有向边建图：来源必须指向当前词典中存在的词条，同一词条的重复来源只算一条边，未解析的文本来源不构成边。自引用已由保存校验拒绝（`self_source_reference`）。

1. 对图做强连通分量（SCC）分解，得到无环的分量图。
2. 一个分量若没有指向分量外的边（没有外部祖先），则它是**源分量**；源分量的全部成员都是词根：
   - 单个无已解析来源的词条（包括只有未解析文本来源的词条，与当前回退行为一致）是自身的词根；
   - 没有外部祖先的循环中，每个成员都是词根（见第 7 节决策 1）。
3. 非源分量的词根集合是其所有父分量词根集合的并集。
4. 词条 `e` 属于词根 `r` 的组，当且仅当 `r ∈ roots(e)` 且 `r ≠ e`。词根永远不出现在自己的衍生词列表中。
5. 结果只由词条集合和边集合决定，与来源顺序、词条遍历顺序、lemma 和排序字段无关；组内和组间顺序仍由 `rootTopologyGroupsForSort` 按查询排序决定。

按此语义，第 2.2 节用例的期望结果：菱形与长菱形均只有 `T` 组；双循环为 `A:[B]`、`B:[A]`；有外部词根的循环只有 `T:[A,B]`；链入循环为 `A:[B,X]`、`B:[A,X]`；多词根与未解析来源不变。

## 4. 模块设计

新增 `lib/etymology-graph-model.js`（UMD，纯函数，无 I/O），与 `lib/` 其他共享模型一致，前后端都可加载：

```js
buildEtymologyGraph({
  entryIds,     // 全部词条 ID
  sourceIds,    // Map<entryId, string[]>：原始来源目标 ID，模块内负责过滤不存在的目标与去重
}) => {
  rootIdsByEntryId,     // Map<entryId, string[]>：该词条所属的词根（不含自身，除非它本身是词根）
  derivedIdsByRootId,   // Map<rootId, string[]>：未排序
  componentByEntryId,   // Map<entryId, componentIndex>
  components,           // [{ memberIds, parentComponents, cyclic }]，按“祖先先于后代”的拓扑序
}
```

- SCC 使用迭代版 Tarjan，不做递归，避免长链栈溢出。Tarjan 沿“词条 → 来源”方向输出分量时，祖先分量先于后代分量完成，输出顺序可直接用于词根传播。
- 词根传播按拓扑序进行：源分量取成员集合；只有一个父分量的分量直接复用父分量的集合引用，多父分量才新建并集，减少 30k 规模下的内存分配。
- `components` 与 `cyclic` 标记直接供 F5-1 使用，第 6 节说明边界。模块不产出质量 code、witness 路径或本地化文本。

## 5. 消费方迁移

1. **Repository**：`rootTopologyFromDatabase` 保留两条 SQL，把解析和求根交给 `buildEtymologyGraph`，再构建现有的 `groups`、`groupsByRootId`、`rootIdsByEntryId`。拓扑对象形状不变，`RootTopologyCache`、查询会话、location 和关系端点的代码无需改动。
2. **缓存不变量**：新拓扑不依赖 lemma、排序键或位置，`updateEntryRecords` 只同步排序记录的做法继续成立。当前保存路径在 lemma 变化时也使拓扑失效（`topologyChanged` 包含 lemma 比较），这在新语义下已无必要，但属于可选优化，不纳入本计划的必做项。
3. **`entry-relations-model`**：`rootModeGroups` 改为基于 `buildEtymologyGraph` 计算分组，只保留查询、匹配与排序外壳，继续作为 repository-contract 中 API 分页与搜索一致性的期望值。算法正确性不再由它证明（见第 8 节）。确认无调用方后删除 `sourceRootEntries`、`rootCount`、`relationForEntry`，删除前以全仓搜索复核。
4. **API 契约**：更新 `docs/API_CONTRACT.md` 的词根模式与 `rootFamilyRanking` 说明：
   - 写明第 3 节的词根定义；
   - 衍生词不包含词根自身；
   - 无外部祖先的循环中每个成员各自成组；
   - 删除“来源无法解析或形成循环时，词根模式可以为可见性建立回退分组”中含义模糊的表述，改为明确规则。

   `/root-groups` 总数与 `rootCount` 不相等的说明保留：只有未解析来源的词条和源循环成员仍会成组，但不计入严格 `rootCount`。

用户可见变化：含共享祖先或循环的词典中，词根模式的组数和 `derivedCount`、词根家族排行的计数会变化，错误的中间节点组会消失。这属于修复，记入 CHANGELOG 的“修复”。

## 6. 与 F5-1 质量检查的关系

- `source_unresolved` 不依赖本模块，按来源解析结果逐条产生，不受影响。
- `source_cycle` 的现有语义（[质量计划](QUALITY_RESULT_PLAN.md) 4.3 节）：来源链最终进入循环的词条也产生 issue。基于本模块可以写成：词条所在分量是循环分量，或者它的某个祖先分量是循环分量。这个“可达循环”标记沿用第 4 节的拓扑序传播，O(V+E)。
- **witness 路径**：当前前端按来源顺序做逐词条 DFS，取第一次回到路径上的节点作为见证，这依赖具体路径，无法记忆化。F5-1 需要为每个循环分量确定一条规范见证（例如从分量中 ID 最小的成员出发，按来源位置顺序在分量内找第一条闭合路径），词条引用其首个可达循环分量的见证。这会改变部分 `cycleEntryIds` 和 issue `id`；服务端 issue 尚未上线且不持久化，属于可以接受的调整。这一点在 F5-1 开工时于质量计划中确认（第 7 节决策 2）。
- 依赖方向：F5-1 → `etymology-graph-model`，模块不反向依赖质量模型。前端 `quality-model.js` 的 `sourceCycleForEntry` 在 F5-3 替换旧本地质量结果时随之删除，本计划不修改它。

## 7. 待确认决策

1. **无外部祖先的循环如何成组**（推荐：每个成员各自为根）。
   - 推荐方案对称，不需要任意选择代表，且与多词根词条在多个组中出现的现有语义一致；代价是循环后代会在多个组中重复出现。
   - 备选方案：按 ID 选一个稳定代表作为唯一词根。组数更少，但代表的选择对用户没有语言学意义。不能按 lemma 选代表，否则 lemma 改名后拓扑需要重建。
   - 不采用“循环成员不出现在词根模式中”，因为这会让词条从列表里消失。
   - 循环本身是数据错误，由质量检查报告。
2. **F5-1 的 `source_cycle` 见证规范化**：见第 6 节，推荐采用每分量的规范见证。
3. **是否同时取消 lemma 变化导致的拓扑失效**：推荐暂不做，作为独立的小优化。

## 8. 测试与验收

- 新增 `scripts/check-etymology-graph.js`，并注册到 `check-all`：
  - 第 2.2 节全部用例与第 3 节期望结果的固定断言；
  - 顺序无关：同一图随机打乱词条顺序和来源顺序后，结果不变；
  - 暴力基准：在带种子的随机小图（N ≤ 12，覆盖菱形、循环、未解析来源和多词根）上，与“对每个词条做祖先可达性 BFS，再按第 3 节定义求根”的独立实现逐一比对；
  - 深链：5 万节点单链与长循环不溢出，结果正确。
- `scripts/repository-contract.js`：在 `/root-groups` 一致性夹具中加入菱形与循环，并对组成员做显式期望断言，不只和 `rootModeGroups` 比较；`/entry-relations` 的 `rootGroup` 与 `/root-groups/location` 覆盖多词根与循环词条。
- 性能：在同一台机器上，用 30k 压测词典对比改动前后的拓扑构建耗时，目标不慢于当前约 110ms 的量级；另测一个多词根、宽扇出的合成图，记录耗时与内存。
- 回归：`node scripts/check-all.js`、改动文件的 `node --check`、`git diff --check`。本计划不改 UI，不需要浏览器检查。

## 9. 实施顺序

1. **G1**：`etymology-graph-model.js` 与 `check-etymology-graph.js`。
2. **G2**：repository 与 `rootModeGroups` 切换到新模块，补 contract 夹具、性能对比，更新 API 契约和 CHANGELOG。G1 和 G2 可以一次提交。
3. **G3**：删除 `entry-relations-model` 中已无调用方的函数，可并入 G2。
4. 之后进入 F5-1，按第 6 节消费分量结果。
