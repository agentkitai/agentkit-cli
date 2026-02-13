import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentKitConfig } from "../config.js";
import {
  tsIndexTemplate,
  tsPackageJsonTemplate,
  tsTsconfigTemplate,
  pyMainTemplate,
  pyProjectTomlTemplate,
} from "./templates.js";

function safeWrite(path: string, content: string): void {
  if (existsSync(path)) {
    console.warn(`⚠️  Skipping existing file: ${path}`);
    return;
  }
  writeFileSync(path, content, "utf-8");
}

export function generateProject(targetDir: string, config: AgentKitConfig): void {
  if (config.language === "typescript") {
    generateTypeScriptProject(targetDir, config);
  } else {
    generatePythonProject(targetDir, config);
  }
}

function generateTypeScriptProject(targetDir: string, config: AgentKitConfig): void {
  const srcDir = resolve(targetDir, "src");
  mkdirSync(srcDir, { recursive: true });

  safeWrite(resolve(targetDir, "package.json"), tsPackageJsonTemplate(config));
  safeWrite(resolve(targetDir, "tsconfig.json"), tsTsconfigTemplate());
  writeFileSync(resolve(srcDir, "index.ts"), tsIndexTemplate(config), "utf-8");
}

function generatePythonProject(targetDir: string, config: AgentKitConfig): void {
  const srcDir = resolve(targetDir, "src");
  mkdirSync(srcDir, { recursive: true });

  safeWrite(resolve(targetDir, "pyproject.toml"), pyProjectTomlTemplate(config));
  writeFileSync(resolve(srcDir, "main.py"), pyMainTemplate(config), "utf-8");
}
