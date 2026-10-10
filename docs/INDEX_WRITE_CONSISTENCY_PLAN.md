# Index Write Consistency Plan / 索引写入一致性设计（A02＋A03）

状态：设计草案（2026-10-10），已做独立复评（第 8 节），待用户确认后交 GPT 6.1 sol 实装、Claude 审查（分工见交接文档第 6 节）。完成后把第 3、4 节中仍有效的契约迁入 [SQLite Backend Plan](SQLITE_BACKEND_PLAN.md) 的 `index.json` 一节，删除本文，并从[审计清单](AUDIT_OPEN_ISSUES.md)删除 A02、A03。

## 1. 现状（已对照代码确认）

所有代码位于 `lib/sqlite-dictionary-repository.js`，按函数名定位。

- `index.json` 只保存当前词典 ID、词典 ID 列表和三项界面偏好。读写入口为 `readIndex()`、`writeIndex()`、`writeJson()`。
- 修改索引的路径各自“读 → 改 → 写”，互不串行：
  - `importDictionarySnapshot()`（新建与导入的共同终点）：先写 SQLite，再读索引并写回；
  - `importDictionary()`：在进入上面的函数之前先读索引判断 ID 冲突；
  - `activateDictionary()`、`deleteDictionary()`、`updatePreferences()`；
  - `readState()`：列出词典时发现文件缺失，会顺手剪除并写回索引（GET 路径中的写入）；
  - `ensureDataStore()`：索引缺失时写入默认索引；
  - `writeIndex()` 本身又读一次文件，用旧值补全偏好字段。
- `writeJson()` 直接覆盖目标文件，没有临时文件与原子替换。
- `node:sqlite` 的 `DatabaseSync` 是同步 API，单进程内请求只会在 `await` 处交错。因此 A02 的丢更新发生在“读索引”和“写索引”之间的 `await` 上，进程内的串行边界即可消除。
- 新建词典时 `openDictionaryDatabase()` 一打开就创建文件并建表；随后的 `writeDictionaryToDatabase()` 在单个 `BEGIN IMMEDIATE` 事务中写入，失败会回滚，但空库文件已经存在。
- 唯一的外部写者是离线脚本 `scripts/migrate-json-data-to-sqlite.js`，它调用 `writeIndex()` 写入完整索引。

## 2. 目标与非目标

目标：

1. 同一服务进程内，任意并发的新建、导入、删除、激活、偏好更新和剪除，都不丢失彼此对索引的修改（A02）。
2. 索引文件任何时刻要么是旧的完整内容，要么是新的完整内容，不出现截断（A03）。
3. 新建或导入失败时，请求报错，且索引与词典文件回到请求前的状态；不出现“报失败但数据已改”或“数据库存在但未登记”（A03 恢复路径）。

非目标：

- **多进程**：两个服务进程共用同一数据目录时，进程内串行无效。记为运行约束，见第 7 节。
- **R05 索引内存缓存**：不在本次实现。只读路径继续每次读文件，依靠原子替换读到完整内容；缓存需要先解决外部修改后的刷新语义，R05 保持开放。
- 不把全局索引迁入 SQLite（审计条目已排除）。
- 不为 Windows 上被其他进程占用导致的 `rename` 失败加重试；失败照常报错，旧索引保持完整。出现实际报告后再评估。
- 不改 HTTP API 路径、请求体、响应体和错误码。

## 3. 设计

### 3.1 索引串行边界

仓库实例持有一条 Promise 链，提供两个内部方法：

- `withIndexLock(fn)`：把 `fn` 排到链尾执行，返回其结果；前一个任务失败不影响后续任务排队。
- `updateIndex(mutator)`：在锁内读取当前索引，调用 `mutator(index)` 得到完整的新索引，原子写入后返回新索引。`mutator` 只做纯计算。

规则：

- 所有修改索引的路径都在锁内完成“读 → 判断 → 写”，包括 `readState()` 的剪除和 `ensureDataStore()` 的默认索引创建。
- 只读路径（`readIndex()`、`requireDictionary()`、`hasDictionary()`、`exportDictionary()`）不加锁：原子替换保证读到的总是完整文件。
- `readState()` 先无锁读取并检查文件；只有需要剪除时才进入锁，并在锁内重新读取、重新判断后再写，不使用锁外读到的旧索引。
- 删除现有 `writeIndex()`：调用方一律通过 `updateIndex()` 提交完整的新索引，不再在写入时回读文件补全偏好字段。

### 3.2 原子写入

`writeIndexFile(index)`（仅由 `updateIndex()` 调用）：

1. 把 JSON 写入同目录的固定临时文件 `index.json.tmp`，写完对文件句柄调用 `sync()`，再关闭；
2. `fs.rename()` 到 `index.json`。

- 临时文件用固定名即可：同一进程内写入已经串行；上次崩溃残留的临时文件会在下次写入时被覆盖，不需要启动清理。
- `rename` 失败时直接抛出，不删除临时文件，不吞错；`index.json` 保持旧的完整内容。
- Windows 上不做目录 `fsync`（不支持）；同目录 `rename` 在 NTFS 上替换目标，满足“旧或新、不截断”。

### 3.3 新建与导入：先登记，后写库，失败回滚登记

`createDictionary()` 与 `importDictionary()` 的整个流程放在一次 `withIndexLock()` 内：

1. 在锁内读取索引，做现有的 ID 冲突判断（索引中已登记、文件已存在、`overwrite` 与 `regenerateId` 规则不变）。判断移入锁内后，两个同 ID 的并发新建只会有一个成功，另一个得到现有的 409 `dictionary_id_exists`。
2. 记下 `previousIndex`，以及目标文件此前是否存在（`fileExisted`）。
3. 写入新索引（登记 ID、设为当前词典）。写入失败则直接抛出：此时尚未创建或改动任何数据库。
4. 打开数据库并在事务中写入词典。
5. 第 4 步失败时补偿：
   - 写回 `previousIndex`；
   - 若 `fileExisted` 为假：关闭连接并删除刚创建的库文件；
   - 抛出原始错误。补偿本身也失败时，抛出 `AggregateError([原始错误, 补偿错误])`，不吞掉任何一个。
6. 第 4 步成功后照旧失效缓存并返回。

选择“先登记”的理由：覆盖导入时，写库失败由 SQLite 事务回滚，旧数据完好，只需把“当前词典”改回去；登记失败时什么都还没改。两种失败都能回到请求前的状态。若“先写库后登记”，覆盖导入在登记失败时数据已被替换，无法回滚。

锁覆盖整个写库过程，因此 `readState()` 的剪除不会在“已登记、库文件尚未建好”的窗口里误删刚登记的 ID。导入期间其他索引修改需要排队；导入是低频操作，且同步写库本来就占住事件循环，不额外增加延迟。

### 3.4 删除、激活、偏好、剪除

- `deleteDictionary()`：锁内保持现有顺序——关闭连接、删除库文件、失效缓存，再通过 `updateIndex()` 移除 ID 并改选当前词典。若最后一步失败，库文件已删、ID 仍登记，下次 `readState()` 的剪除会修复；这是现有自愈路径，明确写入契约，不另加补偿。
- `activateDictionary()`、`updatePreferences()`：改为 `updateIndex()`，在锁内校验词典存在后再写。
- `ensureDataStore()`：目录创建保持锁外；默认索引的“缺失则写入”放进锁内。

### 3.5 离线迁移脚本

`scripts/migrate-json-data-to-sqlite.js` 改为通过 `updateIndex(() => 完整索引)` 写入，从而同样获得原子写入。脚本本身单进程顺序执行，不需要额外处理。

## 4. 对外契约

- HTTP API、响应结构、错误码不变；索引写入失败按现有未分类错误返回 500。
- 新增的持久化契约（完成后迁入 SQLite Backend Plan）：
  - 同一服务进程内，索引修改串行执行，不丢更新；
  - `index.json` 通过同目录临时文件加 `rename` 原子替换，读者只会看到完整文件；
  - 新建与导入失败时，索引与库文件回到请求前状态；删除在登记更新失败时，依靠列表时的剪除自愈；
  - 一个数据目录同一时间只允许一个服务进程写入（见第 7 节）。

## 5. 验收

新增 `scripts/check-index-consistency.js` 并接入 `scripts/check-all.js`，使用临时数据目录（`createTempSqliteRepository`），SQLite 不可用时必须失败。断言当前行为，不写墓碑断言：

1. 20 个并发 `createDictionary()` 全部成功后，索引包含全部 20 个 ID。
2. 新建、删除、激活与 `updatePreferences()` 交错并发后，所有成功操作的结果都体现在最终索引中。
3. 两个同显式 ID 的并发新建：恰好一个成功，另一个为 409 `dictionary_id_exists`；索引中该 ID 只出现一次。
4. 把仓库实例的 `writeIndexFile` 替换为“写完临时文件后抛错”：调用报错，`index.json` 仍可解析且等于操作前内容。
5. 新建时让写库失败（替换实例的 `writeDictionaryToDatabase` 抛错）：报原始错误，索引等于操作前，库文件不存在。
6. 覆盖导入时让写库失败：索引（含当前词典）等于操作前，原词典数据完好可读。
7. 新建时让索引写入失败：报错，库文件不存在。

故障注入只替换测试中仓库实例上的方法，不为测试在生产代码中加开关或参数。

现有 `scripts/check-sqlite-lifecycle.js`、`check-json-directory-conversion.js` 等对 `readIndex()`／`writeIndex()` 的调用随接口调整更新；`node scripts/check-all.js` 全部通过。

## 6. 交给实装方的规格

- 可改：`lib/sqlite-dictionary-repository.js`、`scripts/migrate-json-data-to-sqlite.js`、`scripts/check-index-consistency.js`（新增）、`scripts/check-all.js`、受接口调整影响的现有 `scripts/check-*.js`、`scripts/sqlite-check-utils.js`（如需辅助函数）。
- 不改：`server.js`、`lib/api-routes.js`、前端文件（`app.js`、`index.html`、`styles.css`、`theme-*.css`）、`electron-shell/`。
- 遵守 `AGENTS.md` 的“防御性代码”“数据不变量”与测试规则：
  - 不对索引内容做新的形状校验或修复，`readIndex()` 现有的偏好规范化保持原样；
  - 不为锁加超时、重入检测或重试；
  - 补偿逻辑只限 3.3 第 5 步。
- 交付时列出每一处新增的检查、`catch` 与补偿，以及各自防止的具体风险。
- 验收命令：`node --check lib/sqlite-dictionary-repository.js`、`node scripts/check-index-consistency.js`、`node scripts/check-all.js`、`git diff --check`。
- 文档：更新 `CHANGELOG.md`（实际完成日期段，“修复”类）；按本文开头的说明迁移契约、删除本文和审计条目 A02／A03；交接文档中对应条目删除或改为一句指向。

## 7. 多进程：记为运行约束，不在本次处理

两个服务进程共用同一数据目录时，进程内串行与原子写入只能保证索引文件不被截断，不能防止丢更新；SQLite 自身的文件锁只保证单库事务。已知来源：

- Electron 外壳每次启动都在空闲端口新开服务进程，没有单实例锁。外壳目前不维护（用户 2026-10-10 说明），本次不处理，也不为它在服务端加跨进程锁文件。
- 开发服务与测试服务指向同一数据目录。`AGENTS.md` 已要求测试服务使用临时目录，不复用指向真实 `data/` 的实例。

因此把“一个数据目录同一时间只允许一个服务进程写入”记为运行约束，写入审计清单 R08。外壳恢复维护时，再评估在外壳中加单实例锁。

## 8. 独立复评

把第 3 节当作外部提案重新检查：

1. **串行边界是否必要，只做原子写够不够？** 不够。原子写只防截断；丢更新来自“读到旧值后写回”，必须把读改写整体串行。保留。
2. **锁是否会过宽？** 只读路径不加锁；锁内只有索引修改和新建／导入的写库。写库是同步的，本来就占住事件循环，锁不额外降低并发。保留。
3. **“先登记后写库”是否引入新窗口？** 已登记但库未建好的窗口内，只读请求访问该 ID 会得到 404，与“尚不存在”一致；唯一会误删登记的剪除路径在锁内，被排在导入之后。保留。
4. **补偿是否过度防御？** 只有一处补偿，对应审计明确要求的恢复路径，且两类失败都可在测试中注入复现。删除路径不加补偿，依靠已有剪除自愈。符合“防御性代码”规则。
5. **固定临时文件名是否安全？** 进程内串行保证同一时刻只有一个写者；多进程不在范围内（第 7 节）。随机文件名只会带来残留文件清理问题。保留固定名。
6. **`fsync` 是否必要？** 不 `sync` 时，断电后 `rename` 可能先于数据落盘，留下空文件，这正是 A03 要防的截断。成本是每次写入一次 `sync`，索引写入频率低。保留。
7. **初稿曾考虑**为 `rename` 的 `EPERM`／`EBUSY` 加重试。复评认为目前没有实际报告，重试会掩盖真实的占用问题，故删去，列入非目标。
8. **是否需要新的 API 错误码？** 前端对索引写入失败没有可执行的不同处理，沿用 500 即可，不扩大 API 契约。
9. **R05 要求与本设计一起考虑缓存。** 复评结论是不缓存：缓存会让“仓储是唯一写入方”变成正确性前提，而第 7 节的多进程场景恰好违反它；每次读文件的开销在本地很小。缓存留待 R05 单独测量后决定。
