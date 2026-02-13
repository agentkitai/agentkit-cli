import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock config loading
vi.mock("../src/config.js", () => ({
  loadConfig: vi.fn(),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { loadConfig } from "../src/config.js";
import { statusCommand } from "../src/commands/status.js";

const mockedLoadConfig = vi.mocked(loadConfig);

const baseConfig = {
  projectName: "test",
  language: "typescript" as const,
  services: {
    agentlens: { enabled: true, port: 3000 },
    lore: { enabled: false },
  },
};

describe("Status Command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows running status for healthy service", async () => {
    mockedLoadConfig.mockReturnValue(baseConfig);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: "1.2.0" }),
    });
    const results = await statusCommand({ config: "agentkit.config.yaml" });
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      service: "agentlens",
      status: "running",
      port: 3000,
      version: "1.2.0",
    });
  });

  it("shows disabled status for disabled services", async () => {
    mockedLoadConfig.mockReturnValue(baseConfig);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: "1.0.0" }),
    });
    const results = await statusCommand({ config: "agentkit.config.yaml" });
    const lore = results.find((r) => r.service === "lore");
    expect(lore?.status).toBe("disabled");
  });

  it("shows down status when fetch fails", async () => {
    mockedLoadConfig.mockReturnValue({
      ...baseConfig,
      services: { agentlens: { enabled: true, port: 3000 } },
    });
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));
    const results = await statusCommand({ config: "agentkit.config.yaml" });
    expect(results[0]).toMatchObject({
      service: "agentlens",
      status: "down",
    });
  });

  it("errors when config not found", async () => {
    mockedLoadConfig.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    await expect(statusCommand({ config: "missing.yaml" })).rejects.toThrow(
      "Run `agentkit init` first"
    );
  });
});
