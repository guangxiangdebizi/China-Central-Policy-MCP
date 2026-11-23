# 中国中央政策 MCP
输入主题、文号或原件 URL，查询中央政策、读取全文并定位可引用的原文段落。
从中国政府网官方栏目和检索接口取数，生成带文件清单、原文和引用卡的 Markdown + JSON 材料，不需要 Token 或模型密钥。

[English](README.en.md) · [真实运行输出](docs/real-outputs.md) · [库库 Skill 接入](docs/SKILL.md)

## 5 分钟启动

推荐 Node.js 22 LTS 或更新版本，最低 20.18.1。

```powershell
git clone https://github.com/guangxiangdebizi/China-Central-Policy-MCP.git
cd China-Central-Policy-MCP
npm ci
npm run build
npm start
```

默认使用 stdio。启动后等待 MCP 客户端输入，不向 stdout 写日志。
2026-11-23 现场核对 npm 与[官方 SDK README](https://github.com/modelcontextprotocol/typescript-sdk)：使用稳定 v2 拆包，`@modelcontextprotocol/server@2.4.0`、`@modelcontextprotocol/node@2.1.2`，测试客户端 `@modelcontextprotocol/client@2.4.0`。锁文件固定实际依赖。

### stdio 客户端配置

将 `D:/Business/kuku-upgrade/China-Central-Policy-MCP` 替换为安装目录的绝对路径。

```json
{
  "mcpServers": {
    "central-policy": {
      "command": "node",
      "args": ["D:/Business/kuku-upgrade/China-Central-Policy-MCP/build/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "OUTPUT_DIR": "D:/Business/kuku-upgrade/China-Central-Policy-MCP/output"
      }
    }
  }
}
```

### Streamable HTTP

```powershell
$env:MCP_TRANSPORT="http"
$env:HOST="127.0.0.1"
$env:PORT="3100"
$env:OUTPUT_DIR="D:/Business/kuku-upgrade/China-Central-Policy-MCP/output"
$env:PUBLIC_BASE_URL="http://127.0.0.1:3100"
npm start
```

```json
{
  "mcpServers": {
    "central-policy": {
      "type": "http",
      "url": "http://127.0.0.1:3100/mcp"
    }
  }
}
```

不需要 supergateway。`/mcp` 使用 SDK 原生无状态 HTTP handler，兼容 2025 版客户端。HTTP 网关的鉴权、TLS 和额度由平台配置。

## 三个真实输出

以下输出于 2026-11-23 通过真实 MCP Client 在线生成，可用 `npm run examples` 刷新完整样例。

### 1. 查本周新政策

用户输入：“列出本周中央新政策，按发布日期筛选。”

```json
{"tool":"search_policies","arguments":{"from":"2026-11-23","to":"2026-11-23","limit":5}}
```

实际返回：`status=ok`，0 条。本周窗口内官方最新栏目未返回文件；当次栏目最新可见日为 **2026-11-15**。空结果保留原样，不补入上周文件或机构首页。[完整输出](docs/this-week.json)

### 2. 按文号读全文

用户输入：“查国办发〔2025〕25号，读全文，定位稳岗返还的条件和期限。”

```json
{"tool":"search_policies","arguments":{"query":"国办发〔2025〕25号","mode":"doc_no","limit":3}}
```

从返回的 `url` 调用 `get_policy_fulltext`，可传 `focus: "稳岗返还"`，或不传以分页读取全文。

> **国务院办公厅关于进一步加大稳就业政策支持力度的通知**
>
> 发文机关：国务院办公厅｜国办发〔2025〕25号
>
> 成文：2025-07-03｜发布：2025-07-09
>
> 全文 34 段。`p0008` 的原文同时保留基金备付期限条件、90%/50%比例和“政策执行期限至2025年12月底”。

[官方原件](https://www.gov.cn/zhengce/zhengceku/202507/content_7031216.htm) · [完整原文及引用卡](docs/by-document-number.json) · [实际课堂卡](docs/classroom.md)

### 3. 生成人工智能近 30 天简报

用户输入：“整理人工智能近 30 天的政策材料，保留原文和出处。”

```json
{"tool":"policy_brief","arguments":{"kind":"weekly","query":"人工智能","from":"2026-10-25","to":"2026-11-23","limit":3}}
```

实际读取 3 篇、失败 0 篇，`status=partial`，因为仍有尚未扫描或交付的检索结果。材料包括：

- 广电总局、民政部老年人广电视听公共文化服务通知，发布 2026-11-17。
- 2026 年世界互联网大会乌镇峰会主旨演讲的公报原件，发布 2026-11-20。
- 商务部等 9 部门再生资源回收体系建设意见，发布 2026-11-17。

每篇包含信息表、匹配“人工智能”的完整原段和引用卡。输出为 Markdown 与 JSON 文件，服务端不撰写总结。[阅读简报](docs/ai-30-days.md) · [机器可读结果](docs/ai-30-days.json)

## 工具

| 工具 | 使用场景 | 关键参数 |
|---|---|---|
| `search_policies` | 查主题、文号、最新目录 | `query?`, `mode=topic\|doc_no`, `from?`, `to?`, `catalog=all\|gongwen\|bumenfile\|gongbao`, `limit=1..20`, `cursor?` |
| `get_policy_fulltext` | 读全文、定位段落和引用 | `url` 或 `policy_id`；`focus?`, `max_chars=1000..24000`, `cursor?` |
| `get_policy_interpretations` | 找页面相关解读、图解 | `url` 或 `policy_id`；返回链接列表，没有时返回空列表和原因 |
| `policy_brief` | 周报、课堂卡、备考卡、原文对照 | `kind=weekly\|classroom\|exam\|compare`；`query+from+to` 或 `policy_ids[1..5]`；`focus?`, `limit=1..5` |
| `build_policy_brief` | 方案中的兼容名称 | 与 `policy_brief` 相同 |
| `get_latest_policies` | 旧客户端兼容 | `keyword?`, `startdate?`, `enddate?`, `limit=1..100` |

`doc_no` 模式规范空白和括号后等值匹配。日期为北京时间的发布日期闭区间，成文日期单列为 `issued_on`。无 `query` 时只读最新栏目，`catalog` 必须是 `all`。

全文以信息表和 `#UCAP-CONTENT` 为准，不从全页猜机关。段号在同一 `body_hash` 内稳定；引用卡包含机关、题名、文号、发布日期、URL、原段及哈希。`max_chars` 是完整段落分页预算，单个超长段会完整返回并提示。附件仅返回链接。

简报最多读 5 篇，30 秒总时限，每篇最多选 3 个匹配焦点原词的完整段落。找不到则写“本次未定位”，不生成要点。课堂和备考模板只生成信息表问答和原文问答。`compare` 需正好两篇不同文件并指定 `focus`；Markdown 使用纵向分栏，不依赖宽表。

### 返回与续查

所有工具声明 `outputSchema`，并返回 `structuredContent`：

```json
{
  "status": "ok",
  "data": {"items": [], "returned": 0},
  "warnings": [],
  "fetched_at": "2026-11-23T08:00:00.000Z"
}
```

上例仅展示外层结构，实际 `data` 按工具 schema 返回完整字段。`ok` 表示本次范围内成功；`partial` 表示有续页、覆盖不足或部分正文失败；`error` 配合 `isError=true` 和 `error:{code,message,retryable,hint}`。错误包括 `INVALID_INPUT`、`UNSUPPORTED_URL`、`RATE_LIMITED`、`UPSTREAM_TIMEOUT`、`SOURCE_CHANGED`、`BODY_UNAVAILABLE`、`CURSOR_EXPIRED`、`UPSTREAM_HTTP`、`UPSTREAM_NETWORK`、`RESPONSE_TOO_LARGE`。读不到任何已选正文时，简报返回错误。

搜索和全文使用 `next_cursor`，翻页保留原参数。游标为有界内存快照，10 分钟有效，绑定查询或正文哈希。重启或换实例后重查；多副本使用网关黏性路由。搜索每次最多读 3 个上游页，每页每栏 10 条，累计最多 30 页，按各栏排名轮取并去重；不把 `ptime` 当发布日期。简报的 `coverage.search_next_cursor` 可交给同参数的 `search_policies` 继续查找。

旧两个工具的首个 text 块保留 JSON 及旧字段；第二块为人类可读摘要。旧 `date` 明确表示发布日期。

## 库库平台部署

| 环境变量 | 默认值 | 用途 |
|---|---|---|
| `MCP_TRANSPORT` | `stdio` | `stdio` 或 `http` |
| `HOST` | `127.0.0.1` | 容器服务可设为 `0.0.0.0` |
| `PORT` | `3100` | HTTP 端口 |
| `OUTPUT_DIR` | `./output` | 可写产物目录，推荐绝对路径 |
| `PUBLIC_BASE_URL` | 未设置 | 平台可访问的服务根 URL，设置后返回下载链接 |

产物返回 `path`、`downloadUrl`（未配置时 null）、`bytes`、`sha256`。HTTP 提供 `GET /files/<随机UUID>/policy-brief.md` 和 `.json`；平台应在网关统一控制下载权限，并按需清理产物目录。服务不存用户身份、不申请密钥、不调用大模型。仅代抓 `www.gov.cn`、`sousuo.www.gov.cn`，站外原件只展示链接。

网络层设 6 秒单请求超时、4 MiB 上限、每主机并发 2、每秒至多 2 次请求；网络错误、429 和 5xx 最多重试一次并遵循 `Retry-After`。查询缓存 10 分钟、正文缓存 6 小时，各至多 256 项，同键并发合并，不缓存失败。

## 验证

```powershell
npm test
npm run examples
```

测试使用真实 SDK Client，分别启动 stdio 和 HTTP 服务，在线对照栏目前三条、检索两页、精查文号、核对两种正文模板、拼接分页、回查引用、生成文件并读回、下载后校验 SHA-256。有限的网络故障分支使用可注入 Fetch 测试，不依赖官方站点故障。

## 局限

- 最新栏目和官方检索索引各有覆盖范围，结果不代表全国政策全集。
- 公报再刊与原件只在文号、机关和规范题名都一致时合并；缺失值保留 null。
- 附件专载、站外部门页面及未知正文模板不自动解析，失败项保留原因。
- 工具保留文件当时的规定，不判断今天的申报资格或政策效力。

## 许可证

代码沿用 [Apache-2.0](LICENSE)；政策原文的权利和使用条件归原来源。平台封装不改变代码许可证。作者：Xingyu Chen（[GitHub](https://github.com/guangxiangdebizi/)）。
