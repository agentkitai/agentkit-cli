import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolve } from "node:path";

// Mock config
vi.mock("../src/config.js", () => ({
  loadConfig: vi.fn(),
}));

// Mock child_process
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { loadConfig } from "../src/config.js";
import { execSync } from "node:child_process";
import { doctorCommand } from "../src/commands/doctor.js";

const mockedLoadConfig = vi.mocked(loadConfig);
const mockedExecSync = vi.mocked(execSync);

const baseConfig = {
  projectName: "test",
  language: "typescript" as const,
  services: {
    agentlens: { enabled: true, port: 3000 },
  },
};

describe("Doctor Command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("all checks pass when everything is healthy", async () => {
    mockedLoadConfig.mockReturnValue(baseConfig);
    mockedExecSync.mockReturnValue(Buffer.from("OK"));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: "1.0.0" }),
    });
    const checks = await doctorCommand({ config: "agentkit.config.yaml" });
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  it("reports config missing but still checks docker", async () => {
    mockedLoadConfig.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    mockedExecSync.mockReturnValue(Buffer.from("OK"));
    const checks = await doctorCommand({ config: "missing.yaml" });
    const configCheck = checks.find((c) => c.name === "Config file");
    expect(configCheck?.pass).toBe(false);
    expect(configCheck?.fix).toContain("agentkit init");
    expect(checks).toHaveLength(2); // config + docker
  });

  it("reports docker not running", async () => {
    mockedLoadConfig.mockReturnValue(baseConfig);
    mockedExecSync.mockImplementation((cmd) => {
      if (String(cmd).includes("docker info")) throw new Error("Cannot connect");
      return Buffer.from("OK");
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: "1.0.0" }),
    });
    const checks = await doctorCommand({ config: "agentkit.config.yaml" });
    const dockerCheck = checks.find((c) => c.name === "Docker daemon");
    expect(dockerCheck?.pass).toBe(false);
    expect(dockerCheck?.fix).toContain("docker");
  });

  it("reports container down when `docker compose ps` returns no running services", async () => {
    mockedLoadConfig.mockReturnValue(baseConfig);
    mockedExecSync.mockImplementation((cmd) => {
      // `docker compose ps` exits 0 even when nothing is running, emitting empty output.
      if (String(cmd).includes("docker compose ps")) return Buffer.from("");
      return Buffer.from("OK");
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: "1.0.0" }),
    });
    const checks = await doctorCommand({ config: "agentkit.config.yaml" });
    const containerCheck = checks.find((c) => c.name === "agentlens container");
    expect(containerCheck?.pass).toBe(false);
    expect(containerCheck?.fix).toContain("docker compose up");
  });

  it("runs `docker compose ps` against the config's project directory", async () => {
    mockedLoadConfig.mockReturnValue(baseConfig);
    mockedExecSync.mockReturnValue(Buffer.from('{"Service":"agentlens","State":"running"}'));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: "1.0.0" }),
    });
    await doctorCommand({ config: "/some/project/agentkit.config.yaml" });
    const psCall = mockedExecSync.mock.calls.find((c) => String(c[0]).includes("docker compose ps"));
    expect(psCall).toBeDefined();
    expect(String(psCall![0])).toContain("--format json");
    expect((psCall![1] as { cwd?: string }).cwd).toBe(resolve("/some/project"));
  });

  it("reports service health check failure", async () => {
    mockedLoadConfig.mockReturnValue(baseConfig);
    mockedExecSync.mockReturnValue(Buffer.from("OK"));
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));
    const checks = await doctorCommand({ config: "agentkit.config.yaml" });
    const healthCheck = checks.find((c) => c.name.includes("agentlens") && c.name.includes("health"));
    expect(healthCheck?.pass).toBe(false);
    expect(healthCheck?.fix).toContain("docker compose logs");
  });
});
