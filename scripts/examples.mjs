import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { stdioClient, call, employment } from '../tests/helpers.mjs';

const day = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const date = new Date(day + 'T00:00:00Z');
const month = new Date(date);
month.setUTCDate(date.getUTCDate() - 29);
await mkdir('docs', { recursive: true });
const { client } = await stdioClient({ OUTPUT_DIR: resolve('output') });
const portableJson = value => JSON.stringify(value, (key, entry) => {
  if (key !== 'path' || typeof entry !== 'string' || !isAbsolute(entry)) return entry;
  const suffix = relative(resolve('.'), entry);
  assert.ok(suffix && !suffix.startsWith('..') && !isAbsolute(suffix), 'Example artifact must be inside the installation directory');
  return `/path/to/China-Central-Policy-MCP/${suffix.split(sep).join('/')}`;
}, 2) + '\n';
async function verifyFiles(brief) {
  for (const file of brief.data.files) {
    const bytes = await readFile(file.path);
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    if (file.format === 'json') assert.deepEqual(JSON.parse(bytes).cards, brief.data.cards);
    else assert.equal(bytes.toString('utf8'), brief.data.markdown);
  }
}
try {
  const latestInput = { limit: 5 };
  const latest = await call(client, 'search_policies', latestInput);
  assert.equal(latest.data.items.length, 5);
  const details = [];
  for (const item of latest.data.items) details.push(await call(client, 'get_policy_fulltext', { url: item.url }));
  const searchInput = { query: '国办发〔2025〕25号', mode: 'doc_no', limit: 3 };
  const search = await call(client, 'search_policies', searchInput);
  const full = await call(client, 'get_policy_fulltext', { url: search.data.items.find(i => i.doc_no === '国办发〔2025〕25号').url, max_chars: 24000 });
  const briefInput = { kind: 'weekly', query: '人工智能', from: month.toISOString().slice(0, 10), to: day, limit: 5 };
  const brief = await call(client, 'policy_brief', briefInput);
  assert.equal(brief.status, 'ok');
  assert.equal(brief.data.coverage.read, briefInput.limit);
  assert.equal(brief.data.coverage.failed.length, 0);
  const classroomInput = { kind: 'classroom', policy_ids: [employment], focus: '稳岗返还' };
  const classroom = await call(client, 'policy_brief', classroomInput);
  assert.equal(classroom.status, 'ok');
  await verifyFiles(brief);
  await verifyFiles(classroom);
  for (const [name, request, response] of [
    ['latest-five', latestInput, { search: latest, documents: details.map(result => result.data.document) }], ['by-document-number', searchInput, { search, full }],
    ['ai-30-days', briefInput, brief], ['classroom', classroomInput, classroom],
  ]) await writeFile(`docs/${name}.json`, portableJson({ captured_at: new Date().toISOString(), request, response }));
  await writeFile('docs/ai-30-days.md', brief.data.markdown.trimEnd() + '\n');
  await writeFile('docs/classroom.md', classroom.data.markdown.trimEnd() + '\n');
  const d = full.data.document;
  const p = full.data.paragraphs.find(p => p.text.includes('稳岗返还政策力度'));
  const latestLines = details.map(({ data: { document: i } }) => `- [${i.title}](${i.url})｜机关：${i.issuer ?? '未提供'}｜文号：${i.doc_no ?? '未提供'}｜发布：${i.published_on ?? '未提供'}`);
  const output = `# 真实运行输出\n\n运行时间：${day}（北京时间）。由 npm run examples 通过真实 stdio MCP Client 生成。\n\n示例 JSON 中的产物路径统一使用 /path/to/China-Central-Policy-MCP 占位，使用时替换为实际安装目录；保存前已读回原始产物并核验字节数和 SHA-256。\n\n## 1. 最新 5 条政策\n\n输入：\`${JSON.stringify(latestInput)}\`（不传日期窗），逐篇读取原件信息表。\n\n返回 ${latest.data.returned} 条；搜索状态：${latest.status}，后续栏目条目可用游标续查。\n\n${latestLines.join('\n')}\n\n[检索和原件信息](latest-five.json)\n\n## 2. 按文号读全文\n\n输入：国办发〔2025〕25号，精确匹配后读取原件。\n\n- 题名：${d.title}\n- 发文机关：${d.issuer}\n- 成文日期：${d.issued_on}\n- 发布日期：${d.published_on}\n- 文号：${d.doc_no}\n- 全文：${full.data.total_paragraphs} 段；complete=${full.data.complete}\n- 原件：${d.url}\n\n### 原文定位 ${p.id}\n\n> ${p.text}\n\n## 3. 人工智能近 30 天简报\n\n输入：\`${JSON.stringify(briefInput)}\`\n\n状态：${brief.status}；选中 ${brief.data.coverage.selected} 篇；读取 ${brief.data.coverage.read} 篇；失败 ${brief.data.coverage.failed.length} 篇。\n\n${brief.data.coverage.notes.concat(brief.data.coverage.search?.notes ?? []).join('\n\n')}\n\n[完整 Markdown](ai-30-days.md) · [机器可读输出](ai-30-days.json) · [稳就业课堂卡](classroom.md)\n`;
  await writeFile('docs/real-outputs.md', output);
  console.log(portableJson({ day, latest: latest.data.returned, document: d, brief: brief.data.coverage, artifacts: classroom.data.files }));
  // Verify the generated example artifacts can be read as JSON, not only written.
  JSON.parse(await readFile('docs/by-document-number.json', 'utf8'));
} finally { await client.close(); }
