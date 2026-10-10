# Conlexicon Documentation / 构典技术文档

本目录收纳 Conlexicon 的长期技术契约、当前架构说明和活跃专题计划。项目介绍、运行方式和用户可见功能见仓库根目录的 [README](../README.md)；长期协作规则与当前阶段交接分别见 [AGENTS.md](../AGENTS.md) 和 [NEXT_IMPLEMENTATION_HANDOFF.md](../NEXT_IMPLEMENTATION_HANDOFF.md)。

## 文档索引

| 文档 | 状态 | 用途 |
| --- | --- | --- |
| [API Contract](API_CONTRACT.md) | 稳定契约 | 前后端 HTTP API、错误结构、读取与保存边界。 |
| [Audit Open Issues](AUDIT_OPEN_ISSUES.md) | 长期维护，2026-10-01 复核 | 审计、安全审计与技术债复查中所有未解决问题的唯一清单：保存一致性、HTTP 访问边界、规则执行与算法、无关全量工作、代码质量与待测风险，含处理顺序；不含皮肤与视觉问题。 |
| [Index Write Consistency Plan](INDEX_WRITE_CONSISTENCY_PLAN.md) | 设计草案（2026-10-10），待确认 | A02＋A03：`index.json` 串行读改写、原子替换、新建与导入失败时回到请求前状态；多进程记为运行约束。 |
| [Data Normalization Repair Plan](DATA_NORMALIZATION_REPAIR_PLAN.md) | 已复评，尚未实装 | SQLite JSON 读取不再吞错、只读接口按需读取、删除无用词条形态派生字段、前后端共享纯数据规则、settings 读取收敛、普通保存不再做跨类型 ID 扫描。 |
| [SQLite Backend Plan](SQLITE_BACKEND_PLAN.md) | 当前架构 | SQLite schema、repository 现状、查询层与后续优化。 |
| [SQLite Migration Plan](SQLITE_MIGRATION_PLAN.md) | 当前架构 / 后续计划 | 旧 JSON 导入、SQLite 迁移、导出 profile、备份与回滚边界。 |
| [Query Session Cache Plan](QUERY_SESSION_CACHE_PLAN.md) | 已实装设计参考 | 查询会话、cursor、缓存失效、窗口化和结果定位语义。 |
| [Advanced Filter Query Plan](ADVANCED_FILTER_QUERY_PLAN.md) | F0–F4 核心完成 / F5-0 已完成 | EntryFilter、轻量分析、IPA/形态 feature result，以及 Gloss/质量结果的后续边界。 |
| [Feature Result Session Plan](FEATURE_RESULT_SESSION_PLAN.md) | F4b-0–F4b-3 已完成 | IPA/形态结果源、运行时会话、音系引擎边界和分阶段验收。 |
| [Etymology Graph Plan](ETYMOLOGY_GRAPH_PLAN.md) | 已实装（2026-09-30） | 词根拓扑语义与来源图强连通分量共享模块；F5-1 `source_cycle` 消费其分量结果。 |
| [Quality Result Plan](QUALITY_RESULT_PLAN.md) | F5-0 已完成 / F5-1–F5-3 待办 | 质量规则集、issue/summary、独立查询 API、结果会话与迁移验收。 |
| [Source Autocomplete Plan](SOURCE_AUTOCOMPLETE_PLAN.md) | 已实装（2026-09-30），界面验收部分待完成 | 来源补全复用 lemma 搜索 projection 的只读候选查询、消歧 DTO、异步 controller 与键盘契约。 |
| [App Shell Specification](APP_SHELL_SPEC.md) | 阶段 A 已完成 | 响应式应用外壳：布局、外壳状态模型、DOM/CSS 边界、断点与验收。 |
| [Touch, Focus and Accessibility Plan](TOUCH_FOCUS_A11Y_PLAN.md) | 阶段 A+ 未开始 | 触摸替代交互、输入能力判定、命中区域、焦点管理与无障碍验收。 |
| [Example Corpus Link Plan](EXAMPLE_CORPUS_LINK_PLAN.md) | 阶段 C 未开始 | 词条例句迁移为语料单元引用的目标模型、自动迁移、编辑行为与验收。 |
| [Corpus Workspace Plan](CORPUS_WORKSPACE_PLAN.md) | 阶段 D 未开始 | 语料库轨道工作区、文本与时间轴模式、属性继承、长 Gloss、草稿与性能。 |
| [Style Skin Plan](STYLE_SKIN_PLAN.md) | S0 已完成 / 控件材质职责收尾待实施 | 样式 token、材质角色、视觉基线与通用皮肤边界；普通控件材质职责收尾、控件对照页与视觉定稿的分批计划。 |
| [Entry Editor Unboxing Plan](ENTRY_EDITOR_UNBOXING_PLAN.md) | U1–U3 已完成（2026-10-09～10）/ U4 待 tint 定稿，U5 搁置 | 完整编辑与局部编辑去框化：沿用详情分区分隔接口、框预算、字段与操作栏皮肤 token、分阶段实施与验收。 |
| [Layered Glass Skin Specification](LAYERED_GLASS_SKIN_SPEC.md) | LG-1–LG-4C 已完成 | 层叠玻璃皮肤的层级、透明度、静态与指针响应光学层、运行期选择、降级与性能验收。 |
| [Liquid Glass Skin Specification](LIQUID_GLASS_SKIN_SPEC.md) | LQ-1–LQ-6 已完成 / LQ-7 待实施 | 液态玻璃的材质角色、生产光学引擎、正式表面覆盖、降级和性能边界；LQ-7 性能上限分析与待实测优化候选，Lab 整理方向，tint 与玻璃感的待验证方向。 |
| [Liquid Glass Web Research](archive/LIQUID_GLASS_RESEARCH.md) | 历史归档，非现行规范 | Apple 公开设计边界、开源实现/许可、早期三条 Lab 基线的对照结论；SDF 与 Reference 已于 2026-10-01 放弃并删除。 |
| [Handoff History](archive/HANDOFF_HISTORY.md) | 历史归档，非现行规范 | 2026-09-30 精简前的交接文档，含阶段 B 实施流水与当时的接手清单。 |

## 推荐阅读顺序

1. 修改前后端接口时先读 [API Contract](API_CONTRACT.md)。
2. 修改存储、查询或索引时再读 [SQLite Backend Plan](SQLITE_BACKEND_PLAN.md)。
3. 涉及旧 JSON、导入、导出或迁移时读 [SQLite Migration Plan](SQLITE_MIGRATION_PLAN.md)。
4. 处理查询窗口、cursor 或筛选时分别补读查询缓存、高级筛选与功能结果会话专题文档。
5. 修改主题、材质或组件视觉时先读 [Style Skin Plan](STYLE_SKIN_PLAN.md)；实现层叠玻璃或液态玻璃时再读各自的皮肤规范。
6. 开始阶段 A+、C 或 D 前，先读对应计划文档并按 `AGENTS.md` 做独立复评；追溯历史决策背景时再查 [Handoff History](archive/HANDOFF_HISTORY.md)。

文档中以反引号标出的源码和脚本路径默认相对于仓库根目录；Markdown 链接则相对于当前文档解析。
