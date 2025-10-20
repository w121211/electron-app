// src/core/services/surface-launcher/surface-launcher.ts
import { Logger, type ILogObj } from "tslog";
import {
  getModelSurface,
  getWebModelUrl,
  getWebModelWindowTitle,
  type ModelSurface,
} from "../../../shared/utils/model-utils.js";
import {
  launchTerminalFromConfig,
  type LaunchTerminalResult,
} from "./terminal-launcher.js";
import { focusMacBrowserTab } from "./os/macos.js";
import { focusWindowsWindowByTitle } from "./os/windows.js";
import { focusLinuxWindowByTitle } from "./os/linux.js";

export interface SurfaceLaunchDependencies {
  openUrl: (url: string) => Promise<void> | void;
}

export interface SurfaceLaunchRequest {
  sessionId: string;
  modelId: `${string}/${string}`;
  surface?: ModelSurface;
  projectPath?: string | null;
}

export interface SurfaceLaunchResult {
  success: boolean;
  pid?: number;
  error?: string;
  message?: string;
}

const logger: Logger<ILogObj> = new Logger({ name: "SurfaceLauncher" });

export class SurfaceLauncher {
  constructor(private readonly deps: SurfaceLaunchDependencies) {}

  async launch(request: SurfaceLaunchRequest): Promise<SurfaceLaunchResult> {
    const surface =
      request.surface ?? getModelSurface(request.modelId);

    if (surface === "api") {
      return { success: true, message: "No surface launch required." };
    }

    if (surface === "terminal") {
      return this.launchTerminal(request);
    }

    if (surface === "web") {
      return this.launchWeb(request);
    }

    return {
      success: false,
      error: `Surface "${surface}" is not supported yet.`,
    };
  }

  private launchTerminal(
    request: SurfaceLaunchRequest,
  ): SurfaceLaunchResult {
    if (!request.projectPath) {
      return {
        success: false,
        error: "Terminal models require a project directory.",
      };
    }

    const result: LaunchTerminalResult = launchTerminalFromConfig({
      modelId: request.modelId,
      workingDirectory: request.projectPath,
      sessionId: request.sessionId,
    });

    if (result.success) {
      return {
        success: true,
        pid: result.pid,
        message:
          result.message ??
          (result.state === "focused"
            ? "Focused existing terminal surface."
            : "Launched terminal surface."),
      };
    }

    return {
      success: false,
      error:
        result.error ??
        "Failed to launch terminal for the selected model.",
    };
  }

  private async launchWeb(
    request: SurfaceLaunchRequest,
  ): Promise<SurfaceLaunchResult> {
    const url = getWebModelUrl(request.modelId);
    if (!url) {
      return {
        success: false,
        error: `No launch URL configured for model ${request.modelId}.`,
      };
    }

    const platform = process.platform;

    if (platform === "darwin") {
      try {
        const { success, browserApp } = focusMacBrowserTab({ url });
        if (success) {
          logger.info(`Activated ${browserApp} for ${url}`);
          return {
            success: true,
            message: "Focused browser tab.",
          };
        }

        logger.warn(
          `Failed to control ${browserApp} via AppleScript. Falling back to openUrl.`,
        );
        return this.openUrlFallback({
          url,
          failureMessage: "Failed to control browser with AppleScript.",
        });
      } catch (error) {
        logger.warn("Failed to focus macOS browser window", error);
        return this.openUrlFallback({ url });
      }
    }

    if (platform === "win32") {
      const windowTitle = getWebModelWindowTitle(request.modelId);
      if (windowTitle) {
        try {
          if (focusWindowsWindowByTitle(windowTitle)) {
            logger.info(`Focused Windows browser window: ${windowTitle}`);
            return {
              success: true,
              message: "Focused browser window.",
            };
          }
        } catch (error) {
          logger.warn("Failed to focus Windows browser window", error);
        }
      }

      return this.openUrlFallback({ url });
    }

    if (platform === "linux") {
      const windowTitle = getWebModelWindowTitle(request.modelId);
      if (windowTitle) {
        try {
          if (focusLinuxWindowByTitle(windowTitle)) {
            logger.info(`Focused Linux browser window: ${windowTitle}`);
            return {
              success: true,
              message: "Focused browser window.",
            };
          }
        } catch (error) {
          logger.warn("Failed to focus Linux browser window", error);
        }
      }

      return this.openUrlFallback({ url });
    }

    return this.openUrlFallback({ url });
  }

  private async openUrlFallback({
    url,
    failureMessage,
  }: {
    url: string;
    failureMessage?: string;
  }): Promise<SurfaceLaunchResult> {
    try {
      await this.deps.openUrl(url);
      return {
        success: true,
        message: "Opened browser window.",
      };
    } catch (error) {
      const fallbackError =
        error instanceof Error ? error.message : "Failed to open external browser.";
      return {
        success: false,
        error: failureMessage ?? fallbackError,
      };
    }
  }
}

export function createSurfaceLauncher(
  deps: SurfaceLaunchDependencies,
): SurfaceLauncher {
  return new SurfaceLauncher(deps);
}
