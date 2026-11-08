# 轻量语料库计划（阶段 C）

状态：设计已确认并做过独立复评。第 1 阶段（Gloss 模型）和第 2 阶段（数据切换）已于 2026-11-08 完成，第 3、4 阶段未实施。已实现的契约见 `docs/API_CONTRACT.md`、`docs/SQLITE_BACKEND_SPEC.md` 和 `docs/IMPORT_EXPORT_SPEC.md`。本计划取代原阶段 C“例句迁移为语料单元链接”和阶段 D“语料库工作区重做”，原计划保留在 Git 历史中。

## 1. 目标与边界

语料库最初面向田野调查，现在这个需求已不存在。本计划把它缩成极轻量的语料库：一句一条，内容是文本，释义可以直接连接到语料 ID。语料不一定是例句，没有连接是正常状态，不算问题。

取消的结构：

- 语料块、语料层、父级关系和孤立单元。
- 属性、属性继承、发言人、模态、语料标签和独立备注字段。
- 轨道工作区、时间轴和媒体资源设想。

本计划不做：

- 句子成分到词条的超链接；需要成分级标注时使用专门的语料工具。
- 自动候选式的智能连接和多窗口拖动连接。
- 在语料一侧写入或解除连接；所有连接都从释义编辑里写。
- 把一段多句文本一次拆成多条的批量添加；以后要做的话需要单独的页面或浮窗。
- 删除整个分组。
- 语料搜索的模糊匹配。
- 按整行渲染 ExPex 的 `\pex`、nlevel 等语法。
- `\lingset` 复制和可配置的复制选项。
- 存量 SQLite 词典的转换。旧数据只走 JSON 导入，见第 8 节。

## 2. 数据模型

语料从 `module_blobs.corpus` 拆成正式表。理由：例句并入语料后，搜索、质量检查、筛选和计数都要读取它，自动保存也不应重写全部例句。内容仍是一整段文本，不拆成逐行或逐词的表。

```sql
CREATE TABLE IF NOT EXISTS corpus_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  group_name TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL,
  normalized_text TEXT NOT NULL DEFAULT '',
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_corpus_items_group ON corpus_items(group_name, position);

CREATE TABLE IF NOT EXISTS definition_examples (
  definition_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  item_id TEXT NOT NULL REFERENCES corpus_items(id) ON DELETE RESTRICT,
  PRIMARY KEY(definition_id, item_id),
  FOREIGN KEY(definition_id, entry_id) REFERENCES definitions(id, entry_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_definition_examples_item ON definition_examples(item_id);
```

- `name`、`group_name` 可为空。空分组表示未分组。`position` 只在同一分组内有意义，改分组时追加到新分组末尾。分组按名称排序，未分组排在最后。
- 分组不是实体，没有自己的记录、属性或层级，相同名称即同组。
- `normalized_text` 是搜索用的派生值，由名称、分组和去除标记后的内容经词典配置的搜索规范化生成。保存语料时更新，规范化设置变化时随搜索投影全量重建。
- 一条语料可连接多个释义，一个释义可连接多条语料，同一对只连接一次。
- 删除 `definitions.example` 列和 `corpus` module blob。
- `definition_examples` 沿用 `definition_tags` 的方式，随词条保存整体重写。`writeEntryProjection()` 删除 `definitions` 时级联删除连接，再按 DTO 写回，所以审计 R11 的级联问题不再成立。连接的完整性由外键保证，R06 随拆表关闭。

风险：所有重建词条的内部路径都必须带上连接，否则保存会清空连接。需要覆盖的读取点有 `qualityInputRecords()`、`getEntryFromDatabase()` 对应的 `entryFromRow()`、`staticSearchEntriesFromDatabase()` 和导出快照；需要覆盖的写入路径有普通保存、批量 patch、来源引用同步和全量导入。契约测试要逐条断言这些路径后连接仍在。

DTO：

```js
// 词条详情
definition: { id, meaning, note, tags, examples: [{ itemId, content }] }

// 保存词条
definition: { id, meaning, note, tags, examples: [{ itemId } /* 或 */ { content }] }

// 导出 JSON
definition: { id, meaning, note, tags, examples: [{ itemId }] }
corpus: { items: [{ id, name, group, content, createdAt, updatedAt }] }
```

`{ content }` 用于释义里写新例句，由服务端在词条保存事务中创建语料。这样放弃编辑时不会留下无人使用的语料。

## 3. Gloss 格式

内容保持简化格式。`\ex`、`\begingl` 和 `//` 都不是必需的，写了也能正常解析。

| 内容 | 处理 |
|---|---|
| `\gla`、`\glb`、`\glc`、`\glft` | 识别为层 |
| 别名 `\a`、`\b`、`\c`、`\ft` | 同上；必须在层开头且后接空白，所以不影响 `\c{c}` |
| 层外的 `\ex`（含 `[...]`、`<...>`）、`\xe`、`\begingl`、`\endgl` | 静默忽略 |
| 行首 `%` | 注释，不显示 |
| 整条没有层标记 | 纯文本，原样显示并保持换行 |
| 层内未知命令，如 `\nogloss{x}`、`$_i$` | 当文字显示，复制时原样输出 |
| 行首未知命令（`\pex`、`\glpreamble`）、Gloss 中的无标记行、重复的层 | 不阻止保存，这一条按原文显示并给出提示 |

分隔规则：

- 换行总是结束一层，一层不能跨行。从 LaTeX 贴来的折行 Gloss 走“提示”路径，由用户并成一行。
- `//` 只有在行尾或下一个层标记之前才结束一层，所以同一行可以写多层，句中的 `//kat//` 不受影响。
- 切词只看花括号外的空白。`{out to throw}` 是一列并去掉外层括号，`{}` 是空列。
- `\glb` 的重复层在 ExPex 中合法，本计划按“提示”处理，避免现有解析器后者覆盖前者时内容无声消失。

字面 `\n` 的转换：原先运行期把所有字面 `\n` 转成换行，会破坏 `\nogloss` 这类命令。第 1 阶段先收窄为只转换后面不跟字母的情况（`normalizeGlossLineBreaks()`）；第 2 阶段已把它移到 JSON 导入，运行期不再转换。

`parseGloss()`（`lib/gloss-model.js`）和 `parseStrictCorpusGloss()`（`app.js`）合并成一个共用解析器，前后端共用，返回层、纯文本、注释和提示。

## 4. 行内格式

渲染器支持 `\textbf{}`、`\textit{}`、`\textsc{}`、`\textnormal{}`，可以嵌套，对所有层有效。`{\sc x}` 可以渲染，但工具只写入 `\textsc{}`。其他命令按文字显示。

整行样式和行内标记的关系与 LaTeX 一致，已用 pdflatex 和 ExPex 实测：

- 同类不变：斜体行里的 `\textit{}` 仍是斜体。
- 异类叠加：粗体行里的 `\textit{}` 是粗斜体。
- `\textnormal{}` 清除粗体和斜体。LaTeX 中它还会恢复字体族和小型大写，但不影响字号和颜色；网页上只处理粗体、斜体和行内小型大写，不改字体族和字号。

搜索值和质量检查使用去除标记后的文本，否则 `the-acc` 匹配不到 `the-\textsc{acc}`。

### 长 Gloss 换行

对齐的 Gloss 按列自动折行，做法与 ExPex 相同：每个对齐项是一列，列内上下叠放 `\gla`、`\glb`、`\glc`，列与列像文字一样排列，宽度不够时整列换到下一行。

- 换行只发生在列之间，同一个词的几层不会被拆开；`\ft` 仍是独立的一行，不参与折行。
- 不用 JS 测量，也不用 `ResizeObserver`，窗口宽度变化由浏览器重排。
- 各层行高固定，行内小型大写不撑高行，保证相邻列的同一层对齐；缺项的格子保留高度。
- 列内层间距小于折行后的行间距，让读者看出哪些列属于同一行。
- 单个对齐项本身比容器还宽时，仍在卡片内横向滚动。
- 屏幕阅读器会按列读到交错的内容，所以视觉上的列对辅助技术隐藏，另给一份按层逐行的隐藏文字。
- 只做自动换行，不提供限制行数或横向滚动的显示模式设置。

旧阶段 D 计划中“按宽度测量切分行组”和三种显示模式的设计不再采用。

设置里保留各层的字体、字号、粗体和斜体。删除 `\glb` 的 small caps 开关：`glossStyles.glb.smallCaps`、设置页控件、`renderSmallCaps()`。开过这个开关的词典失去小型大写效果，不自动转换，因为旧规则分不清哪些是语法标记。

## 5. 复制 ExPex

语料页提供“复制 ExPex”，输出完整代码，例句不带整行样式：

```tex
\ex<corpus-item-id>
\begingl
\gla wapm -a //
\glb see \textsc{acc} //
\glft 'saw them'//
\endgl
\xe
```

- 别名规范化为 `\gla`、`\glb`、`\glc`、`\glft`，补齐外壳和 `//`。用户写在 `\ex` 上的选项和标签不保留，标签改用语料 ID。
- 保留 `%` 注释。
- 纯文本输出 `\ex 文本 \xe`。
- `\命令`和成对的 `$…$` 原样输出，其余落单的 `%`、`_`、`&`、`#`、`$`、`^`、`~` 转义。
- 带提示的条目复制原文并提示用户。
- 整组复制时由服务端读取该组全部语料，按顺序拼接，各条之间用空行分隔。

## 6. API

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/dictionaries/:id/corpus/groups` | 分组概览：名称和数量，含未分组 |
| `GET` | `/api/dictionaries/:id/corpus/items` | 按窗口读取语料，支持 `q`、`group`，含内容和连接数量 |
| `GET` | `/api/dictionaries/:id/corpus/items/:itemId/location` | 定位一条语料所在窗口，用于从词条跳转 |
| `POST` | `/api/dictionaries/:id/corpus/items` | 新建，可带 `afterItemId` 插到某句之后 |
| `PUT` | `/api/dictionaries/:id/corpus/items/:itemId` | 保存一条 |
| `POST` | `/api/dictionaries/:id/corpus/items/:itemId/move` | 调整同组内的顺序 |
| `DELETE` | `/api/dictionaries/:id/corpus/items/:itemId` | 删除；有连接时返回 409 `corpus_item_linked` 和受影响的释义，确认后带 `unlink=true` 重发 |
| `GET` | `/api/dictionaries/:id/corpus/items/:itemId/links` | 读取连接的释义，含词形、释义序号和释义文字 |
| `POST` | `/api/dictionaries/:id/corpus/groups/rename` | 分组重命名；新名称已存在时并入该组末尾 |
| `GET` | `/api/dictionaries/:id/corpus/expex` | 按 `group` 生成整组 ExPex |

- 语料列表和例句检索都走服务端窗口，SQL 直接 count 和 offset 分页，不用 cursor（实施时的调整：语料写入频率低，过期窗口重读即可）；前端按分组和搜索分别缓存窗口并用虚拟列表，不一次读取全部语料。
- 搜索对 `normalized_text` 做子串匹配，查询词经同一规范化处理，保证和词条搜索的等价规则一致。
- 词典工作区响应不再包含 `corpus`。
- 语料质量沿用 `POST /api/dictionaries/:id/quality/query`，新增 source `{ type: "corpusQuality", version: 1, options: {} }` 和 `itemKind: "corpusItem"`，窗口项为 `{ item, issues }`。
- 删除 `PUT /api/dictionaries/:id/corpus`。`POST /autosave` 的 `corpus` 改为当前编辑的单条语料。
- 新增错误码需要本地化提示。
- 保存语料且内容变化时，重写连接到它的词条的搜索投影，沿用 `deleteEntry` 中重写引用方投影的做法；只改名称或分组时不重写。所有语料写入都使查询会话 generation 前进（实施时的调整：语料库质量会话依赖它）。

## 7. 界面

### 语料页

两栏：左侧列表，右侧详情，不分查看和编辑状态。

- 列表：搜索框，可折叠分组，未分组排在最后。分组数量来自分组概览，每个展开的分组各自按窗口加载；搜索时不显示分组，平铺结果。行内显示名称，无名称时显示 `\gla` 或第一行；有解析提示时显示图标；有连接时显示数量。继续使用虚拟列表。
- 详情：渲染结果在上；名称和分组是单行输入框，分组提供已有名称建议；内容框上方有粗体、斜体、小型大写按钮；下方只读列出连接的释义，可以打开词条。
- 操作：删除；复制 ExPex 在第 3 阶段加入。自动保存关闭时显示保存按钮。
- “新建语料”在搜索框旁（实施时的调整：窄屏会隐藏顶栏操作），新建的语料加入当前语料的分组，暂时追加到组末。
- 第 3 阶段：分组重命名、整组复制 ExPex；同组内调整顺序沿用 `Alt` + `↑`／`↓` 和拖动把手；在分组中新建时插到当前句之后。
- 语料页使用现有工作页外壳。

保存：同一时间只有一条语料在编辑，草稿模型缩成单条。

- 自动保存开启时持续保存，不重绘编辑区，不改变选择和滚动。
- 自动保存关闭时，切换语料或离开页面走“保存 / 放弃更改 / 取消”。
- 新导航入口（语料到词条、词条到语料）都接入未保存检查。
- 语料改动后，当前词条的例句显示要刷新。

### 释义例句区

完整编辑和局部编辑共用。快速录入没有例句字段，提交时写死的 `example: ""` 一并删除。

- 已连接的例句按渲染结果显示，可解除连接或打开语料。解除连接不删除语料。
- 多条例句可以调整顺序，方式与释义卡片相同：`Alt` + `↑`／`↓` 和拖动把手（第 3 阶段；第 2 阶段按连接顺序显示）。
- 检索框调用语料窗口接口。框为空时按 `Tab` 填入当前词形并开始查找；有内容时 `Tab` 照常移动焦点；`Shift` + `Tab` 不受影响；输入法组字时不触发。这与快速录入的 `Tab` 约定一致。
- “写新例句”展开文本框，保存词条时创建无名称、无分组的语料并连接。改已有句子要跳到语料页。
- 词条详情的例句沿用 `entryExampleRenderPattern` 和对齐设置。

已知限制：检索只匹配文本，查词形找不到变形后的句子，需要手动改搜索词。

### 质量页

质量检查分成“词条”和“语料库”两个平行部分，各有自己的摘要和列表。实施时改为在现有子页分组里加一组“语料库”，与“按优先度”“按检查模块”并列，而不是另做顶部切换。

- 词条部分保持现有的按优先度和按模块分页，去掉“Glossed 例句”模块。
- 语料库部分按问题类型分页：全部、Gloss 不完整、对齐数量不一致、无法解析。列表行显示语料和问题，点击打开语料页的这一条。
- 只有 Gloss 层存在问题才报告。纯文本语料和没有连接的语料都是正常状态。

### 快捷键

| 按键 | 命令 |
|---|---|
| `Ctrl` + `B` | `\textbf{}` |
| `Ctrl` + `I` | `\textit{}` |
| `Ctrl` + `Shift` + `K` | `\textsc{}` |

只在语料内容框和写新例句的框内生效，按钮走同一逻辑：

- 选中普通文字：包裹，光标停在 `}` 后。
- 没有选中且光标在标记外：插入空标记，光标停在括号内。
- 光标或选区在同类标记内：去掉标记，保留文字。

不能复用 `insertSymbolIntoInput()`：它直接给 `value` 赋值，会清掉撤销历史，也不触发 `input` 事件。计划用 `document.execCommand("insertText")`，实施时先验证撤销和 `input` 事件。

## 8. 导入导出

导入只处理 JSON，旧字段转换集中在 `lib/legacy-dictionary-migration.js`。

- 每条非空 `definition.example` 创建一条无名称、无分组的语料并连接。相同文本不合并，以免混淆语境。
- 块标题转成分组。块内先放直属单元，再按顺序放各层单元。空标题的块生成可识别的分组名，重名的块不合并。
- 孤立单元转成未分组语料。
- 单元的备注、标签和属性转成该条开头的 `%` 注释。块和层的同类信息转成其第一条语料的注释；没有单元时生成一条只有注释的语料，内容不丢失。
- 多父级的单元保留第一处，记入迁移报告。
- 旧的渲染设置映射到新设置。

导入边界校验 `examples` 引用的语料存在，语料 ID 进入全局实体 ID 检查。导出只写新形状。

**存量 SQLite 不转换。** 打开数据库时没有版本检查，只执行 `CREATE TABLE IF NOT EXISTS`，所以新版本打开旧词典不会报错，但例句和语料会看不见。实施后第一次运行前，必须用旧版本导出 JSON 再导入。

## 9. 搜索、质量检查和统计

- 搜索：`examples` 字段改由连接的语料生成，值用去除标记后的文本。`entry_search_values` 的主键现在靠释义定位，一个释义多条例句会冲突，来源定位要加上例句位置，并同步前端的命中处理。
- 有无例句筛选：`EXISTS definition_examples`。
- 总览计数：有例句的释义数和词条数改从 `definition_examples` 计算，语义不变。
- 词条质量：删除 `gloss` 模块，词条规则不再读取例句或语料，“Glossed 例句问题”筛选一并删除。词条卡片不再显示 Gloss 问题。
- 语料质量：`gloss_incomplete` 和 `gloss_alignment_mismatch` 迁到独立的语料规则，按语料逐条检查，参数去掉 `definitionId`、`definitionPosition`，改用语料 ID。对齐计数使用新切词规则。新增 `gloss_unparsed`，对应第 3 节的“提示”路径。一句话连接多个释义时只报告一次。
- 语料质量有独立的查询会话，只在打开语料库质量时构建，身份同样绑定 generation。
- 语料页的列表和详情继续显示解析提示，与质量页使用同一个解析器。

## 10. 设置与实施阶段

设置：`corpusUnitCardRenderPattern`、`corpusUnitRenderPattern` 及对应的对齐开关合并为 `corpusRenderPattern`、`corpusGlossAlign`。`entryExampleRenderPattern`、`entryExampleGlossAlign` 和 `corpusAutoSave` 保留。

各阶段独立提交：

1. **Gloss 模型**（2026-11-08 完成）：共用解析器、切词、行内格式、长 Gloss 按列折行、删除 small caps，配 `scripts/check-gloss-model.js` 并接入 `check-all`。数据模型不变，现有例句和语料继续工作。
2. **数据切换**（2026-11-08 完成）：schema、仓库、API、导入导出、搜索、质量检查、统计，以及新语料页和释义例句区。这一步必须一起完成，因为 `definition.example` 和旧语料模块同时删除，不保留过渡层。
3. **编辑增强**：快捷键、复制 ExPex、分组重命名、同组和释义内的顺序调整、在当前句后新建。
4. **收尾**：删除旧语料代码、样式和文案，更新文档。

## 11. 验收

- 新旧格式 JSON 都能导入，例句、语料文本、换行和 Gloss 语法不丢失；重新导出再导入结果一致。
- 编辑语料后，词条显示、搜索和质量检查同步。
- 普通保存、批量 patch、来源引用同步和全量导入后连接都保留。
- 删除有连接的语料时列出受影响的释义，不产生悬空连接；解除连接不删除语料。
- 解析规则逐行有测试：别名、外壳、`//`、成组、空列、注释、未知命令和重复层。
- 复制的 ExPex 用 pdflatex 编译通过，并覆盖转义字符。
- 自动保存不改变选择、滚动、草稿和撤销历史；关闭时切换走三选项确认。
- 快捷键的三种行为、撤销和 `Tab` 检索在真实输入下验证；无法实测的项目按 `AGENTS.md` 列出。
- 用 1 万和 10 万条语料测量：列表只加载和渲染可见窗口，搜索结果遵守词典的搜索规范化规则。
- 同组顺序和释义内例句顺序调整后，重新打开和导出都保持一致。
- 语料库质量覆盖所有语料，纯文本和无连接的语料不产生问题；编辑后重新查询结果同步，点击问题能定位到对应语料。
- 词条质量不再读取语料，也不再包含 Gloss 问题。
- 界面按 `AGENTS.md` 检查中英文、浅色深色、长名称、键盘操作和 320 到 1440px 宽度。

## 12. 实施时同步的文档

- `AGENTS.md`：改写语料相关的数据不变量，第 90 到 92 行和实体 ID 列表。
- `README.md`：语料库、Gloss、快捷键和存储说明。
- `docs/API_CONTRACT.md`：语料端点、错误码、`/autosave`、词条 DTO、`examples` 搜索记录和质量规则表。
- `docs/SQLITE_BACKEND_SPEC.md`：表结构，并删除“语料 SQL 化”“例句语料链接”暂缓项。
- `docs/IMPORT_EXPORT_SPEC.md`：JSON 形状和旧字段转换。
- `docs/API_DRAFTS.md`：删除语料块、层相关的设想。
- `docs/AUDIT_OPEN_ISSUES.md`：关闭 R06 和 R11。
- 完成后，长期契约迁入上述文档，本计划删除。
