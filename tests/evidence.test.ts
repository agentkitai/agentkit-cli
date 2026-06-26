import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evidenceExport, formatEvidenceExport } from "../src/commands/evidence.js";

let dir: string;
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "agentkit-ev-"))));
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const PACK = {
  exportedAt: "2026-06-26T12:00:00.000Z",
  range: { from: "2025-06-26T00:00:00.000Z", to: "2026-06-26T12:00:00.000Z" },
  totalEvents: 3,
  chainVerification: { verified: true, sessionsVerified: 1 },
  events: [{ id: "1", prevHash: null, hash: "h1" }],
  signature: "hmac-sha256:abc123",
};

describe("agentkit evidence export (stack#4)", () => {
  it("writes the signed pack to disk and summarizes it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(PACK));
    const out = join(dir, "ev.json");
    const r = await evidenceExport({ url: "http://lens:3000", out });
    expect(r.ok).toBe(true);
    expect(r.outPath).toBe(out);
    expect(r.totalEvents).toBe(3);
    expect(r.verified).toBe(true);
    expect(r.signed).toBe(true);

    expect(existsSync(out)).toBe(true);
    const written = JSON.parse(readFileSync(out, "utf-8"));
    expect(written.signature).toBe("hmac-sha256:abc123");
    expect(written.totalEvents).toBe(3);
    expect(formatEvidenceExport(r)).toContain("Evidence pack exported");
  });

  it("still exports (ok) when the chain did NOT verify — the verdict is part of the evidence", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ...PACK, chainVerification: { verified: false }, signature: null }),
    );
    const r = await evidenceExport({ url: "http://lens:3000", out: join(dir, "ev.json") });
    expect(r.ok).toBe(true);
    expect(r.verified).toBe(false);
    expect(r.signed).toBe(false);
    expect(formatEvidenceExport(r)).toMatch(/did not verify/i);
  });

  it("fails with a clear error on a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "Forbidden" }, 403));
    const r = await evidenceExport({ url: "http://lens:3000", out: join(dir, "ev.json") });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("403");
    expect(existsSync(join(dir, "ev.json"))).toBe(false);
  });

  it("fails with a reachability error when AgentLens is down", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const r = await evidenceExport({ url: "http://lens:3000", out: join(dir, "ev.json") });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/could not reach/i);
  });

  it("sends a Bearer token when an api key is provided", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(PACK));
    await evidenceExport({ url: "http://lens:3000", apiKey: "als_k", out: join(dir, "ev.json") });
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer als_k");
  });
});
