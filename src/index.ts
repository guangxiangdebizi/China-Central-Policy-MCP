import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler, hostHeaderValidation, originValidation } from '@modelcontextprotocol/node';
import { buildServer } from './server.js';
import { outputDir } from './services/artifacts.js';

const transport = process.env.MCP_TRANSPORT || 'stdio';
if (transport === 'stdio') {
  serveStdio(buildServer, { onerror: error => console.error(error.message) });
} else if (transport === 'http') {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || '3100');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
  const publicHost = process.env.PUBLIC_BASE_URL ? new URL(process.env.PUBLIC_BASE_URL).hostname : undefined;
  const names = ['localhost', '127.0.0.1', '[::1]', host, ...(publicHost ? [publicHost] : [])];
  const validateHost = hostHeaderValidation(names);
  const validateOrigin = originValidation(names);
  const handler = toNodeHandler(createMcpHandler(buildServer));
  const server = createServer(async (req, res) => {
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;
    const path = req.url?.split('?')[0];
    if (path === '/mcp') { await handler(req, res); return; }
    const match = path?.match(/^\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(policy-brief\.(md|json))$/);
    if (match && req.method === 'GET') {
      try {
        const bytes = await readFile(resolve(outputDir(), match[1], match[2]));
        res.writeHead(200, { 'Content-Type': match[3] === 'json' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${match[2]}"`, 'Content-Length': bytes.length, 'X-Content-Type-Options': 'nosniff' });
        res.end(bytes);
        return;
      } catch { /* Missing files use the same 404 as unknown routes. */ }
    }
    res.writeHead(404).end('Not found');
  });
  server.listen(port, host, () => console.error(`China-Central-Policy-MCP http://${host}:${(server.address() as { port: number }).port}/mcp`));
  const close = () => server.close(() => process.exit(0));
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
} else { throw new Error('MCP_TRANSPORT must be stdio or http'); }
