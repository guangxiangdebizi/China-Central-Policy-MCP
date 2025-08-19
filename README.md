# 中国中央政策 MCP（Model Context Protocol）

面向 gov.cn 的国务院政策检索与解析 MCP 服务器，提供“政策列表检索 + 政策正文抓取”两类工具，直接返回结构化数据。

## 功能亮点

- **政策检索**：基于 gov.cn 官方检索接口/页面，支持关键词与日期范围过滤
- **正文获取**：从政策 URL 抓取并解析正文，统一输出结构化字段
- **真实数据**：对接真实政府站点，非模拟数据
- **简单稳定**：仅请求首页（`p=1`），每页固定 100 条（`n=100`），不翻页，性能稳定

## 工具一览

### `get_latest_policies`
按关键词与日期范围检索政策列表（来自 `sousuo.www.gov.cn` 官方检索接口）。

- 参数
  - `startdate`（可选）：开始日期，格式 `YYYY-MM-DD`
  - `enddate`（可选）：结束日期，格式 `YYYY-MM-DD`
  - `limit`（可选）：返回条数上限，默认 `100`，最大 `100`
  - `keyword`（可选）：检索关键词（标题/正文/摘要范围）

- 行为说明
  - 仅请求首页：`p=1, n=100`，不自动翻页（一般不超过 100 条）
  - 解析官方返回中的 `catMap.*.listVO`（并兼容旧式 `results`）
  - 清洗标题与摘要中的 HTML 标签（如 `<em>`、`<br/>`）
  - 统一日期格式：优先时间戳字段（如 `ptime`），否则解析 `YYYY.MM.DD/中文日期`
  - 返回 `debug.requested_urls` 与 `debug.catmap_list_lengths` 便于排查

- 返回字段（items 中的每条记录）
  - `policy_id`、`title`、`level`、`category`、`date`、`url`
  - `summary`、`issuing_agency`、`document_number`、`file_type`
  - `catalog`：来源分类（如 `gongwen`、`bumenfile`、`gongbao`）

- 调用示例
```json
{
  "name": "get_latest_policies",
  "arguments": {
    "keyword": "人工智能",
    "startdate": "2025-06-19",
    "enddate": "2025-08-19",
    "limit": 100
  }
}
```

### `get_policy_fulltext`
从政策 URL 抓取并解析正文为结构化 JSON，优化适配 gov.cn 页面。

- 参数
  - `url`（必填）：政策详情页 URL
  - `policy_id`（可选）：内部 ID（可忽略）

- 返回字段
  - `policy_id`、`title`、`date`、`doc_no`、`issuer`、`url`、`body`

- 调用示例
```json
{
  "name": "get_policy_fulltext",
  "arguments": {
    "url": "https://www.gov.cn/zhengce/zhengceku/202507/content_7031216.htm"
  }
}
```

## 安装与构建

```bash
npm install
npm run build
```

## 运行

### 本地（stdio）
```bash
node build/index.js
```

### SSE（supergateway）
```bash
npm install -g supergateway
npx supergateway --stdio "node build/index.js" --port 3100
```

## MCP 客户端配置示例（Claude）

### stdio 模式
```json
{
  "mcpServers": {
    "china-policy": {
      "command": "node",
      "args": ["path/to/build/index.js"]
    }
  }
}
```

### SSE 模式
```json
{
  "mcpServers": {
    "china-policy": {
      "type": "sse",
      "url": "http://localhost:3100/sse",
      "timeout": 600
    }
  }
}
```

## 数据来源

- 官网“政策/最新”入口：[gov.cn 最新政策](https://www.gov.cn/zhengce/zuixin/)
- 内容：国务院政策、部门文件、公告等

## 法律声明与使用限制

- 作者声明：本项目仅供学习、教学与学术研究使用。开源的目的在于帮助有需要的分析师与研究者更高效地开展政策信息分析与复现工作。
- 使用边界：本项目不面向生产环境或商业化部署，作者不对任何此类用途进行背书或提供保证。如需用于生产/商业场景，请自行完成充分的合规审查与测试，并自行承担全部风险与责任。
- 禁止性用途：不得将本项目用于任何违法、侵权、违规或不道德的用途，包括但不限于：
  - 绕过网站服务条款、访问控制或反爬机制；
  - 大规模抓取、存储、传播受版权保护或包含个人信息的数据；
  - 制造或传播虚假/误导性内容，或用于舆论操纵；
  - 任何违反适用法律法规、数据合规与隐私保护要求的行为。
- 数据来源与合规：本项目对接公开的政府网站入口。使用者应自行确认目标站点的使用条款、robots 协议、访问频率限制与版权要求，合理控制请求频率，避免对对方服务造成不当负载。
- 免责声明：项目按“现状”提供，不作任何明示或默示担保（包括但不限于适销性、特定用途适用性与非侵权）。在法律允许的最大范围内，作者不对因使用本项目而导致的任何直接或间接损失承担责任。
- 版权与许可：本项目采用 Apache-2.0 许可证发布。许可证条款是约束使用的唯一法律文本；本节“法律声明与使用限制”表述的是作者的使用态度与合规提示，不构成对许可证的修改。如对许可证与本声明存在理解冲突，以许可证条款为准。
- 合规与移除：如您认为本项目中的说明或工具可能引发合规风险，或出于正当权利主张提出移除/更正请求，请通过下述联系方式与作者取得联系。

## 许可证

Apache-2.0

## 联系方式

- **LinkedIn**：[Xingyu Chen](https://www.linkedin.com/in/xingyu-chen-b5b3b0313/)
- **Email**：guangxiangdebizi@gmail.com
- **GitHub**：[guangxiangdebizi](https://github.com/guangxiangdebizi/)
- **NPM**：[xingyuchen](https://www.npmjs.com/~xingyuchen)