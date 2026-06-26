import { describe, it, expect } from "vitest";
import { basename } from "node:path";
import { composeArgs, projectDirFromConfig } from "../src/commands/compose.js";

describe("composeArgs (#11)", () => {
  it("up: detached by default; --profile is a global flag before the verb", () => {
    expect(composeArgs("up")).toEqual(["up", "-d"]);
    expect(composeArgs("up", { profile: "minimal" })).toEqual(["--profile", "minimal", "up", "-d"]);
    expect(composeArgs("up", { detached: false })).toEqual(["up"]); // foreground
  });

  it("down: -v only when volumes requested", () => {
    expect(composeArgs("down")).toEqual(["down"]);
    expect(composeArgs("down", { volumes: true })).toEqual(["down", "-v"]);
  });

  it("logs: -f follow and an optional service", () => {
    expect(composeArgs("logs")).toEqual(["logs"]);
    expect(composeArgs("logs", { follow: true })).toEqual(["logs", "-f"]);
    expect(composeArgs("logs", { follow: true, service: "lore" })).toEqual(["logs", "-f", "lore"]);
  });
});

describe("projectDirFromConfig", () => {
  it("resolves to the directory holding the config (and docker-compose.yml)", () => {
    expect(basename(projectDirFromConfig("/a/b/agentkit.config.yaml"))).toBe("b");
  });
});
