import { allowed, hash, PolicyError, readCursor, saveCursor } from '../core.js';
import { govFetch } from '../net/govFetch.js';
import { parsePolicy, type ParsedPolicy, type Paragraph } from '../parsers/policy.js';
import { fulltextInput } from '../schemas.js';
import type * as z from 'zod/v4';

export function policyUrl(input: { url?: string; policy_id?: string }) {
  if (!input.url && !input.policy_id) throw new PolicyError('INVALID_INPUT', 'url 或 policy_id 至少提供一个。');
  const url = allowed(input.url ?? input.policy_id!);
  if (input.url && input.policy_id && url !== allowed(input.policy_id)) throw new PolicyError('INVALID_INPUT', 'url 和 policy_id 必须指向同一政策。');
  return url;
}
export async function readPolicy(url: string, deadline = Date.now() + 30_000): Promise<ParsedPolicy> {
  const result = await govFetch.get(url, true, deadline);
  return parsePolicy(result.text, result.url);
}
export function citation(policy: ParsedPolicy, paragraph: Paragraph) {
  return { ...policy.document, id: `${hash(policy.document.url).slice(0, 12)}:${policy.document.body_hash.slice(0, 12)}:${paragraph.id}`,
    paragraph_id: paragraph.id, quote: paragraph.text, locator_note: '段号为本工具在该正文哈希内的定位符，不是网页锚点。' };
}
export function focusParagraphs(policy: ParsedPolicy, focus?: string) {
  return policy.paragraphs.filter(p => !focus || p.text.includes(focus));
}
export async function getFulltext(input: z.infer<typeof fulltextInput>) {
  const url = policyUrl(input);
  const policy = await readPolicy(url);
  const selected = focusParagraphs(policy, input.focus);
  const key = hash(JSON.stringify([url, policy.document.body_hash, input.focus ?? '', input.max_chars]));
  const offset = input.cursor ? readCursor<number>(input.cursor, 'body', key) : 0;
  const paragraphs: Paragraph[] = [];
  let chars = 0;
  for (const p of selected.slice(offset)) {
    if (paragraphs.length && chars + p.text.length > input.max_chars) break;
    paragraphs.push(p);
    chars += p.text.length;
  }
  const more = offset + paragraphs.length < selected.length;
  const warnings = [...policy.warnings];
  if (chars > input.max_chars) warnings.push('单段超过 max_chars，保留完整条件段，不截断原句。');
  if (input.focus && !selected.length) warnings.push('本次未定位到包含焦点原词的段落。');
  return { ...policy, paragraphs, citations: paragraphs.map(p => citation(policy, p)),
    ...policy.document, date: policy.document.published_on, body: paragraphs.map(p => p.text).join('\n\n'),
    next_cursor: more ? saveCursor('body', key, offset + paragraphs.length) : null,
    complete: !more, total_paragraphs: policy.paragraphs.length, selected_paragraphs: selected.length, warnings };
}
