import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDemo, formatTour, shouldSeedDemo, markDemoSeeded } from "../src/commands/demo.js";

const okFetch = (async () => ({ ok: true, status: 201, json: async () => ({}) })) as unknown as typeof fetch;
const failFetch = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
const throwFetch = (async () => {
  throw new Error("ECONNREFUSED");
}) as unknown as typeof fetch;

describe("agentkit demo (stack#5)", () => {
  it("seeds the trace + redacted-memory pillars and guides the approval pillar", async () => {
    const results = await runDemo({ fetchImpl: okFetch });
    const byPillar = Object.fromEntries(results.map((r) => [r.pillar, r]));
    expect(byPillar.trace!.status).toBe("seeded");
    expect(byPillar.memory!.status).toBe("seeded");
    expect(byPillar.approval!.status).toBe("guided"); // no guessed POST — instructions
    expect(results).toHaveLength(3);
  });

  it("skips a pillar gracefully when its service is unhealthy (e.g. degraded AgentLens)", async () => {
    const results = await runDemo({ fetchImpl: failFetch });
    expect(results.find((r) => r.pillar === "trace")!.status).toBe("skipped");
    expect(results.find((r) => r.pillar === "memory")!.status).toBe("skipped");
    expect(results.find((r) => r.pillar === "approval")!.status).toBe("guided"); // guided regardless
  });

  it("skips (not crashes) when a service is unreachable", async () => {
    const results = await runDemo({ fetchImpl: throwFetch });
    expect(results.find((r) => r.pillar === "trace")!.status).toBe("skipped");
    expect(results.find((r) => r.pillar === "trace")!.detail).toMatch(/unreachable/i);
  });

  it("the seeded memory carries PII so Lore's redaction is demonstrable", async () => {
    let body = "";
    const capture = (async (_u: string, init: RequestInit) => {
      body = String(init.body);
      return { ok: true, status: 201, json: async () => ({}) };
    }) as unknown as typeof fetch;
    await runDemo({ fetchImpl: capture, loreUrl: "http://lore:8765" });
    expect(body).toMatch(/SSN|@example\.com|4111/); // PII present in the seeded memory
  });

  it("formatTour lists all three pillars + the verify/export next steps", () => {
    const tour = formatTour([
      { pillar: "trace", feature: "Trace visibility", service: "AgentLens", status: "seeded", detail: "x", viewAt: "u" },
      { pillar: "approval", feature: "Pending approval", service: "AgentGate", status: "guided", detail: "y" },
      { pillar: "memory", feature: "Redacted memory", service: "Lore", status: "seeded", detail: "z" },
    ]);
    expect(tour).toContain("Trace visibility");
    expect(tour).toContain("Pending approval");
    expect(tour).toContain("Redacted memory");
    expect(tour).toContain("agentkit audit verify");
  });

  describe("first-run marker", () => {
    let dir: string;
    beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "agentkit-demo-"))));
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it("seeds only on the first up", () => {
      expect(shouldSeedDemo(dir)).toBe(true);
      markDemoSeeded(dir);
      expect(shouldSeedDemo(dir)).toBe(false);
    });
  });
});
