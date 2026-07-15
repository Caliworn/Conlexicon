# Conlexicon / 构典

Conlexicon is a local-first web dictionary and editor for constructed languages. It manages multiple dictionaries, supports rich lexical entries, and stores each active dictionary in its own SQLite file.

Conlexicon 是一个面向人造语言的本地优先网页词典与编辑器。它支持多词典管理、复杂词条编辑，并将每个正在使用的词典分别保存为独立的 SQLite 文件。

## Features / 功能

- Multi-dictionary management: create, switch, import, export, configure, and delete dictionaries, with explicit confirmation before an imported dictionary ID overwrites an existing dictionary.
- Per-dictionary SQLite persistence: entries and their structured subobjects, morphology template groups/tables/overrides, corpus data, settings, docs, and IPA rules are stored locally with each dictionary. Legacy JSON remains an explicit import/export and debugging format.
- Lexical entry editing with lemma, pronunciation, tags, multiple definitions, examples, notes, etymology, sources, and derived-entry backlinks.
- Configurable part-of-speech logic: by default the first tag is treated as the part of speech; an optional explicit tag list supports multiple parts of speech per entry for display and filtering.
- Display mode and edit mode: saved entries open in a clean reading view, with full editing and inline section editing available.
- Responsive application shell with collapsible tool navigation, a collapsible entry list, and mobile drawer controls for navigation, entry browsing, and creating entries.
- Advanced filtering from analytics and quality checks: click analytic rows or quality categories to filter the entry browser, with reversible filter variants for coverage, IPA, morphology, and quality issues.
- Root mode entry browsing: derived entries can be nested under their roots, with expand/collapse controls and quick derived-entry creation.
- Lexical network view for source and derived relationships, including hover cards and navigation between connected entries.
- Auto IPA rules with mapping, syllabification, onset/coda clusters, complex phonemes, stress settings, sandbox testing, and batch generation.
- Auto morphology with template groups, multiple subtables per group, automatic or manual per-entry group selection, rule syntax, function objects, overrides, generated forms, and searchable morphology output.
- Markdown language documentation with split edit/preview, edit-only, and preview-only modes.
- Per-dictionary corpus management with ordered blocks, speaker/modality layers, standalone units, inherited attributes, unique entity ID validation, single-parent link validation, and configurable gloss-based unit names with optional render objects.
- Paged data analysis for overview, entries/tags, IPA, morphology, and editing activity, plus a dedicated quality-check page for priority/module issue review.
- Gloss rendering for `\gla`, `\glb`, `\glc`, and `\ft`, with independent render-object and alignment settings for corpus unit cards, unit content headings, and entry examples, plus per-object font, size, bold, italic, and `\glb` small-caps styles.
- Per-dictionary UI/settings options, including per-field search/fuzzy controls, optional NFC and Unicode case folding, custom search equivalence rules, etymology autocomplete matching, label display replacement, highlighted tags, gloss rendering, polysemy display, save/discard/prompt handling for edits during navigation, corpus/docs auto-save, IPA keyboard symbols, and left navigation order.
- SQLite-backed per-value search projections for static entry fields and generated morphology, with configurable strict/fuzzy matching and localized hit summaries. Very large result sets currently show a loaded-count notice until full data windowing is implemented.
- Dark mode and Chinese/English UI switching, with the global interface theme and language remembered in `data/index.json`.

- 多词典管理：新建、切换、导入、导出、配置和删除词典；导入相同词典 ID 的词典前会明确确认是否覆盖。
- 词典级 SQLite 保存：词条及其结构化子对象、形态模板组/子表/覆盖项、语料库、设置、语言文档和 IPA 规则都会随当前词典保存在本地。旧 JSON 仅作为显式导入、导出和调试格式保留。
- 词条编辑：支持词形、发音、标签、多条释义、例句、备注、词源、来源以及反向衍生链接。
- 可配置词性逻辑：默认将第一个标签视为词性；也可显式指定词性标签列表，使一个词条拥有多个词性并用于显示和筛选。
- 查看模式与编辑模式：保存后的词条会进入整洁的阅读界面，也支持完整编辑和栏目局部编辑。
- 响应式应用外壳：支持可收起工具导航、可收起词条列表，以及移动端用于导航、浏览词条和新建词条的抽屉控件。
- 数据分析与质量检查高级筛选：点击统计行或质量类别可以筛选词条浏览栏，并支持释义覆盖、IPA、形态学、质量问题等项目的筛选条件切换。
- 词根模式浏览：衍生词可以嵌套显示在词根下方，支持展开、收起和快速创建衍生词。
- 词汇网络：展示来源与衍生关系，支持悬浮信息卡和在关联词条之间导航。
- 自动 IPA：支持映射、音节划分、音节首/尾辅音簇、复杂音位、重音设置、沙盒测试和批量生成。
- 自动形态学：支持模板组及组内多个形态表格、词条级自动匹配或手动选择形态组、规则语法、函数识别对象、词条覆盖项、生成形式和搜索生成结果。
- Markdown 语言文档：支持左右分栏编辑预览、纯编辑和纯查看模式。
- 词典级语料库：支持有序语料块、发言人/模态语料层、独立语料单元、属性继承、实体 ID 唯一性检查、单父级链接检查，以及带可选渲染对象的 Gloss 单元名渲染。
- 分页式数据分析：包括总览、词条与标签、IPA、形态学和编辑进度；质量检查拥有独立页面，支持按优先度和检查模块查看问题。
- Gloss 渲染：语料单元卡片、单元内容名称和词条例句可分别配置渲染对象与对齐，并支持 `\gla`、`\glb`、`\glc`、`\ft` 独立配置字体、字号、粗体和斜体，以及 `\glb` small caps。
- 词典级界面设置：包括逐字段搜索/模糊匹配、可选 NFC 与 Unicode 大小写折叠、自定义搜索等价规则、词源自动补全、标签显示替换、红色高亮标签、gloss 渲染、多义项显示、导航时保存/放弃/提示编辑、语料库/文档自动保存、IPA 虚拟键盘符号和左侧导航栏排序。
- SQLite 逐值搜索投射：静态词条字段和自动生成形态均支持可配置的严格/模糊搜索及本地化命中摘要；超大结果集在完整数据窗口化实装前会显示当前已加载数量。
- 暗黑模式和中英界面切换；全局界面主题和语言会记忆在 `data/index.json` 中。

## Keyboard Shortcuts / 快捷键

- `Ctrl`/`Cmd` + `S`: save the active edit form or module when saving is available.
- `Ctrl`/`Cmd` + `Enter`: create a new entry when focus is not inside an input, textarea, select, or other editable field. If an unsaved edit is active, Conlexicon uses the existing save / discard / cancel confirmation flow before opening the new entry draft.

- `Ctrl`/`Cmd` + `S`：在当前表单或模块支持保存时执行保存。
- `Ctrl`/`Cmd` + `Enter`：当焦点不在输入框、文本框、下拉框或其他可编辑区域内时新建词条；如果当前有未保存编辑，会沿用现有的“保存 / 放弃 / 取消”确认流程，再进入新词条草稿。

## Run Locally / 本地运行

Conlexicon currently uses a small Node.js backend with no external npm dependencies. The default storage backend is SQLite.

Conlexicon 目前使用一个小型 Node.js 后端，不需要安装额外 npm 依赖。默认存储后端是 SQLite。

```bash
node server.js
```

To use the legacy JSON repository for debugging or old data, select it explicitly:

如需为了调试或旧数据读取使用 legacy JSON repository，可以显式选择：

```bash
CONLEXICON_REPOSITORY=json node server.js
```

When testing or migrating manually, a separate data directory is still recommended:

测试或手动迁移时，仍建议配合单独的数据目录：

```bash
CONLEXICON_DATA_DIR=/tmp/conlexicon-sqlite node server.js
```

Then open:

然后打开：

```text
http://localhost:4173/
```

For the focused frontend query-cache contract check, run:

前端查询缓存的定向契约检查可通过以下命令运行：

```bash
node scripts/check-query-page-cache.js
```

For the backend runtime query-session cache and SQLite integration check, run:

后端运行时查询会话及 SQLite 接线可通过以下命令检查：

```bash
node scripts/check-query-session-cache.js
```

To compare cold and repeated hot query-session performance against an existing SQLite test data directory, run:

如需使用现有 SQLite 测试词典比较查询会话的冷查询与重复热查询性能，可运行：

```bash
node scripts/benchmark-query-session-cache.js --data /path/to/sqlite-data --query bdy --runs 5
```

## Data Storage / 数据存储

Dictionary data is stored locally under:

词典数据会保存在本地目录：

```text
data/
data/index.json
data/dictionaries/*.sqlite
```

`data/index.json` stores the dictionary index, active dictionary ID, global interface language, and global interface theme. Per-dictionary content and settings are stored in `data/dictionaries/*.sqlite` by default.

`data/index.json` 保存词典索引、当前词典 ID、全局界面语言和全局界面主题；默认情况下，各词典的内容与设置分别保存在 `data/dictionaries/*.sqlite` 中。

Legacy JSON dictionaries are not migrated automatically on startup. To reuse an old JSON dictionary in SQLite mode, import the JSON file from the app's dictionary management UI. For debugging or rollback, start with `CONLEXICON_REPOSITORY=json` and the original JSON data directory.

旧 JSON 词典不会在启动时自动迁移。若要在 SQLite 模式下复用旧 JSON 词典，请在应用的词典管理界面导入对应 JSON 文件。如需调试或回滚，可使用 `CONLEXICON_REPOSITORY=json` 和原 JSON 数据目录启动。

For bulk migration testing, use the explicit JSON-to-SQLite migration script with separate source and target data directories:

如需测试批量迁移，可使用显式的 JSON 到 SQLite 迁移脚本，并为源目录和目标目录指定不同位置：

```bash
node scripts/migrate-json-data-to-sqlite.js --from /path/to/json-data --to /path/to/sqlite-data
```

The script refuses to write into a non-empty target directory and does not modify the source directory.

该脚本会拒绝写入非空目标目录，并且不会修改源目录。

The `data/` directory is intentionally ignored by Git so personal dictionaries are not committed to the repository.

`data/` 目录已被 Git 忽略，用于避免把个人词库提交到仓库。

## Repository Contents / 仓库内容

```text
index.html   Main UI / 主界面
app.js       Frontend logic / 前端逻辑
server.js    Local backend with selectable repository / 可选择 repository 的本地后端
styles.css   Application styling / 应用样式
```

## Notes / 说明

This project is designed for local use first. If you plan to deploy it publicly, review the file persistence and import/export behavior before exposing it to untrusted users.

本项目优先面向本地使用。如果需要公开部署，请先检查文件保存、导入与导出逻辑，再暴露给不可信用户。
