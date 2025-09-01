// examples/terminal-launcher-demo.ts
import { launchTerminal } from "../src/core/services/terminal-launcher.js";
import { Logger, ILogObj } from "tslog";

const logger = new Logger<ILogObj>({ name: "TerminalLauncherDemo" });

async function main() {
  logger.info("Starting Terminal Launcher Demo");

  logger.info("Launching macOS Terminal...");
  const terminalResult = launchTerminal("open", ["-a", "Terminal", "."]);
  
  if (terminalResult.success) {
    logger.info(`Successfully launched macOS Terminal with PID: ${terminalResult.pid}`);
  } else {
    logger.error(`Failed to launch Terminal: ${terminalResult.error}`);
  }

  logger.info("Launching VS Code...");
  const vscodeResult = launchTerminal("code", ["."], process.cwd());
  
  if (vscodeResult.success) {
    logger.info(`Successfully launched VS Code with PID: ${vscodeResult.pid}`);
  } else {
    logger.error(`Failed to launch VS Code: ${vscodeResult.error}`);
  }

  logger.info("Launching Claude Code...");
  const claudeResult = launchTerminal("claude-code", [], process.cwd());
  
  if (claudeResult.success) {
    logger.info(`Successfully launched Claude Code with PID: ${claudeResult.pid}`);
  } else {
    logger.error(`Failed to launch Claude Code: ${claudeResult.error}`);
  }

  logger.info("Demo completed!");
}

main().catch(error => {
  logger.error("Demo failed:", error);
  process.exit(1);
});