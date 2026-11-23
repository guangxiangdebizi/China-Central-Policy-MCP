# 库库平台调用说明

用户不需要了解 MCP，也不需要申请 Token。平台 agent 负责理解、总结和写作；本服务只提供官方数据、完整原文、引用卡和确定性模板。

## 路由

1. 用户给出 gov.cn URL：调用 `get_policy_fulltext`；需要解读时调用 `get_policy_interpretations`。
2. 用户给出文号：调用 `search_policies`，`mode=doc_no`；把命中 URL 交给全文工具。
3. 用户查目录或本周新增：调用 `search_policies`；本周起止日由 agent 按北京时间计算，日期依据为发布日期。
4. 用户要周报、课堂卡或备考材料：调用 `policy_brief`，传 `query+from+to` 或最多 5 个 `policy_ids`。
5. 用户对照措辞：`kind=compare`，传两篇不同文件及 `focus`。

`focus` 使用原文关键词，不支持语义扩展。`policy_brief` 是首选名称，`build_policy_brief` 是兼容别名；不要重复调用两者。`get_latest_policies` 仅兼容旧客户端。

## 使用结果

- `ok` 且空列表：在本次可见范围内没有命中，直接说明日期窗和来源。
- `partial`：向用户说明已选数、已读数、失败项及覆盖范围；需要更多时用游标继续搜索。
- `error`：显示明确原因；只在 `retryable=true` 时重试，参数错误先修参数。
- 全文续页保持 URL、focus、max_chars；游标失效则重新读取，不把不同 body_hash 的段落拼接。
- 引用时使用 `citations[].quote` 原文，保留条件和期限；段号不改造成网页锚点。
- 展示材料先给文件清单和原文依据，再由平台 agent 写明确标注的分析；不把模板问答冒充专家结论。
- 文件通过返回的 `downloadUrl` 提供给用户；未配置链接时由平台读取 `path`，并核对 `bytes`、`sha256`。

## 部署

`npm ci`、`npm run build`；配置 `MCP_TRANSPORT=http`、`HOST=0.0.0.0`、`PORT=3100`、可写 `OUTPUT_DIR` 与 `PUBLIC_BASE_URL`，连接 `/mcp`。平台网关统一管理鉴权、配额和 `/files/` 下载权限；多副本使用黏性路由。服务不调用模型、不保存用户身份。
