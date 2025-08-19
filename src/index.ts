import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { getLatestPolicies } from "./tools/getLatestPolicies.js";
import { getPolicyFulltext } from "./tools/getPolicyFulltext.js";

const server = new Server({
  name: "ChinaCentralPolicyMCP",
  version: "1.0.0",
}, {
  capabilities: { tools: {} }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: getLatestPolicies.name,
        description: getLatestPolicies.description,
        inputSchema: getLatestPolicies.parameters
      },
      {
        name: getPolicyFulltext.name,
        description: getPolicyFulltext.description,
        inputSchema: getPolicyFulltext.parameters
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case getLatestPolicies.name:
      return await getLatestPolicies.run(request.params.arguments as any);
    case getPolicyFulltext.name:
      return await getPolicyFulltext.run(request.params.arguments as any);
    default:
      throw new Error("Unknown tool");
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);