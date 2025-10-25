// src/core/services/user-settings-repository.ts
import path from "node:path";
import { Logger, type ILogObj } from "tslog";
import {
  fileExists,
  readJsonFile,
  writeJsonFile,
} from "../utils/file-utils.js";
import type { ProjectDirectory } from "./project-folder-service.js";

export interface ProviderConfig {
  enabled: boolean;
  apiKey?: string;
}

export interface UserSettings {
  project: {
    directories: ProjectDirectory[]; // Multiple project folders
    defaultWorkspaceDirectory: string; // Non-project workspace
  };
  promptScript: {
    chatsFolder: string; // User configurable, relative to the project directory
    // TBC: Yet to confirm is this needed, for now it saved to the `defaultWorkspaceDirectory/audio-recordings`
    // readonly audioRecordingsSubfolder: string; // Computed: <chatsFolder>/audio-recordings
    readonly templatesSubfolder: string; // Computed: <chatsFolder>/templates
  };
  providers: {
    // openai?: ProviderConfig;
    // anthropic?: ProviderConfig;
    // google?: ProviderConfig;
    openrouter?: ProviderConfig;
    aiGateway?: ProviderConfig;
  };
}

const DEFAULT_USER_SETTINGS: UserSettings = {
  project: {
    directories: [],
    defaultWorkspaceDirectory: "",
  },
  promptScript: {
    chatsFolder: "chats",
    // audioRecordingsSubfolder: "", // Computed automatically
    templatesSubfolder: "", // Computed automatically
  },
  providers: {},
};

const createProjectSettings = (
  projectSettings: UserSettings["project"] = DEFAULT_USER_SETTINGS.project,
  userDataDir: string,
): UserSettings["project"] => {
  // Validate defaultWorkspaceDirectory is absolute path when provided
  const defaultWorkspaceDir = projectSettings.defaultWorkspaceDirectory.trim();
  if (defaultWorkspaceDir && defaultWorkspaceDir.length > 0) {
    if (!path.isAbsolute(defaultWorkspaceDir)) {
      throw new Error(
        `defaultWorkspaceDirectory must be an absolute path, received: ${defaultWorkspaceDir}`,
      );
    }
  }

  return {
    directories: projectSettings.directories,
    defaultWorkspaceDirectory:
      defaultWorkspaceDir.length > 0
        ? defaultWorkspaceDir
        : path.join(userDataDir, "default-workspace"),
  };
};

const createPromptScriptSettings = (
  chatsFolder: string = DEFAULT_USER_SETTINGS.promptScript.chatsFolder,
): UserSettings["promptScript"] => {
  return {
    chatsFolder,
    // audioRecordingsSubfolder: path.join(chatsFolder, "audio-recordings"),
    templatesSubfolder: path.join(chatsFolder, "templates"),
  };
};

const createUserSettings = (
  settings: Partial<UserSettings>,
  userDataDir: string,
): UserSettings => {
  return {
    project: createProjectSettings(settings.project, userDataDir),
    promptScript: createPromptScriptSettings(
      settings.promptScript?.chatsFolder,
    ),
    providers: settings.providers ?? DEFAULT_USER_SETTINGS.providers,
  };
};

export class UserSettingsRepository {
  private readonly logger: Logger<ILogObj>;
  private readonly filePath: string;
  private readonly userDataDir: string;
  private cachedSettings?: UserSettings;

  constructor(settingsFilePath: string, userDataDir: string) {
    this.logger = new Logger({ name: "UserSettingsRepository" });
    this.filePath = settingsFilePath;
    this.userDataDir = userDataDir;
  }

  public async getSettings(): Promise<UserSettings> {
    if (this.cachedSettings) {
      return this.cachedSettings;
    }

    if (!(await fileExists(this.filePath))) {
      this.logger.info(
        `Settings file not found, creating default at ${this.filePath}`,
      );
      const defaults = createUserSettings(
        DEFAULT_USER_SETTINGS,
        this.userDataDir,
      );
      await this.saveSettings(defaults);
      this.cachedSettings = defaults;
      return defaults;
    }

    const rawSettings = await readJsonFile<Partial<UserSettings>>(
      this.filePath,
    );
    const normalized = createUserSettings(rawSettings, this.userDataDir);

    // Only save if normalization changed the settings
    if (JSON.stringify(rawSettings) === JSON.stringify(normalized)) {
      await this.saveSettings(normalized);
    }
    this.cachedSettings = normalized;

    return normalized;
  }

  public async saveSettings(settings: UserSettings): Promise<UserSettings> {
    const normalized = createUserSettings(settings, this.userDataDir);
    await writeJsonFile(this.filePath, normalized);
    this.cachedSettings = normalized;
    this.logger.debug(`Settings saved successfully to ${this.filePath}`);

    return normalized;
  }

  public getFilePath(): string {
    return this.filePath;
  }

  public getUserDataDir(): string {
    return this.userDataDir;
  }
}

export function createUserSettingsRepository(
  userDataDir: string,
): UserSettingsRepository {
  const filePath = path.join(userDataDir, "user-settings.json");
  return new UserSettingsRepository(filePath, userDataDir);
}
