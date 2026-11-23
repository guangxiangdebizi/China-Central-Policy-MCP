import { load } from 'cheerio';
import { canonical, clean, dateOf, hash, PolicyError } from '../core.js';
import { documentSchema, paragraphSchema, linkSchema } from '../schemas.js';
import type * as z from 'zod/v4';

export type PolicyDocument = z.infer<typeof documentSchema>;
export type Paragraph = z.infer<typeof paragraphSchema>;
export type PolicyLink = z.infer<typeof linkSchema>;
export type ParsedPolicy = { document: PolicyDocument; paragraphs: Paragraph[]; attachments: PolicyLink[]; interpretations: PolicyLink[];
  interpretation_reason: string | null; warnings: string[] };

export function parsePolicy(html: string, url: string): ParsedPolicy {
  const $ = load(html);
  $('script,style,noscript,iframe,.share,.pages_print,.collectionLocation').remove();
  const fields = new Map<string, string>();
  const labels = new Set(['标题', '发文机关', '成文日期', '发布日期', '发文字号']);
  $('td,th').each((_, element) => {
    const cell = $(element);
    if (cell.find('td,th').length) return;
    const label = cell.text().replace(/[\s\u3000：:]/g, '');
    if (labels.has(label)) fields.set(label, clean(cell.next('td,th').text()));
  });
  const meta = (name: string) => $(`meta[name="${name}"]`).attr('content')?.trim() || null;
  const title = fields.get('标题') || meta('ArticleTitle') || clean($('h1').first().text()) || clean($('title').text().replace(/_+(?:中国政府网|20\d{2}年第).*$/, ''));
  // Both desktop policy templates and the observed central-document template use this container.
  const root = $('#UCAP-CONTENT').first();
  if (!root.length) throw new PolicyError('BODY_UNAVAILABLE', '未识别到政策正文 #UCAP-CONTENT。', false, '请打开原件核对；附件页不作为全文。');
  root.find('br').replaceWith('\n');
  const paragraphs: Paragraph[] = [];
  let parent: string | null = null;
  const append = (text: string, type: Paragraph['type']) => {
    text = clean(text);
    if (!text) return;
    if (type === 'heading' || /^[一二三四五六七八九十百]+、/.test(text) && text.length < 100) {
      type = 'heading';
      parent = text;
    }
    paragraphs.push({ id: `p${String(paragraphs.length + 1).padStart(4, '0')}`, heading: parent, text, type });
  };
  const walk = (node: ReturnType<typeof $>) => {
    for (const child of node.contents().toArray()) {
      if (child.type === 'text') { append($(child).text(), 'paragraph'); continue; }
      if (child.type !== 'tag') continue;
      const element = $(child);
      if (child.name === 'table') {
        const headers = element.find('tr').first().find('th,td').map((_, c) => clean($(c).text())).get();
        element.find('tr').each((i, row) => {
          const values = $(row).children('th,td').map((_, c) => clean($(c).text())).get();
          append(values.map((v, j) => i > 0 && headers[j] ? `${headers[j]}：${v}` : v).join(' | '), 'table_row');
        });
      } else if (/^(p|h[1-6]|li)$/.test(child.name) && !element.find('p,table,li,h1,h2,h3,h4,h5,h6').length) {
        append(element.text(), /^h/.test(child.name) ? 'heading' : 'paragraph');
      } else if (!['img', 'input', 'button', 'a'].includes(child.name) || element.text()) walk(element);
    }
  };
  walk(root);
  if (!paragraphs.length) throw new PolicyError('BODY_UNAVAILABLE', '正文容器没有可读取的段落。');
  const bodyHash = hash(JSON.stringify(paragraphs.map(({ heading, text, type }) => ({ heading, text, type }))));
  const document: PolicyDocument = { policy_id: canonical(url), title, url: canonical(url), issuer: fields.get('发文机关') || null,
    doc_no: fields.get('发文字号') || null, issued_on: dateOf(fields.get('成文日期')),
    published_on: dateOf(fields.get('发布日期')) ?? dateOf(meta('firstpublishedtime') || meta('PubDate')), body_hash: bodyHash };
  const attachments: PolicyLink[] = [];
  const interpretations: PolicyLink[] = [];
  const seen = new Set<string>();
  const addLink = (href: string, title: string, target: PolicyLink[], type: PolicyLink['type']) => {
    if (!href || /^(javascript:|mailto:|#)/i.test(href)) return;
    try {
      const normalized = canonical(href, url);
      if (seen.has(normalized)) return;
      seen.add(normalized);
      target.push({ url: normalized, title: clean(title) || normalized.split('/').at(-1)!, type });
    } catch { /* Non-web links are not evidence links. */ }
  };
  root.find('a[href]').each((_, element) => {
    const a = $(element);
    const href = a.attr('href')!;
    if (/\.(pdf|docx?|xlsx?|zip|rar|ofd)(?:[?#]|$)/i.test(href) || a.attr('data-appendix') === 'true' || a.attr('appendix') === 'true') {
      addLink(href, a.text() || a.attr('title') || '', attachments, 'attachment');
    }
  });
  let blocks = $('.jiedu-blk, .jiedu_list, .related-reading, #related-interpretations');
  $('h2,h3,h4,div,span').each((_, element) => {
    const label = clean($(element).text());
    if (/^(相关解读|政策解读|相关图解)[：:]?$/.test(label)) blocks = blocks.add($(element).parent());
  });
  blocks.find('a[href]').each((_, element) => {
    const a = $(element);
    try {
      const href = canonical(a.attr('href')!, url);
      if (new URL(href).hostname !== 'www.gov.cn' || href === document.url) return;
      addLink(href, a.text() || a.attr('title') || '', interpretations, /图解|一图/.test(a.text()) ? 'infographic' : 'interpretation');
    } catch { /* Skip malformed related links. */ }
  });
  return { document, paragraphs, attachments, interpretations,
    interpretation_reason: interpretations.length ? null : blocks.length ? '页面相关解读区块没有 gov.cn 解读或图解链接。' : '页面未提供相关解读区块。',
    warnings: attachments.length ? ['附件仅列出原件链接；附件内容未纳入本次 HTML 正文。'] : [] };
}
