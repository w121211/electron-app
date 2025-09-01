// src/core/services/terminal-launcher.ts
import { spawn } from "child_process";
import { Logger, type ILogObj } from "tslog";

const logger: Logger<ILogObj> = new Logger({ name: "TerminalLauncher" });

const terminalCommands = {
  "terminal/claude-code": { command: "claude-code", args: [] },
  "terminal/gemini-cli": { command: "gemini-cli", args: [] },
  "terminal/codex": { command: "codex", args: [] },
  "terminal/cursor": { command: "cursor", args: ["."] },
  "terminal/vscode": { command: "code", args: ["."] },
} as const;

export interface LaunchTerminalResult {
  success: boolean;
  pid?: number;
  error?: string;
}

export interface TerminalLaunchConfig {
  modelId: string;
  workingDirectory: string;
}

export function launchTerminalFromConfig(
  config: TerminalLaunchConfig,
): LaunchTerminalResult {
  const commandConfig =
    terminalCommands[config.modelId as keyof typeof terminalCommands];
  if (!commandConfig) {
    return {
      success: false,
      error: `Invalid terminal model: ${config.modelId}`,
    };
  }

  const { command: actualCommand, args } = commandConfig;

  return launchTerminal(actualCommand, [...args], config.workingDirectory);
}

export function launchTerminal(
  command: string,
  args: string[] = [],
  cwd: string = process.cwd(),
): LaunchTerminalResult {
  try {
    logger.info(`Launching terminal command: ${command} ${args.join(" ")}`);

    const child = spawn(command, args, {
      cwd,
      detached: true,
      stdio: "ignore",
      shell: true,
    });

    child.unref();

    return {
      success: true,
      pid: child.pid,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
