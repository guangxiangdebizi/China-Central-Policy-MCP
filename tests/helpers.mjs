import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createServer } from 'node:net';

export const employment = 'https://www.gov.cn/zhengce/zhengceku/202507/content_7031216.htm';
export const department = 'https://www.gov.cn/zhengce/zhengceku/202609/content_7080773.htm';
export async function stdioClient(env = {}) {
  const client = new Client({ name: 'policy-real-test', version: '2.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('build/index.js')],
    env: { ...process.env, MCP_TRANSPORT: 'stdio', ...env }, stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += chunk; });
  await client.connect(transport);
  return { client, stderr: () => stderr };
}
export async function httpClient() {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath, ['build/index.js'], { env: { ...process.env, MCP_TRANSPORT: 'http', PORT: String(port),
    PUBLIC_BASE_URL: `http://127.0.0.1:${port}` }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('HTTP server did not start')); }, 10000);
    child.once('error', reject);
    child.stderr.on('data', data => {
      const match = data.toString().match(/http:\/\/127.0.0.1:(\d+)\/mcp/);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
  const client = new Client({ name: 'policy-http-real-test', version: '2.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp')));
  return { client, base, child, close: async () => { await client.close(); child.kill(); } };
}
export async function call(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(JSON.stringify(result));
  if (!result.structuredContent) throw new Error('Missing structuredContent: ' + JSON.stringify(result));
  return result.structuredContent;
}
