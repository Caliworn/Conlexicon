# 查询会话与结果缓存设计

本文设计 Conlexicon 在 SQLite 查询 API 之上的运行时查询会话和结果缓存。它解决重复 projection 扫描、重复词根分组和前端来回切换条件时的重复请求；不替代后续纯滚动数据窗口化，也不成为新的数据真相来源。

## 1. 当前基线

当前已经具备：

- 普通词条和词根模式使用独立 API 查询状态，并以递增 `requestId` 丢弃迟到响应。
- 搜索输入使用 250ms debounce；连续输入会重新计时。
- SQLite 查询使用稳定排序，词条 ID 是最终排序键。
- `/entries` 和 `/root-groups` 返回 `{ items, pageInfo }`，cursor 当前只是编码后的 offset。
- 静态及形态严格/fuzzy 搜索读取 `entry_search_values` / `entry_morphology_search_values`。
- 前端虚拟列表有卡片高度缓存，但这与查询结果缓存无关。

当前缺口：

- 前端只保留当前查询的单槽状态；切换条件后再切回来会重新请求。
- 同一查询同时由多个渲染入口触发时，只有当前状态判断，没有通用的 in-flight Promise 合并层。
- 后端每次 fuzzy 查询都会重新扫描候选 projection；带搜索条件的词根模式还会重新组装完整共享结果。
- 无搜索词根模式虽然读取 SQL projection，但每次请求仍会重新构建全部词根组后再切页。
- facets 前端缓存键仍通过扫描全部词条标签构造，缓存键本身会产生 O(N) 成本。
- offset cursor 不携带查询版本；真正分批加载后，保存发生在两页之间可能混合两个数据版本。

## 2. 目标与非目标

目标：

1. 相同词典版本、相同规范化查询重复执行时复用结果。
2. 为后续纯滚动窗口化提供稳定、不可解析且绑定查询版本的 cursor。
3. 缓存只保存可重建结果；任何保存、导入、覆盖或删除都不会留下可见旧结果。
4. 限制内存、自动淘汰，并可用基准确认命中收益。
5. 保持 `/entries`、`/root-groups` 和未来高级筛选可共享相同会话模型。

非目标：

- 不新增 SQLite cache 表，不把派生查询结果写进词典文件。
- 不缓存完整 dictionary snapshot 或完整词条对象。
- 不引入持久化 revision、保存冲突协议或多进程一致性机制。
- 不用缓存掩盖带搜索 `queryRootGroups()` 的完整 snapshot 慢路径；该路径仍应后续下推。
- 不在本阶段实现纯滚动窗口化、列表 DTO 收窄或词条详情按需读取。

## 3. 三层职责

```text
前端 QueryPageCache
  紧凑查询状态 + in-flight Promise
              ↓ HTTP
后端 QuerySessionCache
  查询身份 + 有序结果身份 + 命中定位
              ↓
SQLite repository
  主数据、projection、排序和页面 DTO 组装
```

### 3.1 前端页面缓存

前端缓存由 API 响应转换出的紧凑查询状态，而不是复制完整 summary DTO：

```js
{
  ids,
  hitsById,
  pageInfo
}
```

它用于：

- 用户从查询 A 切到 B，再切回 A 时立即恢复。
- 同一 key 的重复渲染只共享一个 Promise。
- 词条列表抽屉关闭再打开时不重复请求。

页面缓存 key 包含：

```text
dictionaryId
dictionary.updatedAt
query kind
canonical query descriptor
cursor
limit
include
```

只缓存成功响应；错误和 loading 状态不进入缓存。即使响应因用户已经切换条件而被当前 UI 的 `requestId` 淘汰，只要词典版本和查询 key 仍匹配，结果仍可进入缓存。保存成功后按词典清空；词典切换时可以保留其他词典的小量 LRU 页面，但不能跨 `updatedAt` 命中。

当前单次查询可能返回 10k 条结果，因此第一版前端缓存只保留约 2–4 个查询状态，并按估算字节和 LRU 双重限制。列表 DTO 尚未与完整词典 snapshot 解耦前，不缓存整页 summary 对象。

### 3.2 后端查询会话

后端缓存结果身份，不缓存完整词条：

```js
{
  sessionId,
  dictionaryId,
  dictionaryUpdatedAt,
  cacheGeneration,
  kind,                 // entries | rootGroups
  descriptor,           // 完整规范化查询，用于页面命中回读和重建
  descriptorKey,
  orderedIds,           // entries 查询
  groups,               // rootId + derivedIds + matchedDerivedIds + rootMatches
  total,
  createdAt,
  lastAccessAt,
  estimatedBytes
}
```

词条 fuzzy 会话只需保存排序后的命中词条 ID。`searchHits` 继续按当前页面的 ID 从 projection 读取，避免把所有命中详情长期留在内存。词根会话只保存组身份和匹配标记，页面 DTO 仍从 SQLite 主表组装。session 必须保留完整规范化 descriptor；只有 digest 无法在后续页面中恢复字段、fuzzy 配置和命中定位语义。

### 3.3 SQLite repository

repository 继续负责：

- 规范化查询参数。
- 结构筛选、projection 匹配和稳定排序。
- 由页面 ID 组装 summary/full DTO。
- 所有写入事务成功后通知缓存按词典失效。

缓存 miss 必须与当前无缓存查询产生完全相同的顺序、`total`、`searchHits` 和 DTO。缓存模块不得复制搜索、词性、标签或形态语义。

## 4. 查询身份

会话 key 不直接使用原始 URL，而使用规范化后的 descriptor。数组先去重并稳定排序；默认值显式补齐；不影响结果集合的页面参数排除在会话身份之外。

```js
{
  kind: "entries",
  dictionaryId,
  dictionaryUpdatedAt,
  cacheGeneration,
  q,                    // 使用当前词典 normalizer 处理后的查询
  part,
  tags,                 // 稳定排序
  tagMode,
  source,
  derivedFrom,
  sort,
  fields,               // 稳定排序
  fuzzyFields           // 稳定排序
}
```

以下不进入结果集合身份：

- `cursor`：只是结果中的窗口位置。
- `limit`：只是窗口大小。
- `include`：只决定 summary/full 序列化，不改变匹配与排序。
- UI locale：当前查询返回原始数据和已保存的显示替换，不进行界面文案本地化。

查询 key 的生成应是单一后端函数；不要让 API route、repository 和缓存各自拼字符串。前端可以生成语义相同的页面 key，但不能把它当成服务端权威身份。`cacheGeneration` 是 repository 进程内的失效世代，不写入词典，也不参与业务保存或冲突检查。

## 5. 缓存选择

不是所有查询都值得物化完整有序 ID：

| 查询类型 | 第一版策略 | 原因 |
| --- | --- | --- |
| `/entries` 无搜索结构筛选 | 前端页缓存；后端继续直接 SQL count/page | SQL 已能直接分页，物化全部 ID 可能得不偿失 |
| `/entries` 严格 projection 搜索 | 先用前端页缓存；基准证明重复扫描显著后再纳入会话 | 当前 SQL `EXISTS` + count/page 已较轻 |
| `/entries` fuzzy projection 搜索 | 后端会话优先 | 当前需要扫描候选 records 并形成完整命中集合 |
| `/root-groups` 无搜索 | 后端会话优先 | 当前每次都会构建全部组再切页；但缓存不解决单个超大组携带全部衍生词的问题 |
| `/root-groups` 带搜索 | 后端会话优先，同时保留后续 SQL 下推任务 | 当前完整共享计算成本最高；不能用缓存固化该慢路径 |
| `/facets` | 独立的小型版本化响应缓存 | payload 小，不需要分页会话 |
| 高级筛选 | 等 filter descriptor API 落地后复用 entries 会话 | 不能继续缓存一组前端临时 ID |

## 6. 失效边界

第一版采用保守的词典级失效：

- `saveEntry()`、`deleteEntry()`、`patchEntries()` 成功后清空该词典查询会话。
- settings、IPA、morphology、metadata、docs、corpus 保存成功后也先统一清空；后续只有基准证明必要时才收窄。
- 导入覆盖、完整 snapshot 保存和删除词典必须清空。
- no-op 保存不发生写入，也不触发失效。
- 失败或回滚的事务不得失效一个仍然有效的会话。

服务端为每个词典维护纯运行时 `cacheGeneration`。repository 写入事务成功后先递增 generation，再清除该词典的会话；失败或 no-op 不递增。这样即使两个写入产生相同毫秒的 `updatedAt`，旧 cursor 也不会误用新结果。

`updatedAt` 用于客户端页面 key 和诊断，`cacheGeneration` 只用于当前服务进程内的缓存/cursor 正确性。它不写入 SQLite，不随词典导出，不参与保存冲突判断，也不是词典级业务 revision。

外部进程直接改写 `.sqlite` 不属于当前支持场景；应用重启会自然清空全部运行时会话。

## 7. Cursor 与 API 语义

第一版前端页缓存不要求改变 API。进入真正多页窗口化时，cursor 应从纯 offset 升级为可重建的不透明查询 cursor，至少绑定：

```js
{
  processEpoch,
  cacheGeneration,
  offset,
  descriptorDigest
}
```

客户端不得解析或修改 cursor。缓存只是加速器，不能成为 cursor 正确性的必要状态：

- session 仍在：直接复用。
- session 因 TTL/LRU 被淘汰，但 process epoch、generation 和 descriptor 仍匹配：重新计算同一查询，再从 cursor offset 继续。
- 单项因超过缓存容量而从未缓存：同样允许按 descriptor 重算和继续。

只有以下情况返回结构化 `query_cursor_stale`：

- 服务进程已重启，`processEpoch` 不匹配。
- 词典写入后 `cacheGeneration` 已变化。
- cursor 与当前 descriptor 不匹配。

前端收到该错误时从第一页重新建立查询，并通过现有列表锚点策略恢复到当前词条或尽量接近的位置。窗口化实装前仍可保留当前 cursor 响应形状，避免为尚未消费的协议提前增加复杂度。

## 8. 容量与淘汰

缓存必须同时受以下限制：

- 每词典会话数量上限。
- 全局估算字节上限。
- idle TTL。
- LRU 淘汰。

后端建议初始实验值为每词典 8 个会话、全局约 64 MiB、2 分钟 idle TTL；前端先限制为 2–4 个紧凑查询状态。这些是便于 10k 压测的起始参数，不是 API 语义，最终应由 `estimatedBytes` 和实际命中率调整。缓存不得因一个超大查询突破全局上限；单项超过上限时直接不缓存，但仍正常返回结果。TTL/LRU 只影响性能，不能改变 cursor 的可用性或查询结果。

## 9. 词根模式的额外边界

`/root-groups` 当前的 `limit` 计算词根组数量，但每个组会返回全部 `derivedEntries`。因此即使组级分页完成，一个拥有大量衍生词的组仍可能产生巨大 payload；查询会话无法解决这一点。

在纯滚动窗口化之前，应先把词根模式响应拆为：

- 折叠组：root summary、derived count、匹配状态和必要的预览 ID。
- 展开组：单独按需请求衍生词 summary。
- 超大组：衍生词自身支持 cursor/window。
- “展开全部”：只有相关组和衍生词已完整加载，或后端支持批量窗口请求时才启用。

## 10. 可观测性与测试

开发期至少记录或可读取：

```text
hit / miss / eviction / invalidation
buildMs
session count
estimatedBytes
query kind
```

不记录完整查询正文或词条内容。基准和检查应覆盖：

1. 参数顺序不同但语义相同会命中同一 descriptor。
2. fuzzy 第二次查询不再执行完整候选扫描。
3. 不同词典、字段、fuzzy 设置和排序不会串用结果。
4. 保存成功立即失效；保存失败不失效。
5. TTL、LRU 和容量淘汰只导致重算，不改变查询结果或让有效 cursor 失效。
6. 缓存开启/关闭的页面顺序、总数和命中详情完全一致。
7. 写入、服务重启或 descriptor 不匹配时 stale cursor 返回稳定错误码，不混合两个词典版本。
8. 并发相同请求共享一次构建，失败 Promise 不留在缓存中。
9. 一个组含大量衍生词时，折叠组响应不会携带全部子项。

## 11. 分步实施

### Q1：前端紧凑查询缓存与请求合并（已完成）

- 已新增通用 `QueryPageCache`，entries、root groups 和 facets 会缓存紧凑查询结果；entries 在 Q3 起直接缓存可渲染的 summary DTO，避免再复制完整词条。
- facets 已改用 `dictionary.updatedAt`，不再以 O(N) 方式扫描词条标签生成签名。
- 当前前端上限为 4 项、约 16 MiB；同 key Promise 会合并，成功结果按 LRU/容量淘汰，错误不缓存。
- 现有 `requestId` 继续保护 UI 提交；有效迟到响应可以写入缓存，写入成功、词典覆盖或删除会按词典失效。
- 本阶段没有改变 API 和 cursor。

### Q2：后端会话缓存基础设施（已完成）

- 已新增独立运行时 `QuerySessionCache`，不进入 SQLite schema、词典导出或持久化 revision。
- fuzzy entries 缓存排序后的命中词条 ID；无搜索和搜索 root groups 缓存根/衍生关系 ID。summary/full 页面仍按需从 SQLite 重建。
- descriptor 统一规范化字段、fuzzy 字段、标签和排序，并排除 `cursor`、`limit`、`include`；无查询文本的 root groups 也会忽略无效的字段搜索选项。
- 当前每词典最多 8 个会话、全局约 64 MiB、idle TTL 2 分钟；支持 LRU、超大单项跳过、同 key in-flight 合并和开发期统计。
- repository 的词条、模块、metadata、完整导入/覆盖和词典删除只在成功写入后递增运行时 generation 并按词典失效；空 patch 和失败写入不失效。
- 当前 API 与 offset cursor 未改变；可重建版本化 cursor 留在 Q4。

2026-07-16 使用 10k 形态压力词典、查询 `bdy`、5 次热查询的基准如下。热查询仍包含当前页 SQLite DTO 和 `searchHits` 重建成本：

| 场景 | 冷查询 | 热查询中位数 | 约提升 |
| --- | ---: | ---: | ---: |
| fuzzy entries，返回 1045 条 | 789.18ms | 93.81ms | 8.4× |
| fuzzy entries，100 条窗口 | 192.37ms | 11.51ms | 16.7× |
| 无搜索 root groups，返回 2000/8147 组 | 6180.75ms | 42.09ms | 146.8× |
| fuzzy root groups，返回 1066 组 | 2962.72ms | 26.46ms | 112.0× |

该结果证明会话复用有效，同时暴露两个后续边界：无搜索 root groups 的首次构建仍约 6.2 秒，必须继续下推/优化；大页面 fuzzy entries 的热查询仍约 94ms，主要成本已经转为页面 DTO 和命中详情重建，适合由 Q3/Q4 的小窗口与按需详情继续收窄。

### Q3：列表 DTO、按需详情与词根组边界（已完成）

- 普通列表直接保存并渲染 API summary DTO，不再先压缩成 ID、再通过完整 `dictionary.entries` 映射回词条。summary 的 `definitionPreviews` 保留全部义项的轻量文本与原位置，因此列表的多义项显示和搜索命中序号不需要完整词条。
- 当前词条详情统一通过 `/entries/:entryId` 按需读取；前端使用最多 12 项、约 12 MiB 的小型 LRU，并合并同一词条的并发请求。保存响应会立即更新当前详情缓存，查询 DTO 则局部更新后按 `updatedAt` 失效并重查。
- `/root-groups` 的折叠组只返回 root summary、衍生词数量和匹配数量，不再携带全部衍生词。展开时通过 `/root-groups/:rootId/entries` 读取组内 summary；该子端点与父端点复用同一关系会话，并保留独立 cursor/`hasMore`。
- 普通编辑器列表与详情已切到上述边界；高级筛选、数据分析、质量检查及若干本地关系消费者仍会在 Q5 前使用完整活动词典 snapshot。这是尚未迁移的当前消费者，不是 summary/detail 的运行时兜底。

### Q4：可重建 cursor 与纯滚动窗口化

- cursor 绑定 process epoch、cache generation、descriptor digest 和 offset；增加 `query_cursor_stale`。
- session 被 TTL/LRU 淘汰时重算并继续，不把缓存 miss 转化为错误。
- 前端按窗口拉取、拼接、淘汰远端页面，并保持滚动锚点。
- 此阶段再降低当前临时 `limit=10000`。

### Q5：剩余查询消费者

- 高级筛选改用 filter descriptor 并复用 entries 会话。
- 带搜索 root groups 下推，缓存只负责复用而不承担算法兜底。
- 数据分析和质量检查使用各自按需 API/cache，不复用词条列表页面缓存对象。
