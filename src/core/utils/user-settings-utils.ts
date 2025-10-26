// src/core/utils/user-settings-utils.ts
import path from "node:path";
import type { UserSettings } from "../services/user-settings-repository";

export const getPromptScriptTemplatesDirectory = (options: {
  parentDir?: string;
  settings: UserSettings;
}) => {
  const parentDir =
    options.parentDir || options.settings.project.workspaceDirectory;

  return path.join(parentDir, options.settings.promptScript.templatesFolder);
};

export const getPromptScriptSaveDirectory = (options: {
  projectPath?: string;
  customDirectory?: string;
  settings: UserSettings;
}): string => {
  if (options.customDirectory) {
    return options.customDirectory;
  }

  const basePath =
    options.projectPath || options.settings.project.workspaceDirectory;

  return path.join(basePath, options.settings.promptScript.chatsFolder);
};
