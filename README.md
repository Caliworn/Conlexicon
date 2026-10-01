# Conlexicon / 构典

Conlexicon is a local-first web dictionary and editor for constructed languages. It manages multiple dictionaries, supports rich lexical entries, and stores each dictionary in its own SQLite file.

Conlexicon 是一个面向人造语言的本地优先网页词典与编辑器。它支持多词典管理和复杂词条编辑，并将每个词典分别保存为独立的 SQLite 文件。

See [docs/README.md](docs/README.md) for architecture, API, migration, and feature-design documentation, and [CHANGELOG.md](CHANGELOG.md) for detailed changes.

架构、API、迁移和专题设计文档见 [docs/README.md](docs/README.md)；详细变更见 [CHANGELOG.md](CHANGELOG.md)。

## Features / 功能

- **Dictionaries**: create, switch, import, export, configure, and delete dictionaries. Importing a dictionary whose ID already exists asks before overwriting.
- **Storage**: each dictionary's entries, morphology templates, corpus, documentation, IPA rules, and settings live in its own SQLite file. Legacy JSON is only an explicit import, export, and migration format.
- **Entries**: lemma, pronunciation, tags, multiple definitions, examples, notes, etymology, sources, and derived-entry backlinks. Saved entries open in a reading view, with full editing and inline section editing. Full editing offers Cancel and Save; start a blank draft with New Entry.
- **Parts of speech**: only tags listed in the dictionary settings count as parts of speech, so an entry can have several; an empty list means the dictionary does not use them.
- **Sources**: a source is either a reference to an entry or plain text. References appear as removable cards that can be reordered by dragging or with Alt+arrow keys, while plain text stays editable in the input. Renaming a target keeps the link; deleting it keeps the text without relinking to a namesake. An entry cannot cite itself or the same target twice. Unbound text can be turned into a new entry and linked in one step, and a new derived entry starts with its source already linked.
- **Source suggestions**: suggestions come from the server's lemma search with the same matching rules as the entry list, one line each with part of speech and a short meaning, up to 50 at a time. Homographs are told apart by part of speech and meaning, never by ID. Source links, source cards, derived-entry cards, and lexical-network nodes share one entry hover card.
- **Browsing and filtering**: large lists and root mode load in windows behind one continuous scrollbar. Search supports per-field strict or fuzzy matching, optional NFC and case folding, and custom equivalence rules. Part-of-speech, analysis, and quality-check filters share one filter bar and keep the current search, sort, and position.
- **Root mode**: derived entries are grouped under their roots, with per-group and global expand/collapse and quick derived-entry creation.
- **Lexical network**: a layered SVG view of sources and derived entries, with animated refocusing, hover details, keyboard support, and a vertical layout on narrow screens.
- **Auto IPA**: mapping, syllabification, onset/coda clusters, complex phonemes, stress settings, a sandbox, and batch generation.
- **Auto morphology**: template groups with multiple tables, automatic or manual group selection per entry, rule syntax, function objects, overrides, and searchable generated forms.
- **Language documentation**: Markdown with split, edit-only, and preview-only modes.
- **Corpus**: ordered blocks, speaker/modality layers, standalone units, inherited attributes, ID and parent-link validation, and gloss-based unit names.
- **Gloss rendering**: `\gla`, `\glb`, `\glc`, and `\ft`, with separate settings for corpus unit cards, unit headings, and entry examples, plus per-line font, size, bold, italic, and `\glb` small caps.
- **Data analysis**: an on-demand overview of lexicon size, coverage, parts of speech, and editing activity, plus tag and tag-set rankings, root families, orthography, IPA checks and distributions, and morphology statistics. Most figures open the matching entries. Quality checks have their own page, grouped by priority and module.
- **Settings**: per-dictionary options for parts of speech, tag separators and display replacements (the entry list and the filter menu can each show raw tags instead), search defaults, gloss rendering, polysemy display, how unsaved edits are handled when navigating, auto-save, IPA keyboard symbols, and navigation order.
- **Appearance**: Classic, Layered Glass, and Liquid Glass skins, light and dark themes, and Chinese or English UI; the global skin, theme, and language are remembered in `data/index.json`. Liquid Glass is still being tuned and falls back to plain materials when its optics are unavailable or accessibility modes are on.
- **Layout**: a responsive shell with collapsible navigation and entry list, and mobile drawers. New entries start from the entry-list toolbar's + button (also shown beside the list toggle when the list is collapsed); other pages return to the editor through the navigation.

- **词典**：新建、切换、导入、导出、配置和删除词典；导入与现有词典 ID 相同的词典前会确认是否覆盖。
- **存储**：每个词典的词条、形态模板、语料库、语言文档、IPA 规则和设置都保存在各自的 SQLite 文件中；旧 JSON 只作为显式导入、导出和迁移格式。
- **词条**：词形、发音、标签、多条释义、例句、备注、词源、来源和反向衍生链接。保存后的词条进入阅读视图，可完整编辑或按栏目局部编辑；完整编辑提供取消与保存，需要空白草稿时使用“新建词条”。
- **词性**：只有词典设置中列出的标签才算词性，因此一个词条可以有多个词性；列表留空表示该词典不使用词性。
- **来源**：来源分为词条引用和纯文本。引用显示为可移除的卡片，可拖动或用 Alt+方向键排序；纯文本留在输入框内编辑。目标改名时链接不变，目标删除后保留文本，不会自动关联同名词条。词条不能引用自身，也不能重复引用同一目标。未绑定的文本可一步创建为新词条并完成链接，新建衍生词时来源已预先链接。
- **来源补全**：候选来自服务端词形搜索，与词条列表使用相同的匹配规则；每项单行显示词性和简短释义，每次最多 50 项。同形词以词性和释义区分，不显示 ID。来源链接、来源卡片、衍生词卡片和词汇网络节点共用同一词条悬浮卡片。
- **浏览与筛选**：大型列表和词根模式分窗加载，保持一条连续滚动条。搜索支持逐字段严格或模糊匹配、可选 NFC 与大小写折叠，以及自定义等价规则。词性、数据分析和质量检查产生的筛选共用一个筛选栏，并保留当前搜索、排序和位置。
- **词根模式**：衍生词按词根分组显示，支持单组和全局展开／收起，以及快速新建衍生词。
- **词汇网络**：以分层 SVG 展示来源与衍生关系，切换焦点时连续过渡，支持悬浮详情、键盘操作和窄屏纵向布局。
- **自动 IPA**：映射、音节划分、音节首／尾辅音簇、复杂音位、重音设置、沙盒测试和批量生成。
- **自动形态学**：模板组及组内多个表格、词条级自动或手动选择形态组、规则语法、函数识别对象、覆盖项，以及可搜索的生成形式。
- **语言文档**：Markdown，支持分栏、纯编辑和纯预览模式。
- **语料库**：有序语料块、发言人／模态语料层、独立语料单元、属性继承、ID 与父级链接校验，以及基于 Gloss 的单元名。
- **Gloss 渲染**：支持 `\gla`、`\glb`、`\glc`、`\ft`；语料单元卡片、单元标题和词条例句分别设置，并可逐行配置字体、字号、粗体、斜体以及 `\glb` small caps。
- **数据分析**：按需加载的总览（词汇规模、资料覆盖、词性分布、编辑活动），以及标签与标签集合排行、词根家族、正写法、IPA 检查与分布、形态统计；多数统计项可直接打开对应词条。质量检查有独立页面，按优先度和检查模块分组。
- **设置**：词典级的词性、标签分隔符与显示替换（词条列表和筛选菜单可分别改为显示原始标签）、默认搜索方式、Gloss 渲染、多义项显示、导航时未保存编辑的处理方式、自动保存、IPA 键盘符号和导航排序。
- **外观**：经典、层叠玻璃和液态玻璃三套皮肤，浅色与深色主题，中英文界面；全局皮肤、主题和语言记忆在 `data/index.json` 中。液态玻璃仍在调校中，光学效果不可用或开启辅助模式时会退回普通材质。
- **布局**：响应式外壳，导航和词条列表均可收起，移动端使用抽屉。新建词条从词条列表工具栏的“+”开始（列表收起时列表开关旁也会显示“+”）；其他页面通过导航返回词条编辑。

## Keyboard Shortcuts / 快捷键

- `Ctrl`/`Cmd` + `S`: save the active edit form or module when saving is available.
- `Ctrl`/`Cmd` + `Enter`: create a new entry when focus is not in an editable field. Unsaved edits go through the usual save / discard / cancel prompt first.
- In a source field: `↑`/`↓` move the current suggestion; `Enter` links it, and with no current suggestion keeps the text and never submits the form; `Tab` only moves focus; `Esc` closes the suggestions and keeps the text.

- `Ctrl`/`Cmd` + `S`：在当前表单或模块支持保存时执行保存。
- `Ctrl`/`Cmd` + `Enter`：焦点不在可编辑区域时新建词条；有未保存编辑时先走“保存 / 放弃 / 取消”确认。
- 来源输入框内：`↑`/`↓` 移动当前候选；`Enter` 绑定当前候选，没有当前候选时保留文本且不提交表单；`Tab` 只移动焦点；`Esc` 关闭候选并保留文本。

## Run Locally / 本地运行

Conlexicon uses a small Node.js backend with no npm dependencies. SQLite is the runtime storage.

Conlexicon 使用一个小型 Node.js 后端，不需要安装 npm 依赖；运行时存储为 SQLite。

```bash
node server.js
```

Then open `http://localhost:4173/`. For testing or manual migration, point the server at a separate data directory:

然后打开 `http://localhost:4173/`。测试或手动迁移时，建议指定单独的数据目录：

```bash
CONLEXICON_DATA_DIR=/tmp/conlexicon-sqlite node server.js
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

A standalone tuning and geometry diagnostic page is available at `http://localhost:4173/liquid-glass-lab.html`. It runs the production optical engine only, does not call application APIs, and does not save parameter changes. Its five licensed backgrounds from Unsplash and Pexels are credited in `THIRD_PARTY_NOTICES.md`. See [the Liquid Glass specification](docs/LIQUID_GLASS_SKIN_SPEC.md) for details.

独立的参数调试与几何诊断页位于 `http://localhost:4173/liquid-glass-lab.html`，只运行生产光学引擎，不调用应用 API，也不保存参数改动。五张来自 Unsplash 和 Pexels、具有明确许可的背景图，署名见 `THIRD_PARTY_NOTICES.md`。详见[液态玻璃规范](docs/LIQUID_GLASS_SKIN_SPEC.md)。

## Data Storage / 数据存储

```text
data/index.json              dictionary index, active dictionary, UI language, theme, and skin
data/dictionaries/*.sqlite   one file per dictionary: content and settings
```

The `data/` directory is ignored by Git so personal dictionaries are never committed.

`data/index.json` 保存词典索引、当前词典及全局界面语言、主题和皮肤；每个词典的内容与设置保存在 `data/dictionaries/*.sqlite`。`data/` 已被 Git 忽略，个人词库不会被提交。

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
