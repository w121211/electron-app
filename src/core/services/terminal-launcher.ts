// src/core/services/terminal-launcher.ts
import { shell } from "electron";
import { spawn } from "child_process";
import { Logger, type ILogObj } from "tslog";

const logger: Logger<ILogObj> = new Logger({ name: "TerminalLauncher" });

const terminalCommands = {
  "terminal/claude-code": { command: "claude", args: [] },
  "terminal/gemini-cli": { command: "gemini", args: [] },
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

    const platform = process.platform;
    const fullCommand =
      args.length > 0 ? `${command} ${args.join(" ")}` : command;

    if (platform === "darwin") {
      // macOS: Use AppleScript to open Terminal.app and run the command
      const child = spawn(
        "osascript",
        [
          "-e",
          `tell application "Terminal" to do script "cd '${cwd}' && ${fullCommand}"`,
          "-e",
          `tell application "Terminal" to activate`,
        ],
        {
          detached: true,
          stdio: "ignore",
        },
      );

      child.on("error", (error) => {
        logger.error(`Failed to launch Terminal.app:`, error);
      });

      child.on("spawn", () => {
        logger.info(
          `Successfully launched Terminal.app and executed: ${fullCommand}`,
        );
      });

      child.unref();

      return {
        success: true,
        pid: child.pid,
      };
    } else if (platform === "win32") {
      // Windows: Use cmd to open Command Prompt
      const child = spawn(
        "cmd",
        ["/c", "start", "cmd", "/k", `cd /d "${cwd}" && ${fullCommand}`],
        {
          detached: true,
          stdio: "ignore",
        },
      );

      child.on("error", (error) => {
        logger.error(`Failed to launch Command Prompt:`, error);
      });

      child.on("spawn", () => {
        logger.info(
          `Successfully launched Command Prompt with command: ${command}`,
        );
      });

      child.unref();

      return {
        success: true,
        pid: child.pid,
      };
    } else {
      // Linux: Try common terminal emulators
      const terminals = [
        {
          cmd: "gnome-terminal",
          args: ["--working-directory", cwd, "--", "bash", "-c", fullCommand],
        },
        {
          cmd: "konsole",
          args: ["--workdir", cwd, "-e", "bash", "-c", fullCommand],
        },
        {
          cmd: "xterm",
          args: ["-e", `bash -c "cd '${cwd}' && ${fullCommand}"`],
        },
      ];

      for (const terminal of terminals) {
        try {
          const child = spawn(terminal.cmd, terminal.args, {
            detached: true,
            stdio: "ignore",
          });

          child.on("error", () => {
            // Try next terminal
          });

          child.on("spawn", () => {
            logger.info(
              `Successfully launched ${terminal.cmd} with command: ${command}`,
            );
          });

          child.unref();

          return {
            success: true,
            pid: child.pid,
          };
        } catch (error) {
          // Try next terminal
          continue;
        }
      }

      throw new Error("No supported terminal found");
    }
  } catch (error) {
    logger.error(`Error launching terminal command ${command}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
