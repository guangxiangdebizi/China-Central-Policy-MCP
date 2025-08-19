# China Central Policy MCP (Model Context Protocol)

An MCP server for retrieving and parsing official State Council policies from gov.cn. It exposes two tools: policy list search and full-text extraction, both returning structured JSON.

## Highlights

- Policy search with keyword and date range filters (gov.cn official search API)
- Full-text extraction from policy pages with normalized fields
- Real data from official sites (not mocks)
- Simple and stable: single page request (p=1, n=100), no pagination

## Tools

### `get_latest_policies`
Search policies via sousuo.www.gov.cn with keyword and date range.

- Parameters
  - `startdate` (optional): YYYY-MM-DD
  - `enddate` (optional): YYYY-MM-DD
  - `limit` (optional): default 100, max 100
  - `keyword` (optional): search in title/content/summary

- Behavior
  - Request only the first page: p=1, n=100
  - Parse catMap.*.listVO (and fallback to legacy results)
  - Strip HTML tags (e.g., <em>, <br/>) from titles and summaries
  - Normalize date with timestamps (ptime) or YYYY.MM.DD/Chinese date strings
  - Return debug.requested_urls and debug.catmap_list_lengths for troubleshooting

- Item fields
  - policy_id, title, level, category, date, url
  - summary, issuing_agency, document_number, file_type
  - catalog (e.g., gongwen, bumenfile, gongbao)

- Example
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
Fetch and parse full text from a policy URL (optimized for gov.cn pages).

- Parameters
  - `url` (required): policy page URL
  - `policy_id` (optional)

- Returns
  - policy_id, title, date, doc_no, issuer, url, body

- Example
```json
{
  "name": "get_policy_fulltext",
  "arguments": {
    "url": "https://www.gov.cn/zhengce/zhengceku/202507/content_7031216.htm"
  }
}
```

## Install & Build

```bash
npm install
npm run build
```

## Run

### Local (stdio)
```bash
node build/index.js
```

### SSE (supergateway)
```bash
npm install -g supergateway
npx supergateway --stdio "node build/index.js" --port 3100
```

## MCP client config (Claude)

### stdio
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

### SSE
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

## Data Source

- Official portal: https://www.gov.cn/zhengce/zuixin/

## License

Apache-2.0

## Contact

- LinkedIn: https://www.linkedin.com/in/xingyu-chen-b5b3b0313/
- Email: guangxiangdebizi@gmail.com
- GitHub: https://github.com/guangxiangdebizi/
- NPM: https://www.npmjs.com/~xingyuchen
