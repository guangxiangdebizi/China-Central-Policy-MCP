import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { PolicyError } from './core.js';
import * as schemas from './schemas.js';
import { searchPolicies } from './providers/govcn.js';
import { getFulltext, policyUrl, readPolicy } from './services/fulltext.js';
import { policyBrief } from './services/brief.js';

function errorResult(error: unknown): CallToolResult {
  const e = error instanceof PolicyError ? error : error instanceof z.ZodError ? new PolicyError('INVALID_INPUT', error.message) :
    new PolicyError('INTERNAL_ERROR', error instanceof Error ? error.message : String(error));
  const structuredContent = { status: 'error', data: null, warnings: [], fetched_at: new Date().toISOString(),
    error: { code: e.code, message: e.message, retryable: e.retryable, hint: e.hint } };
  return { isError: true, structuredContent, content: [{ type: 'text', text: JSON.stringify(structuredContent) }] };
}
export function buildServer() {
  const server = new McpServer({ name: 'ChinaCentralPolicyMCP', version: '2.0.0' });
  function register<I extends z.ZodType, O extends z.ZodType>(name: string, description: string, input: I, output: O,
    run: (args: z.infer<I>) => Promise<z.infer<O>>, summarize: (data: z.infer<O>) => string, legacy = false, writes = false) {
    // Validate inside the callback so invalid arguments also get the structured error envelope.
    const inputSchema = { '~standard': { ...input['~standard'], validate: (value: unknown) => ({ value }) } };
    server.registerTool(name, { description, inputSchema, outputSchema: schemas.envelope(output),
      annotations: { readOnlyHint: !writes, destructiveHint: false, idempotentHint: !writes, openWorldHint: true } }, async (args): Promise<CallToolResult> => {
      try {
        const value = await run(input.parse(args));
        const checked = output.safeParse(value);
        if (!checked.success) throw new PolicyError('INTERNAL_ERROR', '工具输出未通过返回结构校验。', false, checked.error.message);
        const data = checked.data;
        const coverage = (data as { coverage?: { truncated?: boolean; notes?: string[] } }).coverage;
        const next = (data as { next_cursor?: string | null }).next_cursor;
        const warnings = [...((data as { warnings?: string[] }).warnings ?? []), ...(coverage?.notes ?? [])];
        const partial = !!coverage?.truncated || !!next;
        const structuredContent = { status: partial ? 'partial' : 'ok', data, warnings, fetched_at: new Date().toISOString() };
        const content: { type: 'text'; text: string }[] = [];
        if (legacy) content.push({ type: 'text', text: JSON.stringify(data) });
        content.push({ type: 'text', text: summarize(data) });
        return { structuredContent, content };
      } catch (error) { return errorResult(error); }
    });
  }
  register('search_policies', '按主题、文号或发布日期查询中央政策。无 query 时读取官方最新栏目。分页时保留参数并传 next_cursor；日期为北京时间发布日期。',
    schemas.searchInput, schemas.searchData, searchPolicies,
    data => `找到 ${data.returned} 条政策（${data.date_basis}）。\n${data.items.map(i => `- ${i.published_on ?? '日期未知'} ${i.title} ${i.doc_no ?? ''}\n  ${i.url}`).join('\n')}`);
  register('get_policy_fulltext', '读取中国政府网政策原件，返回真实发文机关、成文/发布日期、完整条件段、引用卡、附件和相关解读。focus 为原词定位；翻页保持参数。',
    schemas.fulltextInput, schemas.fulltextData, getFulltext,
    data => `${data.document.title}｜${data.document.doc_no ?? '文号未提供'}｜${data.document.issuer ?? '机关未提供'}\n成文 ${data.document.issued_on ?? '未知'}；发布 ${data.document.published_on ?? '未知'}\n${data.body}`, true);
  register('get_policy_interpretations', '给定一篇 gov.cn 政策 URL 或 policy_id，读取页面相关解读区块中的官方政策解读、图解链接；没有链接时返回空列表及原因。',
    schemas.interpretationInput, schemas.interpretationData, async input => {
      const url = policyUrl(input);
      const p = await readPolicy(url);
      return { policy_id: p.document.policy_id, items: p.interpretations, reason: p.interpretation_reason };
    }, data => data.items.length ? data.items.map(i => `- ${i.title}\n  ${i.url}`).join('\n') : data.reason ?? '未找到相关解读。');
  const briefDescription = '按主题和时间窗或指定最多 5 篇政策生成 Markdown + JSON 原文材料及引用卡，不调用模型、不写总结。kind 支持 weekly/classroom/exam/compare，compare 需两篇和 focus；总时限 30 秒。';
  register('policy_brief', briefDescription, schemas.briefInput, schemas.briefData, policyBrief, data => data.markdown, false, true);
  register('build_policy_brief', 'policy_brief 的兼容名称。' + briefDescription, schemas.briefInput, schemas.briefData, policyBrief, data => data.markdown, false, true);
  register('get_latest_policies', '旧版兼容入口。keyword 对应主题检索，startdate/enddate 对应北京时间发布日期；新接入使用 search_policies。',
    schemas.legacyInput, schemas.legacyData, async input => {
      const result = await searchPolicies(schemas.searchInput.parse({ query: input.keyword, from: input.startdate, to: input.enddate, limit: Math.min(input.limit, 20) }));
      while (result.items.length < input.limit && result.next_cursor) {
        const next = await searchPolicies(schemas.searchInput.parse({ query: input.keyword, from: input.startdate, to: input.enddate, limit: Math.min(input.limit - result.items.length, 20), cursor: result.next_cursor }));
        result.items.push(...next.items);
        result.next_cursor = next.next_cursor;
        result.coverage = next.coverage;
        if (!next.items.length) break;
      }
      return { source: result.source, search_method: input.keyword ? 'official_search_api' : 'latest_policies_list', count: result.items.length,
        filters: { startdate: input.startdate ?? null, enddate: input.enddate ?? null, keyword: input.keyword ?? null },
        items: result.items.map(i => ({ ...i, date: i.published_on, summary: i.snippet, issuing_agency: i.issuer, document_number: i.doc_no })),
        coverage: result.coverage, next_cursor: result.next_cursor, date_basis: result.date_basis };
    }, data => `返回 ${data.count} 条政策；date 为发布日期。`, true);
  return server;
}
