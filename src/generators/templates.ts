import type { AgentKitConfig } from "../config.js";

export function tsIndexTemplate(config: AgentKitConfig): string {
  const enabledServices = Object.entries(config.services)
    .filter(([, v]) => v?.enabled)
    .map(([k]) => k);

  return `// ${config.projectName} — AgentKit Project
// Enabled services: ${enabledServices.join(", ")}

console.log("Welcome to ${config.projectName}!");
console.log("Enabled services: ${enabledServices.join(", ")}");
`;
}

export function tsPackageJsonTemplate(config: AgentKitConfig): string {
  const deps: Record<string, string> = {};
  const services = config.services;
  if (services.agentlens?.enabled) deps["@agentkit/agentlens"] = "latest";
  if (services.lore?.enabled) deps["@agentkit/lore"] = "latest";
  if (services.agentgate?.enabled) deps["@agentkit/agentgate"] = "latest";
  if (services.formbridge?.enabled) deps["@agentkit/formbridge"] = "latest";
  if (services.agenteval?.enabled) deps["@agentkit/agenteval"] = "latest";

  return JSON.stringify(
    {
      name: config.projectName,
      version: "0.1.0",
      type: "module",
      scripts: {
        build: "tsc",
        start: "node dist/index.js",
        dev: "tsx src/index.ts",
      },
      dependencies: deps,
      devDependencies: {
        typescript: "^5.0.0",
        tsx: "^4.0.0",
        "@types/node": "^20.0.0",
      },
    },
    null,
    2
  );
}

export function tsTsconfigTemplate(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        outDir: "dist",
        rootDir: "src",
        strict: true,
        esModuleInterop: true,
      },
      include: ["src"],
    },
    null,
    2
  );
}

export function pyMainTemplate(config: AgentKitConfig): string {
  const enabledServices = Object.entries(config.services)
    .filter(([, v]) => v?.enabled)
    .map(([k]) => k);

  return `# ${config.projectName} — AgentKit Project
# Enabled services: ${enabledServices.join(", ")}

def main():
    print("Welcome to ${config.projectName}!")
    print("Enabled services: ${enabledServices.join(", ")}")

if __name__ == "__main__":
    main()
`;
}

export function pyProjectTomlTemplate(config: AgentKitConfig): string {
  const deps: string[] = [];
  const services = config.services;
  if (services.agentlens?.enabled) deps.push('"agentkit-agentlens"');
  if (services.lore?.enabled) deps.push('"agentkit-lore"');
  if (services.agentgate?.enabled) deps.push('"agentkit-agentgate"');
  if (services.formbridge?.enabled) deps.push('"agentkit-formbridge"');
  if (services.agenteval?.enabled) deps.push('"agentkit-agenteval"');

  return `[project]
name = "${config.projectName}"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = [
  ${deps.join(",\n  ")}
]

[build-system]
requires = ["setuptools>=68.0"]
build-backend = "setuptools.backends._legacy:_Backend"
`;
}
