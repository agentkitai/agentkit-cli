import type { AgentKitConfig } from "../config.js";

export function tsIndexTemplate(config: AgentKitConfig): string {
  const enabledServices = Object.entries(config.services)
    .filter(([, v]) => v?.enabled)
    .map(([k]) => k);

  return `// ${config.projectName} — AgentKit Project
// Enabled services: ${enabledServices.join(", ")}

console.log("Welcome to ${config.projectName}!");
console.log("Enabled services: ${enabledServices.join(", ")}");
`;
}

export function tsPackageJsonTemplate(config: AgentKitConfig): string {
  const deps: Record<string, string> = {};
  const services = config.services;
  if (services.agentlens?.enabled) deps["@agentkit/agentlens"] = "latest";
  if (services.lore?.enabled) deps["@agentkit/lore"] = "latest";
  if (services.agentgate?.enabled) deps["@agentkit/agentgate"] = "latest";
  if (services.formbridge?.enabled) deps["@agentkit/formbridge"] = "latest";
  if (services.agenteval?.enabled) deps["@agentkit/agenteval"] = "latest";

  return JSON.stringify(
    {
      name: config.projectName,
      version: "0.1.0",
      type: "module",
      scripts: {
        build: "tsc",
        start: "node dist/index.js",
        dev: "tsx src/index.ts",
      },
      dependencies: deps,
      devDependencies: {
        typescript: "^5.0.0",
        tsx: "^4.0.0",
        "@types/node": "^20.0.0",
      },
    },
    null,
    2
  );
}

export function tsTsconfigTemplate(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        outDir: "dist",
        rootDir: "src",
        strict: true,
        esModuleInterop: true,
      },
      include: ["src"],
    },
    null,
    2
  );
}

export function pyMainTemplate(config: AgentKitConfig): string {
  const enabledServices = Object.entries(config.services)
    .filter(([, v]) => v?.enabled)
    .map(([k]) => k);

  return `# ${config.projectName} — AgentKit Project
# Enabled services: ${enabledServices.join(", ")}

def main():
    print("Welcome to ${config.projectName}!")
    print("Enabled services: ${enabledServices.join(", ")}")

if __name__ == "__main__":
    main()
`;
}

export function pyProjectTomlTemplate(config: AgentKitConfig): string {
  const deps: string[] = [];
  const services = config.services;
  if (services.agentlens?.enabled) deps.push('"agentkit-agentlens"');
  if (services.lore?.enabled) deps.push('"agentkit-lore"');
  if (services.agentgate?.enabled) deps.push('"agentkit-agentgate"');
  if (services.formbridge?.enabled) deps.push('"agentkit-formbridge"');
  if (services.agenteval?.enabled) deps.push('"agentkit-agenteval"');

  return `[project]
name = "${config.projectName}"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = [
  ${deps.join(",\n  ")}
]

[build-system]
requires = ["setuptools>=68.0"]
build-backend = "setuptools.build_meta"
`;
}

// ── Governed-agent template (#8) — opt-in compliance-first scaffold ──────

/** TypeScript governed-agent entry: audit + approval-gate + redacted-memory pattern. */
export function governedAgentTsTemplate(config: AgentKitConfig): string {
  return `// ${config.projectName} — Governed Agent (compliance-first scaffold)
//
// Three governance pillars are wired in from day one:
//   1. AUDIT    — every action is recorded to AgentLens (tamper-evident hash chain)
//   2. APPROVAL — sensitive actions pause for human approval via AgentGate
//   3. MEMORY   — context is stored in Lore with PII redaction
//
// Verify the audit trail any time:   agentkit audit verify
// Export a compliance pack:          agentkit evidence export
// See GOVERNANCE.md for the full pattern.

interface ActionContext {
  actor: string;
  action: string;
  payload: unknown;
}

const SENSITIVE = new Set(["send_email", "make_payment", "delete_data"]);
const isSensitive = (action: string): boolean => SENSITIVE.has(action);

/** Wrap every agent action so it is audit-logged and policy-checked. */
export async function governed<T>(ctx: ActionContext, run: () => Promise<T>): Promise<T> {
  await audit("action.start", ctx);
  if (isSensitive(ctx.action)) {
    const approved = await requestApproval(ctx); // AgentGate human-in-the-loop
    if (!approved) {
      await audit("action.denied", ctx);
      throw new Error(\`Denied by policy: \${ctx.action}\`);
    }
  }
  try {
    const result = await run();
    await audit("action.ok", ctx);
    return result;
  } catch (err) {
    await audit("action.error", { ...ctx, error: String(err) });
    throw err;
  }
}

// --- governance hooks: wire these to your running stack (see GOVERNANCE.md) ---
async function audit(event: string, ctx: object): Promise<void> {
  // POST to AgentLens; the event joins the tamper-evident audit hash chain.
  console.log("[audit]", event, ctx);
}

async function requestApproval(ctx: ActionContext): Promise<boolean> {
  // AgentGate pauses here for a human decision. Stubbed to true in the scaffold.
  console.log("[approval] requested for", ctx.action);
  return true;
}

async function main(): Promise<void> {
  await governed({ actor: "agent-1", action: "summarize", payload: {} }, async () => {
    console.log("Welcome to ${config.projectName} — running a governed action.");
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
`;
}

/** Python governed-agent entry (parallel to the TS scaffold). */
export function governedAgentPyTemplate(config: AgentKitConfig): string {
  return `"""${config.projectName} — Governed Agent (compliance-first scaffold).

Three governance pillars, wired in from day one:
  1. AUDIT    - every action recorded to AgentLens (tamper-evident hash chain)
  2. APPROVAL - sensitive actions pause for human approval via AgentGate
  3. MEMORY   - context stored in Lore with PII redaction

Verify the audit trail:  agentkit audit verify
Export a compliance pack: agentkit evidence export
See GOVERNANCE.md for the full pattern.
"""

SENSITIVE = {"send_email", "make_payment", "delete_data"}


def audit(event, ctx):
    # POST to AgentLens; the event joins the tamper-evident audit hash chain.
    print("[audit]", event, ctx)


def request_approval(ctx):
    # AgentGate pauses here for a human decision. Stubbed to True in the scaffold.
    print("[approval] requested for", ctx["action"])
    return True


def governed(ctx, run):
    """Wrap every agent action so it is audit-logged and policy-checked."""
    audit("action.start", ctx)
    if ctx["action"] in SENSITIVE:
        if not request_approval(ctx):
            audit("action.denied", ctx)
            raise PermissionError(f"Denied by policy: {ctx['action']}")
    try:
        result = run()
        audit("action.ok", ctx)
        return result
    except Exception as err:  # noqa: BLE001
        audit("action.error", {**ctx, "error": str(err)})
        raise


def main():
    governed(
        {"actor": "agent-1", "action": "summarize", "payload": {}},
        lambda: print("Welcome to ${config.projectName} - running a governed action."),
    )


if __name__ == "__main__":
    main()
`;
}

/** GOVERNANCE.md shipped with the governed-agent template. */
export function governanceDocsTemplate(config: AgentKitConfig): string {
  return `# Governance — ${config.projectName}

This project uses the **governed-agent** scaffold: agents are compliance-first by
construction, not as an afterthought.

## The three pillars

| Pillar | What it does | Backed by |
|--------|--------------|-----------|
| **Audit** | Every action is recorded to a tamper-evident hash chain | AgentLens |
| **Approval** | Sensitive actions pause for a human decision | AgentGate |
| **Memory** | Context is stored with PII redaction | Lore |

## The pattern

Wrap every action in \`governed(ctx, run)\` (see \`src/\`). It:

1. records \`action.start\` to the audit trail,
2. for sensitive actions, requests human approval and records \`action.denied\` if refused,
3. runs the action and records \`action.ok\` / \`action.error\`.

Mark an action sensitive by adding it to the \`SENSITIVE\` set.

## Verify & export

\`\`\`bash
agentkit audit verify        # walk the live hash chain → PASS/FAIL
agentkit evidence export     # signed compliance evidence pack
agentkit identity mint       # mint this agent's identity
\`\`\`

The audit verdict is non-zero on FAIL, so you can gate CI/compliance checks on it.
`;
}
