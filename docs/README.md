# Conlexicon Documentation / 构典技术文档

本目录收纳 Conlexicon 的长期技术契约、当前架构说明和活跃专题计划。项目介绍、运行方式和用户可见功能见仓库根目录的 [README](../README.md)；长期协作规则与当前阶段交接分别见 [AGENTS.md](../AGENTS.md) 和 [NEXT_IMPLEMENTATION_HANDOFF.md](../NEXT_IMPLEMENTATION_HANDOFF.md)。

## 文档索引

| 文档 | 状态 | 用途 |
| --- | --- | --- |
| [API Contract](API_CONTRACT.md) | 稳定契约 | 前后端 HTTP API、本地访问与静态资源边界、LAN 调试开关、错误结构、读取与保存边界；列表窗口与前端缓存、EntryFilter 入口归属与前端筛选状态、feature result 与音系引擎边界、来源补全 controller、词根拓扑语义，质量检查规则集与 issue/summary 语义。 |
| [API Drafts](API_DRAFTS.md) | 非现行契约 | 从 API Contract 移出的未实装设想：启动索引拆分端点、共享查询上下文与功能服务分层、共享关系任务、诊断修复模块、语料细粒度 changeset 与对象级乐观锁；采用前须复评。 |
| [Audit Open Issues](AUDIT_OPEN_ISSUES.md) | 长期维护，2026-10-19 专项复查 | 审计、安全审计与技术债复查中所有未解决问题的唯一清单：保存一致性、规则执行与算法、无关全量工作、代码质量与待测风险，含处理顺序；不含皮肤与视觉问题。 |
| [SQLite Backend Specification](SQLITE_BACKEND_SPEC.md) | 当前规范 | SQLite 存储形态、索引串行与原子写入、repository 分层与能力边界、schema、搜索 projection、查询会话与结果缓存（身份、失效、cursor 重建、容量），以及基准前暂缓的优化。 |
| [Import and Export Specification](IMPORT_EXPORT_SPEC.md) | 当前规范 | 旧 JSON 导入与转换服务、目录迁移脚本、导出 profile、备份与回滚；未实装的 SQLite／XLSX 交换与产品内迁移入口。 |
| [Entry Incremental Save Plan](ENTRY_INCREMENTAL_SAVE_PLAN.md) | 设计草案，未实施 | 审计 A20＋A05：词条写入只改动变化的主表列、子表和投影字段；`PUT` 基于 `updatedAt` 的条件保存与冲突确认。 |
| [Definition Tag Plan](DEFINITION_TAG_PLAN.md) | 阶段 1 已实施（2026-10-25），阶段 2（界面）未实施 | 释义标签与多词性词条：释义可带标签、词条整体取并集（只向上继承）且按标签排序配置排列，形态默认按有效标签匹配，分析页统计多词性词条与词性组合；已实施部分的契约见 API 契约"释义标签与有效标签"，本文保留界面设计、决定点与实施出入。 |
| [Morphology Assignment Plan](MORPHOLOGY_ASSIGNMENT_PLAN.md) | 设计草案，已复评，未实施 | 形态分配重做：去掉形态组，表格以析取范式规则直接匹配；每张表属于一个槽位，槽位内按 elsewhere 由更具体者胜出、槽位间叠加，槽位顺序即显示顺序；覆写按表记录，旧数据转换结果不变；槽位面板、试算面板与影响范围的编辑界面。 |
| [App Shell Specification](APP_SHELL_SPEC.md) | 阶段 A 已完成 | 响应式应用外壳：布局、外壳状态模型、DOM/CSS 边界、断点与验收。 |
| [Touch, Focus and Accessibility Plan](TOUCH_FOCUS_A11Y_PLAN.md) | 阶段 A+ 未开始 | 触摸替代交互、输入能力判定、命中区域、焦点管理与无障碍验收。 |
| [Example Corpus Link Plan](EXAMPLE_CORPUS_LINK_PLAN.md) | 阶段 C 未开始 | 词条例句迁移为语料单元引用的目标模型、自动迁移、编辑行为与验收。 |
| [Corpus Workspace Plan](CORPUS_WORKSPACE_PLAN.md) | 阶段 D 未开始 | 语料库轨道工作区、文本与时间轴模式、属性继承、长 Gloss、草稿与性能。 |
| [Style Skin Plan](STYLE_SKIN_PLAN.md) | S0、控件材质职责收尾、控件对照页与开关控件已完成 / 视觉定稿待实施 | 样式 token、材质角色、视觉基线与通用皮肤边界；控件颜色语义、焦点与开关控件契约；普通控件材质职责收尾、控件对照页与视觉定稿的分批计划。 |
| [Entry Editor Unboxing Plan](ENTRY_EDITOR_UNBOXING_PLAN.md) | U1–U3 已完成（2026-10-09～10）/ U4 待 tint 定稿，U5 搁置 | 完整编辑与局部编辑去框化：沿用详情分区分隔接口、框预算、字段与操作栏皮肤 token、分阶段实施与验收。 |
| [Layered Glass Skin Specification](LAYERED_GLASS_SKIN_SPEC.md) | LG-1–LG-4C 已完成 | 层叠玻璃皮肤的层级、透明度、静态与指针响应光学层、运行期选择、降级与性能验收。 |
| [Liquid Glass Skin Specification](LIQUID_GLASS_SKIN_SPEC.md) | LQ-1–LQ-6 已完成 / LQ-7 待实施 | 液态玻璃的材质角色、生产光学引擎、正式表面覆盖、降级和性能边界；LQ-7 性能上限分析与待实测优化候选，Lab 整理方向，tint 与玻璃感的待验证方向。 |
| [Liquid Glass Web Research](archive/LIQUID_GLASS_RESEARCH.md) | 历史归档，非现行规范 | Apple 公开设计边界、开源实现/许可、早期三条 Lab 基线的对照结论；SDF 与 Reference 已于 2026-10-01 放弃并删除。 |
| [Handoff History](archive/HANDOFF_HISTORY.md) | 历史归档，非现行规范 | 2026-09-30 精简前的交接文档，含阶段 B 实施流水与当时的接手清单。 |

## 推荐阅读顺序

1. 修改前后端接口时先读 [API Contract](API_CONTRACT.md)。
2. 修改存储、查询、索引或缓存时再读 [SQLite Backend Specification](SQLITE_BACKEND_SPEC.md)。
3. 涉及旧 JSON、导入、导出或迁移时读 [Import and Export Specification](IMPORT_EXPORT_SPEC.md)。
4. 处理查询窗口、cursor、筛选或功能结果时，读 API Contract 的“读取 API”与“分析、功能结果与质量查询”两节。
5. 修改主题、材质或组件视觉时先读 [Style Skin Plan](STYLE_SKIN_PLAN.md)；实现层叠玻璃或液态玻璃时再读各自的皮肤规范。
6. 开始阶段 A+、C 或 D 前，先读对应计划文档并按 `AGENTS.md` 做独立复评；追溯历史决策背景时再查 [Handoff History](archive/HANDOFF_HISTORY.md)。

文档中以反引号标出的源码和脚本路径默认相对于仓库根目录；Markdown 链接则相对于当前文档解析。
