# China Central Policy MCP
Search central Chinese policies by topic or document number, read original text, and locate citable paragraphs.
Uses official gov.cn feeds and search; exports Markdown + JSON evidence packs with source links. No API token or model key.

[中文](README.md) · [Real outputs](docs/real-outputs.md) · [Skill integration](docs/SKILL.md)

## Start

Use Node.js 22 LTS or newer; minimum 20.18.1.

```powershell
git clone https://github.com/guangxiangdebizi/China-Central-Policy-MCP.git
cd China-Central-Policy-MCP
npm ci
npm run build
npm start
```

The default transport is stdio. The process waits for MCP input and keeps logs off stdout.
Verified against npm and the [official SDK README](https://github.com/modelcontextprotocol/typescript-sdk) on 2026-11-23: stable v2 packages `@modelcontextprotocol/server@2.4.0`, `@modelcontextprotocol/node@2.1.2`, and test client `@modelcontextprotocol/client@2.4.0`. Dependencies are locked.

### stdio configuration

Replace the absolute installation/output paths below.

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

### Streamable HTTP configuration

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

The native stateless SDK handler at `/mcp` also supports 2025 clients. No supergateway. The platform gateway supplies authentication, TLS and quotas.

## Three real runs

Captured on 2026-11-23 through a real MCP Client. `npm run examples` refreshes the samples. Policy quotations remain in their original Chinese; this README does not present them as official translations.

1. **This week's new policies.** `search_policies({from:"2026-11-23",to:"2026-11-23",limit:5})` returned `ok`, zero items. The latest visible feed date was 2026-11-15. [Raw output](docs/this-week.json).
2. **Read a policy by document number.** Search `国办发〔2025〕25号` with `mode:"doc_no"`, then pass its URL to `get_policy_fulltext`. The issuer is **国务院办公厅**; issued **2025-07-03**, published **2025-07-09**, 34 paragraphs. Paragraph `p0008` preserves the reserve-fund condition, 90%/50% rates, and the December 2025 deadline together. [Official original](https://www.gov.cn/zhengce/zhengceku/202507/content_7031216.htm), [full text and citations](docs/by-document-number.json), [classroom card](docs/classroom.md).
3. **AI policies over 30 days.** `policy_brief({kind:"weekly",query:"人工智能",from:"2026-10-25",to:"2026-11-23",limit:3})` read three sources with no failures. It returned `partial` because more search results remain. The sources cover elderly broadcasting services (November 17), a World Internet Conference speech in the official gazette (November 20), and recycling systems (November 17). [Markdown](docs/ai-30-days.md), [JSON](docs/ai-30-days.json).

## Tools

| Tool | Purpose | Parameters |
|---|---|---|
| `search_policies` | Topic, exact document number, or latest feed | `query?`, `mode=topic\|doc_no`, `from?`, `to?`, `catalog=all\|gongwen\|bumenfile\|gongbao`, `limit=1..20`, `cursor?` |
| `get_policy_fulltext` | Original text, paragraph citations and attachments | `url` or `policy_id`, `focus?`, `max_chars=1000..24000`, `cursor?` |
| `get_policy_interpretations` | Related official explanations and infographics | `url` or `policy_id`; empty list plus reason when absent |
| `policy_brief` | Weekly, classroom, exam or comparison material | `kind`, either `query+from+to` or `policy_ids[1..5]`, `focus?`, `limit=1..5` |
| `build_policy_brief` | Alias for `policy_brief` | Same parameters |
| `get_latest_policies` | Legacy compatibility | `keyword?`, `startdate?`, `enddate?`, `limit=1..100` |

Dates are inclusive **publication dates in Beijing time**, not issue dates. `issued_on` is separate. Exact document matching normalizes whitespace and brackets. Without `query`, only the official latest feed is used and `catalog` must be `all`.

Full text comes from the information table and `#UCAP-CONTENT`. Unknown issuers remain null. Citations contain the issuer, title, document number, publication date, original URL, complete quoted paragraph, paragraph ID and body hash. Paragraph IDs are tool locators, not website anchors. Pagination never cuts a condition or deadline inside a paragraph; one long paragraph can exceed `max_chars` with a warning.

Briefs read up to five documents within 30 seconds and select up to three exact-focus paragraphs per document. No matching paragraph means no invented point. Classroom/exam questions use metadata and quoted text. Comparisons require two distinct policies and a focus; their Markdown uses vertical sections suitable for narrow screens. The server does not call an LLM or write summaries.

## Output and pagination

Each tool advertises `outputSchema` and returns `structuredContent` with `status`, `data`, `warnings` and `fetched_at`. `ok` includes genuine empty results; `partial` indicates remaining pages, limited coverage or failed documents. Errors set `isError:true` and return `error:{code,message,retryable,hint}`. Codes include `INVALID_INPUT`, `UNSUPPORTED_URL`, `RATE_LIMITED`, `UPSTREAM_TIMEOUT`, `SOURCE_CHANGED`, `BODY_UNAVAILABLE`, `CURSOR_EXPIRED`, `UPSTREAM_HTTP`, `UPSTREAM_NETWORK`, `RESPONSE_TOO_LARGE`. A brief with no readable selected documents is an error.

For search/full-text pagination, keep the same arguments and pass `next_cursor`. Opaque cursors expire after ten minutes and bind to the query/body hash. Restarting loses cursors; multiple replicas need sticky routing. A search call fetches at most three upstream pages, ten entries per catalog per page, with a thirty-page cumulative cap. Results are interleaved by catalog rank, then deduplicated. Coverage includes scanned pages, totals, unknown dates and truncation. A brief exposes `coverage.search_next_cursor` for continuation with `search_policies` using its original search arguments.

The two legacy tools retain JSON as their first text block and a readable summary as the second. Their `date` field means publication date.

## Platform deployment

| Environment variable | Default | Purpose |
|---|---|---|
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `HOST` | `127.0.0.1` | Set `0.0.0.0` in a container |
| `PORT` | `3100` | HTTP port |
| `OUTPUT_DIR` | `./output` | Writable artifact directory; use an absolute path |
| `PUBLIC_BASE_URL` | Unset | Externally reachable service root for download URLs |

Artifacts return `path`, `downloadUrl` (null when not configured), `bytes` and `sha256`. HTTP serves `GET /files/<random-UUID>/policy-brief.md` and `.json`. Apply download access controls at the gateway and manage retention in the output directory. No user identity store or model API is required.

Only `www.gov.cn` and `sousuo.www.gov.cn` are fetched; external originals remain links. Networking uses a six-second per-request timeout, 4 MiB response cap, two concurrent requests and at most two request starts per second per host. Transient network failures, HTTP 429 and 5xx retry once, honoring `Retry-After`. Query/body caches expire after ten minutes/six hours, each capped at 256 entries. Concurrent identical fetches share work; failures are not cached.

## Tests

```powershell
npm test
npm run examples
```

Tests use real SDK clients over stdio and HTTP, live official feeds/search, exact document-number retrieval, both policy templates, complete paragraph pagination, quotation round trips, generated JSON/Markdown readback and SHA-256-verified HTTP downloads. Injected fetch responses cover timeout, size, redirects and retry branches.

## Limitations

- The feed and search index each have limited coverage, not a complete nationwide database.
- Cross-URL republications merge only when document number, issuer and normalized title all match; missing values remain null.
- Attachment contents, external ministry sites and unknown page templates are not parsed automatically; failures retain reasons.
- Historical policy conditions do not determine current eligibility or legal effectiveness.

## License

Code: [Apache-2.0](LICENSE), unchanged from the original package declaration. Source documents retain their own rights and terms. Platform packaging does not change the code license. Author: [Xingyu Chen](https://github.com/guangxiangdebizi/).
