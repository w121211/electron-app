// src/renderer/src/stores/file-panel-store.svelte.ts
import { Logger } from "tslog";
import { fileService } from "../services/file-service";

const logger = new Logger({ name: "file-panel-store" });

interface FilePanelState {
  filePath: string | null;
  content: string | null;
  fileName: string | null;
  error: string | null;
  isLoading: boolean;
}

export const filePanelState = $state<FilePanelState>({
  filePath: null,
  content: null,
  fileName: null,
  error: null,
  isLoading: false,
});

export async function loadFileForPanel(filePath: string) {
  filePanelState.isLoading = true;
  filePanelState.error = null;
  filePanelState.content = null;
  filePanelState.filePath = filePath;
  filePanelState.fileName = filePath.split("/").pop() ?? "file";

  try {
    const fileContent = await fileService.openFile(filePath);
    if (filePanelState.filePath === filePath) { // check if it's still the same file
        filePanelState.content = fileContent.content;
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    logger.error(`Failed to load file ${filePath}:`, errorMsg);
    if (filePanelState.filePath === filePath) {
        filePanelState.error = errorMsg;
    }
  } finally {
    filePanelState.isLoading = false;
  }
}

export function closeFilePanel() {
  filePanelState.filePath = null;
  filePanelState.content = null;
  filePanelState.fileName = null;
  filePanelState.error = null;
  filePanelState.isLoading = false;
}