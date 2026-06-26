import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { genSecret, ensureSecrets, waitForHealth, SECRET_VARS } from "../src/commands/up.js";
import type { ServiceStatus } from "../src/commands/status.js";

const st = (service: string, status: ServiceStatus["status"]): ServiceStatus =>
  ({ service, status, port: null, version: null });

describe("up secrets (#7)", () => {
  it("genSecret prefixes LORE_API_KEY and is random", () => {
    expect(genSecret("LORE_API_KEY")).toMatch(/^lore_sk_[0-9a-f]{48}$/);
    expect(genSecret("JWT_SECRET")).toMatch(/^[0-9a-f]{48}$/);
    expect(genSecret("JWT_SECRET")).not.toBe(genSecret("JWT_SECRET"));
  });

  describe("ensureSecrets", () => {
    let dir: string;
    beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "agentkit-up-"))));
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it("creates a .env with all secret vars when absent", () => {
      const r = ensureSecrets(dir);
      expect(r.created).toBe(true);
      expect(existsSync(r.path)).toBe(true);
      const env = readFileSync(r.path, "utf-8");
      for (const v of SECRET_VARS) expect(env).toContain(`${v}=`);
    });

    it("never overwrites an existing .env", () => {
      const path = join(dir, ".env");
      writeFileSync(path, "LORE_API_KEY=preexisting\n");
      const r = ensureSecrets(dir);
      expect(r.created).toBe(false);
      expect(readFileSync(path, "utf-8")).toBe("LORE_API_KEY=preexisting\n");
    });
  });
});

describe("waitForHealth (#7)", () => {
  // Fake clock: sleep advances time so timeouts are deterministic + instant.
  function harness(seq: ServiceStatus[][]) {
    const clock = { t: 0 };
    let i = 0;
    return {
      now: () => clock.t,
      sleep: async (ms: number) => {
        clock.t += ms;
      },
      checkStatus: async () => seq[Math.min(i++, seq.length - 1)]!,
    };
  }

  it("returns ready once required services (lore, agentgate) are running", async () => {
    const h = harness([
      [st("lore", "down"), st("agentgate", "down")],
      [st("lore", "running"), st("agentgate", "running")],
    ]);
    const r = await waitForHealth("cfg", { timeoutMs: 1000, intervalMs: 20, ...h });
    expect(r.ready).toBe(true);
  });

  it("ignores agentlens health (non-blocking) when the rest are up", async () => {
    const h = harness([[st("agentlens", "down"), st("lore", "running"), st("agentgate", "running")]]);
    const r = await waitForHealth("cfg", { timeoutMs: 1000, intervalMs: 20, ...h });
    expect(r.ready).toBe(true);
  });

  it("times out (ready=false) when a required service never comes up", async () => {
    const h = harness([[st("lore", "down"), st("agentgate", "running")]]);
    const r = await waitForHealth("cfg", { timeoutMs: 100, intervalMs: 20, ...h });
    expect(r.ready).toBe(false);
    expect(r.waitedMs).toBeGreaterThanOrEqual(100);
  });
});
