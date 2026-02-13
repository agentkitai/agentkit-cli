import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

// Mock @inquirer/prompts before importing init
vi.mock("@inquirer/prompts", () => ({
  input: vi.fn().mockResolvedValue("test-project"),
  select: vi.fn().mockResolvedValue("typescript"),
  checkbox: vi.fn().mockResolvedValue(["agentlens", "lore"]),
}));

import { initCommand } from "../src/commands/init.js";

const TMP = resolve(__dirname, "../.test-tmp-init");

describe("Init Command", () => {
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it("--yes creates config with all services enabled", async () => {
    mkdirSync(TMP, { recursive: true });
    const config = await initCommand({ yes: true, dir: TMP });
    expect(config.language).toBe("typescript");
    expect(Object.keys(config.services)).toHaveLength(5);
    expect(existsSync(resolve(TMP, "agentkit.config.yaml"))).toBe(true);
  });

  it("--yes generates docker-compose.yml", async () => {
    mkdirSync(TMP, { recursive: true });
    await initCommand({ yes: true, dir: TMP });
    const dcPath = resolve(TMP, "docker-compose.yml");
    expect(existsSync(dcPath)).toBe(true);
    const dc = parse(readFileSync(dcPath, "utf-8"));
    expect(dc.services).toHaveProperty("agentlens");
  });

  it("interactive mode uses prompted values", async () => {
    mkdirSync(TMP, { recursive: true });
    const config = await initCommand({ dir: TMP });
    expect(config.projectName).toBe("test-project");
    expect(config.language).toBe("typescript");
    expect(config.services.agentlens?.enabled).toBe(true);
    expect(config.services.lore?.enabled).toBe(true);
    expect(config.services.agentgate).toBeUndefined();
  });

  it("--dir creates files in specified directory", async () => {
    const subDir = resolve(TMP, "subdir");
    mkdirSync(subDir, { recursive: true });
    await initCommand({ yes: true, dir: subDir });
    expect(existsSync(resolve(subDir, "agentkit.config.yaml"))).toBe(true);
    expect(existsSync(resolve(subDir, "docker-compose.yml"))).toBe(true);
  });
});
