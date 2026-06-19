import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import type { AgentKitConfig } from "../src/config.js";
import { buildDockerCompose, generateDockerCompose } from "../src/generators/docker.js";
import { generateProject } from "../src/generators/project.js";

const TMP = resolve(__dirname, "../.test-tmp-gen");

const tsConfig: AgentKitConfig = {
  projectName: "test-ts",
  language: "typescript",
  services: {
    agentlens: { enabled: true, port: 3000 },
    lore: { enabled: true, port: 3001 },
  },
};

const pyConfig: AgentKitConfig = {
  projectName: "test-py",
  language: "python",
  services: {
    agentgate: { enabled: true, port: 3002 },
  },
};

describe("Generators", () => {
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it("buildDockerCompose only includes enabled services", () => {
    const dc = buildDockerCompose(tsConfig);
    expect(Object.keys(dc.services)).toEqual(["agentlens", "lore"]);
    expect(dc.networks).toHaveProperty("agentkit");
  });

  it("docker-compose has correct port mapping", () => {
    const dc = buildDockerCompose(tsConfig);
    expect(dc.services.agentlens.ports).toEqual(["3000:3000"]);
  });

  it("generates valid YAML docker-compose", () => {
    mkdirSync(TMP, { recursive: true });
    generateDockerCompose(TMP, tsConfig);
    const raw = readFileSync(resolve(TMP, "docker-compose.yml"), "utf-8");
    const parsed = parse(raw);
    expect(parsed.version).toBe("3.8");
    expect(parsed.services.agentlens.image).toBe("agentkit/agentlens:latest");
  });

  it("generates TypeScript project scaffold", () => {
    mkdirSync(TMP, { recursive: true });
    generateProject(TMP, tsConfig);
    expect(existsSync(resolve(TMP, "package.json"))).toBe(true);
    expect(existsSync(resolve(TMP, "tsconfig.json"))).toBe(true);
    expect(existsSync(resolve(TMP, "src/index.ts"))).toBe(true);
    const pkg = JSON.parse(readFileSync(resolve(TMP, "package.json"), "utf-8"));
    expect(pkg.dependencies).toHaveProperty("@agentkit/agentlens");
    expect(pkg.dependencies).toHaveProperty("@agentkit/lore");
  });

  it("generates Python project scaffold", () => {
    mkdirSync(TMP, { recursive: true });
    generateProject(TMP, pyConfig);
    expect(existsSync(resolve(TMP, "pyproject.toml"))).toBe(true);
    expect(existsSync(resolve(TMP, "src/main.py"))).toBe(true);
    const toml = readFileSync(resolve(TMP, "pyproject.toml"), "utf-8");
    expect(toml).toContain("agentkit-agentgate");
  });

  it("generates a pyproject.toml with a valid setuptools build-backend", () => {
    mkdirSync(TMP, { recursive: true });
    generateProject(TMP, pyConfig);
    const toml = readFileSync(resolve(TMP, "pyproject.toml"), "utf-8");

    // The build-backend must be the canonical, installable setuptools entry point.
    // The previous value ("setuptools.backends._legacy:_Backend") does not exist
    // and breaks `pip install -e .`.
    expect(toml).toContain('build-backend = "setuptools.build_meta"');
    expect(toml).not.toContain("setuptools.backends._legacy");

    // ponytail: no TOML parser dependency available, so do a minimal structural
    // parse of the [build-system] table instead of pulling one in.
    const buildSystem = toml.split("[build-system]")[1] ?? "";
    const backendMatch = buildSystem.match(/build-backend\s*=\s*"([^"]+)"/);
    expect(backendMatch).not.toBeNull();
    const backend = backendMatch![1];
    // Valid backend is "module" or "module:object".
    expect(backend).toMatch(/^[\w.]+(:[\w.]+)?$/);
    expect(buildSystem).toMatch(/requires\s*=\s*\[/);
  });
});
