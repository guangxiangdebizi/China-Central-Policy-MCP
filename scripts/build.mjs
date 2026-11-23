import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const build = new URL('build/', root);
if (build.origin !== root.origin || !build.pathname.startsWith(root.pathname) || build.pathname === root.pathname) throw new Error('Unsafe build path');
await rm(build, { recursive: true, force: true });
const result = spawnSync(process.execPath, [fileURLToPath(new URL('node_modules/typescript/bin/tsc', root))], { cwd: fileURLToPath(root), stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
