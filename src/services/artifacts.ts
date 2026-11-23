import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash } from '../core.js';

export const outputDir = () => resolve(process.env.OUTPUT_DIR || './output');
export async function writeBriefFiles(markdown: string, data: unknown) {
  const id = randomUUID();
  const dir = resolve(outputDir(), id);
  await mkdir(dir, { recursive: true });
  const files = [];
  for (const [name, content, format] of [
    ['policy-brief.md', markdown, 'markdown'], ['policy-brief.json', JSON.stringify(data, null, 2), 'json'],
  ] as const) {
    const path = resolve(dir, name);
    await writeFile(path, content, 'utf8');
    const actual = await readFile(path);
    files.push({ path, bytes: actual.byteLength, sha256: hash(actual.toString('utf8')), format,
      downloadUrl: process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/files/${id}/${name}` : null });
  }
  return files;
}
