import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";

export function createCli(): Command {
  const program = new Command();
  program
    .name("agentkit")
    .description("Unified CLI for the AgentKit ecosystem")
    .version("0.1.0");

  registerInitCommand(program);

  return program;
}
