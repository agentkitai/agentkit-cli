import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { findConfig } from "../src/config.js";
import { createCli } from "../src/cli.js";

const TMP = resolve(__dirname, "../.test-tmp-polish");

describe("findConfig()", () => {
  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it("finds config in current directory", () => {
    const configPath = join(TMP, "agentkit.config.yaml");
    writeFileSync(configPath, "projectName: test\nlanguage: typescript\nservices: {}\n");
    const found = findConfig(TMP);
    expect(found).toBe(configPath);
  });

  it("finds config in parent directory", () => {
    const configPath = join(TMP, "agentkit.config.yaml");
    writeFileSync(configPath, "projectName: test\nlanguage: typescript\nservices: {}\n");
    const child = join(TMP, "sub", "deep");
    mkdirSync(child, { recursive: true });
    const found = findConfig(child);
    expect(found).toBe(configPath);
  });

  it("returns null when no config found", () => {
    const found = findConfig(TMP);
    expect(found).toBeNull();
  });
});

describe("CLI --help", () => {
  it("includes all commands in help output", () => {
    const cli = createCli();
    const helpText = cli.helpInformation();
    expect(helpText).toContain("init");
    expect(helpText).toContain("status");
    expect(helpText).toContain("doctor");
    expect(helpText).toContain("agentkit");
  });
});
