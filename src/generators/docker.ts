import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stringify } from "yaml";
import type { AgentKitConfig } from "../config.js";
import { SERVICE_REGISTRY } from "../services.js";

export function buildDockerCompose(config: AgentKitConfig): Record<string, any> {
  const services: Record<string, any> = {};

  for (const [key, svcConfig] of Object.entries(config.services)) {
    if (!svcConfig?.enabled) continue;
    const def = SERVICE_REGISTRY[key];
    if (!def) continue;

    const service: Record<string, any> = {
      image: def.dockerImage,
      restart: "unless-stopped",
      networks: ["agentkit"],
    };

    if (def.defaultPort && svcConfig.port) {
      service.ports = [`${svcConfig.port}:${def.defaultPort}`];
    }

    service.environment = {
      NODE_ENV: "development",
      SERVICE_NAME: key,
    };

    service.volumes = [`./${key}-data:/app/data`];

    services[key] = service;
  }

  return {
    version: "3.8",
    services,
    networks: {
      agentkit: {
        driver: "bridge",
      },
    },
  };
}

export function generateDockerCompose(targetDir: string, config: AgentKitConfig): void {
  const compose = buildDockerCompose(config);
  const outPath = resolve(targetDir, "docker-compose.yml");
  writeFileSync(outPath, stringify(compose), "utf-8");
}
