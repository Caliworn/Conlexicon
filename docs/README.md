# Conlexicon Documentation / 构典技术文档

本目录收纳 Conlexicon 的长期技术契约、当前架构说明和活跃专题计划。项目介绍、运行方式和用户可见功能见仓库根目录的 [README](../README.md)；长期协作规则与当前阶段交接分别见 [AGENTS.md](../AGENTS.md) 和 [NEXT_IMPLEMENTATION_HANDOFF.md](../NEXT_IMPLEMENTATION_HANDOFF.md)。

## 文档索引

| 文档 | 状态 | 用途 |
| --- | --- | --- |
| [API Contract](API_CONTRACT.md) | 稳定契约 | 前后端 HTTP API、错误结构、读取与保存边界。 |
| [SQLite Backend Plan](SQLITE_BACKEND_PLAN.md) | 当前架构 | SQLite schema、repository 现状、查询层与后续优化。 |
| [SQLite Migration Plan](SQLITE_MIGRATION_PLAN.md) | 当前架构 / 后续计划 | 旧 JSON 导入、SQLite 迁移、导出 profile、备份与回滚边界。 |
| [Query Session Cache Plan](QUERY_SESSION_CACHE_PLAN.md) | 已实装设计参考 | 查询会话、cursor、缓存失效、窗口化和结果定位语义。 |
| [Advanced Filter Query Plan](ADVANCED_FILTER_QUERY_PLAN.md) | 部分完成 / 活跃计划 | 高级筛选 F0–F3、IPA feature result 迁移，以及 Gloss/形态/质量结果的后续阶段。 |
| [Feature Result Session Plan](FEATURE_RESULT_SESSION_PLAN.md) | F4b-0/F4b-1 已完成 | 重型分析结果源、运行时会话、音系引擎边界、IPA 试点与后续分阶段验收。 |

## 推荐阅读顺序

1. 修改前后端接口时先读 [API Contract](API_CONTRACT.md)。
2. 修改存储、查询或索引时再读 [SQLite Backend Plan](SQLITE_BACKEND_PLAN.md)。
3. 涉及旧 JSON、导入、导出或迁移时读 [SQLite Migration Plan](SQLITE_MIGRATION_PLAN.md)。
4. 处理查询窗口、cursor 或筛选时分别补读查询缓存、高级筛选与功能结果会话专题文档。

文档中以反引号标出的源码和脚本路径默认相对于仓库根目录；Markdown 链接则相对于当前文档解析。
