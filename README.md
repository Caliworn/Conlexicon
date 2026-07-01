# Conlexicon / 构典

Conlexicon is a local-first web dictionary and editor for constructed languages. It manages multiple dictionaries, supports rich lexical entries, and stores each dictionary in its own JSON file.

Conlexicon 是一个面向人造语言的本地优先网页词典与编辑器。它支持多词典管理、复杂词条编辑，并将每个词典分别保存为独立的 JSON 文件。

## Features / 功能

- Multi-dictionary management: create, switch, import, export, configure, and delete dictionaries, with explicit confirmation before an imported dictionary ID overwrites an existing dictionary.
- Per-dictionary JSON persistence: dictionary entries, corpus data, settings, docs, IPA rules, morphology rules, and UI options are saved with the dictionary.
- Lexical entry editing with lemma, pronunciation, tags, multiple definitions, examples, notes, etymology, sources, and derived-entry backlinks.
- Tag-first part-of-speech logic: the first tag is treated as the part of speech and is used for display/filtering.
- Display mode and edit mode: saved entries open in a clean reading view, with full editing and inline section editing available.
- Advanced filtering from analytics: click analytic rows to filter the entry browser, with reversible filter variants for coverage, IPA, morphology, and quality checks.
- Root mode entry browsing: derived entries can be nested under their roots, with expand/collapse controls and quick derived-entry creation.
- Lexical network view for source and derived relationships, including hover cards and navigation between connected entries.
- Auto IPA rules with mapping, syllabification, onset/coda clusters, complex phonemes, stress settings, sandbox testing, and batch generation.
- Auto morphology tables with custom rule syntax, function objects, overrides, generated forms, and searchable morphology output.
- Markdown language documentation with split edit/preview, edit-only, and preview-only modes.
- Per-dictionary corpus management with ordered blocks, speaker/modality layers, standalone units, inherited attributes, unique entity ID validation, single-parent link validation, and configurable gloss-based unit names with optional render objects.
- Paged data analysis for overview, entries/tags, IPA, morphology, editing activity, quality checks, etymology checks, and glossed examples.
- Gloss rendering for `\gla`, `\glb`, `\glc`, and `\ft`, with independent render-object and alignment settings for corpus unit cards, unit content headings, and entry examples, plus per-object font, size, bold, italic, and `\glb` small-caps styles.
- Per-dictionary UI/settings options, including fuzzy search, label display replacement, highlighted tags, gloss rendering, polysemy display, save/discard/prompt handling for edits during navigation, corpus/docs auto-save, IPA keyboard symbols, and left navigation order.
- Dark mode and Chinese/English UI switching, with the global interface theme and language remembered in `data/index.json`.

- 多词典管理：新建、切换、导入、导出、配置和删除词典；导入相同词典 ID 的词典前会明确确认是否覆盖。
- 词典级 JSON 保存：词条、语料库、设置、语言文档、IPA 规则、形态学规则和界面选项都会随当前词典保存。
- 词条编辑：支持词形、发音、标签、多条释义、例句、备注、词源、来源以及反向衍生链接。
- 标签即词性：第一个标签会被视为词性，用于显示和筛选。
- 查看模式与编辑模式：保存后的词条会进入整洁的阅读界面，也支持完整编辑和栏目局部编辑。
- 数据分析高级筛选：点击统计行可以筛选词条浏览栏，并支持释义覆盖、IPA、形态学、质量检查等项目的筛选条件切换。
- 词根模式浏览：衍生词可以嵌套显示在词根下方，支持展开、收起和快速创建衍生词。
- 词汇网络：展示来源与衍生关系，支持悬浮信息卡和在关联词条之间导航。
- 自动 IPA：支持映射、音节划分、音节首/尾辅音簇、复杂音位、重音设置、沙盒测试和批量生成。
- 自动形态学：支持自定义形态表格、规则语法、函数识别对象、词条覆盖项、生成形式和搜索生成结果。
- Markdown 语言文档：支持左右分栏编辑预览、纯编辑和纯查看模式。
- 词典级语料库：支持有序语料块、发言人/模态语料层、独立语料单元、属性继承、实体 ID 唯一性检查、单父级链接检查，以及带可选渲染对象的 Gloss 单元名渲染。
- 分页式数据分析：包括总览、词条与标签、IPA、形态学、编辑进度、质量检查、词源检查和 glossed 例句检查。
- Gloss 渲染：语料单元卡片、单元内容名称和词条例句可分别配置渲染对象与对齐，并支持 `\gla`、`\glb`、`\glc`、`\ft` 独立配置字体、字号、粗体和斜体，以及 `\glb` small caps。
- 词典级界面设置：包括模糊搜索、标签显示替换、红色高亮标签、gloss 渲染、多义项显示、导航时保存/放弃/提示编辑、语料库/文档自动保存、IPA 虚拟键盘符号和左侧导航栏排序。
- 暗黑模式和中英界面切换；全局界面主题和语言会记忆在 `data/index.json` 中。

## Keyboard Shortcuts / 快捷键

- `Ctrl`/`Cmd` + `S`: save the active edit form or module when saving is available.
- `Ctrl`/`Cmd` + `Enter`: create a new entry when focus is not inside an input, textarea, select, or other editable field. If an unsaved edit is active, Conlexicon uses the existing save / discard / cancel confirmation flow before opening the new entry draft.

- `Ctrl`/`Cmd` + `S`：在当前表单或模块支持保存时执行保存。
- `Ctrl`/`Cmd` + `Enter`：当焦点不在输入框、文本框、下拉框或其他可编辑区域内时新建词条；如果当前有未保存编辑，会沿用现有的“保存 / 放弃 / 取消”确认流程，再进入新词条草稿。

## Run Locally / 本地运行

Conlexicon currently uses a small Node.js backend with no external dependencies.

Conlexicon 目前使用一个小型 Node.js 后端，不需要安装额外依赖。

```bash
node server.js
```

Then open:

然后打开：

```text
http://localhost:4173/
```

## Data Storage / 数据存储

Dictionary data is stored locally under:

词典数据会保存在本地目录：

```text
data/
data/index.json
data/dictionaries/*.json
```

`data/index.json` stores the dictionary index, active dictionary ID, global interface language, and global interface theme. Per-dictionary content and settings remain in `data/dictionaries/*.json`.

`data/index.json` 保存词典索引、当前词典 ID、全局界面语言和全局界面主题；各词典的内容与设置仍分别保存在 `data/dictionaries/*.json` 中。

The `data/` directory is intentionally ignored by Git so personal dictionaries are not committed to the repository.

`data/` 目录已被 Git 忽略，用于避免把个人词库提交到仓库。

## Repository Contents / 仓库内容

```text
index.html   Main UI / 主界面
app.js       Frontend logic / 前端逻辑
server.js    Local backend and JSON persistence / 本地后端与 JSON 保存逻辑
styles.css   Application styling / 应用样式
```

## Notes / 说明

This project is designed for local use first. If you plan to deploy it publicly, review the file persistence and import/export behavior before exposing it to untrusted users.

本项目优先面向本地使用。如果需要公开部署，请先检查文件保存、导入与导出逻辑，再暴露给不可信用户。
