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

进入高级筛选后，前端以 `entryIds` 扫描当前完整词典快照。该实现绕过 `/entries` 查询会话、窗口读取和目标定位；除标签与质量问题外，多数筛选刷新时也不会重新计算条件，只会移除已经不存在的词条 ID。

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
  },
  include
}
```

- `filter` 只回答“哪些词条符合条件”。
- `search` 负责自由文本搜索和命中字段。
- `sort`、`page`、`include` 只影响结果顺序、窗口和 DTO 形状。
- UI 标题、本地化文本、循环按钮位置和问题 tooltip 不属于查询身份。
- 第一版不引入通用递归 `and/or/not` AST。多个稳定条件默认按 AND 组合；标签自身保留 `any/all`。只有出现真实的组合筛选 UI 后，才重新评估逻辑树。

## 3. 已有稳定查询与直接 SQL 条件

| 当前入口 | 当前语义 | 目标 | 备注 |
| --- | --- | --- | --- |
| 自由文本搜索 | `q + fields + fuzzyFields` | 保留为 `search` | 已接 `/entries`、projection、查询会话和定位 API，不属于高级 filter。 |
| 词性、无词性 | 当前词典设置决定第一个标签或手动配置的词性标签 | `part` filter | 已有 SQLite 查询；应从独立 `activePart` 状态并入统一 EntryQuery。 |
| 单标签 | 词条包含指定原始标签 | `tag` filter | 已有 SQLite `entry_tags` 查询；descriptor 必须保存原始标签，不能保存显示替换，也不应沿用自由文本模糊规范化。 |
| 指定来源 | 词条直接引用指定来源键 | `source` filter | 已有 SQLite 查询。 |
| 从指定词条派生 | 指定词条或 lemma 的直接衍生词 | `derivedFrom` filter | 已有 SQLite 查询和关系拓扑。 |
| 有/无释义 | 至少一条非空 `definition.meaning` | `presence(definition)` | 可直接查询 `definitions`。 |
| 有/无例句 | 至少一条非空 `definition.example` | `presence(example)` | 当前例句仍存于 definition；未来语料链接升级时由 query 层保持语义。 |
| 有/无备注 | 当前实现只检查词条级 `entry.notes` | `presence(entryNote)` | 不得模糊命名为所有备注；是否扩展到释义/形态备注需另行产品决策。 |
| 有/无来源 | `entry_sources` 至少一条记录 | `presence(source)` | 可直接 SQL 查询。 |
| 有/无 IPA | `entries.pronunciation` 是否非空 | `presence(ipa)` | 可直接 SQL 查询。 |
| 全部衍生词 | 当前语义为“具有至少一个来源” | `presence(source)` | 与“从指定词条派生”不同。 |
| 多来源词条 | 来源数量大于 1 | `sourceCount(min: 2)` | 可按 `entry_sources` 聚合。 |
| 新增日期 | `createdAt` 的 UTC 日期桶 | `activityDay(created)` | 可直接查询，但必须固定现有 UTC `YYYY-MM-DD` 语义。 |
| 编辑日期 | `updatedAt` 的 UTC 日期桶 | `activityDay(updated)` | 同上。 |
| 当前搜索命中字段 | 当前查询在指定字段至少命中一次 | 复用 `search.fields=[field]` | 不建立第二套分析筛选算法；严格/fuzzy 语义必须与当前搜索一致。 |

以上项目应优先进入统一 EntryQuery。它们不需要由数据分析页面预先计算完整 ID 数组。

## 4. 需要投射或语义整理的统计条件

这些入口可以最终成为稳定 filter，但不能在 F1 中直接照搬当前显示标签：

| 当前入口 | 当前算法 | 阻断点 | 暂定归属 |
| --- | --- | --- | --- |
| 标签组合 | 按标签原顺序，将显示替换后的文本连接 | 不同原始标签可能映射为相同显示文本；需要明确顺序是否属于组合身份 | 先保留 analysis result source；确定 raw-tag 组合语义后再变为 filter。 |
| 词长 | `Array.from(lemma).length` | 必须保持 Unicode code point 语义 | 可由 SQL/确定性函数或轻量 projection 支持。 |
| 首字母 | `Array.from(lemma.trim())[0]` | JS 与 SQLite 对 Unicode 空白的 trim 语义可能不同 | 先统一共享规范，再下推。 |
| 正写法字符 | 移除所有 JS `\s` 后按 code point 计数 | SQLite 原生表达式不能无损复刻全部空白规则 | 适合轻量统计 projection。 |
| 正写法双字符组合 | 同上，再取相邻 code point | 同上 | 适合轻量统计 projection。 |
| IPA 音位、首音、尾音 | 依赖 complex phoneme tokenization | 不是普通字符串包含关系 | 适合 IPA projection 或 feature result source。 |
| 音节数 | 依赖当前 IPA 清理和分隔规则 | 规则随 IPA 设置变化，需要明确失效 | 适合 IPA projection 或 feature result source。 |

为这些统计建立 projection 前，必须证明它们会被高频筛选或能显著减少重复计算；不能只因为“可以分表”就新增 SQL 表。

## 5. Feature result source

以下入口需要功能算法，不应由通用 repository SQL filter 隐式重算：

| 当前入口 | 负责模块 | 原因 |
| --- | --- | --- |
| IPA 自动生成一致、宽松不一致、严格不一致 | IPA analysis/service | 依赖当前 IPA 规则生成和两种比较语义。 |
| Glossed 例句 | Gloss/语料 analysis | 需要解析 Gloss 结构；未来还会迁移到语料链接。 |
| 有/无形态表格 | Morphology analysis/service | 自动模式需要标签匹配，手动模式需要实例组；当前分析仍依赖临时旧单表视图。 |
| 形态表格使用 | Morphology analysis/service | 多组、多子表语义尚未接入当前分析。 |
| 形态空单元 | Morphology analysis/service | 必须解析实际形态组、override 并运行单元格生成。 |
| 质量问题：全部、高、中、低 | QualityService | 需要完整规则报告及问题详情。 |
| 质量模块：词形、标签、IPA、词源、Gloss、其他 | QualityService | 同一词条还需携带一个或多个 issue badge/detail，不能只返回布尔条件。 |

Feature result source 应由对应 service 产生可重建的查询身份，并在服务端会话中保存有序匹配 ID 和必要详情。词条列表只按窗口读取；刷新时重新执行 feature query。它不是把 `entryIds` 从前端机械搬到 API 响应中。

质量结果尤其不能被实现为 repository 看到 `{ type: "quality" }` 后自行扫描完整词典。QualityService 可以消费 repository/query layer，但 repository 不得反向依赖 QualityService。

## 6. 明确不属于筛选的入口

| 当前入口 | 正确行为 |
| --- | --- |
| 词条总数、当前搜索命中 | 返回词条浏览页并保留对应普通查询状态。 |
| 词根家族排行 | 定位相应词根条目；若未来需要“查看该家族”，使用已有 `derivedFrom` 或词根组查询。 |
| Override 排行 | 定位单条词条。 |
| 最近修改列表 | 定位单条词条。 |
| 数据分析中的词性行 | 使用标准词性 filter，不创建高级筛选结果集。 |
| 标签频率中的词性标签 | 同样使用标准词性 filter。 |

## 7. 当前实现债务

- `advancedFilter.entryIds` 是前端主状态，`filteredEntries()` 因而扫描完整 `dictionary.entries`。
- 只有标签和质量问题带有足够的 `meta` 可以刷新后重建；其他分析筛选刷新时只删除已经不存在的 ID，无法让新符合/已不符合的词条正确进出结果。
- 循环变体保存的是多个完整 ID 数组；大词典会重复占用内存。
- 高级筛选没有进入普通词条查询的 cursor descriptor，因此窗口读取、缓存身份和目标定位不能复用现有正式路径。
- 筛选标题曾承担部分语义恢复和本地化工作；正式 descriptor 必须以结构字段作为身份，标题只能由当前语言动态生成。
- 当前标签高级筛选使用前端文本规范化比较，而 SQLite 结构标签采用原始值精确比较。F1 必须以结构标签精确语义为准，不能保留两套规则。
- 当前形态覆盖率、表格使用和空单元统计依赖临时旧形态视图。相关入口在形态分析升级前只能标记为 feature result source，不能据此固化错误 descriptor。

## 8. 后续阶段

### F1：EntryQuery 模型（已完成）

- `lib/entry-query-model.js` 已建立浏览器/Node 可复用、可序列化、可校验和稳定排序的 EntryQuery/EntryFilter 模型。
- 现有 GET 平铺查询参数会先归一化为 `{ filter, search, sort, include, page }`；repository 不再维护另一份平铺的内部查询语义。
- 查询 descriptor、cursor digest 和缓存键直接使用 `entryQueryIdentity()`，自动排除 `limit/cursor/windowOffset/include` 等不改变结果身份的字段；无搜索文本时也不再让搜索字段配置制造无效会话分叉。
- `part`、原始精确标签、来源文本和既有 `derivedFrom` 已进入统一 filter；presence、sourceCount 和 UTC activity day 已具有严格 descriptor 与冲突校验，但在 F2 SQL 编译前由 repository 明确返回 `entry_filter_not_implemented`，不会静默忽略。
- `derivedFrom` 的模型预留 `{ entryId, reference }`，当前 GET 参数映射到 `reference`；后续来源 ID 化不应把 `source_key` 暴露为正式 descriptor 身份。

### F2：普通筛选接线

- repository 编译安全的稳定条件。
- `/entries` 查询、窗口读取和 `/entries/:entryId/location` 使用同一 filter。
- 迁移标签、覆盖率、衍生词、多来源、日期和当前搜索字段入口。

### F3：前端状态收敛

- 高级筛选状态保存结构 descriptor、当前循环变体和显示元数据，不保存完整匹配 ID。
- 普通筛选复用现有查询 SWR、窗口化、自动展开和目标定位。
- 移除已迁移筛选的本地完整快照扫描。

### F4：Feature result session

- 为数据分析、IPA、Gloss、形态和质量检查定义独立 feature query/service。
- feature service 返回结果会话身份、总数、窗口 DTO 和可选 issue detail，而不是完整 ID 数组。
- 会话绑定词典 generation 和功能相关设置；失效后可重建，不把陈旧结果视为成功。

### F5：分析与质量 API

- `/analysis/query` 的 widget 返回统计值以及 entry filter 或 feature result source。
- `/quality/query` 返回问题摘要、问题详情和 quality result source。
- 删除剩余 `advancedFilter.entryIds`、本地质量结果筛选和分析结果 ID 数组桥接。

## 9. F0 验收结果

- 已覆盖所有 `advancedFilterAction()` 直接调用及 `topEntryMapItems()`、`numericEntryMapItems()`、`numericDateEntryItems()` 生成的间接入口。
- 已区分标准词性筛选、普通高级筛选、功能结果集和非筛选导航。
- 已记录标签组合、备注范围、Unicode 词形统计和新形态语义等不能静默决定的问题。
- 已确定 F1 不引入 SQLite schema 变更、不引入通用布尔 DSL、不保留新的前端 ID 兜底。

## 10. F1 验收结果

- 平铺 transport 参数与规范化对象会生成相同查询身份，标签、presence 和日期条件按稳定顺序序列化。
- 查询分页大小、窗口位置和 summary/full DTO 选择不进入会话身份；filter、搜索字段、fuzzy 字段或排序变化会改变身份。
- 现有严格、fuzzy、窗口定位与查询会话 repository contract 全部通过；F1 没有修改 SQLite schema 或前端高级筛选状态。
