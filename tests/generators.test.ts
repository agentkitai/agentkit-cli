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
    lore: { enabled: true, port: 8765 },
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
    // Enabling lore also pulls in its Postgres (lore-db), matching agentkit-stack.
    expect(Object.keys(dc.services)).toEqual(["agentlens", "lore", "lore-db"]);
    expect(dc.networks).toHaveProperty("agentkit");
  });

  it("docker-compose has correct port mapping", () => {
    const dc = buildDockerCompose(tsConfig);
    expect(dc.services.agentlens.ports).toEqual(["3000:3000"]);
  });

  it("lore is wired to boot: 8765, Postgres, and a seeded API key", () => {
    const dc = buildDockerCompose(tsConfig);
    expect(dc.services.lore.ports).toEqual(["8765:8765"]);
    expect(dc.services.lore.environment.DATABASE_URL).toContain("lore-db:5432");
    expect(dc.services.lore.environment.LORE_API_KEY).toContain("LORE_API_KEY");
    expect(dc.services.lore.depends_on).toHaveProperty("lore-db");
    expect(dc.services["lore-db"].image).toContain("pgvector");
  });

  it("generates valid YAML docker-compose", () => {
    mkdirSync(TMP, { recursive: true });
    generateDockerCompose(TMP, tsConfig);
    const raw = readFileSync(resolve(TMP, "docker-compose.yml"), "utf-8");
    const parsed = parse(raw);
    expect(parsed.version).toBe("3.8");
    expect(parsed.services.agentlens.image).toBe("ghcr.io/agentkitai/agentlens:latest");
  });

  it("generates TypeScript project scaffold", () => {
    mkdirSync(TMP, { recursive: true });
    generateProject(TMP, tsConfig);
    expect(existsSync(resolve(TMP, "package.json"))).toBe(true);
    expect(existsSync(resolve(TMP, "tsconfig.json"))).toBe(true);
    expect(existsSync(resolve(TMP, "src/index.ts"))).toBe(true);
    const pkg = JSON.parse(readFileSync(resolve(TMP, "package.json"), "utf-8"));
    expect(pkg.dependencies).toHaveProperty("@agentkitai/agentlens-sdk");
    // lore has no TS SDK — it's run as a service, not imported (no npm dep)
    expect(pkg.dependencies).not.toHaveProperty("@agentkit/lore");
    expect(pkg.dependencies).not.toHaveProperty("@agentkit/agentlens");
  });

  it("generates Python project scaffold", () => {
    mkdirSync(TMP, { recursive: true });
    generateProject(TMP, pyConfig);
    expect(existsSync(resolve(TMP, "pyproject.toml"))).toBe(true);
    expect(existsSync(resolve(TMP, "src/main.py"))).toBe(true);
    const toml = readFileSync(resolve(TMP, "pyproject.toml"), "utf-8");
    // Services are run via compose, not imported — no fake `agentkit-*` PyPI deps
    // (they never existed and broke `pip install -e .`).
    expect(toml).not.toContain("agentkit-agentgate");
    expect(toml).not.toContain("agentkit-lore");
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
