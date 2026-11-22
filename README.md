# Conlexicon / 构典

Conlexicon is a local-first web dictionary and editor for constructed languages. It manages multiple dictionaries, supports rich lexical entries, and stores each dictionary in its own SQLite file.

Conlexicon 是一个面向人造语言的本地优先网页词典与编辑器。它支持多词典管理和复杂词条编辑，并将每个词典分别保存为独立的 SQLite 文件。

See [docs/README.md](docs/README.md) for architecture, API, migration, and feature-design documentation, and [CHANGELOG.md](CHANGELOG.md) for detailed changes.

架构、API、迁移和专题设计文档见 [docs/README.md](docs/README.md)；详细变更见 [CHANGELOG.md](CHANGELOG.md)。

## Features / 功能

- **Dictionaries**: create, switch, import, export, configure, and delete dictionaries. Importing a dictionary whose ID already exists asks before overwriting.
- **Storage**: each dictionary's entries, morphology templates, corpus, documentation, IPA rules, and settings live in its own SQLite file. Legacy JSON is only an explicit import, export, and migration format.
- **Entries**: lemma, pronunciation, tags, multiple definitions (each can carry its own tags; the entry as a whole is filtered and counted by both layers together), examples, notes, etymology, sources, and derived-entry backlinks. Saved entries open in a reading view, with full editing and inline section editing. Full editing offers Cancel and Save; start a blank draft with New Entry.
- **Parts of speech**: only tags listed in the dictionary settings count as parts of speech, so an entry can have several; an empty list means the dictionary does not use them. A word with several parts of speech can put each on its definitions; the entry header marks parts that come from definitions. In the entry list and hover cards, the subtitle shows only the entry's own parts of speech, every meaning is listed (numbered when there are several) and leads with its definition's parts, and the tag row sums up the tags of both layers.
- **Sources**: a source is either a reference to an entry or plain text. References appear as removable cards that can be reordered by dragging or with Alt+arrow keys, while plain text stays editable in the input. Renaming a target keeps the link; deleting it keeps the text without relinking to a namesake. An entry cannot cite itself or the same target twice. Unbound text can be turned into a new entry and linked in one step, and a new derived entry starts with its source already linked.
- **Source suggestions**: suggestions come from the server's lemma search with the same matching rules as the entry list, one line each with part of speech and a short meaning, up to 50 at a time. Homographs are told apart by part of speech and meaning, never by ID. Source links, source cards, derived-entry cards, and lexical-network nodes share one entry hover card.
- **Browsing and filtering**: large lists and root mode load in windows behind one continuous scrollbar. The entry list uses its own navigator in place of the native scrollbar: it positions by entry rather than by pixel, so the thumb follows the pointer while windows load. Hovering it shows where a click would land and floats an index of the current sort (initial letters, or months and years); clicking an index mark jumps to the first entry of that section. Root mode indexes by root and counts positions in groups. On Windows browsers with native middle-click autoscroll, hold the middle mouse button over the entry list and move the pointer up or down to scroll. Search supports per-field strict or fuzzy matching, optional NFC and case folding, and custom equivalence rules. Part-of-speech, analysis, and quality-check filters share one filter bar and keep the current search, sort, and position.
- **Root mode**: derived entries are grouped under their roots, with per-group and global expand/collapse and quick derived-entry creation.
- **Lexical network**: a layered SVG view of sources and derived entries, with animated refocusing, hover details, keyboard support, and a vertical layout on narrow screens.
- **Auto IPA**: mapping, syllabification, onset/coda clusters, multi-character phonemes, stress settings, the IPA keyboard, a sandbox, and batch generation.
- **Morphology** matches each definition's tags in ordered slots and supports table inheritance, cell references and per-entry overrides. Drag table cards across rows to reorder them within a slot, or drop them into another slot to append them. The template editor keeps view switching, save and undo visible while scrolling. Assignment trial and table properties sit in a sticky sidebar on wide workspaces and open in a drawer on narrow ones. Form search, function settings and table-usage analysis are available.
- **Language documentation**: Markdown with split, edit-only, and preview-only modes.
- **Corpus**: one sentence per item, with an optional name and group. New dictionaries save corpus items manually; auto-save can be turned on in Other Settings. Items keep their order within a group; the list loads in windows and searches with the dictionary's search rules, and each item lists the definitions linked to it. Definition examples are links to corpus items: search the corpus from the definition (Tab in the empty search box fills in the lemma), link an item, or write a new example, which becomes an ungrouped item when the entry is saved. Deleting a linked item asks first and removes its links. The quality page has a corpus section for gloss problems.
- **Gloss rendering**: read the way ExPex reads it. `\gla`, `\glb`, `\glc`, and `\glft` (also `\a`, `\b`, `\c`, and `\ft`) start levels; a level runs to `//` or the next marker, so a long level may wrap over lines and `//` is optional. Text before the first level, or `\glpreamble`, is the preamble shown above the gloss. On `\gla`, `+` starts a new line, `@` joins two items, and `\nogloss{…}` has no gloss below it. ExPex wrappers such as `\ex` and `\begingl` and other commands outside a level are skipped. Braces group one aligned item, `{}` is an empty item, lines starting with `%` are comments, and `\textbf`, `\textit`, `\textsc`, and `\textnormal` format text inline. Text after a closed level or a repeated level makes the item show as written, with the reason. The **i** button by the corpus page title explains the syntax. The corpus and entry examples both align corresponding items across levels. The preamble and each level have their own font, size, bold, and italic settings. Plain-text items use the preamble style.
- **Data analysis**: an on-demand overview of lexicon size, coverage, parts of speech, and editing activity, plus tag and tag-set rankings, multi-POS entries and part-of-speech combinations, root families, orthography, IPA checks and distributions, and morphology statistics. Most figures open the matching entries. Quality checks have their own page, grouped by priority and module.
- **Tags**: a dedicated page keeps one ordered registry of parts of speech, display names, red emphasis, and tag order, saving every change at once. With many tags, a compact view shows several per line for reordering by drag. Each tag's actions are in its right-click menu or the ⋯ button.
- **Settings**: per-dictionary options for parts of speech, tag separators and display replacements (the entry list and the filter menu can each show raw tags instead), a tag order that every entry save applies (Apply arranges existing entries; after the order changes, saving the settings offers to do so), whether the entry list's tag row repeats part-of-speech tags, whether the list's part-of-speech text (subtitle and before definitions) shows raw tags, search defaults, gloss rendering, how unsaved edits are handled when navigating, auto-save, IPA keyboard symbols, and navigation order.
- **Fonts**: Layered Glass prioritizes locally installed Segoe UI Variable Text and Segoe UI, with bundled variable Noto Sans as a fallback. The primary UI face's glyph coverage depends on the installed Segoe version. Classic and Liquid Glass use Noto Sans. Headwords, pronunciations, IPA tools, and serif gloss use bundled Charis, while sans-serif gloss uses Noto Sans with browser-synthesized italics. Monospace gloss, corpus and example text editors, Markdown source and code, and shortcut hints prioritize bundled Noto Sans Mono. See the SIL Open Font License in each `OFL.txt` under `assets/fonts/`.
- **Appearance**: Classic, Layered Glass, and Liquid Glass skins, light and dark themes, and Chinese or English UI; the global skin, theme, language, and density are remembered in `data/index.json`. The Appearance menu (palette icon) holds the skin and the density: Auto uses the compact density in desktop windows up to 920px tall, while Compact and Comfortable apply at any window size to the navigation, page heading, entry cards, and entry detail. Liquid Glass is still being tuned and falls back to plain materials when its optics are unavailable or accessibility modes are on.
- **Layout**: a responsive shell with collapsible navigation and entry list, and mobile drawers. The + button in the entry-list toolbar (also beside the list toggle when the list is collapsed, and in the mobile top bar) opens quick entry: an overlay that asks for lemma, pronunciation, tags and definitions one line at a time (its Definition Tags switch adds a tag line before each definition), submits an entry, and starts a fresh draft without leaving the current entry. Its Full Edit button carries the draft into the full editor for sources, examples and notes. Other pages return to the editor through the navigation.

- **词典**：新建、切换、导入、导出、配置和删除词典；导入与现有词典 ID 相同的词典前会确认是否覆盖。
- **存储**：每个词典的词条、形态模板、语料库、语言文档、IPA 规则和设置都保存在各自的 SQLite 文件中；旧 JSON 只作为显式导入、导出和迁移格式。
- **词条**：词形、发音、标签、多条释义（每条释义可带自己的标签，词条整体按两层标签合起来筛选和统计）、例句、备注、词源、来源和反向衍生链接。保存后的词条进入阅读视图，可完整编辑或按栏目局部编辑；完整编辑底部提供删除、取消与保存，需要空白草稿时使用“新建词条”。
- **词性**：只有词典设置中列出的标签才算词性，因此一个词条可以有多个词性；列表留空表示该词典不使用词性。多词性的词可以把词性分别放在各条释义上；词性要么只挂在词条上，要么挂在每条释义上。词条头部显示词条与释义的全部标签，并标出来自释义的标签、两层重复的标签和混用两层的词性，质量检查也会报告后两种情况和没有词性的释义。词条列表和悬浮卡片中，副标题只显示词条自身的词性，全部释义都会列出（多条时编号），每条前显示该释义的词性，标签行汇总两层标签。
- **来源**：来源分为词条引用和纯文本。引用显示为可移除的卡片，可拖动或用 Alt+方向键排序；纯文本留在输入框内编辑。目标改名时链接不变，目标删除后保留文本，不会自动关联同名词条。词条不能引用自身，也不能重复引用同一目标。未绑定的文本可一步创建为新词条并完成链接，新建衍生词时来源已预先链接。
- **来源补全**：候选来自服务端词形搜索，与词条列表使用相同的匹配规则；每项单行显示词性和简短释义，每次最多 50 项。同形词以词性和释义区分，不显示 ID。来源链接、来源卡片、衍生词卡片和词汇网络节点共用同一词条悬浮卡片。
- **浏览与筛选**：大型列表和词根模式分窗加载，保持一条连续滚动条。词条列表用自带的导航条代替原生滚动条：按词条而不是像素定位，窗口加载时抓手仍跟手。指针移到导航条上时，会显示点下去会跳到哪里，并浮出按当前排序分段的索引（首字母或年月），点索引直接跳到该段第一条；词根模式按词根分段，位置以组计。在支持中键自动滚动的 Windows 浏览器中，可把指针放在词条列表上，按住鼠标中键并上下移动来滚动。搜索支持逐字段严格或模糊匹配、可选 NFC 与大小写折叠，以及自定义等价规则。词性、数据分析和质量检查产生的筛选共用一个筛选栏，并保留当前搜索、排序和位置。
- **词根模式**：衍生词按词根分组显示，支持单组和全局展开／收起，以及快速新建衍生词。
- **词汇网络**：以分层 SVG 展示来源与衍生关系，切换焦点时连续过渡，支持悬浮详情、键盘操作和窄屏纵向布局。网络节点和词条详情、完整编辑中的衍生词卡片直接显示词条与各条释义的全部词性，去重后按登记表排序。
- **字体**：层叠玻璃的界面优先使用本机安装的 Segoe UI Variable Text 和 Segoe UI，回退到随项目附带的可变版 Noto Sans。首选界面字体的字形覆盖随本机 Segoe 版本而异。经典和液态玻璃使用 Noto Sans。词形、发音、IPA 工具和 Gloss 的衬线选项使用随附的 Charis。Gloss 的无衬线选项使用 Noto Sans，斜体由浏览器合成。Gloss 的等宽选项、语料和例句正文编辑框、Markdown 源码与代码、快捷键提示优先使用随项目附带的 Noto Sans Mono。字体的 SIL Open Font License 见 `assets/fonts/` 下各目录的 `OFL.txt`。
- **自动 IPA**：映射、音节划分、音节首／尾辅音簇、多字符音位、重音设置、IPA 虚拟键盘、沙盒测试和批量生成。
- **自动形态学**按槽位组织形态表，按释义标签匹配，支持继承、syncretism 引用及逐词覆写。“形态表格”页分为结构视图（槽位、匹配规则、继承、分配试算和词条数）和表格视图（行列、格的状态、词形试算），两者共用一份草稿。同一槽位的表卡片可以跨行拖动排序，拖到另一槽位则追加到末尾。切换视图、保存和撤销放在吸顶工具栏。宽屏的试算、表格属性和选表列表随滚动保持可见。窄屏用工具栏打开试算和属性抽屉或选择表格。表头、格和表卡片的菜单可用 `⋯`、右键或 `Shift+F10` 打开，`Alt+方向键` 调整顺序，删除行列或表格后可撤销。表卡片的“新建父表”可让新父表接管链顶的行列，原表继续持有自己的模板格和逐词覆写。“设置父表”在原列表中区分同链、跨链和不可选的候选。行数和列数分别相同的表可跨链设置父表，确认后按位置迁移模板格、引用和逐词覆写。词条详情把适用同一组释义的表放在一起，共用表只显示一次。小表能并排时并排，超宽表可在表内横向滚动。详情和词形试算合并显示 syncretism 和连续的“不存在”，详情用提示底色标出直接覆写的格。完整编辑和形态局部编辑可写每张表的备注和逐词覆写，查看并删除未生效的覆写。形态搜索、函数设置和按表分析可用，分析页可直接打开对应的模板。
- **语言文档**：Markdown，支持分栏、纯编辑和纯预览模式。
- **语料库**：一句一条，名称和分组可选。新词典默认手动保存，可在其他设置里打开自动保存。新建时先打开草稿，首次保存后才进入列表。放弃新建草稿会关闭编辑，放弃已有语料的更改会恢复上次保存的内容。同组语料保持顺序；列表按窗口加载，搜索使用词典的搜索规则；每条语料列出连接它的释义。释义的例句是对语料的连接：在释义里检索语料（检索框为空时按 Tab 填入词形）并连接，或写新例句，保存词条时会存成一条未分组的语料。删除被连接的语料会先确认并解除连接。质量检查有单独的语料库部分，检查 Gloss 问题。
- **Gloss 渲染**：读法与 ExPex 一致。`\gla`、`\glb`、`\glc`、`\glft`（也可写作 `\a`、`\b`、`\c`、`\ft`）开始一层，一层到 `//` 或下一个层标记为止，所以长的一层可以折行，`//` 也可以省略。第一个层标记之前的文字或 `\glpreamble` 是前言，显示在 Gloss 上方。`\gla` 里的 `+` 换行、`@` 连接两项、`\nogloss{…}` 下方不加注释。`\ex`、`\begingl` 等 ExPex 外壳和层外的其他命令会被跳过。花括号把多个词组成一个对齐项，`{}` 是空项，`%` 开头的行是注释，`\textbf`、`\textit`、`\textsc`、`\textnormal` 用于行内格式。`//` 结束一层后多出的文字或重复的层会让这一条按原文显示并说明原因。语料库页标题旁的 **i** 按钮有格式说明。语料页和词条例句的多层内容都按项对齐。前言及各层的字体、字号、粗体和斜体可独立设置，纯文本语料使用前言样式。
- **数据分析**：按需加载的总览（词汇规模、资料覆盖、词性分布、编辑活动），以及标签与标签集合排行、多词性词条与词性组合、词根家族、正写法、IPA 检查与分布、形态统计；多数统计项可直接打开对应词条。质量检查有独立页面，按优先度和检查模块分组。
- **标签**：独立的标签管理页，用一张有序的登记表管理词性、显示名、红色强调和所有标签的顺序，每次改动立即保存。标签很多时可切换到压缩视图，一行显示多个标签，专门用来拖动排序；每个标签的操作在右键菜单或 ⋯ 按钮里。词性区永远在普通标签之前；新标签保存词条时自动登记，未使用的标签显示为灰色，在用标签不能删除。词条列表、筛选菜单和悬浮卡片的标签显示选项也在这一页。
- **设置**：默认搜索方式、Gloss 渲染、导航时未保存编辑的处理方式、新建按钮默认打开的编辑器、自动保存和导航排序。
- **外观**提供经典、层叠玻璃和液态玻璃三套皮肤，支持浅色与深色主题及中英文界面。明暗切换共用 160ms 柔边转场，太阳与月亮同时旋转淡换。开启减少动态或浏览器缺少转场能力时即时换色。层叠玻璃用云母底、轻投影外壳和更亮的实色卡片分层，最前方的小型浮层、弹窗或词汇网络使用带亮度混合和细噪点的 WinUI 风格亚克力。液态玻璃仍在调校中，光学效果不可用或开启辅助模式时使用普通材质。皮肤、主题、语言和界面密度保存在 `data/index.json`。导航底部的“外观”菜单（调色板图标）里有皮肤和界面密度两组：自动在高度不超过 920px 的桌面窗口里使用紧凑密度，紧凑和舒适在任何窗口下固定使用，作用于导航、页头、词条卡片和词条详情。
- **布局**：响应式外壳，导航可以收起，移动端的导航和词条列表使用抽屉。词条列表顶部是搜索框和一行列表表头（左边排序，右边筛选、词根模式和新建），三套皮肤相同。词条列表工具栏的“+”（移动端在顶栏）默认打开快速录入，`Shift` + 点击改为在完整编辑器中新建；其他设置里可以交换这两种行为，这是词典级设置。快速录入：浮层中逐行填写词形、发音、标签和释义（底栏的“释义标签”开关可在每条释义前加一行释义标签），提交后留在浮层并开始下一条草稿，不离开当前词条。浮层的“最近创建”先列本次提交的词条，再按创建时间倒序列出更早的词条，向下滚动继续加载，点击一行即打开该词条；窗口不小于 900px 时它在字段右侧占一列，更窄时收成底部的折叠条；“完整编辑”把草稿带入完整编辑器，用于补充来源、例句和备注。其他页面通过导航返回词条编辑。

## Keyboard Shortcuts / 快捷键

Press `?` outside a text field to see every shortcut in the app. `Ctrl` and `Cmd` are interchangeable. The main ones:

- `Ctrl` + `K`: jump to the entry search from anywhere. Other pages go through the usual unsaved-changes check first.
- `Ctrl` + `Enter`: open quick entry when focus is not in a text field. `Ctrl` + `Shift` + `Enter` opens the full editor for a new entry instead.
- `Shift` + click on "+": use the other way of adding an entry. A dictionary setting chooses which one a plain click opens; the two `Enter` shortcuts above never change.
- `Ctrl` + `E`: edit the current entry when focus is not in a text field.
- With focus in an open full or local edit: `Ctrl` + `Enter` saves, and `Esc` cancels, asking first if there are unsaved changes.
- `Ctrl` + `S`: save the active edit form or module when saving is available. In a Save / Discard / Cancel prompt it chooses Save and closes the prompt.
- `Alt` + arrow keys on a focused sort card or drag handle: move it one place.

在文本框以外按 `?` 可以查看应用内的完整快捷键列表。`Ctrl` 和 `Cmd` 通用。常用的有：

- `Ctrl` + `K`：从任何页面跳到词条搜索框；在其他页面时先走未保存检查。
- `Ctrl` + `Enter`：焦点不在文本框时打开快速录入。`Ctrl` + `Shift` + `Enter` 改为在完整编辑器中新建词条。
- `Shift` + 点击“+”：改用另一种新建方式。普通点击打开哪一种由词典设置决定，上面两个 `Enter` 快捷键不受影响。
- `Ctrl` + `E`：焦点不在文本框时编辑当前词条。
- 焦点在打开的完整编辑或局部编辑内时：`Ctrl` + `Enter` 保存，`Esc` 取消，有未保存改动时先确认。
- `Ctrl` + `S`：在当前表单或模块支持保存时执行保存。在“保存 / 放弃更改 / 取消”弹窗中按下时选择保存并关闭弹窗。
- 聚焦排序卡片或拖动把手后按 `Alt` + 方向键：移动一位。

## Run Locally / 本地运行

Conlexicon uses a small Node.js backend with no npm dependencies. SQLite is the runtime storage.

Conlexicon 使用一个小型 Node.js 后端，不需要安装 npm 依赖；运行时存储为 SQLite。

```bash
node server.js
```

Then open `http://localhost:4173/`. The server binds to `127.0.0.1` by default. For testing or manual migration, point it at a separate data directory:

然后打开 `http://localhost:4173/`。服务默认只监听本机 `127.0.0.1`。测试或手动迁移时，建议指定单独的数据目录：

```bash
CONLEXICON_DATA_DIR=/tmp/conlexicon-sqlite node server.js
```

For phone or other LAN device testing, explicitly set `CONLEXICON_LAN_DEBUG=1`. This binds to `0.0.0.0` and prints the machine's LAN URLs. Any device on that LAN can read and write the chosen data directory, so use temporary test data. Other values leave LAN access disabled.

需要手机等局域网真机调试时，显式设置 `CONLEXICON_LAN_DEBUG=1`，服务会监听 `0.0.0.0` 并打印本机局域网地址。局域网内任何设备都能读写所选数据目录，请配合临时测试数据使用；其他值均不会开启局域网访问。

```bash
CONLEXICON_LAN_DEBUG=1 CONLEXICON_DATA_DIR=/tmp/conlexicon-lan-debug node server.js
```

Schema changes during development do not migrate existing databases. To move data from a database with an older schema, export JSON with the old version, keep a backup, and import it into a database created by the current version.

开发期 schema 变更不会迁移已有数据库。需要迁移旧结构数据库时，先用旧版本导出 JSON 并备份，再导入由当前版本创建的新数据库。

### Checks / 检查

```bash
node scripts/check-all.js
```

runs the complete model, SQLite, API, and integration suite. Focused checks and benchmarks live in `scripts/`, for example `check-query-page-cache.js`, `check-query-session-cache.js`, and `benchmark-query-session-cache.js --data /path/to/sqlite-data --query bdy --runs 5`.

运行完整的模型、SQLite、API 与集成检查。定向检查和性能基准位于 `scripts/`，例如 `check-query-page-cache.js`、`check-query-session-cache.js` 和 `benchmark-query-session-cache.js --data /path/to/sqlite-data --query bdy --runs 5`。

### Liquid Glass Lab / 液态玻璃实验页

A standalone tuning and geometry diagnostic page is available at `http://localhost:4173/liquid-glass-lab.html`. It runs the production optical engine only, does not call application APIs, and does not save parameter changes. Open it through the local server: from a `file://` URL the Product appearance comparison is disabled and the page says why. Its five licensed backgrounds from Unsplash and Pexels are credited in `THIRD_PARTY_NOTICES.md`. See [the Liquid Glass specification](docs/LIQUID_GLASS_SKIN_SPEC.md) for details.

独立的参数调试与几何诊断页位于 `http://localhost:4173/liquid-glass-lab.html`，只运行生产光学引擎，不调用应用 API，也不保存参数改动。须通过本地服务打开：直接打开文件时“Product role”外观对照会停用，页面顶部会说明原因。五张来自 Unsplash 和 Pexels、具有明确许可的背景图，署名见 `THIRD_PARTY_NOTICES.md`。详见[液态玻璃规范](docs/LIQUID_GLASS_SKIN_SPEC.md)。

### Control gallery / 控件对照页

`http://localhost:4173/control-gallery.html` shows every semantic control recipe and its states side by side under each skin and theme, using the production stylesheets, and runs an in-page contrast and state check. It does not call application APIs or save anything. Open it through the local server: from a `file://` URL the browser blocks reading stylesheet rules, so forced states cannot be shown.

`http://localhost:4173/control-gallery.html` 用生产样式表并排展示各语义控件配方及其状态，可切换皮肤与明暗，并在页内检查对比度和状态区分；不调用应用 API，也不保存任何内容。必须通过本地服务打开，直接打开文件时浏览器不允许读取样式规则，悬浮等状态无法强制显示。详见[样式皮肤规范](docs/STYLE_SKIN_PLAN.md)第 5 节。

### Acrylic Lab / 亚克力 Lab

The Acrylic Lab shows small and large panels on both sides. Choose a recipe independently for each side and tune each panel in its expanded settings. Dragging either panel from its background moves both panels of that size. Open `layered-acrylic-lab.html` from the project root or use the local server. [Acrylic Lab](http://localhost:4173/layered-acrylic-lab.html)

亚克力 Lab 在两侧同时展示大小面板。左右可独立选配方，各面板的参数默认展开。拖动非控件区域时，两侧同尺寸的面板同步移动。可从项目根目录直接打开 `layered-acrylic-lab.html`，也可通过本地服务访问。 [亚克力 Lab](http://localhost:4173/layered-acrylic-lab.html)

## Data Storage / 数据存储

```text
data/index.json              dictionary index, active dictionary, UI language, theme, skin, and density
data/dictionaries/*.sqlite   one file per dictionary: content and settings
```

The `data/` directory is ignored by Git so personal dictionaries are never committed.

Since 2026-10-30, Auto IPA vowel phonemes must be separated by spaces or commas. Legacy JSON is converted on import; for an existing dictionary, retype the vowels on the IPA page (for example `a e i o u`), otherwise the joined vowels count as one item and nothing is syllabified.

To upgrade a dictionary from the previous morphology schema, export it as JSON using the previous version and back up the SQLite data. Start the current version with a new data directory and import the JSON. The current version detects the old morphology schema before writing to it.

Run only one server process per data directory at a time. Index reads and updates are serialized within that process, and writes use atomic file replacement; this does not coordinate multiple server processes.

`data/index.json` 保存词典索引、当前词典及全局界面语言、主题、皮肤和界面密度；每个词典的内容与设置保存在 `data/dictionaries/*.sqlite`。`data/` 已被 Git 忽略，个人词库不会被提交。

2026-10-30 起，自动 IPA 的元音音位必须用空格、逗号或顿号分隔。旧 JSON 导入时会自动转换；已有词典要在 IPA 页重新输入一次元音（例如 `a e i o u`），否则连在一起的元音会算成一项，音节不再切分。

升级到新的形态存储结构前，用旧版将每本词典导出为 JSON 并备份 SQLite 数据。用当前版本启动一个新的数据目录，再导入 JSON。当前版本会在写入前识别旧形态结构。

同一数据目录同一时间只允许一个服务进程写入。索引读取和更新在该进程内串行执行，写入通过原子替换文件发布，不协调多个服务进程。

Legacy JSON dictionaries are not migrated on startup; import them from the dictionary management page. For bulk migration testing, use the explicit script with separate directories. It refuses a non-empty target and never modifies the source:

旧 JSON 词典不会在启动时自动迁移，请在词典管理页导入。测试批量迁移时可使用显式脚本，源目录和目标目录须分开；脚本拒绝写入非空目标目录，也不会修改源目录：

```bash
node scripts/migrate-json-data-to-sqlite.js --from /path/to/json-data --to /path/to/sqlite-data
```

## Repository Contents / 仓库内容

```text
index.html     Main UI / 主界面
app.js         Frontend logic / 前端逻辑
styles.css     Base styles / 基础样式
theme-*.css    Skins / 皮肤样式
lib/           Models shared by frontend and backend, SQLite repository, API routes / 前后端共享模型、SQLite 仓储与 API 路由
server.js      Local HTTP server / 本地 HTTP 服务
scripts/       Checks, benchmarks, and migration tools / 检查、基准与迁移工具
docs/          Technical documentation / 技术文档
```

## Notes / 说明

This project is designed for local use. Before deploying it publicly, review file persistence and import/export behavior before exposing it to untrusted users.

本项目面向本地使用。如需公开部署，请先检查文件保存和导入导出逻辑，再向不可信用户开放。
