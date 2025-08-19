# China Central Policy MCP

A Model Context Protocol (MCP) server for retrieving official State Council policies from gov.cn.

## Features

- **Policy Retrieval**: Fetch latest State Council policies from gov.cn
- **Full Text Access**: Get complete policy content from URLs
- **Real Data**: Scrapes actual government websites (not mock data)

## Tools

### `get_latest_policies`

Fetches State Council policies from gov.cn with date range filtering and keyword search.

**Parameters:**
- `startdate` (optional): Start date in YYYY-MM-DD format
- `enddate` (optional): End date in YYYY-MM-DD format  
- `limit` (optional): Maximum number of policies to return (default: 10, max: 100)
- `keyword` (optional): Keyword to search in policy titles

**Examples:**
```json
{
  "name": "get_latest_policies",
  "arguments": {
    "limit": 20
  }
}
```

```json
{
  "name": "get_latest_policies",
  "arguments": {
    "startdate": "2024-01-01",
    "enddate": "2024-12-31",
    "keyword": "经济",
    "limit": 50
  }
}
```

### `get_policy_fulltext`
Retrieve full text content from a policy URL.

**Parameters:**
- `url` (required): Policy URL from gov.cn

**Example:**
```json
{
  "name": "get_policy_fulltext",
  "arguments": {
    "url": "https://www.gov.cn/zhengce/content/..."
  }
}
```

## Installation

```bash
npm install
npm run build
```

## Usage

### Local Development (Stdio)
```bash
node build/index.js
```

### SSE Server (Supergateway)
```bash
npm install -g supergateway
npx supergateway --stdio "node build/index.js" --port 3100
```

## Claude Configuration

### Stdio Mode
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

### SSE Mode
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

- **Primary Source**: [China Government Network - Latest Policies](https://www.gov.cn/zhengce/zuixin/)
- **Content**: Official State Council policies, regulations, and announcements
- **Update Frequency**: Real-time scraping from official website

## License

Apache 2.0

## Contact

- **LinkedIn**: [Xingyu Chen](https://www.linkedin.com/in/xingyu-chen-b5b3b0313/)
- **Email**: guangxiangdebizi@gmail.com
- **GitHub**: [guangxiangdebizi](https://github.com/guangxiangdebizi/)
- **NPM**: [xingyuchen](https://www.npmjs.com/~xingyuchen)