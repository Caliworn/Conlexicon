# Conlexicon / 人造语言词典

Conlexicon is a local-first web dictionary and editor for constructed languages. It manages multiple dictionaries, supports rich lexical entries, and keeps each dictionary in its own JSON file.

Conlexicon 是一个面向人造语言的本地优先网页词典与编辑器。它支持多词典管理、复杂词条编辑，并将每个词典分别保存为独立的 JSON 文件。

## Features / 功能

- Multi-dictionary management: create, switch, import, export, configure, and delete dictionaries.
- Lexical entry editing with lemma, pronunciation, tags, multiple definitions, examples, notes, etymology, and derived-entry backlinks.
- Tag-first part-of-speech logic: the first tag is treated as the part of speech.
- Auto IPA rules with mapping, syllabification, stress, sandbox testing, and batch generation.
- Auto morphology tables with custom rule syntax, overrides, and searchable generated forms.
- Markdown language documentation with split edit/preview modes.
- Data analysis for entry coverage, tags, IPA, morphology, etymology networks, and quality checks.
- Lexical network view for sources and derived forms.
- Per-dictionary UI/settings options, including fuzzy search, label display replacement, highlighted tags, gloss rendering, and polysemy display.

- 多词典管理：新建、切换、导入、导出、配置、删除词典。
- 词条编辑：支持词形、发音、标签、多条释义、例句、备注、词源与反向衍生链接。
- 标签即词性：第一个标签自动作为词性显示与筛选依据。
- 自动 IPA：支持映射规则、音节划分、重音、沙盒测试和批量生成。
- 自动形态学：支持自定义形态表格、规则语法、词条覆盖项，以及搜索生成形式。
- Markdown 语言文档：支持左右分栏实时编辑与预览。
- 数据分析：统计词条覆盖率、标签、IPA、形态学、词源网络和质量检查。
- 词汇网络：展示来源与衍生关系。
- 词典级设置：支持模糊搜索、标签显示替换、标签红色高亮、gloss 渲染和多义项显示等。

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

The `data/` directory is intentionally ignored by Git so personal dictionaries are not committed to the repository.

`data/` 目录已被 Git 忽略，用来避免把个人词库提交到仓库。

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
