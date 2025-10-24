// src/core/utils/prompt-script-utils.ts
import path from "node:path";
import { UserSettings } from "../services/user-settings-repository";

export function getPromptScriptSaveDirectory(options: {
  projectPath?: string;
  customDirectory?: string;
  settings: UserSettings;
}): string {
  if (options.customDirectory) {
    return options.customDirectory;
  }

  const basePath =
    options.projectPath || options.settings.project.defaultWorkspaceDirectory;

  return path.join(basePath, options.settings.promptScript.chatsFolder);
}
