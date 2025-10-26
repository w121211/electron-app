// src/core/services/user-settings-repository.ts
import path from "node:path";
import { Logger, type ILogObj } from "tslog";
import {
  fileExists,
  readJsonFile,
  writeJsonFile,
} from "../utils/file-utils.js";
import type { ProjectDirectory } from "./project-folder-service.js";

interface AppSettings {
  currentWorkspaceDirectory: string;
}

export interface ProviderConfig {
  enabled: boolean;
  apiKey?: string;
}

export interface UserSettings {
  project: {
    directories: ProjectDirectory[]; // Multiple project folders
    workspaceDirectory: string; // Non-project workspace
  };
  promptScript: {
    chatsFolder: string; // User configurable, relative to the project directory
    // TBC: Yet to confirm is this needed, for now it saved to the `workspaceDirectory/audio-recordings`
    // readonly audioRecordingsSubfolder: string; // Computed: <chatsFolder>/audio-recordings
    readonly templatesFolder: string; // Computed: <chatsFolder>/templates
  };
  providers: {
    // openai?: ProviderConfig;
    // anthropic?: ProviderConfig;
    // google?: ProviderConfig;
    openrouter?: ProviderConfig;
    aigateway?: ProviderConfig;
  };
}

const DEFAULT_USER_SETTINGS: UserSettings = {
  project: {
    directories: [],
    workspaceDirectory: "", // Computed automatically, default: "<appDocumentsDir>/my-app"
  },
  promptScript: {
    chatsFolder: "chats",
    // audioRecordingsSubfolder: "", // Computed automatically
    templatesFolder: "", // Computed automatically, default: "chats/templates"
  },
  providers: {},
};

const createProjectSettings = (
  projectSettings: UserSettings["project"] = DEFAULT_USER_SETTINGS.project,
  appDocumentsDir: string,
): UserSettings["project"] => {
  // Validate workspaceDirectory is absolute path when provided
  const defaultWorkspaceDir = projectSettings.workspaceDirectory.trim();
  if (defaultWorkspaceDir && defaultWorkspaceDir.length > 0) {
    if (!path.isAbsolute(defaultWorkspaceDir)) {
      throw new Error(
        `workspaceDirectory must be an absolute path, received: ${defaultWorkspaceDir}`,
      );
    }
  }

  return {
    directories: projectSettings.directories,
    workspaceDirectory:
      defaultWorkspaceDir.length > 0
        ? defaultWorkspaceDir
        : path.join(appDocumentsDir, "my-app"),
  };
};

const createPromptScriptSettings = (
  chatsFolder: string = DEFAULT_USER_SETTINGS.promptScript.chatsFolder,
): UserSettings["promptScript"] => {
  return {
    chatsFolder,
    // audioRecordingsSubfolder: path.join(chatsFolder, "audio-recordings"),
    templatesFolder: path.join(chatsFolder, "templates"),
  };
};

const normalizeUserSettings = (
  settings: Partial<UserSettings>,
  appDocumentsDir: string,
): UserSettings => {
  return {
    project: createProjectSettings(settings.project, appDocumentsDir),
    promptScript: createPromptScriptSettings(
      settings.promptScript?.chatsFolder,
    ),
    providers: settings.providers ?? DEFAULT_USER_SETTINGS.providers,
  };
};

export class UserSettingsRepository {
  private readonly logger: Logger<ILogObj>;
  private readonly appSettingsPath: string; // In userDataDir
  private userSettingsPath: string; // In workspace dir
  private readonly appDocumentsDir: string;
  private cachedSettings?: UserSettings;

  constructor(appSettingsPath: string, appDocumentsDir: string) {
    this.logger = new Logger({ name: "UserSettingsRepository" });
    this.appSettingsPath = appSettingsPath;
    this.appDocumentsDir = appDocumentsDir;
    this.userSettingsPath = ""; // Will be set after loading app settings
  }

  public async getSettings(): Promise<UserSettings> {
    if (this.cachedSettings) {
      return this.cachedSettings;
    }

    // Get workspace directory from app settings
    const workspaceDir = await this.getWorkspaceDirectory();
    this.userSettingsPath = path.join(workspaceDir, "user-settings.json");

    if (!(await fileExists(this.userSettingsPath))) {
      this.logger.info(
        `Settings file not found, creating default at ${this.userSettingsPath}`,
      );
      const defaults = normalizeUserSettings(
        DEFAULT_USER_SETTINGS,
        this.appDocumentsDir,
      );
      await this.saveSettings(defaults);
      this.cachedSettings = defaults;
      return defaults;
    }

    const rawSettings = await readJsonFile<Partial<UserSettings>>(
      this.userSettingsPath,
    );
    const normalized = normalizeUserSettings(rawSettings, this.appDocumentsDir);

    // Only save if normalization changed the settings
    if (JSON.stringify(rawSettings) !== JSON.stringify(normalized)) {
      await this.saveSettings(normalized);
    }
    this.cachedSettings = normalized;

    return normalized;
  }

  public async saveSettings(settings: UserSettings): Promise<UserSettings> {
    const normalized = normalizeUserSettings(settings, this.appDocumentsDir);
    await writeJsonFile(this.userSettingsPath, normalized);
    this.cachedSettings = normalized;
    this.logger.debug(
      `Settings saved successfully to ${this.userSettingsPath}`,
    );

    return normalized;
  }

  public async updateWorkspaceDirectory(
    newWorkspaceDir: string,
  ): Promise<void> {
    const newSettingsPath = path.join(newWorkspaceDir, "user-settings.json");

    if (newSettingsPath !== this.userSettingsPath) {
      this.logger.info(
        `Updating workspace directory from ${this.userSettingsPath} to ${newSettingsPath}`,
      );

      // Save new workspace directory to app settings
      await this.saveWorkspaceDirectory(newWorkspaceDir);

      // Update settings file path
      this.userSettingsPath = newSettingsPath;
      this.cachedSettings = undefined; // Invalidate cache
    }
  }

  private async getWorkspaceDirectory(): Promise<string> {
    // Check if app settings file exists
    if (await fileExists(this.appSettingsPath)) {
      const appSettings = await readJsonFile<AppSettings>(this.appSettingsPath);
      if (appSettings.currentWorkspaceDirectory) {
        return appSettings.currentWorkspaceDirectory;
      }
    }

    // Default workspace directory
    return path.join(this.appDocumentsDir, "my-app");
  }

  private async saveWorkspaceDirectory(workspaceDir: string): Promise<void> {
    const appSettings: AppSettings = {
      currentWorkspaceDirectory: workspaceDir,
    };
    await writeJsonFile(this.appSettingsPath, appSettings);
  }
}

export function createUserSettingsRepository(
  userDataDir: string,
  appDocumentsDir: string,
): UserSettingsRepository {
  const appSettingsPath = path.join(userDataDir, "app-settings.json");
  return new UserSettingsRepository(appSettingsPath, appDocumentsDir);
}
