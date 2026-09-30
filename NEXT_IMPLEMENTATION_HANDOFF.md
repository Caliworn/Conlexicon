# Conlexicon 实施交接

本文只记录接手所需的当前状态、进行中与待验收事项和下一步。长期规则见 `AGENTS.md`；已完成功能的规范在 `docs/` 专题文档中；2026-09-30 精简前的完整交接内容（含阶段 B 实施流水）原样保存在 [交接历史归档](docs/archive/HANDOFF_HISTORY.md)，仅供追溯，不是现行规范。

## 1. 接手入口

1. 阅读 `AGENTS.md`、[文档索引](docs/README.md)、[API 契约](docs/API_CONTRACT.md)、本文和 `CHANGELOG.md` 最近的日期段。
2. 执行 `git status --short`，确认分支、工作树和最新提交；有未提交改动时先判断归属并提醒用户，不得回滚。
3. 运行期后端只有 SQLite。涉及启动或存储时先跑目标功能的定向检查；跨模块或准备提交时运行 `node scripts/check-all.js`。测试只断言当前契约和明确的架构不变量。

## 2. 仓库速览

- 仓库：`Caliworn/Conlexicon`；本地路径：`C:\Users\scheh\Documents\Conlexicon`。
- 前端：`index.html`、`styles.css`、三套皮肤 `theme-*.css`、`app.js`，共享模型位于 `lib/` 并由前后端共用。
- 后端：无外部依赖的 Node HTTP 服务（`server.js` + `lib/api-routes.js` + `lib/sqlite-dictionary-repository.js`）。
- 存储：`data/index.json` 加每词典一个 `data/dictionaries/*.sqlite`；旧 JSON 只用于显式导入、导出和目录迁移。
- 已完成的主要能力及其规范：应用外壳（[APP_SHELL_SPEC](docs/APP_SHELL_SPEC.md)）、SQLite 主存储（[SQLITE_BACKEND_PLAN](docs/SQLITE_BACKEND_PLAN.md)）、查询会话与窗口化（[QUERY_SESSION_CACHE_PLAN](docs/QUERY_SESSION_CACHE_PLAN.md)）、高级筛选 F0–F4（[ADVANCED_FILTER_QUERY_PLAN](docs/ADVANCED_FILTER_QUERY_PLAN.md)、[FEATURE_RESULT_SESSION_PLAN](docs/FEATURE_RESULT_SESSION_PLAN.md)）、样式皮肤（[STYLE_SKIN_PLAN](docs/STYLE_SKIN_PLAN.md) 及两份玻璃皮肤规范）、来源自动补全（[SOURCE_AUTOCOMPLETE_PLAN](docs/SOURCE_AUTOCOMPLETE_PLAN.md)，2026-09-30 实装）。

## 3. 进行中与待验收

- **来源自动补全界面验收未完成项**：已覆盖中文、经典浅色与液态玻璃暗色、键盘与模拟指针交互；尚未逐项检查英文界面、层叠玻璃、320／480／768／1024 宽度，以及真实输入法和真实鼠标悬停。2026-09-30 修正的请求生命周期（组字、Esc、失焦、编辑退出时取消请求）只用合成事件和延迟请求验证过。留待统一视觉审查。
- **液态玻璃 tinted／solid**（2026-09-24）：已接入语义化 compact 资格入口，自动检查通过；明暗与辅助模式下的可读性、染色强度和分段选中效果待用户验收，当前调参不是视觉定稿。
- **液态玻璃 LQ-7**（全量性能与资源验收）未实施；SDF Baseline 替换生产算法前须先完成 Lab 人工对照，见 [液态玻璃规范](docs/LIQUID_GLASS_SKIN_SPEC.md) 第 13 节。2026-09-27 代码审查另记录三个待 LQ-7 实测确认的风险：`activate()` 对 `document.body` 建立 subtree MutationObserver；词根模式虚拟列表滚动时逐个注册／注销折叠按钮光学表面；`unregister()` 每次断开后为全部表面重新观察祖先链。
- **质量检查 F5-1**：下一步实装 QualityService、最小 repository 输入和 `/quality/query`、`/quality/location`，契约见 [QUALITY_RESULT_PLAN](docs/QUALITY_RESULT_PLAN.md)；之后 F5-2／F5-3 迁移质量页面并替换旧本地质量结果 adapter。
- **词源网络视图对循环和菱形缺少表达**（2026-09-30 检查）：视图只显示一层来源和衍生词；两个词互相引用时对方只出现在来源栏，两条反向连线重叠成双箭头，更长的循环和菱形都看不出来。`/entry-relations` 返回的 `rootGroup` 前端拿到但没有渲染。改进方向（循环标记、双向节点、展开到词根层级）属于界面设计，待用户决定。
- **浏览态词源回退文本**：关系数据加载完成前仍读取前端完整快照（`renderEtymology()`），不在来源补全计划范围内。

## 4. 待视觉审查（记录，暂不单独修复）

- 暗色主题只调亮 `--ui-accent`，未覆盖 `--ui-text-on-solid`：实色强调底上的白字对比度在经典／层叠玻璃暗色约 2.86:1，液态玻璃暗色估算约 4.5:1（其实色配方压暗底色）。受影响的有 `data-control-emphasis="solid"` 的强调／危险按钮和 `.segmented-control` 选中项；改用深色文字约可达 5.8–7.3:1。来源补全选中行已单独改为浅色调高亮，不在此列。（2026-09-30）

## 5. 已知技术债与后续评估

- **前端完整快照的剩余消费者**（2026-09-29 代码检查，随代码变化需复核）。是否移除快照应先实测 10k／30k 词典的快照加载耗时、体积和内存再决定：
  - 服务端已有能力的本地后备：`filteredEntries()` 的本地筛选路径、`refreshActiveFilterState()` 按快照清理失效 ID——可直接删除。
  - 整词典批处理：`batchGenerateIpa()`、`applyTagSortOrder()`、前端 `buildQualityReport()`（其缓存键 `qualityReportCacheKey()` 本身序列化全部词条，为 O(N)）——宜改为服务端批处理命令，质量部分即 F5。
  - 快照同步维护：`upsertEntryInDictionary()`、`removeEntryFromDictionary()`、`applyEntryPatchPayload()`——快照移除后自然消失。
  - 小范围查找：上文的浏览态词源回退文本。
- **代码审查发现**（2026-09-27，尚未处理）：
  - `app.js` 复制了 `lib/dictionary-model.js` 26 个函数中的 22 个（`normalizeDictionary`、`normalizeDictionarySettings` 等），且已出现字段漂移（前端多出 `toolNavOrder`）；前端还在 30 余处对已规范化的 settings 重复调用 `normalizeDictionarySettings()`，部分位于逐标签热路径。
  - `sqlite-dictionary-repository.js` 的 `parseJson()` 在解析失败时静默返回默认值；词典 settings 损坏时可能被默认值覆盖后写回。
  - 对 `NOT NULL` 列的读取仍层层兜底（如 `rowCount || 1` 会把 0 静默改为 1）；`elements.xxx?.` 用于静态 DOM 会掩盖 ID 改名错误。
- 语料库保存：评估是否先拆为块／单元级 changeset，再决定何时 SQL 分表。
- 增量保存稳定后，基于目标对象 `updatedAt` 做轻量冲突检查；短期不引入词典级 revision。

## 6. 路线图

1. **F5 质量检查查询化**：见上文；`source_cycle` 消费[词源图模块](docs/ETYMOLOGY_GRAPH_PLAN.md)的分量结果。
2. **阶段 A+ 触摸、焦点与无障碍**：[计划](docs/TOUCH_FOCUS_A11Y_PLAN.md)，建议在阶段 B 或 C 之后集中处理。
3. **阶段 C 例句迁移为语料单元链接**：[计划](docs/EXAMPLE_CORPUS_LINK_PLAN.md)。
4. **阶段 D 语料库工作区重做**：[计划](docs/CORPUS_WORKSPACE_PLAN.md)，依赖阶段 C。

约束：

- 各阶段独立提交，不在同一批改动中同时进行产品内自动迁移、例句语料迁移和大规模前端模块化。
- 旧 JSON 词典通过词典管理的 JSON 导入手动迁入 SQLite；未设计备份、报告和回滚前不加入启动时自动迁移。
- 不一次性重写 `app.js`；后端沿 `lib/` 既有边界增量拆分。前端若改用 ES modules，单独提交并完整验证启动、Electron 和全局事件。Gloss 解析、实体 ID 验证和迁移函数保持前后端单一实现。
