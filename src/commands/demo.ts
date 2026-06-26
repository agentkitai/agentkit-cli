/**
 * `agentkit demo` (stack#5) — seed demo data + a governed guided tour on first
 * `up`, walking the three governance pillars:
 *   • trace visibility  (AgentLens)
 *   • pending approval  (AgentGate)
 *   • redacted memory   (Lore)
 *
 * Best-effort + graceful: each pillar is attempted independently, and an
 * unreachable/unhealthy/erroring service is SKIPPED with a reason rather than
 * failing the whole demo. (AgentLens is known-degraded under the stale compose,
 * so its trace step skips cleanly — see the version-alignment follow-up.)
 *
 * The approval pillar is "guided" (instructions) rather than seeded: AgentGate's
 * create-approval API isn't wired here, so rather than POST to a guessed
 * endpoint we point the user at how to trigger one (a governed action).
 */

import { Command } from "commander";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface DemoOptions {
  lensUrl?: string;
  loreUrl?: string;
  gateUrl?: string;
  lensKey?: string;
  loreKey?: string;
  timeout?: number;
  /** Injectable for tests (defaults to global fetch). */
  fetchImpl?: typeof fetch;
}

export interface PillarResult {
  pillar: "trace" | "approval" | "memory";
  feature: string;
  service: string;
  status: "seeded" | "guided" | "skipped";
  detail: string;
  viewAt?: string;
}

const trim = (u: string) => u.replace(/\/+$/, "");
const lensUrl = (o: DemoOptions) => trim(o.lensUrl ?? process.env["AGENTLENS_URL"] ?? "http://localhost:3000");
const loreUrl = (o: DemoOptions) => trim(o.loreUrl ?? process.env["LORE_URL"] ?? "http://localhost:8765");
const gateUrl = (o: DemoOptions) => trim(o.gateUrl ?? process.env["AGENTGATE_URL"] ?? "http://localhost:3002");

function bearer(key?: string): Record<string, string> {
  return key ? { Authorization: `Bearer ${key}` } : {};
}

// PII on purpose — demonstrates that Lore redacts it at rest.
const DEMO_MEMORY = {
  problem: "Customer john.doe@example.com (SSN 123-45-6789, card 4111 1111 1111 1111) reported a failed deploy.",
  resolution: "Rolled back; the secret had leaked into logs. Redact PII before storing.",
  context: "agentkit demo seed",
  tags: ["demo", "governance"],
};

async function seedTrace(o: DemoOptions, f: typeof fetch): Promise<PillarResult> {
  const url = lensUrl(o);
  const base: PillarResult = { pillar: "trace", feature: "Trace visibility", service: "AgentLens", status: "skipped", detail: "" };
  try {
    const res = await f(`${url}/api/events/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(o.lensKey) },
      body: JSON.stringify({
        events: [
          { sessionId: "demo-session", agentId: "demo-agent", eventType: "agent.start", timestamp: new Date(0).toISOString() },
          { sessionId: "demo-session", agentId: "demo-agent", eventType: "tool.call", timestamp: new Date(1).toISOString() },
          { sessionId: "demo-session", agentId: "demo-agent", eventType: "agent.end", timestamp: new Date(2).toISOString() },
        ],
      }),
      signal: AbortSignal.timeout(o.timeout ?? 5000),
    });
    if (!res.ok) return { ...base, detail: `AgentLens ingest → ${res.status} (skipped; AgentLens may be degraded)` };
    return { ...base, status: "seeded", detail: "Seeded a 3-event demo trace.", viewAt: `${url} (Traces)` };
  } catch (err) {
    return { ...base, detail: `AgentLens unreachable (${err instanceof Error ? err.message : String(err)}) — skipped` };
  }
}

async function seedMemory(o: DemoOptions, f: typeof fetch): Promise<PillarResult> {
  const url = loreUrl(o);
  const base: PillarResult = { pillar: "memory", feature: "Redacted memory", service: "Lore", status: "skipped", detail: "" };
  try {
    const res = await f(`${url}/v1/lessons`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(o.loreKey) },
      body: JSON.stringify(DEMO_MEMORY),
      signal: AbortSignal.timeout(o.timeout ?? 5000),
    });
    if (!res.ok) return { ...base, detail: `Lore create → ${res.status} (skipped)` };
    return { ...base, status: "seeded", detail: "Stored a memory containing PII — Lore redacts it at rest.", viewAt: `${url}/v1/lessons` };
  } catch (err) {
    return { ...base, detail: `Lore unreachable (${err instanceof Error ? err.message : String(err)}) — skipped` };
  }
}

function guideApproval(o: DemoOptions): PillarResult {
  return {
    pillar: "approval",
    feature: "Pending approval",
    service: "AgentGate",
    status: "guided",
    detail: "Trigger a pending approval by running a sensitive action through the governed-agent template (see `agentkit init --template governed-agent`).",
    viewAt: `${gateUrl(o)} (Approvals)`,
  };
}

export async function runDemo(o: DemoOptions = {}): Promise<PillarResult[]> {
  const f = o.fetchImpl ?? fetch;
  const [trace, memory] = await Promise.all([seedTrace(o, f), seedMemory(o, f)]);
  return [trace, guideApproval(o), memory];
}

export function formatTour(results: PillarResult[]): string {
  const icon = { seeded: "✓", guided: "→", skipped: "·" };
  const lines = ["", "🎒 Governed guided tour — three pillars of agent governance:", ""];
  for (const r of results) {
    lines.push(`${icon[r.status]} ${r.feature} (${r.service}) — ${r.status}`);
    lines.push(`    ${r.detail}`);
    if (r.viewAt && r.status !== "skipped") lines.push(`    view: ${r.viewAt}`);
    lines.push("");
  }
  lines.push("Verify integrity any time:  agentkit audit verify");
  lines.push("Export a compliance pack:   agentkit evidence export");
  return lines.join("\n");
}

/** Marker so the demo auto-seeds only on the FIRST `up`. Returns true if it should seed now. */
export function shouldSeedDemo(projectDir: string): boolean {
  return !existsSync(join(projectDir, ".agentkit", "demo-seeded"));
}

export function markDemoSeeded(projectDir: string): void {
  const dir = join(projectDir, ".agentkit");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "demo-seeded"), new Date(0).toISOString() + "\n", "utf-8");
}

export function registerDemoCommand(program: Command): void {
  program
    .command("demo")
    .description("Seed demo data + a governed guided tour (trace, pending approval, redacted memory)")
    .option("--lens-url <url>", "AgentLens base URL")
    .option("--lore-url <url>", "Lore base URL")
    .option("--gate-url <url>", "AgentGate base URL")
    .option("--lens-key <key>", "AgentLens API key")
    .option("--lore-key <key>", "Lore API key")
    .action(async (opts) => {
      const results = await runDemo({
        lensUrl: opts.lensUrl, loreUrl: opts.loreUrl, gateUrl: opts.gateUrl,
        lensKey: opts.lensKey, loreKey: opts.loreKey,
      });
      console.log(formatTour(results));
    });
}
