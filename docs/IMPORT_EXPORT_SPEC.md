# 导入导出规范

本文是 Conlexicon 旧 JSON 导入、转换服务、目录迁移、导出 profile、备份与回滚的规范。它补充 [SQLite 后端规范](SQLITE_BACKEND_SPEC.md)：后者规定 SQLite schema、repository 和查询层，本文规定旧数据如何安全进入 SQLite，以及数据如何导出为交换格式。导入/导出端点见 [API Contract](API_CONTRACT.md#导入导出与词典生命周期)。

## 1. 总原则

- SQLite 是唯一的 canonical storage，应用运行期读写与查询均以 SQLite 为准。
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
| Export profile | 从 canonical SQLite dictionary 生成某种导出格式的规则，例如 legacy JSON、SQLite 文件或 XLSX。 |
| Migration report | 迁移或导入过程生成的结构化报告，记录成功项、警告、修复和失败原因。 |

## 3. 目标形态

当前已经采用单一 SQLite runtime repository：

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

旧 JSON runtime repository 已移除。旧 JSON 只保留为兼容输入、导出 profile 和离线目录迁移格式：单文件导入由 conversion service 与 legacy migration 处理，目录迁移脚本直接只读旧 `index.json` 和词典文件后写入 SQLite，不再通过第二套 repository。

## 4. 标准转换服务

已存在独立转换层 `lib/dictionary-conversion-service.js`。它不属于前端，也不属于某个 UI 页面；它是旧 JSON 导入解析和 JSON export profile 校验的标准入口。

当前已落地的核心接口是：

```js
parseLegacyJsonDictionary(payload, options)
importDictionaryFromJsonPayload(payload, options)
exportDictionarySnapshot(dictionary, options)
```

其中 `lib/legacy-dictionary-migration.js` 负责旧 JSON 字段迁移和迁移报告，`SqliteDictionaryRepository.importDictionarySnapshot()` 负责把 normalized dictionary 写入 SQLite；目录级迁移由 `scripts/migrate-json-data-to-sqlite.js` 负责。转换服务不承担普通运行期写入。

## 5. 导入流程

Legacy JSON 导入应分为几个明确阶段：

1. 解析 payload。
   - 判断是不是可识别词典。
   - 拒绝非对象、空对象或明显不是词典的结构。
2. legacy 兼容迁移。
   - 由 `lib/legacy-dictionary-migration.js` 处理旧字段，例如旧释义/例句字段、旧来源文本字段、旧 corpus 字段、旧 IPA `stressMappings`、旧设置字段，以及旧形态 `morphology.tables` / `entry.morphology` 结构。
   - 记录发生过的 legacy 字段转换。
   - 迁移会移除旧的空释义；判断"空"时也看释义标签 `definitions[].tags`，因此当前格式中只有标签的释义会保留。旧 JSON 没有释义标签。
   - 文件没有 `tagRegistry` 时，由 `partOfSpeechTags`、`tagSortOrder`、`tagDisplayMap`、`redHighlightTags` 和词典中实际在用的标签生成登记表，并从 settings 移除这四项（见 5.1）。
3. 规范化。
   - 补齐缺失 ID。
   - 规范化当前形状的 settings、docs、corpus、morphology、IPA、entries、definitions（含可选的释义标签 `tags`，缺省为 `[]`）、sources、tags。
   - 规范化标签登记表：同一标签保留首行，词性区排在普通区之前，与自身相同的显示名按空保存；文件中在用但未登记的标签按首次出现追加到普通区末尾。
   - 对错误词典 ID 提供“作为新词典导入并重新生成 ID”的路径。
4. 校验。
   - 完整实体 ID 唯一性。
   - 语料父子关系、顺序字段、模块结构。
   - 形态语法、IPA 映射规则等已有模块校验。
   - `tagRegistry` 是数组，每行标签非空且不重复，`partOfSpeech` 是布尔值，`displayLabel` 是字符串，`color` 是合法颜色名；不合规返回 `invalid_tag_registry`，整次拒绝。不校验分隔符：数组形式的写入和导入本来就不拆分，已有数据可能含这类标签，校验会让导出的文件无法再导入。
5. 写入 SQLite。
   - 创建或覆盖目标 `.sqlite`。
   - 写入 module blobs、词条结构表、形态结构表和索引。
6. 生成 report。
   - 成功词典 ID。
   - 入口来源。
   - 自动修复项。
   - 警告。
   - 失败项和错误码。

导入相同词典 ID 时仍必须保留“导入并覆盖 / 取消”确认，不能静默覆盖。

### 5.1 旧标签设置转换

旧格式用四个列表描述标签，各自按不同规则匹配。`legacyTagRegistry()` 把它们合成一张登记表：

1. **词性区**：`partOfSpeechTags` 中的标签。先按在 `tagSortOrder` 中的位置，未列出的按 `partOfSpeechTags` 原顺序排在后面。
2. **普通区**：`tagSortOrder` 中的非词性项按原顺序；其余在用标签按首次出现（词条顺序，词条标签在前、释义标签在后）。
3. **大小写**：旧排序忽略大小写，词性和红色强调区分大小写。一项旧排序配置匹配到多个在用值时，这些值共享该位置，按首次出现排列。
4. **红色强调**：旧配置可能写的是显示替换文本，按"原始值或显示文本"解析，对应行写入 `color: "red"`。
5. **只出现在旧配置里的值**登记为未使用的行，保留原有设置，不丢弃。
6. 词条和释义中标签数组的顺序只用于第 2 条的"首次出现"，不写入标签表。

可见变化：原排序把非词性标签排在词性前面的词典，转换后词性移到最前；原先没列进 `tagSortOrder`、按存储顺序显示的标签，转换后在每个词条中都按登记表顺序显示。

## 6. 正式迁移流程

正式迁移是“把现有 JSON data directory 转换成 SQLite data directory”，不是普通导入单个文件。

目录级迁移由脚本执行，不提供启动时自动迁移 UI（产品内入口见第 12 节）：

```bash
node scripts/migrate-json-data-to-sqlite.js --from <json-data-dir> --to <sqlite-data-dir>
```

脚本只允许写入不存在或为空的目标目录，不直接覆盖源目录，也不允许源目录和目标目录互相嵌套。

脚本向标准输出写出格式化的结构化 JSON conversion report；`scripts/check-json-directory-conversion.js` 使用临时目录验证源目录不被修改、目标 SQLite 可读、active dictionary 和 UI 偏好被保留。

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

导出不应只有“把内部结构原样吐成 JSON”这一种。

JSON 导出使用 profile；当前实装 `legacy-json` 与 `portable-json`，其余为未实装的设计方向（见第 12 节）：

| profile | 状态 | 目标 | 说明 |
| --- | --- | --- | --- |
| `legacy-json` | 已实装 | 默认 JSON 导出 | 用于兼容导入导出、迁移和人工检查；不承诺永久等同内部结构，也不代表可重新启用已移除的 JSON runtime。 |
| `portable-json` | 已实装 | 兼容别名 | 输出与 `legacy-json` 相同；不设计独立结构，也不作为主要交换格式。 |
| `sqlite` | 未实装 | 原生词典交换/备份 | 直接复制并校验完整词典数据库；需要明确应用版本、schema 版本和导入冲突处理。 |
| `xlsx` | 未实装 | 表格交换 | 适合词条、释义、标签、来源、IPA 等扁平化导出；复杂模块可能拆成多 sheet。 |
| `fieldwork` / `interlinear` | 未设计 | 田野或语料交换 | 预留给语料和 gloss 工具升级后设计。 |

加入新格式时，`GET /api/export` 可扩展参数：

```text
GET /api/export?dictionaryId=...&format=sqlite
GET /api/export?dictionaryId=...&format=xlsx
```

导出 profile 的输出结构可以与旧内部 JSON 不完全一致，但必须有文档和版本号。

JSON 导出顶层带 `tagRegistry`（含未使用的行，不含 `displayAmbiguous`），词条和释义的 `tags` 数组按登记表排序；导入时只取其中的集合，往返后登记表与标签集合不变。

## 8. `index.json` 的职责

`index.json` 是全局索引和 UI 偏好文件，不保存词典内容，也不承担 JSON/SQLite 混合存储识别；运行期词典文件统一为 `data/dictionaries/<dictionary-id>.sqlite`。写入的串行与原子替换见 [SQLite 后端规范](SQLITE_BACKEND_SPEC.md#索引写入与失败恢复)。

结构保持简单：

```json
{
  "activeDictionaryId": "dict-...",
  "uiLanguage": "zh",
  "uiTheme": "light",
  "uiSkin": "classic",
  "dictionaryIds": ["dict-..."]
}
```

词典名称、语言、描述、`entryCount` 和严格 `rootCount` 都从各 SQLite 文件轻量查询；`rootCount` 按没有来源记录的词条数计算，不建立词根拓扑。未加载词典不会因启动或词典管理页建立拓扑，这些派生值也不写入 `index.json` 作为第二份真相。不为存储分流给 `index.json` 增加 `storage/path` 字段。

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
| 未识别字段 | 当前 normalized dictionary 只保留受支持的当前字段，尚无通用未知字段保留机制。扩展外部格式前，应在对应 import adapter 中显式映射或报告未识别字段，不能把“无损保留未知字段”写成现有保证。 |

诊断修复模块可以复用迁移 report 的结构，但不要把未解析来源等普通质量检查问题塞进迁移诊断。迁移诊断只处理“会影响数据能否安全进入 canonical storage”的问题。

在语料库尚未正式 SQL 化之前，`corpus` 仍作为 module blob 保存，但其 block、layer、unit ID 仍属于全局实体 ID 命名空间。完整导入与迁移把 corpus blob 内部 ID 纳入全量跨类型唯一性检查；语料模块保存只检查语料内部重复，词条、普通设置和文档保存不检查 corpus ID（规则见 [API Contract](API_CONTRACT.md#实体-id-校验约定)）。repository contract 覆盖导入时 corpus ID 与词条／释义 ID 互撞和语料保存时的内部重复，避免后续 SQLite 下推或语料库重构时绕过该规则。

## 10. 当前策略与回滚

### 10.1 当前策略

1. `server.js` 运行期只使用 SQLite repository；没有 JSON runtime repository 或存储后端 feature flag。
2. 运行时 Node 必须支持 `node:sqlite`；不支持时启动给出明确错误，不引入其他存储后端兜底。
3. 启动时不扫描、不自动迁移旧 JSON data，也不静默原地改写真实 `data/`。
4. 旧 JSON 词典通过词典管理界面的 JSON 导入功能手动迁入 SQLite；批量迁移使用 `scripts/migrate-json-data-to-sqlite.js`，它直接只读旧数据目录，也是将来迁移向导的基础设施。
5. JSON 导入/导出返回完整 dictionary-shaped JSON；这是交换和备份路径，不代表存储层使用 JSON。
6. 语料库仍作为 `module_blobs.corpus` 保存（见 [SQLite 后端规范](SQLITE_BACKEND_SPEC.md#11-暂缓)）。

### 10.2 回滚步骤

- SQLite 启动失败时，先不要修改或删除原 JSON `data/`、SQLite 备份或最近的 Git checkpoint。
- 已生成的 SQLite 测试目录可以直接丢弃并重新迁移；不为开发中的 SQLite schema 写兼容迁移。
- 失败来自真实数据结构问题时，先记录迁移 report 和错误码，再决定是否交给诊断修复模块，不在默认启动路径中静默修复。
- 回滚依赖 Git checkpoint、SQLite 备份或从原 JSON 目录重新迁移，不再启动旧 JSON 后端。

## 11. 测试要求

SQLite 单后端仍需保留以下测试边界：

- SQLite repository 契约测试继续通过。
- 服务启动检查确认临时数据目录中只创建 `.sqlite` 词典。
- 转换服务测试覆盖：
  - 旧 JSON → normalized dictionary。
  - normalized dictionary → SQLite。
  - SQLite → legacy-json。
- 目录迁移脚本测试覆盖：
  - 使用临时数据目录。
  - 覆盖多词典、当前词典、无词典、坏词典、重复 ID、无效词典 ID。
  - 确认源目录不被修改。
- roundtrip 检查覆盖：
  - legacy JSON 输入迁移到 SQLite 后，导出 profile 能通过对应格式校验。

所有测试数据必须放在临时目录，不使用真实 `data/`。

## 12. 未实装

以下尚未实装，待办记录在交接文档路线图的“明确搁置”中：

- 原生 SQLite 文件导入/导出与 XLSX 等表格交换（第 7 节的 `sqlite`、`xlsx` profile），优先于独立的 portable JSON 结构。
- 产品内迁移入口。加入时必须由用户显式发起，不在启动时自动执行；显示迁移说明、备份路径和迁移报告，允许取消，不静默覆盖；备份按第 6.2 节默认采用新目录写入并保留原目录，同时补齐失败回滚。
