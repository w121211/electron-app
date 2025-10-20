// src/core/services/surface-launcher/terminal-launcher.ts
import { spawn, spawnSync, type ChildProcess } from "child_process";
import { Logger, type ILogObj } from "tslog";
import { presetExternalModels } from "../../utils/model-utils.js";
import itermAppleScriptTemplate from "./scripts/launch-iterm.applescript?raw";
import terminalAppleScriptTemplate from "./scripts/launch-terminal.applescript?raw";
import { focusWindowsWindowByTitle } from "./os/windows.js";
import { focusLinuxWindowByTitle } from "./os/linux.js";

const logger: Logger<ILogObj> = new Logger({ name: "TerminalLauncher" });

export interface LaunchTerminalResult {
  success: boolean;
  pid?: number;
  error?: string;
  message?: string;
  state?: "focused" | "launched";
}

export type MacOSTerminal = "iterm" | "terminal";

export interface TerminalLaunchConfig {
  modelId: string;
  workingDirectory: string;
  macOSTerminal?: MacOSTerminal;
  sessionId: string;
}

export interface ExecuteCommandResult {
  success: boolean;
  process?: ChildProcess;
  error?: string;
}

const appleScriptTemplates: Record<
  MacOSTerminal,
  string
> = Object.freeze({
  iterm: itermAppleScriptTemplate,
  terminal: terminalAppleScriptTemplate,
});

function renderAppleScriptTemplate({
  template,
  cwd,
  fullCommand,
  sessionTitle,
}: {
  template: string;
  cwd: string;
  fullCommand: string;
  sessionTitle: string;
}): string {
  return template
    .replaceAll("{{CWD}}", cwd)
    .replaceAll("{{FULL_COMMAND}}", fullCommand)
    .replaceAll("{{SESSION_TITLE}}", sessionTitle)
    .replaceAll("{{SESSION_NAME}}", sessionTitle);
}

function sanitizeSessionId(sessionId: string): string {
  const normalized = sessionId
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (normalized.length === 0) {
    return "session";
  }

  return normalized;
}

function createTerminalWindowTitle(sessionId: string): string {
  return `AI Chat ${sanitizeSessionId(sessionId)}`;
}

function launchMacOSTerminal(
  terminal: MacOSTerminal,
  fullCommand: string,
  cwd: string,
  sessionTitle: string,
): LaunchTerminalResult {
  try {
    const template = appleScriptTemplates[terminal];
    if (!template) {
      return {
        success: false,
        error: `Unsupported macOS terminal: ${terminal}`,
      };
    }

    const script = renderAppleScriptTemplate({
      template,
      cwd,
      fullCommand,
      sessionTitle,
    });
    const appName = terminal === "iterm" ? "iTerm" : "Terminal";

    const result = spawnSync("osascript", ["-e", script], {
      stdio: "ignore",
    });

    if (result.status === 0) {
      logger.info(
        `Activated ${appName} session for: ${sessionTitle} (${fullCommand})`,
      );
      return {
        success: true,
        message: `Activated ${appName} session`,
      };
    }

    return {
      success: false,
      error: `${appName} AppleScript exited with code ${result.status ?? -1}`,
    };
  } catch (error) {
    logger.error(`Error launching ${terminal}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export function getCommandForModel(
  modelId: string,
): { command: string; args: string[] } | undefined {
  const externalModel = Object.values(presetExternalModels).find(
    (model) => model.modelId === modelId,
  );
  if (!externalModel) {
    return undefined;
  }
  if (!externalModel.command || externalModel.command.trim().length === 0) {
    return undefined;
  }
  return {
    command: externalModel.command,
    args: externalModel.args ?? [],
  };
}

export function launchTerminalFromConfig(
  config: TerminalLaunchConfig,
): LaunchTerminalResult {
  const modelInfo = getCommandForModel(config.modelId);
  if (!modelInfo) {
    return {
      success: false,
      error: `Invalid terminal model: ${config.modelId}`,
    };
  }

  const { command: actualCommand, args } = modelInfo;

  return launchTerminal(
    actualCommand,
    [...args],
    config.workingDirectory,
    config.macOSTerminal,
    config.sessionId,
  );
}

export function launchTerminal(
  command: string,
  args: string[] = [],
  cwd: string = process.cwd(),
  macOSTerminal: MacOSTerminal = "iterm",
  sessionId: string,
): LaunchTerminalResult {
  try {
    logger.info(`Launching terminal command: ${command} ${args.join(" ")}`);

    const platform = process.platform;
    const fullCommand =
      args.length > 0 ? `${command} ${args.join(" ")}` : command;
    const sessionTitle = createTerminalWindowTitle(sessionId);

    if (platform === "darwin") {
      return launchMacOSTerminal(
        macOSTerminal,
        fullCommand,
        cwd,
        sessionTitle,
      );
    } else if (platform === "win32") {
      try {
        if (focusWindowsWindowByTitle(sessionTitle)) {
          return {
            success: true,
            state: "focused",
            message: "Focused existing Windows terminal window",
          };
        }
      } catch (error) {
        logger.warn("Failed to focus Windows terminal window", error);
      }

      const focusCommand = `title ${sessionTitle} && cd /d "${cwd}" && ${fullCommand}`;

      const child = spawn(
        "cmd",
        ["/c", "start", "", "cmd", "/k", focusCommand],
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
        state: "launched",
      };
    } else {
      try {
        if (focusLinuxWindowByTitle(sessionTitle)) {
          return {
            success: true,
            state: "focused",
            message: "Focused existing Linux terminal window",
          };
        }
      } catch (error) {
        logger.warn("Failed to focus Linux terminal window", error);
      }

      // Linux: Try common terminal emulators
      const terminals = [
        {
          cmd: "gnome-terminal",
          args: [
            "--title",
            sessionTitle,
            "--working-directory",
            cwd,
            "--",
            "bash",
            "-c",
            fullCommand,
          ],
        },
        {
          cmd: "konsole",
          args: [
            "--workdir",
            cwd,
            "--title",
            sessionTitle,
            "-e",
            "bash",
            "-c",
            fullCommand,
          ],
        },
        {
          cmd: "xterm",
          args: [
            "-title",
            sessionTitle,
            "-e",
            `bash -c "cd '${cwd}' && ${fullCommand}"`,
          ],
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
            state: "launched",
          };
        } catch (error) {
          // Continue to next terminal option
        }
      }

      return {
        success: false,
        error:
          "Failed to launch a terminal. Install gnome-terminal, konsole, or xterm.",
      };
    }
  } catch (error) {
    logger.error("Failed to launch terminal command", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
