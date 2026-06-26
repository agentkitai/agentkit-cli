import { describe, it, expect, vi, afterEach } from "vitest";
import { checkLinkage, auditVerify, formatAuditVerify } from "../src/commands/audit.js";

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const ev = (id: string, sessionId: string, timestamp: string, prevHash: string | null, hash: string) =>
  ({ id, sessionId, timestamp, prevHash, hash });

afterEach(() => vi.restoreAllMocks());

describe("checkLinkage (stack#3)", () => {
  it("accepts an intact per-session chain", () => {
    const events = [
      ev("1", "s1", "2026-06-26T00:00:01Z", null, "h1"),
      ev("2", "s1", "2026-06-26T00:00:02Z", "h1", "h2"),
      ev("3", "s1", "2026-06-26T00:00:03Z", "h2", "h3"),
    ];
    expect(checkLinkage(events)).toEqual({ linkageOk: true, linkageChecked: 2 });
  });

  it("rejects a broken link (prevHash doesn't match the previous hash)", () => {
    const events = [
      ev("1", "s1", "2026-06-26T00:00:01Z", null, "h1"),
      ev("2", "s1", "2026-06-26T00:00:02Z", "TAMPERED", "h2"),
    ];
    expect(checkLinkage(events).linkageOk).toBe(false);
  });

  it("checks each session independently and is order-insensitive on input", () => {
    const events = [
      ev("b2", "s2", "2026-06-26T00:00:02Z", "g1", "g2"),
      ev("a1", "s1", "2026-06-26T00:00:01Z", null, "h1"),
      ev("b1", "s2", "2026-06-26T00:00:01Z", null, "g1"),
      ev("a2", "s1", "2026-06-26T00:00:02Z", "h1", "h2"),
    ];
    expect(checkLinkage(events).linkageOk).toBe(true);
  });
});

describe("auditVerify (stack#3)", () => {
  it("PASS when the server verifies AND the local re-walk linkage holds", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const u = String(input);
      if (u.includes("/api/audit/verify/export")) {
        return jsonResponse({ events: [ev("1", "s1", "t1", null, "h1"), ev("2", "s1", "t2", "h1", "h2")] });
      }
      return jsonResponse({ verified: true, sessionsVerified: 1, brokenChains: [] });
    });
    const r = await auditVerify({ url: "http://lens:3000" });
    expect(r.ok).toBe(true);
    expect(r.verified).toBe(true);
    expect(r.linkageOk).toBe(true);
    expect(r.linkageChecked).toBe(1);
    expect(formatAuditVerify(r)).toContain("PASS");
  });

  it("FAIL when the server reports an unverified chain", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ verified: false, sessionsVerified: 1, brokenChains: [{ sessionId: "s1", reason: "hash mismatch" }] }),
    );
    const r = await auditVerify({ url: "http://lens:3000" });
    expect(r.ok).toBe(false);
    expect(r.brokenChains).toHaveLength(1);
    expect(formatAuditVerify(r)).toContain("FAIL");
  });

  it("FAIL when the server says verified but the local linkage re-walk is broken", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const u = String(input);
      if (u.includes("/export")) {
        return jsonResponse({ events: [ev("1", "s1", "t1", null, "h1"), ev("2", "s1", "t2", "WRONG", "h2")] });
      }
      return jsonResponse({ verified: true, sessionsVerified: 1, brokenChains: [] });
    });
    const r = await auditVerify({ url: "http://lens:3000" });
    expect(r.verified).toBe(true);
    expect(r.linkageOk).toBe(false);
    expect(r.ok).toBe(false); // the independent cross-check catches it
  });

  it("FAIL with a clear error on a non-2xx from the server", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "Forbidden" }, 403));
    const r = await auditVerify({ url: "http://lens:3000" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("403");
  });

  it("FAIL with a reachability error when AgentLens is down", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const r = await auditVerify({ url: "http://lens:3000" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/could not reach/i);
  });

  it("sends a Bearer token when an api key is provided", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ verified: true, sessionsVerified: 0, brokenChains: [] }));
    await auditVerify({ url: "http://lens:3000", apiKey: "als_secret" });
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer als_secret");
  });
});
