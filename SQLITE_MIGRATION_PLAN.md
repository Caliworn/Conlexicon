# SQLite 正式迁移与 JSON 兼容层设计

本文记录 Conlexicon 从 JSON 词典文件过渡到 SQLite 主存储时的迁移、转换、兼容导入和导出设计。它补充 `SQLITE_BACKEND_PLAN.md`：后者关注 SQLite schema 和 API 反推，本文关注“如何安全地从旧数据进入新存储，以及以后如何把数据导出为不同交换格式”。

## 1. 总原则

- SQLite 是未来唯一的 canonical storage。应用运行期读写、查询、索引、分析和质量检查最终都应以 SQLite 为准。
- JSON 不再作为长期主存储格式继续演化；它退位为 legacy import source 和 export profile。
- 前端只依赖 HTTP API，不感知当前词典来自旧 JSON、SQLite、兼容导出还是其他格式。
- 不长期双写 JSON 与 SQLite。双写会制造两个真相来源，并让错误恢复、版本检查和用户解释都变复杂。
- 不静默原地迁移用户真实 `data/`。正式迁移必须有备份、报告和可解释的失败路径。

## 2. 术语

| 名称 | 含义 |
| --- | --- |
| Canonical SQLite dictionary | 应用正式使用的 `.sqlite` 词典文件。 |
| Legacy JSON dictionary | 旧版 Conlexicon 直接存储和读取的 JSON 词典文件。 |
| Normalized dictionary | 经过当前 `normalizeDictionary()` 的当前形状内存词典对象，只包含当前规范化、ID 补齐和当前语义校验。旧字段兼容应在进入 normalized dictionary 前完成。 |
| Import adapter | 把某种外部格式解析成 normalized dictionary 或可诊断中间结构的模块。 |
| Export profile | 从 canonical SQLite dictionary 生成某种导出格式的规则，例如 legacy JSON、portable JSON、compact JSON、XLSX。 |
| Migration report | 迁移或导入过程生成的结构化报告，记录成功项、警告、修复和失败原因。 |

## 3. 目标形态

长期目标不是“JSON repository 与 SQLite repository 平级存在”，而是：

```text
应用运行期
  HTTP API
    ↓
  SQLite repository / query services
    ↓
  *.sqlite canonical dictionary

兼容输入
  Legacy JSON / future XLSX / other dictionaries
    ↓
  import adapters
    ↓
  normalized dictionary
    ↓
  SQLite writer

兼容输出
  SQLite reader
    ↓
  export profiles
    ↓
  JSON / XLSX / other exchange formats
```

JSON repository 在迁移完成后可以保留为：

- 旧数据读取和迁移工具的一部分。
- legacy/debug subset 的基础检查对象。
- 旧 JSON 导入转换和 legacy JSON 导出 profile 的参考。
- 紧急回退工具，但不作为普通运行期主路径。

JSON repository 不再作为并行后端追随新增功能。SQLite repository 跑完整当前主契约；JSON repository 只覆盖旧 JSON 导入/转换、基础读取、legacy 导出和显式回滚相关检查。

## 4. 标准转换服务

建议新增独立转换层，例如 `lib/dictionary-conversion-service.js`。它不属于前端，也不属于某个 UI 页面；它是后端数据层的标准入口。

第一批接口可以是概念上的：

```js
parseLegacyJsonDictionary(payload, options)
normalizeImportedDictionary(source, options)
buildImportReport(source, normalized, diagnostics)
writeNormalizedDictionaryToSqlite(normalized, options)
exportSqliteDictionary(dictionaryId, profile, options)
migrateJsonDataDirectoryToSqlite(sourceDataDir, targetDataDir, options)
```

其中 `lib/legacy-dictionary-migration.js` 负责旧 JSON 字段迁移和迁移报告，`SqliteDictionaryRepository.importDictionarySnapshot()` 可以继续承担“把 normalized dictionary 写入 SQLite”的底层能力；转换服务负责更高层的格式判断、报告、备份策略和 profile 选择。

## 5. 导入流程

Legacy JSON 导入应分为几个明确阶段：

1. 解析 payload。
   - 判断是不是可识别词典。
   - 拒绝非对象、空对象或明显不是词典的结构。
2. legacy 兼容迁移。
   - 由 `lib/legacy-dictionary-migration.js` 处理旧字段，例如旧释义/例句字段、旧来源文本字段、旧 corpus 字段、旧 IPA `stressMappings`、旧设置字段，以及旧形态 `morphology.tables` / `entry.morphology` 结构。
   - 记录发生过的 legacy 字段转换。
3. 规范化。
   - 补齐缺失 ID。
   - 规范化当前形状的 settings、docs、corpus、morphology、IPA、entries、definitions、sources、tags。
   - 对错误词典 ID 提供“作为新词典导入并重新生成 ID”的路径。
4. 校验。
   - 完整实体 ID 唯一性。
   - 语料父子关系、顺序字段、模块结构。
   - 形态语法、IPA 映射规则等已有模块校验。
5. 写入 SQLite。
   - 创建或覆盖目标 `.sqlite`。
   - 写入 module blobs、entry JSON、projection tables 和索引。
6. 生成 report。
   - 成功词典 ID。
   - 入口来源。
   - 自动修复项。
   - 警告。
   - 失败项和错误码。

导入相同词典 ID 时仍必须保留“导入并覆盖 / 取消”确认，不能静默覆盖。

## 6. 正式迁移流程

正式迁移是“把现有 JSON data directory 转换成 SQLite data directory”，不是普通导入单个文件。

建议第一版先实现脚本，不先做 UI：

```bash
node scripts/migrate-json-data-to-sqlite.js --from <json-data-dir> --to <sqlite-data-dir>
```

脚本默认只允许写入不存在或为空的目标目录，不直接覆盖源目录，也不允许源目录和目标目录互相嵌套。正式接入产品时再加入 UI 或启动向导。

当前脚本会输出 JSON migration report，并已有 `scripts/check-sqlite-migration.js` 使用临时目录验证源目录不被修改、目标 SQLite 可读、active dictionary 和 UI 偏好被保留。

### 6.1 迁移步骤

1. 读取源 `index.json`。
2. 枚举源词典文件。
3. 对每本词典执行导入流程。
4. 写入目标 `index.json`。
5. 写入目标 `.sqlite` 词典文件。
6. 输出迁移报告。
7. 可选执行导出 roundtrip 检查。

### 6.2 备份策略

正式产品内迁移时必须有备份：

```text
data/
data-backup-before-sqlite-YYYYMMDD-HHMMSS/
```

或采用新目录写入：

```text
data-json-legacy/
data/
```

推荐默认采用“新目录写入 + 原目录保留”的策略。它比原地改写更容易解释，也更容易回滚。

### 6.3 不建议的策略

- 不建议启动时发现 JSON 就自动覆盖成 SQLite。
- 不建议没有报告地自动修复重复 ID。
- 不建议同时维护 JSON 与 SQLite 两份实时可写数据。

## 7. 导出 profile

未来导出不应只有“把内部结构原样吐成 JSON”这一种。

建议先把 JSON 导出也视为 profile：

| profile | 目标 | 说明 |
| --- | --- | --- |
| `legacy-json` | 尽量兼容旧 Conlexicon JSON | 用于旧版回退或人工查看；不承诺永久等同内部结构。 |
| `portable-json` | 新版推荐交换格式 | 可包含 schemaVersion、exportedAt、profile 等元数据；更适合长期交换。 |
| `compact-json` | 备份或版本管理 | 可裁剪派生字段、排序稳定、体积较小。 |
| `xlsx` | 表格交换 | 适合词条、释义、标签、来源、IPA 等扁平化导出；复杂模块可能拆成多 sheet。 |
| `fieldwork` / `interlinear` | 后续田野或语料交换 | 预留给语料和 gloss 工具升级后设计。 |

`GET /api/export` 后续可以扩展参数：

```text
GET /api/export?dictionaryId=...&format=json&profile=portable-json
GET /api/export?dictionaryId=...&format=xlsx
```

导出 profile 的输出结构可以与旧内部 JSON 不完全一致，但必须有文档和版本号。

## 8. `index.json` 的未来职责

迁移后 `index.json` 仍保留为全局索引和 UI 偏好文件，但不保存词典内容，也不承担 JSON/SQLite 混合存储识别。项目方向是全面 SQLite 化；正式运行期词典文件统一为 `data/dictionaries/<dictionary-id>.sqlite`。

当前推荐保持简单结构：

```json
{
  "activeDictionaryId": "dict-...",
  "uiLanguage": "zh",
  "uiTheme": "light",
  "dictionaryIds": ["dict-..."]
}
```

词典名称、语言、描述、`entryCount/rootCount` 等从 SQLite 轻量查询；不写入 `index.json` 作为第二份真相。除非未来确有启动性能需求，否则不要为了过渡期存储分流给 `index.json` 增加 `storage/path` 字段。

## 9. 失败与诊断

迁移和导入失败应尽量结构化：

| 类型 | 处理 |
| --- | --- |
| 词典 JSON 无法解析 | 拒绝导入，报告文件和解析错误。 |
| 词典 ID 格式无效 | 提示作为新词典导入并重新生成 ID。 |
| 词典 ID 已存在 | 需要覆盖确认。 |
| 实体 ID 重复 | 拒绝迁移该词典，报告重复类型和位置；后续诊断修复模块可提供修复。 |
| legacy 字段被转换 | 迁移成功但写入 warning。 |
| 语料结构错误 | 拒绝或降级为 warning 需谨慎，默认拒绝更安全。 |
| 未识别字段 | 默认保留在 normalized/exportable 结构中或记录 warning；不要静默丢弃。 |

诊断修复模块可以复用迁移 report 的结构，但不要把未解析来源等普通质量检查问题塞进迁移诊断。迁移诊断只处理“会影响数据能否安全进入 canonical storage”的问题。

在语料库尚未正式 SQL 化之前，`corpus` 仍作为 module blob 保存，但其 block、layer、unit ID 仍属于全局实体 ID 命名空间。完整导入、迁移、词条保存和语料模块保存都必须把 corpus blob 内部 ID 纳入防撞；普通设置和文档保存则不应因为无关的历史 corpus ID 问题被阻断。repository contract 已覆盖 corpus ID 与词条/释义 ID 互撞、corpus 内部重复 ID 等场景，避免后续 SQLite 下推或语料库重构时绕过该规则。

## 10. 默认切换清单与当前策略

本节记录把默认 repository 从 JSON 改为 SQLite 时使用的 checklist，以及当前开发期迁移策略。默认 repository 已切换为 SQLite；旧 JSON 词典暂时不做启动时自动迁移，而是通过词典管理界面的 JSON 导入功能手动导入到 SQLite 数据目录。自动迁移向导、备份报告和产品内迁移 UI 暂缓。

### 10.1 已用于默认切换的检查项

- 当前改动已经提交或至少形成清晰 checkpoint；SQLite schema 中间态不做兼容迁移，测试库不匹配时从 JSON 重新生成。
- 本地没有残留测试服务端口；尤其确认默认端口 `4173` 和最近使用的 smoke 端口没有被旧 `node server.js` 占用。
- 当前 Node runtime 支持 `node:sqlite`；不支持时必须给出明确启动错误，而不是静默退回 JSON repository。
- 已用 `scripts/migrate-json-data-to-sqlite.js` 或应用内 JSON 导入路径验证 JSON → SQLite 数据进入流程。
- SQLite 数据目录至少包含：
  - `index.json`
  - 每个词典一个 `dictionaries/<dictionary-id>.sqlite`
  - `entries` 表无 `entry_json` 列
  - `morphology_template_groups/tables/cells` 与 `entry_morphology_groups/cell_overrides` 表存在
  - `entries.etymology_description` 列存在
- 下列脚本通过：
  - `node --check app.js`
  - `node --check server.js`
  - `node --check lib/sqlite-dictionary-repository.js`
  - `node scripts/check-sqlite-schema.js`
  - `node scripts/check-sqlite-lifecycle.js`
  - `node scripts/check-sqlite-repository.js`
  - `node scripts/check-sqlite-contract.js`
  - `node scripts/check-sqlite-migration.js`
  - `node scripts/check-default-repository.js`
  - `git diff --check`
- SQLite 模式下完成一次 API smoke，至少覆盖：
  - 轻量 `/api/state`
  - 当前词典完整 snapshot
  - entries 列表、单条读取、facets、entry relations、root groups
  - 普通搜索和带搜索 root groups
  - 新建、完整编辑保存、批量 patch、删除
- SQLite 模式下完成一次 UI smoke，至少覆盖：
  - 启动页面渲染
  - 切换/读取当前真实词典
  - 新建并保存词条
  - 数据分析页可渲染
  - 质量检查页可渲染
  - 浏览器 console 无 error
- 手动确认真实词典可用：
  - 第二标准语词典
  - Stress Test 1k
  - Stress Test 3k
  - Stress Test 10k
- 默认切换时必须更新 `README.md`、`API_CONTRACT.md` 和本文档，明确：
  - SQLite 是默认 repository。
  - JSON repository 仅作为 legacy/debug/迁移来源，不再同步新增普通功能。
  - 旧 JSON data 需要显式导入或显式迁移；开发期不静默原地迁移真实 `data/`。
  - 回滚方式是显式设置 `CONLEXICON_REPOSITORY=json` 并使用原 JSON data 目录。

### 10.2 可暂缓但必须记录

以下项目不是默认切 SQLite 的阻断项，但切换时必须在文档中明确其状态：

- 普通文本搜索、fuzzy 搜索、tag fuzzy、动态形态搜索仍可能从 SQL 表重建完整 dictionary object 后用共享 JS 逻辑扫描；这不依赖 JSON repository，但仍不是纯 SQL/FTS。
- 带搜索条件的 root groups 仍可能走共享 JS 语义。
- 数据分析和质量检查仍主要由前端/共享 JS 基于完整 dictionary object 计算，尚未全部 API 化或 SQL 化。
- 语料库仍作为 `module_blobs.corpus` 保存，尚未正式 SQL 分表。
- JSON 导入/导出仍返回完整 dictionary-shaped JSON；这是交换/备份路径，不代表存储层仍使用 JSON repo。

### 10.3 当前切换结果

1. `server.js` 默认 repository 已改为 SQLite。
2. `CONLEXICON_REPOSITORY=json` 保留为显式 legacy/debug/回滚模式。
3. 启动时不自动扫描并迁移旧 JSON data。
4. 旧 JSON 词典当前通过词典管理界面的 JSON 导入功能手动迁入 SQLite。
5. `scripts/migrate-json-data-to-sqlite.js` 仍保留为批量迁移测试和后续迁移向导的基础设施。
6. 后续如果增加产品内迁移入口，必须补备份、迁移报告、失败回滚和用户确认流程。

### 10.4 回滚步骤

- 如果默认 SQLite 启动失败，先不要修改或删除原 JSON `data/`。
- 设置：

```bash
CONLEXICON_REPOSITORY=json
```

- 使用原 JSON `data/` 目录启动。
- 若已经生成 SQLite 测试目录，可以直接丢弃并重新迁移；开发期不为中间 SQLite schema 写兼容迁移。
- 如果失败来自真实数据结构问题，优先记录迁移 report 和错误码，再决定是否加入诊断修复模块，而不是在默认启动路径中静默修复。

## 11. 测试要求

默认 SQLite 后仍需保留以下测试边界：

- SQLite repository 契约测试继续通过。
- 默认 repository 启动检查继续覆盖：
  - 无 `CONLEXICON_REPOSITORY` 时启动 SQLite。
  - `CONLEXICON_REPOSITORY=json` 时仍可显式切回 legacy/debug JSON repository。
- 转换服务测试覆盖：
  - 旧 JSON → normalized dictionary。
  - normalized dictionary → SQLite。
  - SQLite → legacy-json。
  - SQLite → portable-json。
- 目录迁移脚本测试覆盖：
  - 使用临时数据目录。
  - 覆盖多词典、当前词典、无词典、坏词典、重复 ID、无效词典 ID。
  - 确认源目录不被修改。
- roundtrip 检查覆盖：
  - legacy JSON 输入迁移到 SQLite 后，导出 profile 能通过对应格式校验。

所有测试数据必须放在临时目录，不使用真实 `data/`。

## 12. 分阶段实施建议

### M0：文档与契约

- 确认 SQLite 是 canonical storage。
- 明确 JSON 是 legacy import/export profile。
- 明确导出 profile 与旧内部 JSON 可以分离。

### M1：转换服务骨架

- 抽 `dictionary-conversion-service`。
- 把现有 import/normalize/export 调用通过该服务集中。
- 暂时不改变 UI。

### M2：迁移脚本

- 新增 `scripts/migrate-json-data-to-sqlite.js`。
- 只操作临时或显式指定目录。
- 输出机器可读和人可读 report。
- 当前已实现第一版 CLI 和临时目录检查脚本；后续可继续扩展 report 详情、失败项定位和产品内迁移入口。

### M3：导出 profile

- 把现有 JSON 导出命名为 `legacy-json` 或 `portable-json` 的一个明确 profile。
- 为 XLSX 导出预留 adapter 位置。

### M4：产品内迁移入口

- 启动时检测旧 JSON data。
- 显示迁移说明、备份路径和迁移报告。
- 允许取消，不静默覆盖。

### M5：切换默认后端

- 已完成：默认 repository 改为 SQLite。
- 已完成：JSON repository 降级为 legacy/debug/迁移来源和契约参考。
- 已完成：继续保留显式兼容 JSON 导入/导出。
- 暂缓：产品内自动迁移向导；当前旧 JSON 词典通过词典管理界面的 JSON 导入功能手动迁入 SQLite。
