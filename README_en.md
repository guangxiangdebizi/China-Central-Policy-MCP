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

## Legal Notice & Use Restrictions

- Author's intent: This project is provided solely for learning, teaching, and academic research. The open-sourcing purpose is to help analysts and researchers conduct policy analysis more efficiently and reproducibly.
- Scope of use: This project is not intended for production or commercial deployment. The author does not endorse or warrant such usage. If you plan to use it in production/commercial settings, you must perform your own compliance review and testing and bear all risks and responsibilities.
- Prohibited uses: You must not use this project for any illegal, infringing, non-compliant, or unethical purposes, including but not limited to:
  - Bypassing website terms of service, access controls, or anti-scraping measures;
  - Large-scale scraping, storing, or distributing copyrighted or personal data;
  - Creating or disseminating false/misleading content or manipulating public opinion;
  - Any behavior in violation of applicable laws, regulations, data compliance, or privacy requirements.
- Data source & compliance: This project connects to publicly accessible government portals. Users are responsible for verifying target site terms, robots directives, rate limits, and copyright requirements; use reasonable request rates to avoid undue load on the remote service.
- Disclaimer: The project is provided "as is" without any express or implied warranties (including merchantability, fitness for a particular purpose, or non-infringement). To the maximum extent permitted by law, the author shall not be liable for any direct or indirect damages arising from the use of this project.
- License primacy: This project is licensed under Apache-2.0. The license is the sole governing legal text; this section expresses the author's usage intent and compliance reminders and does not modify the license. In case of interpretation conflicts, the license terms prevail.
- Compliance and takedown: If you believe this project may raise compliance concerns or you have a legitimate rights claim requesting removal/correction, please contact the author via the channels below.

## License

Apache-2.0

## Contact

- LinkedIn: https://www.linkedin.com/in/xingyu-chen-b5b3b0313/
- Email: guangxiangdebizi@gmail.com
- GitHub: https://github.com/guangxiangdebizi/
- NPM: https://www.npmjs.com/~xingyuchen
