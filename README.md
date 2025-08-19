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

## 许可证

Apache-2.0

## 联系方式

- **LinkedIn**：[Xingyu Chen](https://www.linkedin.com/in/xingyu-chen-b5b3b0313/)
- **Email**：guangxiangdebizi@gmail.com
- **GitHub**：[guangxiangdebizi](https://github.com/guangxiangdebizi/)
- **NPM**：[xingyuchen](https://www.npmjs.com/~xingyuchen)