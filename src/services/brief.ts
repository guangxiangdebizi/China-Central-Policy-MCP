import { allowed, checkWindow, PolicyError } from '../core.js';
import { searchPolicies } from '../providers/govcn.js';
import { briefData, briefInput, searchInput } from '../schemas.js';
import { citation, focusParagraphs, readPolicy } from './fulltext.js';
import { writeBriefFiles } from './artifacts.js';
import type * as z from 'zod/v4';

const md = (text: string) => text.replace(/[\\`*_[\]<>]/g, '\\$&');
export async function policyBrief(input: z.infer<typeof briefInput>): Promise<z.infer<typeof briefData>> {
  const deadline = Date.now() + 45_000;
  checkWindow(input.from, input.to);
  if (input.policy_ids ? input.query || input.from || input.to : !input.query || !input.from || !input.to) {
    throw new PolicyError('INVALID_INPUT', '请二选一：query + from + to，或 policy_ids。');
  }
  if (input.kind === 'compare' && (!input.policy_ids || input.policy_ids.length !== 2 || !input.focus)) {
    throw new PolicyError('INVALID_INPUT', 'compare 必须指定两份不同文件和 focus。');
  }
  let urls = input.policy_ids?.map(allowed) ?? [];
  if (new Set(urls).size !== urls.length) throw new PolicyError('INVALID_INPUT', 'policy_ids 不得包含重复文件。');
  let search: Awaited<ReturnType<typeof searchPolicies>> | undefined;
  if (!input.policy_ids) {
    // Leave twenty seconds for reading the selected originals; ordinary search keeps its three-page budget.
    search = await searchPolicies(searchInput.parse({ query: input.query, from: input.from, to: input.to, limit: input.limit }), deadline - 20_000, 12);
    urls = search.items.map(i => i.url);
  }
  const cards: z.infer<typeof briefData>['cards'] = [];
  const byInput = new Map<string, (typeof cards)[number]>();
  const citations: z.infer<typeof briefData>['citations'] = [];
  const failed: z.infer<typeof briefData>['coverage']['failed'] = [];
  const notes: string[] = [];
  const selectionComplete = !search || urls.length >= input.limit || !search.coverage.truncated;
  if (search) notes.push(`本次简报最多选 ${input.limit} 篇，已选 ${urls.length} 篇；${selectionComplete ? '选取完成' : '检索覆盖不足，选取未完成'}。搜索覆盖和续查游标单列，不代表穷尽主题下的全部文件。`);
  // GovFetcher enforces the shared per-host concurrency and request-start limits.
  const originals = await Promise.allSettled(urls.slice(0, 5).map(url => readPolicy(url, deadline)));
  for (const [index, original] of originals.entries()) {
    const url = urls[index];
    try {
      if (original.status === 'rejected') throw original.reason;
      const policy = original.value;
      const focus = input.focus ?? input.query;
      const matches = focusParagraphs(policy, focus).filter(p => p.type !== 'heading');
      const selected = (focus ? matches : policy.paragraphs.filter(p => p.type !== 'heading')).slice(0, 3);
      const facts = selected.map(p => {
        const c = citation(policy, p);
        citations.push(c);
        return { text: p.text, citation_ids: [c.id] };
      });
      const card: (typeof cards)[number] = { title: policy.document.title, document: policy.document, facts };
      if (input.kind === 'classroom' || input.kind === 'exam') {
        card.qa = [
          { question: '文件由谁发布？', answer: policy.document.issuer ?? '信息表未提供发文机关。', citation_ids: [] },
          { question: '文件何时成文、何时发布？', answer: `成文：${policy.document.issued_on ?? '未提供'}；发布：${policy.document.published_on ?? '未提供'}。`, citation_ids: [] },
          ...facts.map(f => ({ question: `文件对“${focus ?? '该事项'}”怎样规定？请保留条件和期限。`, answer: f.text, citation_ids: f.citation_ids })),
        ];
      }
      if (!facts.length) notes.push(`${policy.document.title}：本次未定位到焦点原词段落，不生成要点。`);
      notes.push(...policy.warnings.map(w => `${policy.document.title}：${w}`));
      cards.push(card);
      byInput.set(url, card);
    } catch (error) {
      failed.push({ url, code: error instanceof PolicyError ? error.code : 'BODY_UNAVAILABLE', reason: error instanceof Error ? error.message : String(error) });
    }
  }
  if (urls.length && !cards.length) throw new PolicyError('BODY_UNAVAILABLE', '选中文件的正文均未读取成功。', failed.some(f => /TIMEOUT|NETWORK/.test(f.code)), JSON.stringify(failed));
  cards.sort((a, b) => input.kind === 'compare' ? 0 : (b.document.published_on ?? '').localeCompare(a.document.published_on ?? ''));
  const rows = input.kind === 'compare' ? [{ focus: input.focus!,
    left: byInput.get(urls[0])?.facts ?? [], right: byInput.get(urls[1])?.facts ?? [] }] : undefined;
  const labels = { weekly: '政策周报材料', classroom: '政策课堂卡', exam: '政策备考卡', compare: '政策原文对照' };
  const lines = [`# ${labels[input.kind]}`, '', input.query ? `主题：${md(input.query)}｜发布日期：${input.from} 至 ${input.to}（北京时间）` : '文件：指定原件', '',
    '## 文件清单', '', ...urls.map((url, i) => `${i + 1}. [${md(cards.find(c => c.document.url === url)?.title ?? '原件')}](${url})`), ''];
  if (!urls.length) lines.push('本次检索窗口未返回文件。', '');
  for (const card of cards) {
    const d = card.document;
    lines.push(`## ${md(card.title)}`, '', `- 发文机关：${md(d.issuer ?? '未提供')}`,
      `- 文号：${md(d.doc_no ?? '未提供')}`, `- 成文：${d.issued_on ?? '未提供'}｜发布：${d.published_on ?? '未提供'}`,
      `[中国政府网原件](${d.url})`, '', '### 关键段落原文', '');
    if (!card.facts.length) lines.push('本次未定位到焦点原词段落。', '');
    for (const f of card.facts) lines.push(`> ${md(f.text)}`, '', `引用：${f.citation_ids.map(md).join('、')}`, '');
    if (card.qa) for (const qa of card.qa) lines.push(`**${md(qa.question)}**`, '', md(qa.answer), '',
      qa.citation_ids.length ? `出处：${qa.citation_ids.map(md).join('、')}` : `出处：[原件信息表](${d.url})`, '');
  }
  if (rows) {
    lines.push(`## 焦点对照：${md(input.focus!)}`, '');
    for (const [index, side] of [rows[0].left, rows[0].right].entries()) {
      lines.push(`### 文件 ${index + 1}`, '', `[原件](${urls[index]})`, '', ...(side.length ? side.map(f => `> ${md(f.text)}\n\n引用：${f.citation_ids.map(md).join('、')}\n`) : ['本次未定位或正文读取失败。']), '');
    }
  }
  lines.push('## 引用卡', '');
  for (const c of citations) lines.push(`- ${md(c.id)}：${md(c.issuer ?? '机关未提供')}，《${md(c.title)}》，${md(c.doc_no ?? '文号未提供')}，发布 ${c.published_on ?? '未提供'}，[原件](${c.url})，段号 ${c.paragraph_id}，正文 SHA-256：${c.body_hash}。`, '');
  lines.push('段号是本工具定位符，不是网页锚点。', '', `已选 ${urls.length} 篇，已读 ${cards.length} 篇，失败 ${failed.length} 篇。`, '');
  for (const failure of failed) lines.push(`- 读取失败：[原件](${failure.url})：${md(failure.reason)}`);
  for (const note of [...(search?.coverage.notes ?? []), ...notes]) lines.push(`- ${md(note)}`);
  const markdown = lines.join('\n');
  const data = { markdown, kind: input.kind, topic: input.query ?? null, from: input.from ?? null, to: input.to ?? null,
    cards, citations, rows, coverage: { selected: urls.length, read: cards.length, failed, selection_complete: selectionComplete,
      truncated: !selectionComplete || failed.length > 0, search: search?.coverage ?? null, search_next_cursor: search?.next_cursor ?? null, notes }, generated_at: new Date().toISOString() };
  const files = await writeBriefFiles(markdown, data);
  return { ...data, files };
}
