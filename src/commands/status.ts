import { loadConfig } from "../config.js";
import { SERVICE_REGISTRY } from "../services.js";
import chalk from "chalk";

export interface ServiceStatus {
  service: string;
  status: "running" | "down" | "disabled";
  port: number | null;
  version: string | null;
}

export interface StatusOptions {
  config: string;
  timeout?: number;
}

export async function statusCommand(opts: StatusOptions): Promise<ServiceStatus[]> {
  const timeout = opts.timeout ?? 3000;
  let config;
  try {
    config = loadConfig(opts.config);
  } catch {
    throw new Error("Run `agentkit init` first");
  }

  const results: ServiceStatus[] = [];

  for (const [key, svcConfig] of Object.entries(config.services)) {
    const def = SERVICE_REGISTRY[key];
    if (!def) continue;
    const enabled = svcConfig?.enabled ?? false;
    const port = svcConfig?.port ?? def.defaultPort;

    if (!enabled) {
      results.push({ service: key, status: "disabled", port: null, version: null });
      continue;
    }

    if (!def.healthEndpoint) {
      results.push({ service: key, status: "down", port, version: null });
      continue;
    }

    try {
      const res = await fetch(`http://localhost:${port}${def.healthEndpoint}`, {
        signal: AbortSignal.timeout(timeout),
      });
      const body = await res.json();
      results.push({ service: key, status: "running", port, version: body.version ?? null });
    } catch {
      results.push({ service: key, status: "down", port, version: null });
    }
  }

  return results;
}

export function formatStatusTable(results: ServiceStatus[]): string {
  const icons: Record<string, string> = { running: "✅", down: "❌", disabled: "⚪" };
  const colorFn: Record<string, (s: string) => string> = {
    running: chalk.green,
    down: chalk.red,
    disabled: chalk.gray,
  };
  const header = "Service        | Status     | Port  | Version";
  const sep = "---------------|------------|-------|--------";
  const rows = results.map((r) => {
    const name = r.service.padEnd(14);
    const rawStatus = `${icons[r.status]} ${r.status}`.padEnd(10);
    const status = (colorFn[r.status] ?? ((s: string) => s))(rawStatus);
    const port = (r.port?.toString() ?? "-").padEnd(5);
    const version = r.version ?? "-";
    return `${name} | ${status} | ${port} | ${version}`;
  });
  return [header, sep, ...rows].join("\n");
}
