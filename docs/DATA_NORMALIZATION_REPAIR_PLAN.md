# 数据规范化与 SQLite 读取修复计划

状态：已复评（2026-09-30），尚未实装。初稿由 GPT 根据 2026-09-27 代码审查编写，复评后收窄为下文方案；删改内容及理由见第 8 节。2026-10-01 按修订后的 `AGENTS.md` 数据不变量新增阶段 4。

本计划处理交接文档“已知技术债”中的审查发现：SQLite JSON 读取吞错、前后端规范化函数重复、settings 重复规范化、普通保存时的跨类型 ID 扫描，以及顺带确认的无用词条形态派生字段。它不涉及本地 HTTP 服务安全、皮肤与 CSS、词源拓扑或质量检查架构。

## 1. 已确认的现状

以下依据当前代码检查；行号会随实现变化，接手时按函数名定位。

- **JSON 吞错**：`lib/sqlite-dictionary-repository.js` 的 `parseJson(value, fallback)` 在解析失败时返回默认值，共 6 处调用：`dictionaryQueryContext` 读 settings；`morphologyTemplateGroupsFromDatabase` 读 `match_tags_json`、`row_labels_json`、`column_labels_json`；`baseDictionarySnapshot` 与 `exportDictionarySnapshot` 读全部 `module_blobs`。损坏的 settings 会被当作空配置规范化，之后可能随保存写回默认值。这是按读取与保存路径推断的风险，尚未复现实际数据丢失。
- **坏 JSON 的来源**：正常写入不会产生坏 JSON。模块数据只经 `writeModuleBlob` 写入 `JSON.stringify(value || {})`，形态标签列同样由代码序列化，且写入都在事务内；新建词典总是写全 settings、docs、corpus、morphology 四个模块。坏数据只可能来自外部直接修改数据库或未来的程序缺陷。
- **现成的错误路径**：不吞错时，原始 `SyntaxError` 会由 `lib/api-error.js` 的 `systemErrorCode` 映射为已有错误码 `system_json_parse`；前端已有中英文提示（当前文案为“本地 JSON 文件损坏或无法解析”），`server.js` 会打印完整错误。
- **模型重复**：`app.js` 复制了 `lib/dictionary-model.js` 26 个函数中的 22 个，且已出现漂移：前端规范化 `toolNavOrder`，后端只随 `...settings` 透传。`dictionary-model.js` 依赖 `node:crypto` 和 `apiError`，浏览器不能直接加载。
- **settings 重复规范化**：`app.js` 中有 33 处调用 `normalizeDictionarySettings(...)`，包括标签判定与显示等逐标签路径；完整词典进入前端状态时已规范化。耗时未量化。
- **整本读取**：`baseDictionarySnapshot()` 解析全部模块（settings、docs、corpus、morphology，并读取形态模板表），但若干只读调用方只需要 settings：`getEntryRelations`（每次选中词条、词汇网络每次跳转都会调用）、`getEntryFacets`、`queryAnalysis` 的标签统计。GPT 用临时数据复现，关系查询和 facets 每次各自解析约 100 万字符的语料 JSON；实际界面延迟尚未测量。`dictionaryQueryContext()` 只读 settings，查询与来源补全已在使用。各保存操作也读取全部模块，其中词条、形态和语料保存要用完整词典做跨实体 ID 冲突检查（`conflictingEntityIdRecords`），至少依赖 corpus。
- **运行期 ID 检查**：`conflictingEntityIdRecords` 在每次词条、形态和语料保存时，拿提交的 ID 查询 `entries`、`definitions`、`morphology_template_groups`、`morphology_template_tables`，并解析整个语料库，要求跨类型全局唯一。所有 ID 都由程序以“类型前缀加 UUID”生成，界面不能输入或修改 ID，所有引用都带类型。相关数据库行为：
  - `definitions` 是普通插入，撞到其他词条的义项 ID 会触发主键错误并回滚整个保存（GPT 用临时库验证）；
  - `entries`、形态组和形态表使用 `ON CONFLICT ... DO UPDATE`，主键只保证最终无重复行，不能阻止错误的新建覆盖旧记录；
  - 新建词条目前有两层保护：`POST /entries` 拒绝客户端传入 ID，`saveEntry` 的 `createOnly` 在 ID 已存在时返回 409；
  - 形态写入计划（`lib/morphology-write-plan.js` 的 `morphologyIndex`）用 `Map` 按 ID 整理组和表，同一次提交中两张同 ID 的表会被静默合并，数据库没有机会报错；目前靠全局检查顺带拦住（GPT 已验证）。
- **无用的形态派生字段**：前端 `normalizeEntry` 用 `morphologyEditorView` 生成扁平的 `entry.morphology`，唯一使用处是保存前把它剥掉（`const { morphology: _editorMorphology, ...payload } = entry`）。`lib/legacy-dictionary-migration.js` 读取旧 JSON 中的 `entry.morphology`，与这个前端派生字段无关。

## 2. 边界与原则

- 修的是“吞错后可能写回默认值”和“两份实现已漂移”，不是为外部篡改增加防护层。正常写入路径不可能产生的数据形状，不专门校验。
- 前后端有意不同的语义保持不变：
  - 后端 `normalizeEntry` 拒绝重复来源和自引用；前端以 `allowDuplicateTargets: true` 读取，使早期数据库中可能存在的重复引用仍可见、可删除后保存；
  - 后端负责实体 ID 唯一性校验和导入入口；
  - 前端负责本地化默认名称、summary 和显示视图。
- 前端状态入口不只有首次加载，还包括模块保存响应、词条保存响应、批量 patch、导入和新建。这些入口保留规范化；`renderExampleHtml(example, rawSettings)` 等明确接收原始配置的函数、表单收集和旧格式导入也不视为已规范化状态。
- 不改完整快照的维护、缓存失效或局部更新策略（另一项已记录技术债），不改 SQLite schema，不操作真实 `data/`。

## 3. 阶段 1：JSON 读取不再吞错、只读接口按需读取、删除形态派生字段

三项都只涉及少量调用点，可以一次完成。保存路径的读取范围依赖阶段 4 去掉跨类型 ID 扫描，不在本阶段内。

### 3.1 JSON 读取

- 删除 `parseJson`，6 处调用改为直接 `JSON.parse`。
- 记录本身不存在时保留当前默认值，例如 `settingsRow ? JSON.parse(settingsRow.valueJson) : {}`；模块 Map 中缺失的模块同理。新建路径总会写全四个模块，但用户已有数据库可能由早期版本创建，无法确认，保留缺失默认值不会覆盖任何已有数据。
- 记录存在而内容无效时一律报错。原来的 `valueJson || "{}"` 会把空字符串当作缺失，改后空字符串按损坏处理。
- 不新增错误码：解析失败沿用 `system_json_parse`。只把前端中英文文案改为不特指文件的说法，例如“本地数据损坏或无法解析”／“Local data is damaged or cannot be parsed”，因为它现在也覆盖数据库中的配置数据。
- 不校验合法 JSON 的顶层类型（如 settings 被改成 `null` 或数组）：正常写入产生不了这类数据。
- 可见变化：模块损坏时，读取该模块的操作会失败，而不是静默继续。这是显式报错的预期结果，在 CHANGELOG 中说明。目前 `baseDictionarySnapshot` 读取全部模块，任一模块损坏都会影响所有依赖它的操作；3.2 收窄读取范围后，影响只限于确实需要该模块的操作。

### 3.2 只读接口按需读取

- `getEntryRelations`、`getEntryFacets`、`queryAnalysis` 的标签统计改用 `dictionaryQueryContext()`，只读 settings。实施前确认它们只用到 settings，例如 `entrySummary` 的标签显示与词性判断。
- 收益有两点：
  - 选中词条和词汇网络跳转不再每次解析整个语料库，阶段 D 语料变大后差异更明显；
  - 某个模块损坏时，这些只读接口不受影响，缩小 3.1 中显式报错的影响范围。
- 保存路径不在本阶段内：词条、形态和语料保存目前依赖 corpus 做跨实体 ID 冲突检查，阶段 4 去掉该扫描后再收窄读取范围。
- 不缓存模块解析结果，不改变保存语义。

### 3.3 形态派生字段

- 删除前端 `normalizeEntry` 中的 `morphology: morphologyEditorView(...)`、`morphologyEditorView` 函数，以及保存前剥离该字段的解构。
- 实施前再全仓搜索一次 `entry.morphology`、解构和序列化用法，确认没有新增消费者。
- 保留 `morphologyMode`、`morphologyGroups`、词典级形态配置和旧 JSON 迁移。不添加断言“字段不存在”的墓碑测试。

### 3.4 验收

- 在 SQLite contract 中加一条测试：临时数据库里把 settings 改成截断的 JSON，用新的 repository 实例（避免读到缓存）确认：
  - 读取和一个依赖 settings 的保存都返回 `system_json_parse`；
  - 数据库中的原值未被改写。
- 同一测试确认 `{}` 和缺失记录仍按当前行为工作。
- 同一测试另把 docs 或 corpus 改成损坏的 JSON，确认 `/entry-relations` 与 facets 仍正常返回，而导出等依赖该模块的操作报错。
- 既有 SQLite contract 中保存、实体 ID 冲突和导出相关检查全部通过。
- 形态自动／手动编辑、显示与保存的既有回归通过。

## 4. 阶段 2：共享纯数据规则

### 4.1 模块边界

- 新增 `lib/dictionary-data-model.js`（UMD），承载前后端相同的纯数据规范化：
  - settings、gloss 样式、工具导航顺序、词条区域顺序、docs、corpus 与各级语料实体、definition、词条字段整形、UI 偏好；
  - ID 生成与登记。浏览器与 Node 均使用 `globalThis.crypto.randomUUID`，不依赖 `node:crypto`。
- 依赖已有的 tag、IPA、entry-search、morphology 共享模型，不复制它们。
- 词条字段整形函数接收已处理好的 sources：
  - 后端 wrapper 做严格来源校验，并抛 `apiError`；
  - 前端 wrapper 宽松读取。
  - 不在共享模块里加“宽松／严格”模式参数。
- `dictionary-model.js` 保留 Node 侧的错误包装、完整词典入口、实体唯一性校验、import 入口和现有公开 exports。
- `app.js` 保留本地化默认名称、summary、显示视图与状态入口。
- `index.html` 在依赖模型之后、`app.js` 之前加载新模块。

### 4.2 语义

- 两端使用同一个 `normalizeDictionarySettings`。后端开始规范化 `toolNavOrder`（去重、过滤非法项、保留合法顺序、补齐缺项）是有意的行为变化；合法配置的相对顺序不变。
- 保留 settings 的未知字段透传、布尔默认值、gloss 默认样式、保存确认选项和搜索／IPA 设置的现有语义。不新增旧字段兼容逻辑。
- `normalizeGlossStyles` 中对常量 `"serif"` 的规范化调用可直接改用常量，结果不变。
- 共享的默认数组／对象不能被调用方原地修改：返回新对象，或在迁移时确认没有原地修改。

### 4.3 验收

- Node 下的模型测试，覆盖：
  - 工具顺序的合法值、重复值、非法值和缺项；
  - 未知 settings 字段保留；
  - 显式 `false`、空字符串与空集合保留；
  - 重复规范化结果稳定。
- 按 `index.html` 的脚本顺序在 VM 中加载到 `app.js` 之前，确认新模块和依赖它的模型可用。不比较 CommonJS 与浏览器环境的运行结果：两边执行的是同一个文件。
- 既有回归全部通过，包括导入、导出、ID 唯一性、语料父级与顺序、后端拒绝重复来源和自引用。
- 浏览器冒烟（临时数据目录）：初次加载、切换词典、词条显示与编辑、导入、语料编辑。

## 5. 阶段 3：settings 读取收敛

依赖阶段 2：共享规范化后，才能确认所有进入前端状态的 settings 都已规范化。

- 引入 `dictionarySettings(dictionary = activeDictionary())`：
  - 已加载词典直接返回状态中的 `settings`；
  - 没有活动词典或只有 metadata 占位时，返回一次生成的默认设置。它只供读取，不能交给表单或排序逻辑修改。
- 实施前核对所有写入前端状态的路径。发现直接写入原始 settings 时修该入口，不在读取处兜底。
- 33 处调用按语义逐处判断、逐处替换，不做全局或批量机械替换：
  - 读取已加载词典配置的，改用访问函数；
  - 模块响应合并、表单原始输入和明确接收 rawSettings 的保留规范化。
- 核对被替换的读取点是否原地修改排序数组、glossStyles 等。原来作用在副本上的修改，改后不能污染词典状态。
- 验收以功能回归为准：保存设置后，显示、搜索选项、工具顺序、词性、标签显示替换和 docs／corpus 自动保存立即使用新配置。这一步的主要收益是代码清晰，不以性能提升为目标，也不要求性能对比；如果要宣称性能收益，再补测量。
- 不改变虚拟滚动、未保存离开确认、自动保存草稿与选择／滚动／撤销历史。

## 6. 阶段 4：运行期 ID 检查收窄与保存路径按需读取

依据 2026-10-01 修订的 `AGENTS.md` 数据不变量：全局唯一仍是数据约定，但由生成规则、导入边界检查和数据库约束共同保证，普通保存不再扫描无关实体类型。本阶段不依赖阶段 2、3，可在阶段 1 之后直接进行。

### 6.1 检查边界

| 场景 | 保留的检查 |
| --- | --- |
| 导入、旧格式转换 | 一次完整检查：全局 ID 唯一、引用和父级关系（`assertUniqueDictionaryEntityIds` 等），不放宽 |
| 新建词条 | 服务端生成 ID；`POST /entries` 拒绝客户端 ID；`createOnly` 时 ID 已存在返回 409 |
| 义项写入 | 主键和事务兜底，不查其他实体类型 |
| 形态模块保存 | 检查同一次提交内组和表的 ID 是否重复，在写入计划合并之前拒绝；不查词条和语料 |
| 语料模块保存 | 检查语料内部的 ID 重复（目前是一整块 JSON，没有数据库约束）；不查词条和形态。父级关系见 6.2 末条 |
| 内部读取、渲染 | 直接使用当前模型的数据，不重复规范化和校验 |

### 6.2 实施

- `saveEntry`、`saveMorphology`、`saveCorpusChanges` 不再调用 `conflictingEntityIdRecords`；该函数及只为它服务的辅助函数在确认无其他调用方后删除。
- 形态保存在生成写入计划之前，检查提交内组 ID 和表 ID 的重复，复用现有错误码 `duplicate_entity_ids_scoped`。语料保存保留现有的模块内检查。
- 新建词条的两层保护保持不变；主键冲突仍以现有错误路径返回，不为此新增错误码。
- 去掉扫描后，按 3.2 的方式逐个核对保存操作实际用到的模块，只读取需要的部分：例如词条保存需要 settings 与形态配置，不再需要 corpus、docs。
- 全局唯一仍是数据约定，导入检查不放宽。程序缺陷导致导出无法重新导入的情况，靠修复缺陷解决，不作为每次保存扫描的理由。
- 已确认的现状缺口：语料单元的父级关系（多父级、引用不存在的单元、重复链接）目前只由前端语料编辑器校验（`corpusMultipleParents`、`corpusMissingUnit`、`corpusDuplicateLink`），后端语料保存只检查 ID 重复。`AGENTS.md` 把父级关系列为模块内应检查的范围，但补到后端属于新增校验，不在本阶段内；阶段 D 把语料改为 SQL 表时，由外键和唯一约束一并解决，或届时另行决定。

### 6.3 验收

- contract 覆盖：
  - 形态提交内两张同 ID 的表被拒绝，数据库保持原样；
  - 语料提交内重复 ID 被拒绝；
  - 新建词条不能覆盖已有词条（客户端传 ID 被拒绝；`createOnly` 撞 ID 返回 409）；
  - 义项 ID 撞到其他词条的义项时保存失败并整体回滚；
  - 导入跨类型重复 ID 的词典仍被拒绝。
- 损坏的 docs 或 corpus 不再影响词条保存（与 3.1 的损坏用例合用临时库）。
- 不添加只断言“不再查询某表”的墓碑测试。

## 7. 本轮不处理

- `NOT NULL` 列读取中的 `rowCount || 1` 等兜底：`NOT NULL` 不保证数值大于零，直接删除可能把异常尺寸送进渲染。数值完整性另行评估，不随本计划批量删除。
- 静态 DOM 的 `elements.xxx?.`：按节点生命周期逐处判断，留待相关 DOM 工作时处理。
- 浏览器能力检测、异步 generation／session 校验和正常控制流中的 catch 保留。
- 以上仍记录在交接文档，不宣称本计划修复了全部防御性写法。

## 8. 复评记录（2026-09-30）

复评依据第 1 节的代码事实，对初稿做了以下收窄：

| 初稿内容 | 处理 | 理由 |
| --- | --- | --- |
| 新增 `system_dictionary_json_invalid` 错误码、中英文提示、结构化 `details` 和 API 契约条目 | 删除，改为沿用 `system_json_parse` 并调整文案 | 不吞错时原始 `SyntaxError` 已映射为该码，前端已有提示，服务端打印完整错误；新码不带来额外能力。 |
| 校验 `module_blobs` 与形态标签列的 JSON 顶层类型 | 删除 | 正常写入路径不可能产生错误类型，只能来自外部篡改；为此加校验正是审查要清理的写法。 |
| 6 条损坏场景验收（逐列注入、事务部分提交、缓存失效等） | 收窄为一条 contract 测试 | 读取在任何写入之前抛错，“失败保存不覆盖数据”是自然结果；保留“用新实例避免缓存”这一有效要求。 |
| 阶段 B 比较 CommonJS 与浏览器 UMD 下的运行结果 | 改为 Node 模型测试加脚本顺序加载冒烟 | 两边执行同一文件，比较运行结果等于测试 JS 引擎。 |
| 阶段 C 验证热路径复用同一 settings 对象，并比较耗时与内存分配 | 改为功能回归，性能测量可选 | 主要收益是代码清晰；对象身份在 `app.js` 中难以测试，性能收益未量化。 |
| 按 A → B → C 顺序实施，形态字段删除放在阶段 C | 形态字段删除提前到阶段 1 | 已确认是死代码，几行即可删除，不依赖共享模块。 |
| （初稿未涉及） | 新增阶段 4（2026-10-01）：普通保存不再做跨类型 ID 扫描，保存路径随之按需读取 | 依据修订后的 `AGENTS.md`：全局唯一由生成规则、导入检查和数据库约束保证；GPT 复核补充了形态提交内重复会被静默合并、upsert 不阻止新建覆盖旧记录两点，因此保留局部检查。 |
| （初稿未涉及） | 阶段 1 新增“只读接口按需读取” | 2026-09-30 复查发现多处只需 settings 的只读接口读取全部模块；收窄读取同时缩小损坏报错的影响范围，与 3.1 直接相关。GPT 复核时指出保存路径依赖 corpus 做 ID 冲突检查，因此保存路径不纳入本阶段。 |
| ID 生成继续依赖 `node:crypto` | 改用 `globalThis.crypto.randomUUID` | 使共享模块在浏览器和 Node 中无需分别注入。 |

保留了初稿中正确的判断：前后端有意不同的来源校验语义、前端状态入口的完整清单、接收原始配置的边界、空字符串按损坏处理、共享默认值不可变、逐处而非批量替换 settings 调用，以及第 6 节的不处理项。

初稿配套的一次性重构脚本 `.audit-refactor.cjs` 未运行即删除：它依赖字符串位置截取，在当前 `index.html` 缩进下会报错，且对 31 处调用做批量机械替换，与本计划的逐处替换原则相悖。

## 9. 完成标准

每个阶段单独完成并验证，可分别提交：

1. 对每个改动的 JavaScript 文件执行 `node --check`，包含 `app.js` 与新增模块、检查脚本。
2. 运行 `node scripts/check-all.js`；SQLite 不可用必须失败。
3. 阶段 2、3 改动前端状态与共享模型，需用临时数据目录做浏览器冒烟；阶段 1、4 只改后端，以 contract 测试为准。本计划不改视觉与布局，不需要逐宽度检查；无法完成的检查项按 `AGENTS.md` 逐项列出。
4. 实现完成后按实际日期写 CHANGELOG，并在交接文档中删除已处理的技术债条目。本计划不改变 HTTP 契约；如果实现中改了错误码或保存范围，再同步 `docs/API_CONTRACT.md`。
5. `git diff --check`，核对改动范围。
