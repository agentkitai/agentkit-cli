import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { statusCommand, formatStatusTable } from "./commands/status.js";
import { doctorCommand, formatDoctorOutput } from "./commands/doctor.js";

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
    .option("-c, --config <path>", "Config file path", "agentkit.config.yaml")
    .option("-t, --timeout <ms>", "Connection timeout in ms", "3000")
    .action(async (opts) => {
      const results = await statusCommand({ config: opts.config, timeout: Number(opts.timeout) });
      console.log(formatStatusTable(results));
    });

  program
    .command("doctor")
    .description("Run diagnostic checks on your AgentKit setup")
    .option("-c, --config <path>", "Config file path", "agentkit.config.yaml")
    .option("-t, --timeout <ms>", "Connection timeout in ms", "3000")
    .action(async (opts) => {
      const checks = await doctorCommand({ config: opts.config, timeout: Number(opts.timeout) });
      console.log(formatDoctorOutput(checks));
    });

  return program;
}
