import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, unlinkSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mintIdentity } from "../src/commands/identity.js";
import { stackToolsFor, loadServingIdentity } from "../src/mcp/stack-tools.js";
import { runStackMcpServer } from "../src/mcp/stack-server.js";

let store: string;
beforeEach(() => (store = mkdtempSync(join(tmpdir(), "agentkit-stk-"))));
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(store, { recursive: true, force: true });
});

const ID = { id: "agt_test", fingerprint: "SHA256:abc" };

describe("stackToolsFor (stack#7)", () => {
  it("exposes only read/verify stack tools (no mint/init/scaffold)", () => {
    const names = stackToolsFor(ID).map((t) => t.name).sort();
    expect(names).toEqual(["audit_verify", "evidence_export", "identity_whoami", "status"]);
  });

  it("whoami returns the bound identity", async () => {
    const whoami = stackToolsFor(ID).find((t) => t.name === "identity_whoami")!;
    expect(await whoami.handler({})).toEqual({ id: "agt_test", fingerprint: "SHA256:abc" });
  });

  it("stamps every tool result with the serving identity", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      { ok: true, status: 200, json: async () => ({ verified: true, sessionsVerified: 0, brokenChains: [] }) } as Response,
    );
    const audit = stackToolsFor(ID).find((t) => t.name === "audit_verify")!;
    const out = (await audit.handler({ url: "http://lens:3000" })) as { servedBy: unknown; result: unknown };
    expect(out.servedBy).toEqual({ id: "agt_test", fingerprint: "SHA256:abc" });
    expect((out.result as { ok: boolean }).ok).toBe(true);
  });
});

describe("loadServingIdentity (identity scoping)", () => {
  it("loads a minted identity whose key is present + matches", () => {
    const { record } = mintIdentity({ root: store });
    const bound = loadServingIdentity(store, record.id);
    expect(bound.id).toBe(record.id);
    expect(bound.fingerprint).toBe(record.fingerprint);
  });

  it("throws on a missing identity", () => {
    expect(() => loadServingIdentity(store, "agt_missing")).toThrow(/not found/i);
  });

  it("refuses when the private key is absent (can't act AS the identity)", () => {
    const { record } = mintIdentity({ root: store });
    const keyFile = readdirSync(join(store, "identities")).find((f) => f.endsWith(".key"))!;
    unlinkSync(join(store, "identities", keyFile));
    expect(() => loadServingIdentity(store, record.id)).toThrow(/absent/i);
  });
});

describe("runStackMcpServer (HTTP)", () => {
  it("starts only with a usable identity; non-/mcp paths 404", async () => {
    const { record } = mintIdentity({ root: store });
    const server = await runStackMcpServer({ identityId: record.id, port: 0, store });
    try {
      expect(server.port).toBeGreaterThan(0);
      const res = await fetch(`http://localhost:${server.port}/health`);
      expect(res.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("refuses to start without a usable identity", async () => {
    await expect(runStackMcpServer({ identityId: "agt_missing", port: 0, store })).rejects.toThrow(/not found/i);
  });
});
