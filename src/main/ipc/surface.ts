// src/main/ipc/surface.ts
import { ipcMain, shell } from "electron";
import {
  createSurfaceLauncher,
  type SurfaceLaunchResult,
} from "../../core/services/surface-launcher/surface-launcher.js";
import { ModelSurfaceV2 } from "../../core/services/chat/chat-session-repository.js";
import type { ModelId } from "../../core/utils/model-utils-v2.js";

interface SurfaceLaunchPayload {
  sessionId: string;
  modelId: ModelId;
  modelSurface: ModelSurfaceV2;
  projectPath?: string | null;
}

const surfaceLauncher = createSurfaceLauncher({
  openUrl: (url: string) => shell.openExternal(url),
});

export function registerSurfaceIpcHandlers(): void {
  ipcMain.handle(
    "surface:launch",
    async (
      _event,
      payload: SurfaceLaunchPayload,
    ): Promise<SurfaceLaunchResult> => {
      return surfaceLauncher.launch({
        sessionId: payload.sessionId,
        modelId: payload.modelId,
        surface: payload.modelSurface,
        projectPath: payload.projectPath,
      });
    },
  );
}
