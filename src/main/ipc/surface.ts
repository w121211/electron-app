// src/main/ipc/surface.ts
import { ipcMain, shell } from "electron";
import {
  createSurfaceLauncher,
  type SurfaceLaunchResult,
} from "../../core/services/surface-launcher/surface-launcher.js";
import type { ModelSurface } from '../../core/utils/model-utils.js';

interface SurfaceLaunchPayload {
  sessionId: string;
  modelId: `${string}/${string}`;
  modelSurface: ModelSurface;
  projectPath?: string | null;
}

const surfaceLauncher = createSurfaceLauncher({
  openUrl: (url: string) => shell.openExternal(url),
});

export function registerSurfaceIpcHandlers(): void {
  ipcMain.handle(
    "surface:launch",
    async (_event, payload: SurfaceLaunchPayload): Promise<SurfaceLaunchResult> => {
      return surfaceLauncher.launch({
        sessionId: payload.sessionId,
        modelId: payload.modelId,
        surface: payload.modelSurface,
        projectPath: payload.projectPath,
      });
    },
  );
}
