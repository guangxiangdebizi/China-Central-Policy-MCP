import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { stdioClient, call, employment } from '../tests/helpers.mjs';

const day = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const date = new Date(day + 'T00:00:00Z');
const monday = new Date(date);
monday.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
const month = new Date(date);
month.setUTCDate(date.getUTCDate() - 29);
await mkdir('docs', { recursive: true });
const { client } = await stdioClient();
try {
  const weeklyInput = { from: monday.toISOString().slice(0, 10), to: day, limit: 5 };
  const weekly = await call(client, 'search_policies', weeklyInput);
  const search = await call(client, 'search_policies', { query: '国办发〔2025〕25号', mode: 'doc_no', limit: 3 });
  const full = await call(client, 'get_policy_fulltext', { url: search.data.items.find(i => i.doc_no === '国办发〔2025〕25号').url, max_chars: 24000 });
  const briefInput = { kind: 'weekly', query: '人工智能', from: month.toISOString().slice(0, 10), to: day, limit: 3 };
  const brief = await call(client, 'policy_brief', briefInput);
  const classroom = await call(client, 'policy_brief', { kind: 'classroom', policy_ids: [employment], focus: '稳岗返还' });
  for (const [name, request, response] of [
    ['this-week', weeklyInput, weekly], ['by-document-number', { query: '国办发〔2025〕25号', mode: 'doc_no' }, { search, full }],
    ['ai-30-days', briefInput, brief], ['classroom', { policy_ids: [employment], focus: '稳岗返还' }, classroom],
  ]) await writeFile(`docs/${name}.json`, JSON.stringify({ captured_at: new Date().toISOString(), request, response }, null, 2) + '\n');
  await writeFile('docs/ai-30-days.md', brief.data.markdown.trimEnd() + '\n');
  await writeFile('docs/classroom.md', classroom.data.markdown.trimEnd() + '\n');
  const d = full.data.document;
  const p = full.data.paragraphs.find(p => p.text.includes('稳岗返还政策力度'));
  const output = `# 真实运行输出\n\n运行时间：${day}（北京时间）。由 npm run examples 通过真实 stdio MCP Client 生成。\n\n## 1. 本周新政策\n\n输入：\`${JSON.stringify(weeklyInput)}\`\n\n状态：${weekly.status}；返回 ${weekly.data.returned} 条。\n\n${weekly.data.items.map(i => `- ${i.published_on} [${i.title}](${i.url})`).join('\n') || '本周窗口内，官方最新栏目未返回新文件。'}\n\n栏目可见范围：${weekly.data.coverage.window_start} 至 ${weekly.data.coverage.window_end}。\n\n## 2. 按文号读全文\n\n输入：国办发〔2025〕25号，精确匹配后读取原件。\n\n- 题名：${d.title}\n- 发文机关：${d.issuer}\n- 成文日期：${d.issued_on}\n- 发布日期：${d.published_on}\n- 文号：${d.doc_no}\n- 全文：${full.data.total_paragraphs} 段；complete=${full.data.complete}\n- 原件：${d.url}\n\n### 原文定位 ${p.id}\n\n> ${p.text}\n\n## 3. 人工智能近 30 天简报\n\n输入：\`${JSON.stringify(briefInput)}\`\n\n状态：${brief.status}；选中 ${brief.data.coverage.selected} 篇；读取 ${brief.data.coverage.read} 篇。\n\n${brief.data.coverage.notes.concat(brief.data.coverage.search?.notes ?? []).join('\n\n')}\n\n[完整 Markdown](ai-30-days.md) · [机器可读输出](ai-30-days.json) · [稳就业课堂卡](classroom.md)\n`;
  await writeFile('docs/real-outputs.md', output);
  console.log(JSON.stringify({ day, weekly: weekly.data.returned, document: d, brief: brief.data.coverage, artifacts: classroom.data.files }, null, 2));
  // Verify the generated example artifacts can be read as JSON, not only written.
  JSON.parse(await readFile('docs/by-document-number.json', 'utf8'));
} finally { await client.close(); }
