/**
 * `agentkit up` orchestration helpers (#7) — turn the thin compose wrapper into
 * a one-command governed stack: fresh secrets on first run, governance profile
 * by default, and an optional --wait that blocks until the stack is healthy.
 *
 * The pure/injectable pieces (genSecret, ensureSecrets, waitForHealth) live here
 * so they're unit-testable; cli.ts wires them around the compose call.
 */

import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { statusCommand, type ServiceStatus } from "./status.js";
import { SERVICE_REGISTRY } from "../services.js";

/** Secrets the governed stack needs (matches the agentkit-stack compose). */
export const SECRET_VARS = ["LORE_API_KEY", "ADMIN_API_KEY", "JWT_SECRET"] as const;

/** AgentLens is known-degraded under the stale 0.12.2-era compose env — report it but don't gate --wait on it. */
const NON_BLOCKING = new Set(["agentlens"]);

export function genSecret(name: string): string {
  const hex = randomBytes(24).toString("hex");
  return name === "LORE_API_KEY" ? `lore_sk_${hex}` : hex;
}

/**
 * Write a .env with fresh random secrets next to the compose, IF one doesn't
 * already exist. Never overwrites (so re-running `up` is safe). 0600 on POSIX.
 */
export function ensureSecrets(projectDir: string): { created: boolean; path: string } {
  const path = join(projectDir, ".env");
  if (existsSync(path)) return { created: false, path };
  const body = SECRET_VARS.map((v) => `${v}=${genSecret(v)}`).join("\n") + "\n";
  writeFileSync(path, body, { encoding: "utf-8", mode: 0o600 });
  return { created: true, path };
}

export interface WaitResult {
  ready: boolean;
  statuses: ServiceStatus[];
  waitedMs: number;
}

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  pollTimeout?: number;
  /** Injectable for tests; defaults to the real health probe. */
  checkStatus?: (configPath: string, timeout: number) => Promise<ServiceStatus[]>;
  /** Injectable clock/sleep for tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Poll service health until every REQUIRED service (enabled, has a health
 * endpoint, not in NON_BLOCKING) is "running", or the timeout elapses.
 * Returns ready=false on timeout (caller exits non-zero).
 */
export async function waitForHealth(configPath: string, opts: WaitOptions = {}): Promise<WaitResult> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const intervalMs = opts.intervalMs ?? 2000;
  const pollTimeout = opts.pollTimeout ?? 3000;
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const check = opts.checkStatus ?? ((cfg, t) => statusCommand({ config: cfg, timeout: t }));

  const start = now();
  let statuses: ServiceStatus[] = [];
  for (;;) {
    statuses = await check(configPath, pollTimeout);
    const required = statuses.filter(
      (s) => s.status !== "disabled" && !NON_BLOCKING.has(s.service) && SERVICE_REGISTRY[s.service]?.healthEndpoint,
    );
    const ready = required.length > 0 && required.every((s) => s.status === "running");
    const waited = now() - start;
    if (ready || waited >= timeoutMs) return { ready, statuses, waitedMs: waited };
    await sleep(intervalMs);
  }
}
