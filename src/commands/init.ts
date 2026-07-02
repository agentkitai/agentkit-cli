import { Command } from "commander";
import { basename, resolve } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { input, select, checkbox } from "@inquirer/prompts";
import { writeConfig, type AgentKitConfig } from "../config.js";
import { SERVICE_REGISTRY } from "../services.js";
import { generateDockerCompose } from "../generators/docker.js";
import { generateProject } from "../generators/project.js";

export interface InitOptions {
  yes?: boolean;
  dir?: string;
  template?: string;
}

/** "governed-agent" only when explicitly chosen — it is never the default (#8). */
function normalizeTemplate(t: string | undefined): "default" | "governed-agent" {
  return t === "governed-agent" ? "governed-agent" : "default";
}

function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "agentkit-project";
}

export async function initCommand(options: InitOptions): Promise<AgentKitConfig> {
  const targetDir = resolve(options.dir || ".");
  mkdirSync(targetDir, { recursive: true });
  const dirName = basename(targetDir);

  let config: AgentKitConfig;

  if (options.yes) {
    config = {
      projectName: sanitizeName(dirName),
      language: "typescript",
      template: normalizeTemplate(options.template), // default unless --template given
      services: {
        agentlens: { enabled: true, port: 3000 },
        lore: { enabled: true, port: 8765 },
        agentgate: { enabled: true, port: 3002 },
        formbridge: { enabled: true, port: 3003 },
        agenteval: { enabled: true },
      },
    };
  } else {
    const projectName = await input({
      message: "Project name:",
      default: dirName,
    });

    const language = await select({
      message: "Language:",
      choices: [
        { value: "typescript" as const, name: "TypeScript" },
        { value: "python" as const, name: "Python" },
      ],
    });

    // Template choice — "default" is preselected; "governed-agent" is opt-in (#8).
    const template = options.template
      ? normalizeTemplate(options.template)
      : await select({
          message: "Project template:",
          choices: [
            { value: "default" as const, name: "Default — minimal starter" },
            { value: "governed-agent" as const, name: "Governed agent — compliance-first (audit + approval gate + redacted memory)" },
          ],
        });

    const serviceKeys = Object.keys(SERVICE_REGISTRY);
    const enabledServices = await checkbox({
      message: "Select services to enable:",
      choices: serviceKeys.map((key) => ({
        value: key,
        name: `${SERVICE_REGISTRY[key].name} — ${SERVICE_REGISTRY[key].description}`,
        checked: true,
      })),
    });

    const services: AgentKitConfig["services"] = {};
    for (const key of enabledServices) {
      const def = SERVICE_REGISTRY[key];
      (services as any)[key] = {
        enabled: true,
        ...(def.defaultPort ? { port: def.defaultPort } : {}),
      };
    }

    config = { projectName: sanitizeName(projectName), language, template, services };
  }

  const configPath = resolve(targetDir, "agentkit.config.yaml");
  writeConfig(configPath, config);
  generateDockerCompose(targetDir, config);
  generateProject(targetDir, config);

  console.log("\n✅ Project initialized!\n");
  console.log("Next steps:");
  console.log(`  cd ${targetDir}`);
  if (config.language === "typescript") {
    console.log("  npm install");
  } else {
    console.log("  pip install -e .");
  }
  console.log("  docker compose up\n");

  return config;
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize a new AgentKit project")
    .option("-y, --yes", "Skip prompts, use defaults")
    .option("-d, --dir <path>", "Target directory")
    .option("--template <name>", "Project template: default | governed-agent (opt-in compliance-first)")
    .action(async (opts) => {
      await initCommand(opts);
    });
}
