// src/core/services/terminal-launcher.ts
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

export type MacOSTerminal = "iterm" | "terminal";

export interface TerminalLaunchConfig {
  modelId: string;
  workingDirectory: string;
  macOSTerminal?: MacOSTerminal;
}

function launchMacOSTerminal(
  terminal: MacOSTerminal,
  fullCommand: string,
  cwd: string,
): LaunchTerminalResult {
  try {
    let script: string;
    let appName: string;

    if (terminal === "iterm") {
      appName = "iTerm";
      // Smart window management: create window only if none exist, otherwise use current
      script = `
-- Check the state of the application *before* we do anything.
if application "iTerm" is running then
    -- It's already running, so our goal is to create a new, separate window.
    tell application "iTerm"
        set new_window to (create window with default profile)
        tell new_window
            tell current session
                write text "cd '${cwd}' && ${fullCommand}\r"
            end tell
        end tell
    end tell
else
    -- It's not running. We'll let 'activate' launch it and create the
    -- initial window for us, which we will then use.
    tell application "iTerm"
        activate
        delay 1
        
        -- This is a guard for a rare preference setting. If iTerm launches
        -- but creates no window, we must make one ourselves.
        if (count of windows) is 0 then
            create window with default profile
        end if

        -- Now we can safely target the frontmost window.
        tell current window
            tell current session
                write text "cd '${cwd}' && ${fullCommand}\r"
            end tell
        end tell
    end tell
end if
`;
    } else {
      appName = "Terminal";
      script = `tell application "Terminal"
        do script "cd '${cwd}' && ${fullCommand}"
        activate
      end tell`;
    }

    const child = spawn("osascript", ["-e", script], {
      detached: true,
      stdio: "ignore",
    });

    child.on("error", (error) => {
      logger.error(`Failed to launch ${appName}:`, error);
    });

    child.on("spawn", () => {
      logger.info(
        `Successfully launched ${appName} and executed: ${fullCommand}`,
      );
    });

    child.unref();

    return {
      success: true,
      pid: child.pid,
    };
  } catch (error) {
    logger.error(`Error launching ${terminal}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
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

  return launchTerminal(
    actualCommand,
    [...args],
    config.workingDirectory,
    config.macOSTerminal,
  );
}

export function launchTerminal(
  command: string,
  args: string[] = [],
  cwd: string = process.cwd(),
  macOSTerminal: MacOSTerminal = "iterm",
): LaunchTerminalResult {
  try {
    logger.info(`Launching terminal command: ${command} ${args.join(" ")}`);

    const platform = process.platform;
    const fullCommand =
      args.length > 0 ? `${command} ${args.join(" ")}` : command;

    if (platform === "darwin") {
      return launchMacOSTerminal(macOSTerminal, fullCommand, cwd);

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
