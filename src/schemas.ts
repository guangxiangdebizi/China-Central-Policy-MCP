import * as z from 'zod/v4';

const day = z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(s => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s, '日期必须是真实的 YYYY-MM-DD');
const query = z.string().trim().min(1).max(120);
const cursor = z.string().uuid().optional();
const url = z.string().url();
export const searchInput = z.strictObject({ query: query.optional(), mode: z.enum(['topic', 'doc_no']).default('topic'),
  from: day.optional(), to: day.optional(), catalog: z.enum(['all', 'gongwen', 'bumenfile', 'gongbao']).default('all'),
  limit: z.int().min(1).max(20).default(10), cursor });
export const fulltextInput = z.strictObject({ url: url.optional(), policy_id: url.optional(), focus: query.optional(),
  cursor, max_chars: z.int().min(1000).max(24000).default(8000) });
export const interpretationInput = z.strictObject({ url: url.optional(), policy_id: url.optional() });
export const briefInput = z.strictObject({ kind: z.enum(['weekly', 'classroom', 'exam', 'compare']).default('weekly'),
  query: query.optional(), from: day.optional(), to: day.optional(), policy_ids: z.array(url).min(1).max(5).optional(),
  focus: query.optional(), limit: z.int().min(1).max(5).default(3) });
export const legacyInput = z.strictObject({ keyword: query.optional(), startdate: day.optional(), enddate: day.optional(), limit: z.int().min(1).max(100).default(100) });

const nullable = z.string().nullable();
export const hitSchema = z.object({ policy_id: z.string(), title: z.string(), url: z.string(), issuer: nullable, doc_no: nullable,
  published_on: nullable, snippet: z.string(), catalog: z.string(), alternate_urls: z.array(z.string()) });
export type PolicyHit = z.infer<typeof hitSchema>;
export const linkSchema = z.object({ title: z.string(), url: z.string(), type: z.enum(['attachment', 'interpretation', 'infographic']) });
export const paragraphSchema = z.object({ id: z.string(), heading: nullable, text: z.string(), type: z.enum(['heading', 'paragraph', 'table_row']) });
export const documentSchema = z.object({ policy_id: z.string(), title: z.string(), url: z.string(), issuer: nullable, doc_no: nullable,
  issued_on: nullable, published_on: nullable, body_hash: z.string() });
export const citationSchema = documentSchema.extend({ id: z.string(), paragraph_id: z.string(), quote: z.string(), locator_note: z.string() });
export const searchCoverage = z.object({ catalogs: z.array(z.string()), pages_scanned: z.int(), upstream_totals: z.record(z.string(), z.int()),
  scanned: z.int(), unknown_dates: z.int(), window_start: nullable, window_end: nullable, truncated: z.boolean(), notes: z.array(z.string()) });
export const searchData = z.object({ items: z.array(hitSchema), returned: z.int(), source: z.string(), date_basis: z.string(),
  coverage: searchCoverage, next_cursor: nullable });
export const fulltextData = z.object({ document: documentSchema, paragraphs: z.array(paragraphSchema), citations: z.array(citationSchema),
  attachments: z.array(linkSchema), interpretations: z.array(linkSchema), interpretation_reason: nullable, next_cursor: nullable,
  complete: z.boolean(), total_paragraphs: z.int(), selected_paragraphs: z.int(), warnings: z.array(z.string()),
  policy_id: z.string(), title: z.string(), url: z.string(), issuer: nullable, doc_no: nullable, date: nullable, body: z.string() });
const fileSchema = z.object({ path: z.string(), downloadUrl: nullable, bytes: z.int(), sha256: z.string(), format: z.enum(['markdown', 'json']) });
const factSchema = z.object({ text: z.string(), citation_ids: z.array(z.string()) });
export const briefData = z.object({ markdown: z.string(), kind: z.string(), topic: nullable, from: nullable, to: nullable,
  cards: z.array(z.object({ title: z.string(), document: documentSchema, facts: z.array(factSchema),
    qa: z.array(z.object({ question: z.string(), answer: z.string(), citation_ids: z.array(z.string()) })).optional() })),
  citations: z.array(citationSchema), rows: z.array(z.object({ focus: z.string(), left: z.array(factSchema), right: z.array(factSchema) })).optional(),
  coverage: z.object({ selected: z.int(), read: z.int(), failed: z.array(z.object({ url: z.string(), code: z.string(), reason: z.string() })),
    truncated: z.boolean(), search: searchCoverage.nullable(), search_next_cursor: nullable, notes: z.array(z.string()) }), generated_at: z.string(), files: z.array(fileSchema) });
export const interpretationData = z.object({ policy_id: z.string(), items: z.array(linkSchema), reason: nullable });
export const legacyData = z.object({ source: z.string(), search_method: z.string(), count: z.int(),
  filters: z.object({ startdate: nullable, enddate: nullable, keyword: nullable }),
  items: z.array(hitSchema.extend({ date: nullable, summary: z.string(), issuing_agency: nullable, document_number: nullable })),
  coverage: searchCoverage, next_cursor: nullable, date_basis: z.string() });
export function envelope<T extends z.ZodType>(data: T) {
  return z.object({ status: z.enum(['ok', 'partial', 'error']), data: data.nullable(), warnings: z.array(z.string()), fetched_at: z.string(),
    error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean(), hint: z.string() }).optional() });
}
