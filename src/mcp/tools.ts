/**
 * MCP tool registry (#10) — exposes core CLI verbs as MCP tools so LLM agents
 * can drive them. Pure: handlers reuse the existing command functions (which
 * already return data) and this module imports NO MCP SDK, so the tools are
 * unit-testable on their own. server.ts wires this registry into a stdio server.
 *
 * identity ops go through the same functions as the CLI, so their audit-log
 * entries are preserved for MCP-invoked operations too.
 */

import { resolve } from "node:path";
import { statusCommand } from "../commands/status.js";
import { doctorCommand } from "../commands/doctor.js";
import { auditVerify } from "../commands/audit.js";
import {
  resolveStore,
  mintIdentity,
  inspectIdentity,
  rotateIdentity,
} from "../commands/identity.js";
import { findConfig, writeConfig, type AgentKitConfig } from "../config.js";
import { SERVICE_REGISTRY } from "../services.js";
import { generateDockerCompose } from "../generators/docker.js";
import { generateProject } from "../generators/project.js";

export interface McpTool {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

function requireConfig(args: Record<string, unknown>): string {
  const cfg = str(args["config"]) ?? findConfig();
  if (!cfg) throw new Error("No agentkit.config.yaml found. Run `init` first or pass `config`.");
  return cfg;
}

/** Scaffold a project non-interactively from explicit params (the MCP shape of `init`). */
export function scaffoldProject(args: {
  projectName: string;
  language?: "typescript" | "python";
  services?: string[];
  dir?: string;
}): { configPath: string; config: AgentKitConfig } {
  const targetDir = resolve(args.dir ?? ".");
  const selected = args.services ?? Object.keys(SERVICE_REGISTRY);
  const services: AgentKitConfig["services"] = {};
  for (const key of selected) {
    const def = SERVICE_REGISTRY[key];
    if (!def) continue;
    (services as Record<string, unknown>)[key] = {
      enabled: true,
      ...(def.defaultPort ? { port: def.defaultPort } : {}),
    };
  }
  const config: AgentKitConfig = {
    projectName: args.projectName,
    language: args.language ?? "typescript",
    services,
  };
  const configPath = resolve(targetDir, "agentkit.config.yaml");
  writeConfig(configPath, config);
  generateDockerCompose(targetDir, config);
  generateProject(targetDir, config);
  return { configPath, config };
}

export const TOOLS: McpTool[] = [
  {
    name: "status",
    description: "Health/status of all configured AgentKit services (running/down/disabled).",
    inputSchema: {
      type: "object",
      properties: {
        config: { type: "string", description: "Path to agentkit.config.yaml (default: auto-discover)" },
        timeout: { type: "number", description: "Per-service health timeout (ms)" },
      },
    },
    handler: async (args) => statusCommand({ config: requireConfig(args), timeout: Number(args["timeout"]) || undefined }),
  },
  {
    name: "doctor",
    description: "Diagnostic checks on the AgentKit setup (config, docker, containers, health).",
    inputSchema: {
      type: "object",
      properties: {
        config: { type: "string" },
        timeout: { type: "number" },
      },
    },
    handler: async (args) => doctorCommand({ config: requireConfig(args), timeout: Number(args["timeout"]) || undefined }),
  },
  {
    name: "audit_verify",
    description: "Walk a running stack's AgentLens audit hash chain; returns PASS/FAIL (ok) + details.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "AgentLens base URL (default: $AGENTLENS_URL or localhost:3000)" },
        apiKey: { type: "string" },
        from: { type: "string", description: "ISO 8601 range start" },
        to: { type: "string", description: "ISO 8601 range end" },
        session: { type: "string", description: "Verify a single session id" },
      },
    },
    handler: async (args) =>
      auditVerify({
        url: str(args["url"]), apiKey: str(args["apiKey"]),
        from: str(args["from"]), to: str(args["to"]), session: str(args["session"]),
      }),
  },
  {
    name: "identity_mint",
    description: "Mint a new ed25519 agent identity. Returns the PUBLIC record (no secret).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-friendly label" },
        store: { type: "string", description: "Identity store root (default: ~/.agentkit)" },
      },
    },
    handler: async (args) => mintIdentity(resolveStore(str(args["store"])), { name: str(args["name"]) }).record,
  },
  {
    name: "identity_inspect",
    description: "Inspect an agent identity (public material only; verifies the local key).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        store: { type: "string" },
      },
    },
    handler: async (args) => {
      const id = str(args["id"]);
      if (!id) throw new Error("`id` is required");
      return inspectIdentity(resolveStore(str(args["store"])), id);
    },
  },
  {
    name: "identity_rotate",
    description: "Rotate an identity's key material in place (id stays stable). Returns the updated record.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        store: { type: "string" },
      },
    },
    handler: async (args) => {
      const id = str(args["id"]);
      if (!id) throw new Error("`id` is required");
      return rotateIdentity(resolveStore(str(args["store"])), id).record;
    },
  },
  {
    name: "init",
    description: "Scaffold a new AgentKit project non-interactively (config + docker-compose + project files).",
    inputSchema: {
      type: "object",
      required: ["projectName"],
      properties: {
        projectName: { type: "string" },
        language: { type: "string", enum: ["typescript", "python"] },
        services: { type: "array", items: { type: "string" }, description: "Service keys to enable (default: all)" },
        dir: { type: "string", description: "Target directory (default: cwd)" },
      },
    },
    handler: async (args) => {
      const projectName = str(args["projectName"]);
      if (!projectName) throw new Error("`projectName` is required");
      const language = str(args["language"]) as "typescript" | "python" | undefined;
      const services = Array.isArray(args["services"]) ? (args["services"] as string[]) : undefined;
      const { configPath, config } = scaffoldProject({ projectName, language, services, dir: str(args["dir"]) });
      return { configPath, projectName: config.projectName, language: config.language, services: Object.keys(config.services) };
    },
  },
];

export const TOOLS_BY_NAME: Map<string, McpTool> = new Map(TOOLS.map((t) => [t.name, t]));
