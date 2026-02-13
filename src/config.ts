import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parse, stringify } from "yaml";
import { join, dirname, resolve } from "node:path";

const ServiceConfigSchema = z.object({
  enabled: z.boolean(),
  port: z.number().optional(),
  version: z.string().optional(),
});

export type ServiceConfig = z.infer<typeof ServiceConfigSchema>;

export const AgentKitConfigSchema = z.object({
  projectName: z.string().min(1),
  language: z.enum(["typescript", "python"]),
  services: z.object({
    agentlens: ServiceConfigSchema.optional(),
    lore: ServiceConfigSchema.optional(),
    agentgate: ServiceConfigSchema.optional(),
    formbridge: ServiceConfigSchema.optional(),
    agenteval: ServiceConfigSchema.optional(),
  }),
});

export type AgentKitConfig = z.infer<typeof AgentKitConfigSchema>;

export function findConfig(startDir?: string): string | null {
  let dir = resolve(startDir ?? process.cwd());
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, "agentkit.config.yaml");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function loadConfig(path: string): AgentKitConfig {
  const raw = readFileSync(path, "utf-8");
  const parsed = parse(raw);
  return AgentKitConfigSchema.parse(parsed);
}

export function writeConfig(path: string, config: AgentKitConfig): void {
  const validated = AgentKitConfigSchema.parse(config);
  writeFileSync(path, stringify(validated), "utf-8");
}
