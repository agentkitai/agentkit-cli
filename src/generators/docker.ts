import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stringify } from "yaml";
import type { AgentKitConfig } from "../config.js";
import { SERVICE_REGISTRY } from "../services.js";

/**
 * Lore's compose block. Unlike the Node services, Lore needs Postgres+pgvector
 * and a DATABASE_URL/LORE_API_KEY — a bare container can't boot. This mirrors
 * the lore + lore-db services in agentkit-stack/docker-compose.yml (the canonical
 * stack), so a generated project boots the same way the stack does.
 *
 * ponytail: mirrored, not imported — a published CLI can't read the stack repo at
 * runtime. Keep in sync with agentkit-stack; if drift bites, ship the stack
 * compose as a package dependency and read it instead.
 */
function loreServices(hostPort: number): Record<string, any> {
  return {
    lore: {
      image: SERVICE_REGISTRY.lore.dockerImage,
      restart: "unless-stopped",
      networks: ["agentkit"],
      ports: [`${hostPort}:8765`],
      environment: {
        DATABASE_URL: "postgresql://lore:lore@lore-db:5432/lore",
        // Interpolated from the .env `agentkit up` writes (lore_sk_ prefix required by Lore auth).
        LORE_API_KEY: "${LORE_API_KEY:?set LORE_API_KEY in .env (agentkit up seeds one)}",
      },
      volumes: ["./lore-data:/app/data"],
      depends_on: { "lore-db": { condition: "service_healthy" } },
      healthcheck: {
        test: [
          "CMD-SHELL",
          "python -c \"import urllib.request; urllib.request.urlopen('http://localhost:8765/health')\"",
        ],
        interval: "5s",
        timeout: "3s",
        retries: 10,
        start_period: "10s",
      },
    },
    "lore-db": {
      image: "pgvector/pgvector:pg16",
      restart: "unless-stopped",
      networks: ["agentkit"],
      environment: {
        POSTGRES_USER: "lore",
        POSTGRES_PASSWORD: "lore",
        POSTGRES_DB: "lore",
      },
      volumes: ["./lore-db-data:/var/lib/postgresql/data"],
      healthcheck: {
        test: ["CMD-SHELL", "pg_isready -U lore"],
        interval: "5s",
        timeout: "3s",
        retries: 5,
      },
    },
  };
}

export function buildDockerCompose(config: AgentKitConfig): Record<string, any> {
  const services: Record<string, any> = {};

  for (const [key, svcConfig] of Object.entries(config.services)) {
    if (!svcConfig?.enabled) continue;
    const def = SERVICE_REGISTRY[key];
    if (!def) continue;

    // Lore isn't a bare container — emit the stack's lore + lore-db block.
    if (key === "lore") {
      Object.assign(services, loreServices(svcConfig.port ?? def.defaultPort ?? 8765));
      continue;
    }

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
