# HTTP Access Boundary Spec / 本地 HTTP 访问边界规格（A06–A08）

状态：实装规格（2026-10-10），交 GPT 6.1 sol 实装、Claude 审查（分工见交接文档第 6 节）。完成后把第 3 节的对外契约迁入 [API Contract](API_CONTRACT.md)，删除本文，并从[审计清单](AUDIT_OPEN_ISSUES.md)删除 A06、A07、A08。

## 1. 现状（已对照代码确认）

- `server.js`：`http.createServer(handleRequest).listen(port)` 没有指定地址，监听全部网卡；启动日志打印 `http://localhost:${port}`，`scripts/check-default-repository.js` 依赖这行日志判断启动完成。
- 请求处理：`handleRequest()` 用 `request.headers.host` 构造 URL，`/api/` 交给 `createApiRouter()`（`lib/api-routes.js`），其余交给 `createStaticFileServer()`（`lib/static-server.js`）。没有 Host、Origin 或媒体类型校验。
- 静态服务：根目录就是仓库。对 `decodeURIComponent` 后的路径做 `path.resolve`，用字符串前缀判断越界，用区分大小写的 `/data/` 片段阻止私有目录。`.git`、服务端源码、`data/`（大小写变化后）都可读；非 GET 方法也会返回文件。
- `readRequestBody()`（`lib/http-utils.js`）不检查媒体类型，正文能解析为 JSON 就执行。
- 现有调用方（不需要修改）：
  - 前端 `api()`（`app.js`）对所有请求设置 `Content-Type: application/json`，包括 DELETE 和无正文的 POST；
  - 退出时的 `navigator.sendBeacon()` 使用 `application/json` 类型的 Blob，失败时 `fetch` 兜底也设置同一类型；
  - `scripts/check-default-repository.js` 用 Node `http.request` 访问 `127.0.0.1:<port>`，不带 Origin。
- 前端实际加载的静态资源：
  - `index.html`：`theme-classic.css`、`theme-layered-glass.css`、`theme-liquid-glass.css`、`styles.css`、`app.js`，以及 `lib/` 下 16 个前端模块（以 `index.html` 的 `<script src>` 为准）；
  - `liquid-glass-lab.html`：`lib/liquid-glass-geometry.js`、`lib/liquid-glass-engine.js`、运行时拼出的 `theme-liquid-glass.css` 与 `styles.css`，以及 `assets/liquid-glass-lab/` 下的 5 张图片；
  - 样式表中没有引用本地 `url()` 资源；前端没有 `api()` 之外的 `fetch`。

## 2. 规则

所有检查集中在请求入口，按下列顺序执行；任一失败即返回，不进入路由，不读取正文。

### 2.1 只监听本机（A06）

- 默认 `listen(port, "127.0.0.1")`。
- 启动日志保持 `Conlexicon running at http://localhost:${port} (sqlite repository)` 不变。

### 2.1a 局域网调试开关（用户 2026-10-10 要求保留）

用于手机等真机通过局域网访问开发服务。

- 只有环境变量 `CONLEXICON_LAN_DEBUG=1` 时开启；其他值或未设置均为关闭。不提供配置文件或界面入口。
- 开启时监听 `0.0.0.0`，并在 2.2 的 Host 白名单中额外允许本机各网卡的非内部 IPv4 地址（启动时由 `os.networkInterfaces()` 取得）加端口。不接受任意主机名，也不接受其他设备的地址。
- 2.3、2.4、2.5 的规则不变：同源判断仍是 `Origin` 等于 `http://` 加 `Host`，从手机访问时两者都是本机局域网 IP，自然同源。
- 开启时在原启动日志之后额外打印一行警告，列出可访问的局域网地址，并说明局域网内任何设备都能读写该数据目录；建议配合临时数据目录使用。
- 不在 Electron 外壳中暴露这个开关。

### 2.2 Host 白名单（A06，防 DNS rebinding）

（开启 2.1a 调试开关时按该节扩展。）

- 适用于所有请求（API 与静态资源、所有方法）。
- 允许的 `Host` 头：`localhost:<port>`、`127.0.0.1:<port>`、`[::1]:<port>`，其中 `<port>` 是服务实际监听的端口；主机名比较不区分大小写。
- 缺失或不在白名单：API 路径返回 403 JSON，错误码 `forbidden_host`；其他路径返回 403 纯文本。

### 2.3 写请求来源（A08）

- 适用于方法不是 GET、HEAD 的 `/api/` 请求。
- 有 `Origin` 头时，必须严格等于 `http://` 加上已通过 2.2 校验的 `Host` 值；不等（包括 `null`）返回 403，错误码 `forbidden_origin`。
- 没有 `Origin` 头时放行：浏览器对非 GET 请求总会携带 `Origin`，缺失只来自命令行或脚本等非浏览器客户端，而本机进程本来就能直接读写数据目录。

### 2.4 写请求媒体类型（A08）

- 适用范围同 2.3。
- `Content-Type` 的媒体类型（忽略参数，不区分大小写）必须是 `application/json`；无论请求是否带正文。缺失或不符返回 415，错误码 `unsupported_media_type`。
- 不在 `readRequestBody()` 中重复检查。

### 2.5 静态资源白名单（A07）

- 只响应 GET、HEAD；其他方法返回 405 纯文本。
- 公开资源是一份显式清单，按请求的原始 `url.pathname` 精确匹配（区分大小写，不做 `decodeURIComponent`，不做 `path.resolve`）：
  - `/` 映射到 `index.html`；
  - `index.html`、`liquid-glass-lab.html`、`app.js`、`styles.css`、三个 `theme-*.css`；
  - `lib/` 下被两个 HTML 页面引用的前端模块，逐个列出，不开放整个 `lib/`；
  - `assets/liquid-glass-lab/` 下的图片：启动时读取该目录生成清单，或逐个列出，二者任选其一。
- 不在清单中的路径一律 404（不返回 403，不暴露“存在但禁止”的信息）。清单之外不再需要越界判断、`data/` 片段判断或解码处理，删除这些旧逻辑。
- 清单中的文件读取失败（如开发中被删除）按现有方式抛出，不加兜底。

## 3. 对外契约（完成后迁入 API Contract）

| 情况 | 状态码 | 错误码 |
| --- | --- | --- |
| `Host` 缺失或不在白名单 | 403 | `forbidden_host` |
| 非 GET／HEAD 的 API 请求，`Origin` 存在但不同源 | 403 | `forbidden_origin` |
| 非 GET／HEAD 的 API 请求，媒体类型不是 `application/json` | 415 | `unsupported_media_type` |
| 静态路径不在公开清单 | 404 | 纯文本 |
| 静态路径使用 GET／HEAD 以外的方法 | 405 | 纯文本 |

错误响应沿用 `serializeApiError()` 的结构。前端现有调用方全部满足这些规则，不需要新增本地化文案；若实装中发现前端会触发这些错误，停止并报告，不要改前端。

## 4. 实现约束

- 新增一个小模块（建议 `lib/http-access.js`）实现 2.2–2.4，导出一个入口函数，供 `server.js` 在路由前调用；静态白名单留在 `lib/static-server.js`，由它接收清单。
- 为了测试，把 `server.js` 的请求处理与启动拆成可调用的工厂（例如 `lib/http-server.js` 导出 `createRequestHandler({ repository, rootDir, port })`），`server.js` 只负责读取环境变量、创建仓库并启动。不改变现有启动方式、环境变量与日志。
- 遵守 `AGENTS.md` 的“防御性代码”规则：
  - 不加 CORS 响应头、CSRF token、速率限制、额外安全响应头或任何第 2 节以外的检查；
  - 不在路由内部或 `readRequestBody()` 中重复入口检查；
  - 不为白名单中的文件加存在性兜底。
- 交付时列出每一处新增的检查及其对应的第 2 节条目；对应不上的删除。

## 5. 验收

新增 `scripts/check-http-access.js` 并接入 `scripts/check-all.js`。用临时数据目录（`CONLEXICON_DATA_DIR` 或 `createTempSqliteRepository`）和临时端口在进程内启动服务，SQLite 不可用时必须失败。断言当前行为，不写墓碑断言：

1. 默认监听地址为 `127.0.0.1`；设置 `CONLEXICON_LAN_DEBUG=1` 时为 `0.0.0.0`。
1a. 调试开关关闭时，以本机局域网 IPv4 加端口作为 `Host` 返回 403 `forbidden_host`；开启时同一请求成功，且同源的写请求成功；任意其他主机名仍为 403。本机没有非内部 IPv4 时跳过 1a 中依赖该地址的断言，并在输出中说明。
2. `Host` 为 `localhost:<port>`、`127.0.0.1:<port>`、`[::1]:<port>`、`LOCALHOST:<port>` 时，`GET /api/state` 与 `GET /` 均成功；`evil.example:<port>`、错误端口、缺失 `Host` 时，前者 403 `forbidden_host`，后者 403。
3. `POST /api/dictionaries`：
   - 同源 `Origin` 加 `application/json` 成功；
   - 不带 `Origin` 加 `application/json` 成功；
   - `Origin: http://evil.example` 返回 403 `forbidden_origin`；
   - `Origin: null` 返回 403；
   - 两种拒绝之后，词典列表都没有增加。
4. 同源请求使用 `text/plain`、缺失 `Content-Type`、`application/x-www-form-urlencoded` 时返回 415 `unsupported_media_type`，且未创建词典；`application/json; charset=utf-8` 与 `Application/JSON` 成功。不带正文的 `DELETE` 缺失类型时同样返回 415。
5. 以 `application/json` Blob 等价的请求调用 `POST /api/dictionaries/:id/autosave` 成功（beacon 兼容）。
6. 静态资源：
   - 清单中的每个路径返回 200 且 `Content-Type` 正确；
   - `/.git/config`、`/data/index.json`、`/DATA/index.json`、`/server.js`、`/lib/sqlite-dictionary-repository.js`、`/APP.JS`、`/%2e%2e/package.json`、`/lib/../server.js` 均返回 404；
   - `POST /index.html` 返回 405。
7. 清单契约：`index.html` 的全部 `<script src>`、`<link rel="stylesheet" href>`，以及 `liquid-glass-lab.html` 引用的本地脚本、样式与图片，都在公开清单中；清单中的每个文件都存在。

现有检查随接口调整更新：`scripts/check-default-repository.js` 必须继续通过（它不带 `Origin`，访问 `127.0.0.1`）。

## 6. 交付范围

- 可改：`server.js`、`lib/static-server.js`、`lib/http-utils.js`（仅当需要共享媒体类型解析）、新增 `lib/http-access.js` 与 `lib/http-server.js`、新增 `scripts/check-http-access.js`、`scripts/check-all.js`、受影响的现有 `scripts/check-*.js`。
- 不改：前端文件（`app.js`、`index.html`、`liquid-glass-lab.html`、`styles.css`、`theme-*.css`）、`lib/api-routes.js` 的路由逻辑、`lib/sqlite-dictionary-repository.js`（A02／A03 由另一任务修改，避免冲突）、`electron-shell/`。
- 文档：`docs/API_CONTRACT.md` 增加第 3 节的访问边界与 2.1a 开关；`README.md` 的本地运行说明注明服务默认只监听本机，并说明 `CONLEXICON_LAN_DEBUG=1` 的用途与风险；`CHANGELOG.md` 实际完成日期段的“安全与兼容性”；按本文开头的说明删除本文与审计条目 A06–A08，交接文档对应条目改为一句指向。
- 验收命令：对改动的每个 `.js` 执行 `node --check`；`node scripts/check-http-access.js`；`node scripts/check-all.js`；`git diff --check`。
- 与 A02＋A03 任务的唯一共同文件是 `scripts/check-all.js`（双方各新增一项检查）；后完成的一方在当前 `main` 上合并，不覆盖对方的条目。
- 不需要浏览器验收；若想手动确认，用临时数据目录在 4174 端口启动，按 `AGENTS.md` 的端口规则操作。
