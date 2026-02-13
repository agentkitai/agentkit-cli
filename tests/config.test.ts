import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig, writeConfig, AgentKitConfigSchema } from "../src/config.js";

const TMP = resolve(__dirname, "../.test-tmp-config");

describe("Config Schema & IO", () => {
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it("validates a correct config", () => {
    const config = {
      projectName: "test",
      language: "typescript" as const,
      services: { agentlens: { enabled: true, port: 3000 } },
    };
    expect(AgentKitConfigSchema.parse(config)).toEqual(config);
  });

  it("rejects invalid language", () => {
    expect(() =>
      AgentKitConfigSchema.parse({
        projectName: "test",
        language: "rust",
        services: {},
      })
    ).toThrow();
  });

  it("round-trips config through YAML", () => {
    mkdirSync(TMP, { recursive: true });
    const configPath = resolve(TMP, "agentkit.config.yaml");
    const config = {
      projectName: "myproject",
      language: "python" as const,
      services: {
        lore: { enabled: true, port: 3001 },
        agenteval: { enabled: false },
      },
    };
    writeConfig(configPath, config);
    const loaded = loadConfig(configPath);
    expect(loaded).toEqual(config);
  });

  it("rejects empty projectName", () => {
    expect(() =>
      AgentKitConfigSchema.parse({
        projectName: "",
        language: "typescript",
        services: {},
      })
    ).toThrow();
  });
});
