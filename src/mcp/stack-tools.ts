/**
 * Identity-scoped stack MCP tools (stack#7).
 *
 * Exposes a running stack for LLM clients to QUERY/INTERACT with — but bound to
 * a single minted identity (#9), not as a universal gateway proxy (the
 * gateway-parity anti-goal). The binding is enforced two ways:
 *   1. the server refuses to start unless it holds the identity's private key
 *      (loadServingIdentity), so it can only act AS that identity;
 *   2. every tool result is stamped with `servedBy {id, fingerprint}`.
 *
 * The tool set is deliberately read/verify-scoped (whoami / status / audit_verify
 * / evidence_export) — no init/mint/scaffold, which aren't "interact with the
 * running stack" and would broaden the surface beyond the identity's view.
 */

import { statusCommand } from "../commands/status.js";
import { auditVerify } from "../commands/audit.js";
import { evidenceExport } from "../commands/evidence.js";
import { findConfig } from "../config.js";
import { inspectIdentity, resolveStore } from "../commands/identity.js";
import type { McpTool } from "./tools.js";

export interface BoundIdentity {
  id: string;
  fingerprint: string;
}

/**
 * Load + validate the identity the server will be bound to. Throws unless the
 * identity exists AND its private key is present and matches — the server must
 * hold the key to legitimately act as that identity (the scoping guarantee).
 */
export function loadServingIdentity(store: string | undefined, id: string): BoundIdentity {
  const s = resolveStore(store);
  const r = inspectIdentity(s, id); // throws if the identity record is missing
  if (!r.keyPresent || !r.keyMatches) {
    throw new Error(`Identity ${id} is not usable here: its private key is ${r.keyPresent ? "mismatched" : "absent"}.`);
  }
  return { id: r.id, fingerprint: r.fingerprint };
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

export function stackToolsFor(identity: BoundIdentity): McpTool[] {
  const stamp = (result: unknown) => ({ servedBy: { id: identity.id, fingerprint: identity.fingerprint }, result });
  const requireConfig = (args: Record<string, unknown>): string => {
    const cfg = str(args["config"]) ?? findConfig();
    if (!cfg) throw new Error("No agentkit.config.yaml found.");
    return cfg;
  };

  return [
    {
      name: "identity_whoami",
      description: "The agent identity this MCP server is bound to.",
      inputSchema: { type: "object", properties: {} },
      handler: async () => ({ id: identity.id, fingerprint: identity.fingerprint }),
    },
    {
      name: "status",
      description: "Health/status of the running stack's services.",
      inputSchema: { type: "object", properties: { config: { type: "string" }, timeout: { type: "number" } } },
      handler: async (args) => stamp(await statusCommand({ config: requireConfig(args), timeout: Number(args["timeout"]) || undefined })),
    },
    {
      name: "audit_verify",
      description: "Walk the running stack's audit hash chain; returns PASS/FAIL.",
      inputSchema: {
        type: "object",
        properties: { url: { type: "string" }, apiKey: { type: "string" }, from: { type: "string" }, to: { type: "string" }, session: { type: "string" } },
      },
      handler: async (args) =>
        stamp(await auditVerify({ url: str(args["url"]), apiKey: str(args["apiKey"]), from: str(args["from"]), to: str(args["to"]), session: str(args["session"]) })),
    },
    {
      name: "evidence_export",
      description: "Export a signed compliance evidence pack from the running stack.",
      inputSchema: {
        type: "object",
        properties: { url: { type: "string" }, apiKey: { type: "string" }, from: { type: "string" }, to: { type: "string" }, out: { type: "string" } },
      },
      handler: async (args) =>
        stamp(await evidenceExport({ url: str(args["url"]), apiKey: str(args["apiKey"]), from: str(args["from"]), to: str(args["to"]), out: str(args["out"]) })),
    },
  ];
}
