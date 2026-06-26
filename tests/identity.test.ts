import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveStore,
  mintIdentity,
  inspectIdentity,
  rotateIdentity,
  readIdentity,
  formatIdentity,
  type IdentityStore,
} from "../src/commands/identity.js";

let store: IdentityStore;
let root: string;
const NOW = "2026-06-26T12:00:00.000Z";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "agentkit-id-"));
  store = { root };
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("agentkit identity (#9)", () => {
  it("mints an ed25519 identity: public record + 0600 key file, no secret leak", () => {
    const { record, keyFile } = mintIdentity(store, { name: "ci-agent", now: NOW });
    expect(record.id).toMatch(/^agt_[0-9a-f]{16}$/);
    expect(record.algorithm).toBe("ed25519");
    expect(record.fingerprint).toMatch(/^SHA256:/);
    expect(record.status).toBe("active");
    expect(record.name).toBe("ci-agent");

    // private key is on disk only, never in the public record/formatter.
    expect(existsSync(keyFile)).toBe(true);
    expect(readFileSync(keyFile, "utf-8")).toContain("PRIVATE KEY");
    expect(JSON.stringify(record)).not.toContain("PRIVATE KEY");
    expect(formatIdentity(record)).not.toContain("PRIVATE KEY");

    // 0600 on POSIX (Windows ACLs don't honor mode — skip there).
    if (process.platform !== "win32") {
      expect(statSync(keyFile).mode & 0o777).toBe(0o600);
    }
  });

  it("derives a stable id from the public key (two mints differ)", () => {
    const a = mintIdentity(store, {});
    const b = mintIdentity(store, {});
    expect(a.record.id).not.toBe(b.record.id);
    // persisted record round-trips
    expect(readIdentity(store, a.record.id).publicKey).toBe(a.record.publicKey);
  });

  it("inspect returns public material and verifies the local key matches", () => {
    const { record } = mintIdentity(store, { now: NOW });
    const got = inspectIdentity(store, record.id);
    expect(got.publicKey).toBe(record.publicKey);
    expect(got.keyPresent).toBe(true);
    expect(got.keyMatches).toBe(true);
  });

  it("inspect throws on a missing identity", () => {
    expect(() => inspectIdentity(store, "agt_doesnotexist0")).toThrow(/not found/i);
  });

  it("rotate keeps the id, swaps the key, archives the old one, records history", () => {
    const minted = mintIdentity(store, { now: NOW });
    const oldPub = minted.record.publicKey;

    const rotated = rotateIdentity(store, minted.record.id, { now: "2026-06-27T00:00:00.000Z" });
    expect(rotated.record.id).toBe(minted.record.id); // stable id
    expect(rotated.record.publicKey).not.toBe(oldPub); // new key material
    expect(rotated.record.previousKeys?.[0]?.publicKey).toBe(oldPub); // history kept

    // the new local key matches the new record; old key archived as .revoked
    expect(inspectIdentity(store, minted.record.id).keyMatches).toBe(true);
    const files = readdirSync(join(root, "identities"));
    expect(files.some((f) => f.endsWith(".revoked"))).toBe(true);
  });

  it("audit-logs every operation (mint, inspect, rotate)", () => {
    const { record } = mintIdentity(store, { now: NOW });
    inspectIdentity(store, record.id);
    rotateIdentity(store, record.id);
    const log = readFileSync(join(root, "audit.log"), "utf-8").trim().split("\n").map((l) => JSON.parse(l));
    expect(log.map((e) => e.op)).toEqual(["mint", "inspect", "rotate"]);
    expect(log.every((e) => e.id === record.id && e.ts)).toBe(true);
  });

  it("resolveStore honors --store, then AGENTKIT_HOME, then ~/.agentkit", () => {
    expect(resolveStore("/explicit").root).toBe("/explicit");
    const prev = process.env["AGENTKIT_HOME"];
    process.env["AGENTKIT_HOME"] = "/from-env";
    try {
      expect(resolveStore(undefined).root).toBe("/from-env");
    } finally {
      if (prev === undefined) delete process.env["AGENTKIT_HOME"];
      else process.env["AGENTKIT_HOME"] = prev;
    }
  });
});
