/**
 * Identity-scoped stack MCP server over HTTP (stack#7).
 *
 * Binds to a minted identity (refuses to start otherwise) and serves the
 * read/verify-scoped stack tools over the MCP Streamable-HTTP transport. The
 * SDK + node:http are loaded via dynamic import() (ESM-from-CJS). Stateless:
 * a fresh transport+server per request (no session state to leak across
 * identities).
 */

import { stackToolsFor, loadServingIdentity, type BoundIdentity } from "./stack-tools.js";
import type { McpTool } from "./tools.js";

export interface StackServerOptions {
  identityId: string;
  port?: number;
  store?: string;
}

export interface RunningStackServer {
  port: number;
  close: () => Promise<void>;
}

async function buildServer(identity: BoundIdentity, tools: McpTool[]) {
  const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
  const { ListToolsRequestSchema, CallToolRequestSchema } = await import("@modelcontextprotocol/sdk/types.js");
  const byName = new Map(tools.map((t) => [t.name, t]));

  const server = new Server(
    { name: `agentkit-stack:${identity.id}`, version: "0.1.1" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = byName.get(request.params.name);
    if (!tool) return { content: [{ type: "text" as const, text: `Unknown tool: ${request.params.name}` }], isError: true };
    try {
      const result = await tool.handler((request.params.arguments ?? {}) as Record<string, unknown>);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  });
  return server;
}

export async function runStackMcpServer(opts: StackServerOptions): Promise<RunningStackServer> {
  // Identity-scoping enforcement: throws unless we hold this identity's key.
  const identity = loadServingIdentity(opts.store, opts.identityId);
  const tools = stackToolsFor(identity);

  const { createServer } = await import("node:http");
  const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");

  const httpServer = createServer(async (req, res) => {
    if (!req.url?.startsWith("/mcp")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Not found", hint: "POST MCP requests to /mcp" }));
      return;
    }
    // Stateless: a fresh server + transport per request.
    const server = await buildServer(identity, tools);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    let raw = "";
    for await (const chunk of req) raw += chunk;
    await transport.handleRequest(req, res, raw ? JSON.parse(raw) : undefined);
  });

  const requested = opts.port ?? 8770;
  await new Promise<void>((resolve) => httpServer.listen(requested, resolve));
  const addr = httpServer.address();
  const port = typeof addr === "object" && addr ? addr.port : requested;
  return {
    port,
    close: () => new Promise<void>((resolve) => httpServer.close(() => resolve())),
  };
}
