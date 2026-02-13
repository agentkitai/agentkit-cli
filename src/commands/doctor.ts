import { loadConfig } from "../config.js";
import { SERVICE_REGISTRY } from "../services.js";
import { execSync } from "node:child_process";

export interface CheckResult {
  name: string;
  pass: boolean;
  fix?: string;
}

export interface DoctorOptions {
  config: string;
  timeout?: number;
}

export async function doctorCommand(opts: DoctorOptions): Promise<CheckResult[]> {
  const timeout = opts.timeout ?? 3000;
  const checks: CheckResult[] = [];

  // 1. Config file
  let config;
  try {
    config = loadConfig(opts.config);
    checks.push({ name: "Config file", pass: true });
  } catch {
    checks.push({ name: "Config file", pass: false, fix: "Run `agentkit init`" });
    // Still check Docker, but skip service checks
    try {
      execSync("docker info", { stdio: "pipe", timeout: 10000 });
      checks.push({ name: "Docker daemon", pass: true });
    } catch {
      checks.push({
        name: "Docker daemon",
        pass: false,
        fix: "Start Docker Desktop or `systemctl start docker`",
      });
    }
    return checks;
  }

  // 2. Docker daemon
  try {
    execSync("docker info", { stdio: "pipe", timeout: 10000 });
    checks.push({ name: "Docker daemon", pass: true });
  } catch {
    checks.push({
      name: "Docker daemon",
      pass: false,
      fix: "Start Docker Desktop or `systemctl start docker`",
    });
  }

  // 3. Per-service checks
  for (const [key, def] of Object.entries(SERVICE_REGISTRY)) {
    const svcConfig = config.services[key as keyof typeof config.services];
    if (!svcConfig?.enabled) continue;

    const port = svcConfig.port ?? def.defaultPort;

    // Container running
    try {
      execSync(`docker compose ps --status running ${key}`, { stdio: "pipe", timeout: 10000 });
      checks.push({ name: `${key} container`, pass: true });
    } catch {
      checks.push({
        name: `${key} container`,
        pass: false,
        fix: "Run `docker compose up -d`",
      });
    }

    // Health endpoint
    if (def.healthEndpoint) {
      try {
        const res = await fetch(`http://localhost:${port}${def.healthEndpoint}`, {
          signal: AbortSignal.timeout(timeout),
        });
        if (res.ok) {
          checks.push({ name: `${key} health`, pass: true });
        } else {
          throw new Error("not ok");
        }
      } catch {
        checks.push({
          name: `${key} health`,
          pass: false,
          fix: `Check logs with \`docker compose logs ${key}\``,
        });
      }
    }
  }

  return checks;
}

export function formatDoctorOutput(checks: CheckResult[]): string {
  return checks
    .map((c) => {
      const icon = c.pass ? "✅" : "❌";
      const fix = c.fix ? ` → ${c.fix}` : "";
      return `${icon} ${c.name}${fix}`;
    })
    .join("\n");
}
