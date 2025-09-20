// src/core/services/terminal-launcher.ts
import { spawn, type ChildProcess } from "child_process";
import { Logger, type ILogObj } from "tslog";
import { presetExternalModels } from "../utils/model-utils";

const logger: Logger<ILogObj> = new Logger({ name: "TerminalLauncher" });

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

export interface ExecuteCommandResult {
  success: boolean;
  process?: ChildProcess;
  error?: string;
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

export function getCommandForModel(
  modelId: string,
): { command: string; args: string[] } | undefined {
  const externalModel = Object.values(presetExternalModels).find(
    (model) => model.modelId === modelId,
  );
  if (!externalModel) {
    return undefined;
  }
  return { command: externalModel.command, args: externalModel.args };
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
