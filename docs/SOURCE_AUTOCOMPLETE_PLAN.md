# 后端来源自动补全设计

设计日期：2026-09-29。状态：设计完成，尚未实装；本文不表示端点已存在或交互已验收。

## 1. 当前事实

- `app.js` 的 `sourceCompletionCandidates()` 在前端完整 `dictionary.entries` 上匹配：fuzzy 关闭时只做前缀匹配，开启时追加包含和 JS `fuzzyScore`，排序后只保留六项；方向键只能在这六项中循环，第七个以后的同形词无法到达。
- 同一次按键中，渲染、方向键和 `selectedSourceCandidate()` 各自重新计算一次候选，每次都重新规范化全部词形。
- 候选只显示词形；`sourceInputLabel()` 仅在本地发现同形词时追加 ID，并为此在每张卡片上扫描全词典。候选没有词性或释义辅助信息。
- `selectedSourceCandidate()` 回退到第一项，Enter 和 Tab 在没有明确选择时也会绑定第一候选；`keydown` 未检查 `event.isComposing`，输入法确认键可能被当作绑定。
- `completeSourceAtCursor()` 已无调用方。
- 后端 `/entries` 搜索已读取 `entry_search_values` projection，查询文本经 `searchSettingsQueryOptions(settings.search).normalizeText` 规范化，fuzzy 由连接级 `conlexicon_fuzzy_match` 复用共享 `normalizedTextMatches`。projection 按 `STATIC_ENTRY_SEARCH_FIELDS` 构建，与用户启用的搜索字段无关，因此每个非空词形都有 `field = 'lemma'` 记录；词条写入和规范化设置变化时由既有机制重建。
- `/entry-relations/:entryId` 的 `sources[]` 已按精确目标 ID 返回 `matchedEntryId`、`matchedLemma` 和 `matchedEntry` summary DTO；summary 已包含发音、标签、词性和释义预览。

## 2. 目标与范围

目标：

1. 补全候选改由后端基于既有 lemma projection 与共享 matcher 生成，使补全与普通列表搜索共用同一规范化与匹配执行位置，消除前端副本造成的语义漂移。
2. 候选不再固定截断为六项：每次最多返回 50 项，超出时提示继续输入以缩小范围。同形词以词性、释义与发音等内容区分，界面不展示 ID。
3. 修正无明确选择时 Enter／Tab 绑定首项及输入法确认误绑定。
4. 来源卡片的同形区分改用目标词条内容，不再依赖全词典扫描，也不再显示 ID。

保留纯文本输入、精确 ID 绑定、去重、自引用校验、创建绑定和现有卡片排序；保存层校验不因候选排除而放松。

非目标：

- 不移除前端完整快照。当前启动仍无条件加载活动词典快照，删除、批处理、质量检查等消费者仍依赖它；本轮只迁移补全与卡片标签两个查找消费者，不以“未加载快照时可工作”作为验收项，该项留待快照整体移除时验收。
- 不新增 schema、索引、FTS 或专用补全表，不修改版本号。
- 不重写词根拓扑，不迁移 F5 质量计算，不做发音／释义匹配。

## 3. 方案复评记录

- **复用 projection，而非另建扫描。** 初稿曾计划在后端扫描轻量 ID／词形记录，以免 projection 改变召回。复评认为与列表搜索保持同一匹配语义本身就是目标，召回差异可以接受；复用后补全与列表在构造上一致，不需要另证等价。
- **严格模式语义随之改变。** 共享 matcher 的严格模式是“包含”，替代现有补全在 fuzzy 关闭时的“仅前缀”。这是产品决策：召回范围的差异不重要，优先保证补全与列表搜索语义一致；排序仍把完全相等与前缀匹配放在最前。
- **补全 fuzzy 开关保持独立。** 继续由 `settings.search.etymologyAutocomplete.fuzzy` 控制，只复用 matcher，不与列表的逐字段 fuzzy 设置合并。
- **不做 cursor、翻页与会话缓存。** 补全结果随每次输入作废，不存在长寿命窗口；固定上限加总数提示即可，由继续输入收窄。初稿中的不透明 cursor、`query_cursor_stale`、上一页／下一页按钮、`QuerySessionCache` descriptor 扩展和候选详情懒加载全部删除。
- **不复用 `/entries` 端点本身。** 普通列表不提供补全排序、草稿排除集合和紧凑消歧 DTO；复用的是其下层 projection、规范化和 matcher，而不是在列表端点上叠加补全特例。
- **以内容而非 ID 消歧。** ID 是系统生成的绑定键，用户无法记忆，显示它只能说明两项不同，不能说明哪一项是所需词义；候选、卡片、tooltip 与无障碍名称均不展示 ID，ID 只用于绑定与保存。现有卡片在同形时追加 ID 的行为随本方案移除。
- **候选复用词条 summary DTO。** 候选直接返回与 `/entry-relations` 中 `matchedEntry` 相同的 summary 结构，新选中的卡片与已存卡片因此共用同一份数据和同一套渲染，tooltip 内容一致，无需在选中后另发详情请求。50 项 summary 的读取与体积成本很小，不为节省字节另立精简 DTO。
- **不引入同形计数或匹配类型字段。** 候选与卡片都已持有 summary，候选冲突在候选集合内比较，卡片冲突在已选卡片内比较，均可在前端完成。曾考虑的 `homographCount` 只服务于“单张卡片、词典中另有同形词”时的内联提示，而该绑定是用户在显示词性与释义的候选中亲自选定的，事后可由 tooltip 查看完整内容，收益不足以抵消两个端点的新增字段与计算口径；`matchKind` 前端没有消费者。二者均不加入，`/entry-relations` 保持不变。
- **候选单行显示。** 两行布局过于笨重；候选每项一行，只在同形冲突时改变显示内容，不改变行高。
- **上限 50 项不做分页。** 超过 50 个匹配只能由继续输入收窄；五十个以上完全同形词不是需要支持的场景。
- **异步 controller 是后端化的必要成本。** 防抖、取消、序号校验和输入法处理保留，不视为过度设计。

## 4. API

`POST /api/dictionaries/:id/source-candidates/query`，只读，不创建词条、不保存草稿、不更新词典时间。使用 POST 以便在请求体传递排除 ID 数组。

请求：

```json
{
  "q": "tala",
  "ownerEntryId": "entry-owner",
  "excludeEntryIds": ["entry-already-selected"],
  "limit": 50
}
```

- `q` 为光标所在分隔项去首尾空白后的文本；规范化后为空时返回空结果，不枚举整部词典。
- `ownerEntryId` 为已存词条 ID，后端排除自身；新建草稿传空字符串。owner 不存在时返回 `entry_not_found`。
- `excludeEntryIds` 来自当前草稿中的引用卡片，只接受字符串数组，按精确 ID 处理；不存在的 ID 忽略，不导致查询失败。
- `limit` 默认 50，范围 1–50。
- 规范化规则、等价规则、词性配置与补全 fuzzy 开关均读取该词典已保存设置，不接受前端传入规则参数。

响应：

```json
{
  "items": [{
    "id": "entry-target",
    "lemma": "tala",
    "pronunciation": "ˈta.la",
    "tags": ["n", "植物"],
    "partOfSpeech": "n",
    "parts": ["n"],
    "definitionPreviews": [
      { "id": "def-1", "position": 0, "meaning": "树" },
      { "id": "def-2", "position": 1, "meaning": "木材，木料" }
    ],
    "createdAt": "2026-09-01T00:00:00.000Z",
    "updatedAt": "2026-09-20T00:00:00.000Z"
  }],
  "total": 37,
  "limit": 50
}
```

- `total` 为排除自身与已选项后的实际匹配数；同形不同 ID 分别计数，不按词形合并。`total > items.length` 时前端提示继续输入。
- 每项即现有词条 summary DTO（与 `/entries` 列表项及 `entry-relations` 的 `matchedEntry` 同构），不附加其他字段；数组顺序即排序结果。`parts` 使用现有 `entryParts` 词性识别规则；summary 字段仅用于显示，不参与匹配。
- 错误使用既有结构化错误包络：`invalid_source_candidate_query`（400，新增）、`dictionary_not_found`／`entry_not_found`（404），请求体超限沿用 `request_body_too_large`。

## 5. 匹配与排序

查询形状：

```sql
SELECT entry_id, raw_value, normalized_value
FROM entry_search_values
WHERE field = 'lemma'
  AND entry_id NOT IN (SELECT value FROM json_each(?))
  AND <match>
```

- `<match>`：补全 fuzzy 开启时为 `conlexicon_fuzzy_match(normalized_value, ?) = 1`；关闭时为 `instr(normalized_value, ?) > 0`，与共享 `normalizedTextMatches` 的严格语义一致。
- 排除集合合并 owner ID 与 `excludeEntryIds`，以 JSON 数组参数传入，不拼接 `IN (...)`。
- SQL 只负责过滤并返回命中行；排序在 JS 中由新增的共享纯函数完成，按元组比较：
  1. 规范化词形完全相等；
  2. 前缀匹配，长度差小者优先；
  3. 包含匹配，出现位置靠前、长度差小者优先；
  4. 其余 fuzzy 匹配，按 `fuzzyScoreNormalized` 降序。

  各层最后按原始词形与精确 ID 稳定排序。匹配阶段对 lemma projection 做一次过滤，排序为 O(M log M)，M 为命中数；单字母等宽泛前缀时 M 接近词典规模，是性能最坏情况。不需要新增 SQL 打分函数。
- 先排除、再排序、最后截取 `limit`，然后仅为截取后的候选复用 `entrySummariesFromRows()` 读取 summary（释义与标签各一次按 `entry_id` 查询）。

## 6. 前端

### 候选列表

- 每项一行：词形、弱化的词性、截断的首条释义，释义超出宽度时以省略号截断。所有候选格式一致；不显示 ID、发音或标签。
- 冲突回退：当前可见候选中若有词形与首条释义均相同的项，这些项改为显示各自第一条不同的释义；仍无差异时显示发音。该判断在前端基于候选 summary 完成，不发额外请求。
- 列表限高可滚动，最多 50 项；`total` 超出时在列表底部显示“共 N 项，继续输入以缩小范围”。
- 加载中、失败可重试、无匹配是不同状态；失败不显示为无匹配，也不回退扫描本地快照。

### Controller 与键盘契约

每个来源输入框使用独立 controller，替代共享的 `sourceSuggestionIndex` 与隐藏计时器，状态包含词典 ID、owner／草稿身份、当前文本项范围、请求序号、AbortController、候选、活动候选 ID 与加载状态。

- 输入防抖约 100ms。本地服务无网络延迟，但 Node 单线程与同步 SQLite 不会因前端取消而中断已开始的扫描，连续快速输入时仍需少量合并。具体值以 30k 词典实测后确定。
- 输入期间保留上一批候选，新结果到达后原位替换，不清空、不闪烁；请求超过 200ms 仍未返回才显示加载状态，与词条详情的延迟遮罩规则一致。
- 保留显示不等于仍可确认：输入内容、光标所在文本项或排除集合一旦变化，立即清除活动候选并将当前列表标记为过期，不等防抖结束或新响应到达。过期列表只作视觉占位，方向键、Enter 与点击均不能确认其中的项；新响应到达并替换后才恢复可选。
- `compositionstart` 至 `compositionend` 期间不发请求，`keydown` 检查 `event.isComposing` 后不拦截确认键。
- 新请求取消旧请求；响应到达时再核对请求序号、词典、草稿身份与当前文本项，过期响应丢弃。以文本项位置区分相同文本的多次出现。
- 首次展示不自动选中任何候选。方向键激活并移动候选，到达两端时停止，不循环。
- Enter 只确认当前明确激活、且所在列表未过期的候选；无活动候选时保留纯文本，并阻止整个表单提交。Tab 恢复正常焦点移动，不绑定候选。Escape 关闭列表但不清空文本，也不取消词条草稿。
- 点击、触屏与键盘确认走同一确认函数；确认前再次核对草稿、文本项与已选集合。
- 输入框采用 combobox／listbox 语义，维护 `aria-expanded`、`aria-controls`、`aria-activedescendant`。
- 弹层关闭、词条切换、完整／局部编辑销毁时取消请求并释放 controller。

### 卡片标签

- 卡片默认只显示词形，保持紧凑。同一来源输入框中有两张以上词形相同的卡片时，这些卡片在词形后内联弱化的区分信息：词性与截断的首条释义（约 12 个字符），无词性时只显示释义，无释义时显示发音。
- 悬停或键盘聚焦卡片时，以应用内 tooltip 显示目标摘要：发音、词性、标签与释义列表；触屏通过现有 tooltip 触发方式查看。卡片的无障碍名称包含词形及同形时的区分信息，不含 ID。
- 已存卡片的区分内容与 tooltip 来自 `/entry-relations/:entryId` 已返回的 `matchedEntry` summary；新选中的卡片直接使用该候选的 summary。两者同构，未保存的新卡片同样能显示完整 tooltip。关系数据加载前已存卡片先只显示词形，到达后补全。本方案不修改 `/entry-relations`。
- 卡片冲突只比较同一来源输入框中当前已选的卡片，不考虑词典中其他未选的同形词条；单张卡片不显示内联区分信息，完整内容通过 tooltip 查看。两张以上同形卡片的词性与首条释义相同时，改用各自第一条不同的释义，仍无差异时显示发音。若全部内容都相同，则确实无法凭现有内容区分，这类词条属于数据层面的潜在重复，可作为后续质量检查规则，不在本方案内处理。
- `sourceInputLabel()` 不再扫描全词典。

### 清理

删除 `sourceCompletionCandidates()`、`selectedSourceCandidate()`、`completeSourceAtCursor()` 与全局 `sourceSuggestionIndex`；键盘操作只消费 controller 的当前候选。

## 7. 实施顺序

1. 共享排序纯函数及单元测试。
2. Repository 查询与 API 端点；更新 `docs/API_CONTRACT.md`。
3. 前端 controller、键盘契约与候选单行渲染及冲突回退。
4. 卡片标签切换到 DTO，删除旧函数。
5. README 快捷键说明更新 Enter／Tab 行为；CHANGELOG 记录。

## 8. 验收

- 同一词典与查询下，补全命中集合与 `/entries` 仅启用 lemma 字段时的命中集合相同（fuzzy 开关分别对应）。
- 候选、卡片、tooltip 与无障碍名称中均不出现 ID；仅当同一输入框有两张以上同形卡片时显示内联区分信息，按词性→释义→发音回退；首条释义冲突时候选（在当前候选集合内比较）与卡片（在当前已选卡片内比较）改用第一条不同的释义。
- 输入后在新响应到达前按 Enter、方向键或点击旧候选，均不会绑定旧候选。
- 未保存的新卡片 tooltip 与保存后刷新得到的内容一致。
- 补全与卡片路径不再调用读取 `dictionary.entries` 的辅助函数（包括 `sourceInputLabel()` 与带 entries 参数的 `sourceReferenceText()`）；以代码检查与针对 controller／卡片渲染的测试确认，不要求构造整体无快照的应用环境。
- 排序元组各层与稳定次序；超过 6 个同形词时全部可选，超过 `limit` 时截断且 `total` 准确；选中任一候选绑定正确 ID。
- 排除 owner、已选卡片、删除卡片后重新出现；新建草稿；owner 不存在；非法请求体与超限。
- 等价规则、NFC、大小写折叠与补全 fuzzy 开关按设置生效。
- 响应乱序、输入中切换文本项、草稿切换／销毁、输入法确认、Esc、Enter 无选择不提交表单、Tab 不绑定、网络失败。
- 保存层继续拒绝自引用与重复目标。
- 临时 30k 词条词典上测量：单次查询延迟、单字母前缀等大量命中的最坏情况，以及模拟连续快速输入时的端到端响应与服务端排队；据此确定防抖值，不以减少召回换取指标。
- 中英文、明暗与各皮肤、长词形／长释义／无词性无释义的同形词、320／480／768／1024／1440px、鼠标／触屏／键盘与弹层层级。
- 所有改动 `.js` 执行 `node --check`，`node scripts/check-all.js` 通过，新测试接入完整入口；`git diff --check`。
