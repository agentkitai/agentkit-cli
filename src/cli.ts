#!/usr/bin/env node
import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { statusCommand, formatStatusTable } from "./commands/status.js";
import { doctorCommand, formatDoctorOutput } from "./commands/doctor.js";
import { composeArgs, runCompose, projectDirFromConfig, type ComposeOpts } from "./commands/compose.js";
import { findConfig } from "./config.js";

const NO_CONFIG = "No agentkit.config.yaml found. Run `agentkit init` to get started.";

/** Thin compose wrapper shared by up/down/logs (#11). */
function runComposeVerb(verb: "up" | "down" | "logs", configPath: string | undefined, opts: ComposeOpts): void {
  const cfg = configPath ?? findConfig();
  if (!cfg) {
    console.log(NO_CONFIG);
    return;
  }
  process.exit(runCompose(projectDirFromConfig(cfg), composeArgs(verb, opts)));
}

export function createCli(): Command {
  const program = new Command();
  program
    .name("agentkit")
    .description("Unified CLI for the AgentKit ecosystem")
    .version("0.1.0");

  registerInitCommand(program);

  program
    .command("status")
    .description("Show status of all AgentKit services")
    .option("-c, --config <path>", "Config file path")
    .option("-t, --timeout <ms>", "Connection timeout in ms", "3000")
    .option("-w, --watch [seconds]", "Live-refresh the status table every N seconds (default 2)")
    .action(async (opts) => {
      const configPath = opts.config ?? findConfig();
      if (!configPath) {
        console.log(NO_CONFIG);
        return;
      }
      const render = async () => {
        const results = await statusCommand({ config: configPath, timeout: Number(opts.timeout) });
        return formatStatusTable(results);
      };
      if (opts.watch === undefined) {
        console.log(await render());
        return;
      }
      const intervalMs = (Number(opts.watch) > 0 ? Number(opts.watch) : 2) * 1000;
      // Thin TUI: clear screen + reprint on a timer (Ctrl+C to exit).
      for (;;) {
        const table = await render();
        process.stdout.write("\x1b[2J\x1b[H"); // clear + cursor home
        console.log(table);
        console.log(`\n(refreshing every ${intervalMs / 1000}s — Ctrl+C to exit)`);
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    });

  // Thin `docker compose` wrappers (#11) — NOT an orchestrator.
  program
    .command("up")
    .description("Start the stack (docker compose up -d)")
    .option("-c, --config <path>", "Config file path")
    .option("-p, --profile <name>", "Compose profile (minimal | governance | full)")
    .option("--no-detach", "Run in the foreground")
    .action((opts) => runComposeVerb("up", opts.config, { profile: opts.profile, detached: opts.detach }));

  program
    .command("down")
    .description("Stop the stack (docker compose down)")
    .option("-c, --config <path>", "Config file path")
    .option("-v, --volumes", "Also remove volumes (data loss!)")
    .action((opts) => runComposeVerb("down", opts.config, { volumes: opts.volumes }));

  program
    .command("logs [service]")
    .description("Tail stack logs (docker compose logs)")
    .option("-c, --config <path>", "Config file path")
    .option("-f, --follow", "Follow log output")
    .action((service, opts) => runComposeVerb("logs", opts.config, { follow: opts.follow, service }));

  program
    .command("doctor")
    .description("Run diagnostic checks on your AgentKit setup")
    .option("-c, --config <path>", "Config file path")
    .option("-t, --timeout <ms>", "Connection timeout in ms", "3000")
    .action(async (opts) => {
      const configPath = opts.config ?? findConfig();
      if (!configPath) {
        console.log("No agentkit.config.yaml found. Run `agentkit init` to get started.");
        return;
      }
      const checks = await doctorCommand({ config: configPath, timeout: Number(opts.timeout) });
      console.log(formatDoctorOutput(checks));
    });

  return program;
}

// Entry point when run directly
if (require.main === module) {
  createCli().parseAsync();
}
