import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TOOLS, TOOLS_BY_NAME, scaffoldProject } from "../src/mcp/tools.js";

afterEach(() => vi.restoreAllMocks());

describe("MCP tool registry (#10)", () => {
  it("exposes the core CLI verbs as tools", () => {
    const names = TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(
      ["audit_verify", "doctor", "identity_inspect", "identity_mint", "identity_rotate", "init", "status"],
    );
    // every tool has a JSON-schema input + a handler
    for (const t of TOOLS) {
      expect(t.inputSchema.type).toBe("object");
      expect(typeof t.handler).toBe("function");
    }
  });

  describe("identity tools (reuse the identity spine, no secret leak)", () => {
    let store: string;
    beforeEach(() => (store = mkdtempSync(join(tmpdir(), "agentkit-mcp-"))));
    afterEach(() => rmSync(store, { recursive: true, force: true }));

    it("identity_mint returns the public record only", async () => {
      const rec = (await TOOLS_BY_NAME.get("identity_mint")!.handler({ name: "bot", store })) as Record<string, unknown>;
      expect(rec["id"]).toMatch(/^agt_/);
      expect(rec["fingerprint"]).toMatch(/^SHA256:/);
      expect(JSON.stringify(rec)).not.toContain("PRIVATE KEY");
    });

    it("identity_inspect / identity_rotate round-trip the same id", async () => {
      const minted = (await TOOLS_BY_NAME.get("identity_mint")!.handler({ store })) as { id: string };
      const inspected = (await TOOLS_BY_NAME.get("identity_inspect")!.handler({ id: minted.id, store })) as Record<string, unknown>;
      expect(inspected["id"]).toBe(minted.id);
      const rotated = (await TOOLS_BY_NAME.get("identity_rotate")!.handler({ id: minted.id, store })) as Record<string, unknown>;
      expect(rotated["id"]).toBe(minted.id);
    });

    it("identity_inspect requires an id", async () => {
      await expect(TOOLS_BY_NAME.get("identity_inspect")!.handler({ store })).rejects.toThrow(/required/i);
    });
  });

  it("init scaffolds a project non-interactively", () => {
    const dir = mkdtempSync(join(tmpdir(), "agentkit-mcp-init-"));
    try {
      const { config } = scaffoldProject({ projectName: "demo", services: ["agentlens", "lore"], dir });
      expect(config.projectName).toBe("demo");
      expect(Object.keys(config.services)).toEqual(["agentlens", "lore"]);
      expect(existsSync(join(dir, "agentkit.config.yaml"))).toBe(true);
      expect(existsSync(join(dir, "docker-compose.yml"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("audit_verify tool returns a structured PASS/FAIL result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      { ok: true, status: 200, json: async () => ({ verified: true, sessionsVerified: 0, brokenChains: [] }) } as Response,
    );
    const r = (await TOOLS_BY_NAME.get("audit_verify")!.handler({ url: "http://lens:3000" })) as Record<string, unknown>;
    expect(r["ok"]).toBe(true);
    expect(r["verified"]).toBe(true);
  });

  it("status tool errors clearly on a non-existent config", async () => {
    await expect(
      TOOLS_BY_NAME.get("status")!.handler({ config: "/nope/agentkit.config.yaml" }),
    ).rejects.toThrow(/init/i);
  });
});
