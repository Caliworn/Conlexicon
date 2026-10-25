# 词条增量持久化与版本条件保存计划（A20＋A05）

设计日期：2026-10-22。状态：设计草案，未实施。实施前须按 `AGENTS.md` 做独立复评；完成后把仍然有效的契约迁入 `docs/API_CONTRACT.md`，本文删除，`docs/AUDIT_OPEN_ISSUES.md` 中的 A20、A05 随之删除。

**2026-10-25 释义标签阶段 1 先于本计划实施**（[Definition Tag Plan](DEFINITION_TAG_PLAN.md) 7.6），下文第 1 节的事实和依赖清单尚未据此修订。实施前须吸收：

- 释义有了标签，存于 `definition_tags`，随释义写入、经外键级联删除；释义子表的差异比较要包含释义标签。
- 自动形态改按有效标签（词条标签 ∪ 释义标签）匹配，所以只改释义标签也可能改变形态结果；形态生成键里的"自动模式下的标签集合"应改为有效标签集合（或按形态分配计划 D6 的上下文），或直接用解析出的模板 ID 列表。
- 搜索投影的 `tags` records 包含释义标签，`entry_search_values` 主键加入了 `source_id`。
- `batchUpdateEntries()` 不再调用 `patchEntries()`，两者共用内部的 `writeEntryEdits()`；整理标签顺序也会改写释义标签。

## 1. 当前事实

以下内容都对照了基准提交 `7cf1ea3` 的代码。

**写入路径**

- 所有词条写入最终都调用 `writeEntryProjection(db, entry, position, dictionary)`（`lib/sqlite-dictionary-repository.js`）。它无条件执行以下步骤：
  1. 删除当前词条的 definitions、tags、sources、形态组和 override，然后全部重新插入；
  2. 用 `INSERT … ON CONFLICT(id) DO UPDATE` 重写主表的全部列，包括来自请求的 `created_at`；
  3. 重建该词条的静态搜索投影（`writeEntrySearchProjection()`）和形态搜索投影（`writeEntryMorphologySearchProjection()`）；
  4. lemma 变化时，执行 `UPDATE entry_sources SET source_text …`，并重建所有引用方的整份静态投影。
- 调用方：
  - `saveEntry()`：服务 `POST /entries`、`PUT /entries/:entryId`、`POST /entries/create-source`；
  - `patchEntries()`：服务 `PATCH /entries`，只允许 `pronunciation`、`tags` 两个字段，但仍把整条词条读出、合并后交给上面的通用写入；
  - `batchUpdateEntries()`：批量生成 IPA、整理标签顺序，内部调用 `patchEntries()`。
- `batchUpdateEntries()` 读取目标行后，`await this.patchEntries()`；而 `patchEntries()` 开头又 `await this.requireDictionary()`。两次读取之间存在让出点，其他请求可以插进来写入。`saveEntry()` 和 `patchEntries()` 自身从最后一个 `await` 到 `COMMIT` 之间都是同步执行的。

**投影依赖**

- 静态搜索投影由 `entrySearchValueRecords(entry, dictionary, { fields: STATIC_ENTRY_SEARCH_FIELDS })` 生成，按 `field` 分组。各字段的来源：
  - `lemma`、`pronunciation`：同名属性；
  - `tags`：标签原值，以及按 `tagDisplayMap` 得到的显示值；
  - `definitions`、`examples`：各条释义的释义文字和例句；
  - `notes`：词条备注、释义备注、形态组备注三者合并；
  - `etymology`：词源描述和来源文本。
- 形态搜索投影由 `morphologySearchValueRecords(entry, dictionary)` 生成。它依赖的词条输入只有：
  - `lemma`；
  - `morphologyMode`；
  - 形态组的 `templateGroupId` 与 `overrides`；
  - 自动模式下的标签**集合**：`resolveAutomaticTemplateGroups()` 先把标签转成 Set，再按模板组顺序取第一个匹配项，因此与标签顺序无关。

  它不依赖 `pronunciation`、释义、备注、形态组的 `title / notes`，也不依赖词源。

**版本与冲突**

- `PUT /entries/:entryId` 不比较客户端的编辑基准，后保存的旧草稿会静默覆盖先保存的修改（A05）。目前只有 `create-source` 的 `sourceBinding.expectedUpdatedAt` 对原词条做了版本检查。
- 前端只有两个 PUT 调用方：
  - `savePartialEdit()`：用缓存的词条详情加上当前分区的表单拼出完整词条；
  - `saveEntry()`：完整编辑。

  两者都把整条词条作为请求体，客户端自带的 `updatedAt` 会被服务端覆盖。前端没有 `PATCH /entries` 的调用方。
- 离开当前编辑时，`closePendingEditsForPageSwitch()` 选择"保存"后，如果保存函数返回 `false`，就中断这次切换。保存失败不会丢失草稿。

## 2. 目标与不做的事

**目标**

1. **A20**：一次词条写入只改动实际变化的主表列和子表，只重建依赖发生变化的投影部分。保存后的 DTO 和搜索结果必须与当前实现完全一致。
2. **A05**：`PUT` 必须携带编辑基准 `expectedUpdatedAt`。服务端发现词条已被别处修改时返回 409，前端保留草稿，由用户决定覆盖还是取消。
3. **顺带修正两个相关的正确性问题**：
   - 更新词条时，`created_at` 保留数据库中的值，不再接受请求覆盖；
   - 批处理的读取和写入放进同一个同步区间，消除中间的让出点。

**不做**

- 子对象级 HTTP 端点、按分区的 PATCH 保存；
- `PATCH /entries` 的版本条件（见 §5.3）；
- C13 的删列、R09–R10 的 schema 调整、R11 的例句链接外键；
- 新建词条时 `createdAt` 的语义。仍按现状接受客户端传入的值。

## 3. A20 设计：单一差异写入器

用一个函数替代 `writeEntryProjection()`：

```
writeEntryChanges(db, previous, next, position, dictionary, options)
```

- `previous`：数据库中的当前词条 DTO。新建时为 `null`。
- `next`：已经规范化、并由服务端补好 `updatedAt` 的目标词条。

所有调用方都改用它。比较逻辑集中在这一个函数里，不为每个 patch 字段各写一条特殊路径。这样 `patchEntries()` 合并后自然只会写到变化的部分。

### 3.1 主表

- **新建**：`INSERT`，与现在相同。
- **更新**：`UPDATE` 只写发生变化的列，再加上必写的 `updated_at`。
  - `sort_key` 随 lemma 一起变化；
  - `created_at` 和 `position` 一律不写。

### 3.2 子表

不同子表按规模和后续需求采用不同粒度。

**definitions：按 ID 比较**

- 先按 `previous` 中的释义 ID 把 `next` 的释义分成三类：
  - 已有，且位置和内容都没变：跳过；
  - 已有，但位置或内容变了：`UPDATE … WHERE id = ? AND entry_id = ?`；
  - 新的 ID：普通 `INSERT`。这样撞上其他词条的释义 ID 时，仍由主键约束拒绝并整体回滚，`API_CONTRACT` 中的现有语义不变。
- `previous` 中有、`next` 中没有的 ID：`DELETE`。
- **不能**用 `INSERT … ON CONFLICT(id) DO UPDATE`。否则 `next` 里如果带着别的词条的释义 ID，会把那条释义改挂到当前词条上。
- 这样做同时满足 R11 的前提：保存时保留未变的释义行，将来给例句链接加外键时不会被级联删除。
- `definitions.updated_at` 在 C13 删除之前，只在插入和更新的行里写入词条的 `updatedAt`。

**tags、sources、形态组与 override：整组比较**

- 这几类每条词条通常只有几项。整组按顺序比较规范化后的值，相同就跳过，不同才整组删除后重新插入。按行比较带来的复杂度不值得。
- 形态组比较的是 `normalizeEntryMorphologyState()` 的结果，排除 `createdAt / updatedAt`。形态组没变时整组不写，原有时间戳也就保留下来。
- sources 先按现在的规则，用目标词条的当前 lemma 重新计算来源文本，再做比较。

### 3.3 静态搜索投影：按字段比较

- 对 `previous` 和 `next` 各生成一次静态 records。这部分不涉及形态生成，开销很小。
- 按 `field` 分组比较，只对内容不同的字段执行：
  ```
  DELETE … WHERE entry_id = ? AND field = ?
  ```
  然后插入该字段的新 records。
- 字段和词条属性的依赖关系仍然只由 `entrySearchValueRecords()` 决定，仓库层不另外维护一张"属性 → 字段"对照表。
- 新建词条时，直接写入全部 records。

### 3.4 形态搜索投影：按生成键判断

- 在 `lib/morphology-model.js` 中新增并导出 `entryMorphologyGenerationKey(entry)`，与 `resolveEntryMorphologyGroups()` 放在一起维护。生成键包含：
  - `lemma`；
  - `morphologyMode`；
  - 有序的 `[templateGroupId, overrides]`；
  - 仅自动模式下：与 `resolveAutomaticTemplateGroups()` 使用同一规范化方式得到的排序后标签集合。
- 两边生成键相同时跳过形态生成。这样单改 `pronunciation`、释义、备注、词源或调整标签顺序时，都不会重新生成词形。
- 风险：生成键漏掉某个依赖时，投影会**静默过期**。缓解措施见 §6 的一致性验收：每轮编辑后，把增量结果与全量重建结果逐行比较。

### 3.5 lemma 改名时的关联更新

- `UPDATE entry_sources SET source_text …` 保留。这是 A20 明确不能取消的必要工作。
- 引用方的静态投影只重建 `etymology` 字段，不再整份重建。

### 3.6 调用方调整

- **`saveEntry()`**：在写入前读取完整的 `previous`。这会增加少量读取，但比原来无条件的删除、插入和形态生成便宜得多。topology 失效判断保持现状：sources 变化时整体失效，否则只刷新该词条的记录。
- **`patchEntries()`**：
  - 拆成两部分：异步外壳负责 `requireDictionary`；同步内核负责读取、合并、比较和写入。
  - 如果本次附带的 settings 会触发全量投影重建，就跳过同一类投影的逐条写入，避免重复工作。
- **`batchUpdateEntries()`**：在一次 `requireDictionary` 之后，读取目标行和调用同步内核放在同一同步区间内完成，中间不再有让出点。
- **`create-source` 的原词条更新**：同样用 `writeEntryChanges()`。它的 `previous` 就是绑定检查时已经读出的 `owner`。

## 4. A05 设计：基于 `updatedAt` 的条件保存

### 4.1 版本标识

- 直接使用词条现有的 `updated_at`。它由服务端在每次接受写入时生成，是毫秒精度的 ISO 字符串。这与 `API_DRAFTS.md` §5"基于目标对象 `updatedAt` 做轻量乐观锁"的方向一致，不引入 revision 列，也不改 schema。
- 旧数据中 `updated_at` 可能为空串。空串也是合法的基准值，按字符串严格相等比较。
- 毫秒碰撞不会造成漏检：对方的写入一定发生在本方读取基准之后，生成的时间必然不同于基准。

### 4.2 服务端

**repository**

- `saveEntry()` 增加可选项 `expectedUpdatedAt`。
- 比较必须放在最后一个 `await` 之后、`BEGIN IMMEDIATE` 之前的同步区间里，这样比较和写入之间不会插入其他请求。
- 不一致时抛出：
  ```
  409 entry_version_conflict
  details: { entryId, currentUpdatedAt }
  ```
- 内部调用和测试可以省略这个选项。

**HTTP**

- `PUT /entries/:entryId` 的请求体改为 `{ entry, expectedUpdatedAt }`。
- `expectedUpdatedAt` 缺失或不是字符串时，返回 400 `invalid_entry_payload`。
- 不再接受裸 entry 作为请求体。
- 原因：前端是唯一调用方，强制要求这个字段，才不会留下一条不受保护的写入路径。

**不变的部分**

- `POST /entries` 不需要版本条件。
- `create-source` 沿用 `sourceBinding.expectedUpdatedAt`。
- 被别处删除的词条仍返回 404 `entry_not_found`。
- 来源文本由服务端按目标词条的当前 lemma 重新计算，所以对方改名不会让本方保存出错，也不需要因此判为冲突。

### 4.3 前端

**记录基准**

- 进入编辑时记录基准，而不是在保存时读取缓存。原因：编辑期间词条详情缓存可能被刷新，那时再读就会把基准悄悄推进。
  - `openPartialEdit()` 记录 `entry.updatedAt`；
  - `beginEditEntry()` 记录 `selectedEntry().updatedAt`。完整编辑已有词条时 `entryDraft` 为 `null`，`saveEntry()` 在保存时才读取 `selectedEntry()`，所以基准必须在入口处另外保存。
- 保存成功后，用响应中的 `entry.updatedAt` 更新基准。

**请求体**

- `savePartialEdit()` 和 `saveEntry()` 发送 `{ entry, expectedUpdatedAt }`。
- 新建词条的请求体不变。

**冲突处理**

- 收到 `entry_version_conflict` 后，保留编辑状态和草稿，弹出应用内确认框（复用 `appConfirm()`，属于风险操作确认，不归入"保存 / 放弃 / 取消"离开流程）：
  - **覆盖保存**：用 `details.currentUpdatedAt` 作为基准重新提交；
  - **取消**：保存函数返回 `false`，留在编辑中。
- 如果冲突发生在离开前的保存流程中，选择取消就会按现有逻辑中断这次切换。
- 错误码映射和中英文文案按现有方式补齐。

### 4.4 已确认的决定

1. **冲突框的选项**（2026-10-22 已定）：只提供"覆盖保存 / 取消"，不加"放弃修改并载入最新"。后者用"取消"再"放弃更改"就能做到，单独设一个选项只会多一个会丢失草稿的按钮。
2. **PUT 是否强制要求 `expectedUpdatedAt`**（2026-10-22 已定）：强制。缺失时返回 400，不保留不受版本保护的写入路径。

## 5. 复评记录与取舍

**5.1 为什么 definitions 按 ID 比较，其他子表整组比较**

单看 A20，整组比较就够了。但释义是每条词条中最大的子列表，而且 R11 需要保存时保留释义行。分类所需的 ID 集合已经在 `previous` 里，额外的复杂度只是一条 UPDATE 分支，所以保留按 ID 比较。其他子表没有这类需求，保持简单。

**5.2 为什么静态投影用"重新计算后比较"，形态投影用生成键**

静态 records 计算很便宜，直接比较结果就不需要维护依赖表，不会漏项。形态生成正是要省掉的开销，所以只能用生成键提前判断；因为有漏依赖的风险，必须配一致性验收。

**5.3 为什么 PATCH 暂不加版本条件**

PATCH 是把指定字段合并到数据库的最新状态上，不会把整条旧草稿写回去，没有 A05 那种整条覆盖的风险。目前也没有前端调用方。将来如果做按分区的 PATCH 保存，再按 `API_DRAFTS.md` §5 加对象级条件。那样还能减少两个窗口编辑不同分区时产生的"假冲突"。

**5.4 局部编辑仍发送整条词条**

所以两个窗口分别编辑不同分区，也会被判为冲突。这是本方案已知的保守之处：宁可误报，也不静默覆盖。

**5.5 投影不再随每次保存整份重建**

现在每次保存都会整份重建当前词条的投影，即使投影因为别处的缺陷而过期，也会在下一次保存时被顺带修正。改为按字段比较后，没有变化的字段不会再被重写，这种"顺带修正"也就没有了。投影的正确性改为依赖现有的维护机制：设置变化时全量重建，模板变化时按受影响的词条局部重建。§6 第 2 步的一致性验收，就是用来保证这些机制和增量写入合起来仍然正确。

**5.6 比较出错的后果**

- 主表、子表和静态投影都按值比较。即使两边的 DTO 形状有细微差别（例如空串和缺省值），结果也只是误判为"有变化"，多写一次，不会漏写。
- 只有 §3.4 的形态生成键可能把实际变化误判为"没有变化"。所以一致性验收重点覆盖这一项。

## 6. 实施步骤与验收

1. **基线测量**：在临时数据目录（`CONLEXICON_DATA_DIR`）里构造以下场景，记录耗时和各表写入行数：
   - 单个词条：10 条释义，手动模式下 2 张 10×10 的形态表；
   - 对该词条分别单改 `pronunciation`、单改一条释义、改 lemma，各保存一次；
   - 5000 个词条的批量 IPA 生成，词条属于自动形态模板。

   写入行数用临时触发器（`CREATE TEMP TRIGGER`）记录，不改动生产代码。测量脚本放在 scratchpad，不提交；数字写进 CHANGELOG。
2. **A20 仓库改动**：按 §3 实施，并新增 `scripts/check-entry-incremental-save.js`，同时加入 `check-all` 清单。验收内容：
   - **DTO 一致**：同一组编辑序列分别用新写入器和全量重建执行，保存后的 DTO 完全一致；
   - **投影一致**：每步编辑后，增量投影与 `rebuildEntrySearchProjection()`、`rebuildEntryMorphologySearchProjection()` 的全量结果逐行一致。编辑序列至少覆盖：单字段、释义增删和排序、标签增删和换序、自动与手动模式切换、override、lemma 改名及引用方同步、来源增删；
   - **没有多余写入**：用临时触发器断言单改 `pronunciation` 时不写 definitions、tags、sources、形态表和形态投影，调整标签顺序时不重新生成形态；
   - **约束和回滚**：撞上其他词条的释义 ID 仍然整体回滚；`created_at` 不被请求覆盖；事务失败时全部回滚；
   - **批处理**：结果与原实现一致。
3. **A05 服务端**：repository 选项、HTTP 校验和错误码，同步 `docs/API_CONTRACT.md`，包括 PUT 行、错误码表，以及更新时保留 `created_at` 的说明。测试覆盖：
   - 基准匹配时保存成功；
   - 基准不匹配时返回 409，且没有写入；
   - 缺少基准时返回 400；
   - 空串基准；
   - 被删除的词条返回 404。
4. **A05 前端**：基准记录、请求体、冲突确认框、错误码映射和中英文文案。在 `scripts/check-editor-saves.js` 的 VM 夹具中覆盖：
   - 冲突后草稿和编辑状态保留；
   - 离开流程中选择取消会中断切换；
   - 覆盖保存会改用新基准重新提交。
5. **复测与收尾**：重跑第 1 步的测量，运行 `node scripts/check-all.js` 和 `git diff --check`，写 CHANGELOG，删除审计清单中的 A20、A05，按本文开头的约定迁移契约并删除本文。

**UI 验收**：冲突确认框需要检查中英文、浅色与深色主题、键盘操作和弹窗层级，宽度覆盖 320、768、1440px。浏览器面板受限而无法完成的项目，按 `AGENTS.md` 逐项列出，并写明替代的验证方式。
