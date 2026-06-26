/**
 * MCP stdio server (#10) — wires the pure TOOLS registry into the MCP SDK.
 *
 * The SDK is ESM-only and this CLI builds to CommonJS, so it's loaded via
 * dynamic import() (which survives the CJS emit). Every tool result is returned
 * as structured JSON text so MCP clients/agents can parse it; handler errors
 * become isError responses rather than crashing the server.
 */

import { TOOLS, TOOLS_BY_NAME } from "./tools.js";

export async function runMcpServer(): Promise<void> {
  const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { ListToolsRequestSchema, CallToolRequestSchema } = await import("@modelcontextprotocol/sdk/types.js");

  const server = new Server(
    { name: "agentkit", version: "0.1.1" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = TOOLS_BY_NAME.get(request.params.name);
    if (!tool) {
      return { content: [{ type: "text" as const, text: `Unknown tool: ${request.params.name}` }], isError: true };
    }
    try {
      const result = await tool.handler((request.params.arguments ?? {}) as Record<string, unknown>);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  });

  await server.connect(new StdioServerTransport());
}
