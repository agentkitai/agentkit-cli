// Thin `docker compose` wrappers (#11) — deliberately NOT an orchestrator
// (Dagger anti-goal): build the args, shell out, pass the exit code through.

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";

export interface ComposeOpts {
  /** `up` only: detach (default true). */
  detached?: boolean;
  /** Compose profile (#stack6: minimal | governance | full). */
  profile?: string;
  /** `down` only: also remove volumes. */
  volumes?: boolean;
  /** `logs` only: follow. */
  follow?: boolean;
  /** `logs` only: a single service. */
  service?: string;
}

/** Build the `docker compose …` argument list. Pure, so it's unit-testable. */
export function composeArgs(verb: "up" | "down" | "logs", opts: ComposeOpts = {}): string[] {
  const args: string[] = [];
  if (opts.profile) args.push("--profile", opts.profile); // global flag — before the verb
  args.push(verb);
  if (verb === "up" && opts.detached !== false) args.push("-d");
  if (verb === "down" && opts.volumes) args.push("-v");
  if (verb === "logs" && opts.follow) args.push("-f");
  if (verb === "logs" && opts.service) args.push(opts.service);
  return args;
}

/** The directory holding docker-compose.yml (next to the agentkit config). */
export function projectDirFromConfig(configPath: string): string {
  return dirname(resolve(configPath));
}

/** Run `docker compose <args>` in the stack dir, streaming output; returns the exit code. */
export function runCompose(projectDir: string, args: string[]): number {
  const res = spawnSync("docker", ["compose", ...args], { stdio: "inherit", cwd: projectDir });
  return res.status ?? 1;
}
