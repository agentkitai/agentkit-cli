import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateProject } from "../src/generators/project.js";
import type { AgentKitConfig } from "../src/config.js";

let dir: string;
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "agentkit-tpl-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const baseConfig = (over: Partial<AgentKitConfig> = {}): AgentKitConfig => ({
  projectName: "demo",
  language: "typescript",
  services: { agentlens: { enabled: true, port: 3000 } },
  ...over,
});

describe("governed-agent template (#8)", () => {
  it("scaffolds the compliance-first pattern + GOVERNANCE.md when opted in", () => {
    generateProject(dir, baseConfig({ template: "governed-agent" }));
    const index = readFileSync(join(dir, "src/index.ts"), "utf-8");
    expect(index).toContain("governed");
    expect(index).toContain("requestApproval"); // approval gate
    expect(index).toContain("audit"); // audit trail
    expect(index).toContain("SENSITIVE"); // policy
    expect(existsSync(join(dir, "GOVERNANCE.md"))).toBe(true);
    expect(readFileSync(join(dir, "GOVERNANCE.md"), "utf-8")).toContain("agentkit audit verify");
  });

  it("does NOT use the governed scaffold by default (it is opt-in)", () => {
    generateProject(dir, baseConfig()); // no template → default
    const index = readFileSync(join(dir, "src/index.ts"), "utf-8");
    expect(index).not.toContain("requestApproval");
    expect(index).toContain("Welcome to demo"); // the basic starter
    expect(existsSync(join(dir, "GOVERNANCE.md"))).toBe(false);
  });

  it("treats an explicit default template like no template", () => {
    generateProject(dir, baseConfig({ template: "default" }));
    expect(existsSync(join(dir, "GOVERNANCE.md"))).toBe(false);
  });

  it("supports the governed scaffold for Python too", () => {
    generateProject(dir, baseConfig({ language: "python", template: "governed-agent" }));
    const main = readFileSync(join(dir, "src/main.py"), "utf-8");
    expect(main).toContain("def governed");
    expect(main).toContain("request_approval");
    expect(existsSync(join(dir, "GOVERNANCE.md"))).toBe(true);
  });
});
