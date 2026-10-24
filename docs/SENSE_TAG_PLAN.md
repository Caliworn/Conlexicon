# 义项标签与多词性词条计划

设计日期：2026-10-23。状态：设计草案，已完成独立复评（第 7 节），并按用户 2026-10-23 的四点答复修订；2026-10-24 把形态匹配规则移到 [Morphology Assignment Plan](MORPHOLOGY_ASSIGNMENT_PLAN.md)，本计划只保留"按义项提供匹配上下文"的契约。未实施；第 9 节的决定点须用户确认后才能开工。完成后把仍然有效的契约迁入 `docs/API_CONTRACT.md` 和 [SQLite 后端规范](SQLITE_BACKEND_SPEC.md)，本文删除。

## 1. 背景与目标

一个词可以同时是形容词、名词、代词，各义项分属不同词性，但变化方式相同。现在标签只能挂在词条上，这样的词只能在词条上同时挂 adj、n、pron，看不出哪个义项是哪个词性。

本计划的目标：

1. 义项可以带标签。
2. 词条作为整体时，取词条标签与所有义项标签的并集。
3. 自动形态按义项提供匹配上下文，一个词条可以因不同义项得到不同的形态表；匹配与组合规则由 [Morphology Assignment Plan](MORPHOLOGY_ASSIGNMENT_PLAN.md) 决定。
4. 分析页统计多词性词条：显示多词性词条的数量和各种词性组合，两者都能跳转到对应的词条筛选。

数据原则（2026-10-23 与用户确定）：

- **只向上继承**：义项不继承词条标签。词条标签描述这个词，义项标签描述那个义项；词条整体取两层的并集。
- **词性放哪一层是使用约定，不是数据约束**：多词性词条原则上把词性放到各义项上；单词性词条保持现状，词性挂在词条上。程序不强制、不迁移，也不提示。
- **同形异义词只表示偶然同音**：一个词有多个词性或多套变化表时，仍是一个词条，不拆分。

**不做的事**（用户确定）

- 不做冗余提示：词条和义项上有同一个标签时，不显示、不提示、也不在保存时处理。
- 不迁移存量数据，不提供批量下放工具：单词性词条保持现状是合法的。
- 不设计形态的匹配规则、槽位与组合方式，见 [Morphology Assignment Plan](MORPHOLOGY_ASSIGNMENT_PLAN.md)。

其他范围限定（如不做义项级共现筛选、不做提升 / 下放操作）是代理拟定的，列在第 9 节待确认清单中。

**正文中的代理拟定方案**：第 3–6 节里凡是用户可感知的行为或界面选择，除第 9 节"已确定"列出的以外，都是代理拟定、尚未经用户确认的方案，逐项列在第 9 节的待确认清单中。

## 2. 当前事实

以下内容都对照了基准提交 `b66940e` 的代码。

**存储与读取**

- 标签只存在 `entry_tags(entry_id, position, tag)`，主键 `(entry_id, position)`，索引 `idx_entry_tags_tag_entry(tag, entry_id)`。`definitions` 只有 `meaning / example / notes`。
- 打开数据库时执行 `db.exec(SQLITE_SCHEMA)`，所有表都用 `CREATE TABLE IF NOT EXISTS` 创建。没有 schema 版本或迁移表；开发期 schema 变化后，旧数据库须经 JSON 重新导入。
- 词性没有独立字段：`settings.partOfSpeechTags` 列出的标签就是词性。`tagModel.entryParts()` 返回词条标签中的全部词性，不止第一个。
- `lib/sqlite-dictionary-repository.js` 中读取 `entry_tags` 的位置：
  - `morphologyAnalysisFeatureInput()`、`automaticMorphologyEntryInputs()`：形态；
  - `qualityInputRecords()`：质量检查；
  - `entrySummariesFromRows()`、`entriesFromRows()`：摘要与详情 DTO；
  - `entryTagIdentitySnapshotFromDatabase()`：标签与词性 facet，按 `COUNT(DISTINCT entry_id)` 计数；
  - `entryTagSetStatsFromDatabase()`：标签组合统计；
  - `batchUpdateEntries()`：标签排序批处理；
  - `staticSearchEntriesFromDatabase()`：静态搜索投影重建；
  - 词条查询的 SQL 筛选：词性（含"无词性"）、标签 `any / all / exact` 三种模式、标签存在性、标签数量。

**形态解析的输入**

- 自动形态目前只用词条标签解析：共享模型的 `resolveAutomaticTemplateGroups()`（`lib/morphology-model.js`）读取 `entry.tags`；repository 的 `automaticMorphologyEntryInputs()`、`morphologyAnalysisFeatureInput()` 也只读取 `entry_tags`。
- 匹配规则本身的现状（任一标签相同即匹配、只取最前）与重做方案，见 [Morphology Assignment Plan](MORPHOLOGY_ASSIGNMENT_PLAN.md) 第 2、3 节。

**标签顺序**

- 词条标签按存储顺序显示。`arrangeTagsByOrder()` 只在"整理标签顺序"批处理里使用，按 `settings.tagSortOrder` 重写存储顺序：列在其中的标签按其中的位置排在前面，其余保持原顺序。显示时不做排序。

**搜索投影**

- 标签由 `entrySearchValueRecords()` 生成：`sourceType: "tag"`，`sourcePosition` 为标签位置，`valueType` 为 `raw` 或 `display`。
- `entry_search_values` 的主键是 `(entry_id, field, source_type, source_position, value_type)`，**不含 `source_id`**。

**前端**

- 完整编辑和局部编辑的词条标签都是逗号分隔的文本输入（`#tagsInput`）。
- 详情头部把词条标签分成词性徽章和普通标签芯片。点击芯片时调用 `applyTagFilter(entry, value)`，按标签值筛选；`data-entry-tag-index` 只用作选择器。
- 详情只显示释义、例句或备注非空的义项。
- `allowEmptyTags` 为 false 时，保存要求词条至少有一个标签。

**质量检查**：`missing_tags`（high）只检查词条标签；`near_duplicate_tags`（low）与 `tag_too_long`（low）也只覆盖词条标签。

**分析与筛选**

- 词性分布 widget `partDistribution`（任务 `partStats`）每个词性一行，统计带这个词性的词条数，另有"无词性"一行，并带 `noPartAction` 跳转。多词性词条会在多行里各算一次，页面上看不出有多少词条是多词性的。总览和"词汇 > 标签"页都请求这个 widget。
- 标签组合 widget `tagSetDistribution`（任务 `tagSetStats`，`entryTagSetStatsFromDatabase()`）按完整标签集合分组，行内标签按 `tagSortOrder` 排序，并标出 `isPartOfSpeech`；另有"多标签词条"计数，`multiTagAction` 跳转到 `tagCount: { min: 2 }`。因为按全部标签分组，同样是 adj + n + pron 的词条，会按是否带其他标签分散到不同的行。这个 widget 只由"词汇 > 标签"页请求。
- EntryFilter 的 `part` 只能选一个词性（或"无词性"），没有词性数量或词性集合条件。分析跳转在前端会生成带本地化标题的当前筛选（`analysisQueryFilterAction()` → `entryFilterAction()`）。

## 3. 数据模型

### 3.1 存储

新增一张表，并给搜索投影的主键加上 `source_id`：

```sql
CREATE TABLE IF NOT EXISTS definition_tags (
  definition_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY(definition_id, position),
  FOREIGN KEY(definition_id, entry_id)
    REFERENCES definitions(id, entry_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_definitions_id_entry ON definitions(id, entry_id);
CREATE INDEX IF NOT EXISTS idx_definition_tags_tag_entry ON definition_tags(tag, entry_id);

-- entry_search_values 主键改为：
PRIMARY KEY(entry_id, field, source_type, source_id, source_position, value_type)
```

- 冗余存一份 `entry_id`，让并集查询不用连接 `definitions`，索引形状也和 `idx_entry_tags_tag_entry` 一致。用复合外键保证它和义项的实际归属一致。这一点成立的前提是：义项不会在词条之间移动，当前也没有这种功能。
- 同一义项内的标签去重，保持顺序，规则与词条标签相同（`normalizeTagList`）。
- **这是 schema 变更**：按当前开发期规则，旧数据库须经 JSON 重新导入（用户确定）。不做旧库检测、回填或启动时升级。

### 3.2 有效标签与顺序

词条的**有效标签** = 词条标签 ∪ 各义项标签，顺序这样确定：

1. 先按"首次出现"拼出并集：词条标签（存储顺序），然后按义项顺序、义项内顺序追加未出现过的标签；
2. 再用 `arrangeTagsByOrder(并集, settings.tagSortOrder)` 排序：列在 `tagSortOrder` 中的标签按其中的位置排在前面，其余保持第 1 步的顺序。

- 有效标签只在读取时计算，不存储。两层各自的存储顺序仍由用户编辑和批处理决定，有效标签的顺序只由 `tagSortOrder` 和首次出现决定。这样，标签分散在不同层级时，合并结果仍然符合用户配置的排序。
- `tagSortOrder` 为空时，结果就是第 1 步的首次出现顺序；没有义项标签的词条，有效标签就是它的存储顺序。
- 共享模型新增一个函数，例如 `tagModel.effectiveEntryTags(entry, settings)`，供前后端使用。
- `parts` 与 `partOfSpeech`（主词性）取有效标签中的词性，按有效标签的顺序排列。
- SQL 侧用一段常量查询片段表示有效标签的集合，不建持久化的 VIEW（VIEW 定义变化时，`IF NOT EXISTS` 不会更新它）。SQL 只负责集合与计数，顺序由共享函数在 JavaScript 中计算。
  ```sql
  SELECT entry_id, tag FROM entry_tags
  UNION
  SELECT entry_id, tag FROM definition_tags
  ```
  只判断成员关系时可以用 `UNION ALL`；计数、`exact` 判断和组合统计用 `UNION`。

### 3.3 DTO 与 API

- **详情 DTO**：`tags` 保持为词条标签，含义不变；`definitions[]` 新增 `tags: string[]`。
- **摘要 DTO**：`tags` 保持为词条标签；新增 `effectiveTags`（按 3.2 排序）；`parts` 与 `partOfSpeech` 改为从 `effectiveTags` 计算。这样所有 DTO 里的 `tags` 都是同一个含义。
- **`POST / PUT /entries`**：请求体的 `definitions[].tags` 在 HTTP 边界按标签列表规范化，缺省时为 `[]`。
- **`PATCH /entries`**：对外仍只允许 `pronunciation`、`tags`（词条级）。
- **导入与导出 JSON**：`definitions[].tags` 是可选字段，在 conversion service 边界规范化；旧 JSON 没有这个字段，导入后为空。`lib/legacy-dictionary-migration.js` 不改。
- **搜索命中**：`searchHits` 新增 `sourceType: "definitionTag"`，`sourceId` 为义项 ID，`sourcePosition` 为义项内的标签位置。投影主键已包含 `source_id`，不同义项的同位置标签不会冲突。

## 4. 并集的使用范围

只有需要"整个词"的答案时，才把两层合并：

| 位置 | 规则 |
| --- | --- |
| 词性筛选（含"无词性"） | 按有效标签判断 |
| 标签筛选 `any` | 有效标签中有任一个 |
| 标签筛选 `all` | 有效标签包含全部 |
| 标签筛选 `exact` | 有效标签恰好等于所选集合 |
| 标签存在性、标签数量 | 按有效标签去重后计算 |
| 标签和词性 facet、分析页的词性与标签分布 | 按有效标签，每个词条计一次 |
| 标签组合统计 | 有效标签集合 |
| 词条列表的标签芯片与词性 | 摘要的 `effectiveTags` |
| 详情头部的词性徽章 | 有效标签中的词性 |
| `allowEmptyTags = false` 的保存校验 | 有效标签非空 |
| 质量检查 `missing_tags` | 有效标签为空才报 |
| 多词性计数、词性组合、`partCount` 与 `partSet` 筛选（4.1） | 有效标签中的词性集合 |

自动形态**不**按有效标签整体匹配，而是按义项分别提供上下文，见第 5 节。

**不合并的地方**

- 详情头部的普通标签芯片只显示词条标签；义项的标签显示在各自义项里。
- 编辑器里两层各自编辑，互不影响。

**其他规则**

- `near_duplicate_tags` 与 `tag_too_long` 同时覆盖两层；义项标签产生的 issue 带上 `definitionId`。
- 标签显示映射（`tagDisplayMap`）和红色强调对两层同样生效。
- 标签排序批处理同时整理词条标签和每个义项内的标签顺序（用户确定）。批处理目前通过 `patchEntries()` 写入，而它只接受词条级 `tags`，所以批处理要改为在内部写入义项标签；对外的 `PATCH` 字段白名单不变。

### 4.1 多词性分析

多词性是合法状态，不是质量问题，所以只放在分析页，不加质量规则。下文"词条的词性集合"指有效标签中出现在 `partOfSpeechTags` 里的标签，去重后组成的集合。词性挂在词条上还是义项上，统计结果都一样。

**筛选条件**（EntryFilter 新增两个字段，HTTP 边界校验，错误码沿用 `invalid_entry_filter_*` 命名）

- `partCount: { min, max? }`：词性集合的大小在范围内。形状和校验规则与 `tagCount` 相同。
- `partSet: string[]`：词性集合恰好等于给定集合，至少两个词性。只做"恰好等于"：单个词性已有 `part` 筛选，"包含其中任一 / 全部"目前没有入口需要，不做。给定值中出现不在 `partOfSpeechTags` 里的标签时，结果为空，和 `part` 处理未配置词性的方式一致。
- 两者都可以和其他筛选条件组合，SQL 用 3.2 的有效标签片段，限定在已配置的词性内。

**多词性计数**

- `partStats` 任务新增 `multiPartEntryCount`：词性集合至少有两个词性的词条数。`partDistribution` widget 返回这个计数；请求跳转动作时（与 `noPartAction` 的条件相同）再附 `multiPartAction`，即 `partCount: { min: 2 }`。
- 没有配置词性时计数为 0。
- 词性分布卡片在"无词性"旁显示"多词性词条 N"，可点击跳转。总览卡片是否显示，在阶段 2 的界面验收时决定；数据已经包含在同一个 widget 里，不需要额外请求。

**词性组合**

- 新增 widget `partSetDistribution`，任务 `partSetStats`，接受可选 `limit`（1–50，与其他排行 widget 相同）。只有"词汇 > 标签"页请求它，总览不请求。
- 统计方式：每个词条取词性集合，**只统计至少两个词性的集合**；单个词性的分布已经由 `partDistribution` 给出。行内词性按 `tagSortOrder` 排序，排序方式与 `tagSetDistribution` 行内一致。行按词条数降序，同数时按显示文本排序。
- 返回值：
  ```js
  {
    type: "partSetDistribution",
    partSetCount,          // 不同组合的数量
    multiPartEntryCount,   // 与 partDistribution 中的同名计数相同
    rows: [{
      parts: [{ value, displayLabel, displayAmbiguous }],
      entryCount,
      action?,             // partSet: [...values]
    }],
  }
  ```
- 实现：与 `entryTagSetStatsFromDatabase()` 相同，按词条顺序遍历一次有效标签行，只保留已配置的词性；词性身份（显示名、歧义）复用标签身份快照。
- "词汇 > 标签"页在词性分布卡片后新增"词性组合"卡片，形式与标签组合卡片相同：每行是一组词性芯片加词条数，点击跳转筛选。没有多词性词条时显示空状态。
- 跳转生成的当前筛选标题：多词性写"多词性词条"；组合写"词性组合：adj + n + pron"（显示名用 `tagDisplayMap`，连接符和中英文文案在阶段 2 定）。

## 5. 自动形态：按义项提供匹配上下文

> 本节是代理拟定的方案，2026-10-23 在修订另一处设计时引入，没有作为决定点征求用户意见，现列为待确认的 D3（第 9 节）。另一个选择是只用一个上下文，即有效标签的并集。

本计划只决定**用哪些标签集合去匹配**。匹配规则、槽位、elsewhere 与组合方式由 [Morphology Assignment Plan](MORPHOLOGY_ASSIGNMENT_PLAN.md) 决定，两份计划之间的契约是该计划的 3.4。

**上下文**

1. 每个义项构成一个上下文：词条标签 ∪ 该义项的标签；
2. 词条没有义项时，只有一个上下文：词条标签；
3. 各上下文的解析结果合并去重，按模板顺序排列。

为什么上下文要包含词条标签：变化类这样的词级标签通常挂在词条上，必须参与每个义项的匹配。这只是匹配时用的输入，不改变"义项不继承词条标签"的显示与筛选语义。

| 词条 | 上下文 |
| --- | --- |
| 词条 `[借词]`，三个义项分别标 adj、n、pron | `{借词, adj}`、`{借词, n}`、`{借词, pron}` |
| 词条 `[n]`，两个义项都没有标签 | `{n}`、`{n}`，结果等同于只用词条标签 |
| 没有义项 | 只有词条标签这一个上下文 |

所有义项都没有标签时，每个上下文都等于词条标签，解析结果与"只用词条标签"完全相同。所以**现有数据的形态结果不会因本计划而变化**。

**实现**

- 共享模型新增一个函数，例如 `morphologyModel.morphologyMatchContexts(entry)`，返回上下文列表。形态解析的所有调用方都通过它取上下文：前端预览（包括草稿中的义项标签）、搜索投影、模板保存后计算受影响词条、形态分析输入。
- repository 读取自动模式词条的输入时（`automaticMorphologyEntryInputs()`、`morphologyAnalysisFeatureInput()`），同时读取义项标签。
- **与形态分配计划的先后**：
  - 如果形态分配计划先实施，直接把上下文列表交给它的 `resolveAutomaticTables()`；
  - 如果本计划先实施，就在现行模板组模型上，对每个上下文按现行规则（任一标签相同、只取最前）分别解析，再合并去重。这时多词性词条已经可以因不同义项得到不同的组，只是组合与竞争的能力要等形态分配计划落地。

## 6. 界面

**编辑**

- 完整编辑和局部编辑的义项卡片各加一个义项标签输入框，形式与词条标签相同：逗号分隔的文本，同样支持三种分隔符。
- （待确认，S2）草稿中新增义项时，如果上一个义项有词性标签，预填这些词性。这是看得见、可以改的复制，不是继承。上一个义项没有词性时不预填。
- 局部编辑词条基础区时，`allowEmptyTags` 校验要读取已缓存的义项标签。

**快速录入**（用户 2026-10-24 选定方案 C）

- 现状：字段依次是词形、读音、一个标签输入、若干释义行；标签全部挂在词条上，标签输入会提示本词典上一次快速录入用过的标签。
- 每个释义行附带一个可选的义项标签输入，提交时成为对应义项的标签；词条标签输入保持不变。
- （待确认，S3）义项标签输入默认隐藏，用快捷键或开关显示；具体的快捷键、开关位置，以及是否记住显示状态，待定。
- （待确认，S2）新增释义行时是否预填上一行的词性，与完整编辑器使用同一条规则。
- 键盘流程：`Enter` 与 `Tab` 在义项标签和释义之间如何移动、空释义行的删除规则怎样配合标签输入，在阶段 2 定稿，并按 `AGENTS.md` 检查窄屏和真实输入法组字。

**显示**

- 详情中的义项卡片显示自己的标签：词性用词性徽章样式，其他用描边芯片。只有标签的义项也算可见，不能被"内容为空"的过滤规则隐藏。
- 详情头部的词性徽章来自有效标签。仅来自义项的词性用"推导"样式区分，tooltip 写"来自义项"。
- 点击任何标签芯片仍按标签值调用 `applyTagFilter()`。筛选本来就按有效标签，所以点义项芯片和点头部芯片的结果一致；`applyTagFilter()` 内部判断是否为词性时，也要改用有效标签。
- 词条列表用 `effectiveTags` 渲染芯片与词性副标题。

## 7. 独立复评

按 `AGENTS.md`，把第 3–6 节当作外部提案重新检查。以下是复评结论；凡是推翻或修正初稿的地方，正文已经按结论改写。7.4 与 7.8 记录用户答复后的再次修订，7.9 是后来加入的多词性分析的复评，7.10 记录形态匹配规则的移出。

### 7.1 必要性

- 真正缺少的只有"多词性词条的义项与词性的对应关系"。这样的词条、它的变化表、筛选和统计，现在挂多个词条级词性就都能工作。
- **替代方案一：把词性写进释义文本**，例如"(adj.) ……"。成本为零，但无法筛选、统计或参与形态匹配，也和词典的词性设置脱节。不采纳。
- **替代方案二：义项只加一个"词性"字段，不做通用标签**。看起来范围更窄，但词性本身是由 `partOfSpeechTags` 定义的标签子集，一改设置，字段里的值就可能不再是词性，还得另外设计失效处理。两者的实现成本相近，通用标签反而不需要处理设置变化。不采纳。
- 结论：做通用义项标签，但严格限定在第 1 节的范围内；不做义项级共现筛选，它是让复杂度翻倍的部分。

### 7.2 存储方案

- **初稿考虑过给 `entry_tags` 加一个归属列**（`definition_id` 为空表示词条级），这样很多查询只要加 `DISTINCT` 就是并集。初次复评以"改现有表会让旧数据库失效"为主要理由否决了它；用户确认 schema 变更本来就要重新导入后，这条理由不再成立。
- 仍然采用新表 `definition_tags`，剩下的理由是：
  - 新表可以用外键级联到义项，删除义项时标签自动删除；归属列做不到；
  - 主键含可空列在 SQLite 里语义很弱；
  - 分表后，词条级查询不会被义项标签意外放大，需要并集的地方显式使用并集片段，范围清楚。
- **初稿用持久化 VIEW 表示并集，复评改为常量 SQL 片段**，原因见 3.2。

### 7.3 搜索投影主键

`entry_search_values` 的主键不含 `source_id`。如果义项标签按"义项内位置"作为 `sourcePosition`，两个义项的第 0 个标签就会主键冲突。初次复评为避免改主键，选择了全词条范围的扁平序号；用户确认 schema 变更需要重新导入后，改为把 `source_id` 加进主键，`sourcePosition` 保持"义项内位置"的本义。

### 7.4 冗余显示

初稿提议在编辑器里提示"n 已由义项提供"。用户决定不做冗余提示，第 6 节已删除。两层出现同一个标签时，程序不显示、不提示、不处理。

### 7.5 DTO 含义

初稿打算把摘要 DTO 的 `tags` 直接改成并集。复评改为新增 `effectiveTags`：

- 同一个字段名在摘要和详情里含义不同，容易出错；
- 前端在保存后会从详情实体重算摘要（`updateEntrySummaryDtoAfterSave()`），字段含义一致才不容易写错。

### 7.6 耦合与顺序

- **[Entry Incremental Save Plan](ENTRY_INCREMENTAL_SAVE_PLAN.md)（草案，未实施）**按字段依赖决定重建范围，其中形态的输入是"自动模式下的标签集合"。按第 5 节，形态结果改为依赖"每个义项的上下文"。最简单的生成键是解析出的模板 ID 列表加上 lemma、模式和覆写，而不是标签本身。义项子表的差异比较也要包含义项标签。建议先实施那份计划，再做本计划，并在实施时同步修订那份计划的依赖清单；如果顺序反过来，那份计划在实施时要先吸收本节的变化。
- **[Morphology Assignment Plan](MORPHOLOGY_ASSIGNMENT_PLAN.md)**：只通过它的 3.4 契约连接，两份计划谁先实施都可以（见第 5 节）。
- **第 3 阶段规则引擎**：规则引擎计划的输入约束应当保留"按义项上下文分别分配、结果合并去重"这一层；分配规则本身的约束写在形态分配计划第 7 节。
- facet 和标签组合统计的快照缓存必须在义项标签变化时失效。`saveEntry()` 已调用 `invalidateQuerySessions()`，会同时清除查询会话、筛选事实和标签身份快照。义项标签只要沿用词条保存这条写入路径，就不需要新增失效点。

### 7.7 风险与验收

- **性能**：标签筛选和 facet 从单表查询变成 `UNION`。验收要用 `scripts/generate-stress-dictionary.js` 生成的压力词典，对比改动前后词条查询、facet 和标签组合统计的耗时，并确认 SQLite 查询计划用到了两张表的 `(tag, entry_id)` 索引。
- **一致性**：增加契约测试，断言无论标签放在哪一层，有效标签都会进入筛选、facet、质量检查和静态搜索投影；形态解析拿到的上下文符合第 5 节的表；增量投影与全量重建一致。测试只断言当前契约，不为"旧行为不存在"写墓碑断言。
- **测试夹具**：`n`、`v`、`adj` 只在词性相关的契约里断言具体值。

### 7.8 用户答复后的修订（2026-10-23）

- **"匹配全部模板组"被推翻**：它会破坏现行"有交集即匹配、只取最前"规则下依靠排序实现的特殊优先，改为按义项上下文分别匹配。
- 修订后的规则让现有数据的形态结果完全不变，所以初稿中"先做只读统计、单独确认行为变化"的独立阶段不再需要，形态改动并入阶段 1。
- **有效标签的顺序**：初稿只有"首次出现"顺序。当标签分散在两层时，合并结果可能与 `tagSortOrder` 不符，例如词条 `[古语]` 加义项 `[n]` 得到 `古语, n`，而配置要求词性在前。修订为在首次出现顺序之上再按 `tagSortOrder` 排序（3.2），代价见决定点 D2。

### 7.9 多词性分析（4.1）

- **必要性**：多词性计数给出词性分布各行加总大于词条数的原因，也能列出所有多词性词条，方便按"多词性词条把词性放到义项上"的约定整理。词性组合回答"哪些词性经常共存"，对造语设计有直接价值。两者现在都无法从标签组合里干净地读出来。
- **替代方案：给 `tagSetDistribution` 加"只看词性"参数**。表面上复用最多，但同一个 widget 会返回两种分组口径，计数项（多标签／多词性）、跳转筛选（`tags exact`／`partSet`）和标题都要随参数分叉。不采纳，改为独立的 widget；它的实现结构可以照搬标签组合。
- **跳转筛选不能复用 `tags: { mode: "exact" }`**：它要求词条不含任何额外标签，带"古语"等非词性标签的词条会被漏掉。所以新增只看词性集合的 `partSet`。
- **范围收窄**：`partSet` 只做"恰好等于"；组合行只统计至少两个词性的集合；总览不请求 `partSetDistribution`，不增加总览的查询量。
- **与义项标签的依赖**：4.1 只依赖"有效标签的词性集合"这一条契约。它也可以先于义项标签单独实施，那时按词条标签计数，阶段 1 落地时改用并集片段即可，契约不变。

### 7.10 形态匹配规则移出（2026-10-24）

2026-10-23 的版本曾在本计划中设计模板组的结构化匹配规则（行内"且"、行间"或"、排除、只取最前）。后续讨论发现"只取最前"处理不了叠加的变化表（形容词 = 名词性变化 + 级变化），方案演变为去掉形态组、表格直接匹配、槽位内按 elsewhere 竞争。这已经是形态架构的重做，超出义项标签的范围，所以移到 [Morphology Assignment Plan](MORPHOLOGY_ASSIGNMENT_PLAN.md)，被取代的各方案的理由也记在那份计划的 8.2。本计划只保留第 5 节的上下文契约，因此不依赖分配规则如何实现。

## 8. 分阶段实施

**阶段 1：存储、API、并集查询与形态上下文**

- 内容：
  - `definition_tags` 表与读写、搜索投影主键；
  - 详情和摘要 DTO，HTTP 与导入导出边界；
  - 静态搜索投影，第 4 节表格里的全部 SQL 与 facet，质量规则；
  - 有效标签的共享函数（含排序）；
  - 第 5 节的上下文函数与各调用方，repository 读取义项标签；
  - 标签排序批处理覆盖义项标签；
  - 4.1 的 `partCount`、`partSet` 筛选，`multiPartEntryCount` 与 `partSetDistribution`；
  - 同步更新 `docs/API_CONTRACT.md` 与 [SQLite 后端规范](SQLITE_BACKEND_SPEC.md)。
- 验收：
  - `node scripts/check-all.js`；
  - 7.7 中的一致性契约与压力词典性能对比；
  - 多词性计数、组合行与对应跳转的结果数一致，并且词性挂在词条上或义项上时统计相同；
  - 义项都没有标签时，每个词条的形态解析结果与只用词条标签时相同；
  - 用改动前导出的 JSON 重新导入后，筛选、facet、形态结果和搜索结果与改动前一致。

**阶段 2：界面**

- 内容：第 6 节的编辑（含快速录入）、显示、词性预填（视 S2 的确认结果）；4.1 的"多词性词条"计数入口、"词性组合"卡片和两种跳转筛选的标题。
- 验收：
  - 按 `AGENTS.md` 的 UI 验收清单：中英文、明暗主题、三套皮肤、长标签、320／480／768／1024／1440px、键盘与 tooltip 层级；
  - 完整编辑与局部编辑的离开确认流程不受影响；
  - 只有标签的义项能在详情中显示；
  - 自动模式下因不同义项得到多张形态表时的显示。

## 9. 决定点

**已确定（用户）**

- 义项可以带标签；只向上继承，词条整体取两层的并集（2026-10-23）。
- 多词性词条原则上把词性放到义项上，单词性词条保持现状；程序不强制、不迁移、不提示（2026-10-23）。
- 同形异义词只表示偶然同音（2026-10-23）。
- schema 变更沿用当前规则：旧数据库经 JSON 重新导入（2026-10-23）。
- 标签排序批处理同时负责义项内的标签（2026-10-23）。
- 不做冗余提示（2026-10-23）。
- 分析页加入多词性计数、`partCount` 筛选和词性组合（2026-10-23；细节见 S12）。
- 形态匹配规则与组合方式移到 [Morphology Assignment Plan](MORPHOLOGY_ASSIGNMENT_PLAN.md)（2026-10-24，原 D1）。
- 快速录入采用方案 C：释义行附带可选的义项标签输入（2026-10-24；细节见 S2、S3）。

**待用户确认：决定点**

- **D3**：形态匹配上下文。按义项分别算（每个义项一个上下文：词条标签 ∪ 该义项标签，结果合并去重），还是只用一个上下文（有效标签的并集）？两者只在规则用了"且"或排除、相关标签分别挂在不同义项上时结果不同，例如义项 1 标 `n, 古语`、义项 2 标 `v`，规则 `v, 古语` 在并集下会误匹配。
- **D2**：有效标签按 `tagSortOrder` 排序（3.2）后，凡是配置了 `tagSortOrder`、但还没运行过"整理标签顺序"的词条，列表里的标签和主词性会按配置顺序显示，与以前的存储顺序不同；详情头部的普通标签仍按词条的存储顺序。是否接受？另一个选项是只对带义项标签的词条应用排序：现有显示完全不变，但规则不统一。

**待用户确认：代理拟定的设计选择**（正文已按这些方案书写，确认或修改后再定稿）

- **S2 词性预填**：新增义项（完整编辑、局部编辑）或新增快速录入释义行时，预填上一个义项的词性标签；上一个义项没有词性时不预填。
- **S3 快速录入的显示方式**：义项标签输入默认隐藏，用快捷键或开关显示。
- **S4 详情头部**：词性徽章取有效标签中的词性；仅来自义项的词性用"推导"样式区分，tooltip 写"来自义项"；普通标签芯片只显示词条标签。
- **S5 词条列表**：标签芯片和词性副标题用有效标签，包括义项上的非词性标签。
- **S6 义项卡片**：显示自己的标签，词性用词性徽章样式，其他用描边芯片；只有标签、没有释义等内容的义项也算可见。
- **S7 筛选语义**：标签筛选 `any / all / exact`、标签存在性和标签数量都按有效标签；点击任何标签芯片都按标签值筛选；不做义项级共现筛选。
- **S8 搜索**：在"标签"字段搜索时也搜义项标签，命中定位到义项。
- **S9 保存校验**：`allowEmptyTags` 关闭时，有效标签非空即可，标签只挂在义项上也算满足。
- **S10 质量检查**：`missing_tags` 看有效标签；`near_duplicate_tags`、`tag_too_long` 同时覆盖义项标签。
- **S11 显示映射**：标签显示映射和红色强调对义项标签同样生效。
- **S12 多词性分析细节**：词性组合只统计至少两个词性的组合；`partSet` 只做"恰好等于"；不进质量检查；总览卡片是否显示多词性计数留到界面验收。
- **S13 不做提升 / 下放**：层级调整只靠普通编辑，不提供专门操作。
- **S14 不做义项与形态表的显式关联**：形态表只按标签匹配得出，义项上不能手动指定用哪张表。
