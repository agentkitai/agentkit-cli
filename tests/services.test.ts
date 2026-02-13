import { describe, it, expect } from "vitest";
import { SERVICE_REGISTRY } from "../src/services.js";

describe("Service Registry", () => {
  it("has all 5 services", () => {
    expect(Object.keys(SERVICE_REGISTRY)).toHaveLength(5);
    expect(SERVICE_REGISTRY).toHaveProperty("agentlens");
    expect(SERVICE_REGISTRY).toHaveProperty("lore");
    expect(SERVICE_REGISTRY).toHaveProperty("agentgate");
    expect(SERVICE_REGISTRY).toHaveProperty("formbridge");
    expect(SERVICE_REGISTRY).toHaveProperty("agenteval");
  });

  it("agenteval has no port or health endpoint", () => {
    expect(SERVICE_REGISTRY.agenteval.defaultPort).toBeNull();
    expect(SERVICE_REGISTRY.agenteval.healthEndpoint).toBeNull();
  });

  it("services have correct default ports", () => {
    expect(SERVICE_REGISTRY.agentlens.defaultPort).toBe(3000);
    expect(SERVICE_REGISTRY.lore.defaultPort).toBe(3001);
    expect(SERVICE_REGISTRY.agentgate.defaultPort).toBe(3002);
    expect(SERVICE_REGISTRY.formbridge.defaultPort).toBe(3003);
  });
});
