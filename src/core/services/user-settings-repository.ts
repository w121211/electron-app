// src/core/services/user-settings-repository.ts
import path from "node:path";
import { Logger, ILogObj } from "tslog";
import {
  fileExists,
  readJsonFile,
  writeJsonFile,
} from "../utils/file-utils.js";
import { ProjectFolder } from "./project-folder-service.js";

export interface ProviderConfig {
  enabled: boolean;
  apiKey?: string;
}

export interface UserSettings {
  projectFolders: ProjectFolder[];
  // workspaceDirectory?: string; // COMMENTED OUT: Not needed - users add existing folders
  providers: {
    openai?: ProviderConfig;
    anthropic?: ProviderConfig;
    google?: ProviderConfig;
    openrouter?: ProviderConfig;
    aiGateway?: ProviderConfig;
  };
  agent: {
    todoTemplatePath: string;
    todoChatDirectory: {
      mode: "project" | "global";
      path: string;
    };
  };
  promptScriptsDirectory: string;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  projectFolders: [],
  // workspaceDirectory: undefined, // COMMENTED OUT: Not needed - users add existing folders
  providers: {},
  agent: {
    todoTemplatePath: ".chat/todo.md",
    todoChatDirectory: {
      mode: "project",
      path: "chats/todos",
    },
  },
  promptScriptsDirectory: "",
};

export function createDefaultUserSettings(userDataDir: string): UserSettings {
  return {
    ...DEFAULT_USER_SETTINGS,
    projectFolders: [...DEFAULT_USER_SETTINGS.projectFolders],
    providers: { ...DEFAULT_USER_SETTINGS.providers },
    agent: { ...DEFAULT_USER_SETTINGS.agent },
    promptScriptsDirectory: path.join(userDataDir, "prompt-scripts"),
  };
}

export class UserSettingsRepository {
  private readonly logger: Logger<ILogObj>;
  private readonly filePath: string;
  private readonly userDataDir: string;

  constructor(settingsFilePath: string, userDataDir: string) {
    this.logger = new Logger({ name: "UserSettingsRepository" });
    this.filePath = settingsFilePath;
    this.userDataDir = userDataDir;
  }

  public async getSettings(): Promise<UserSettings> {
    if (!(await fileExists(this.filePath))) {
      this.logger.info(
        `Settings file not found, creating default at ${this.filePath}`,
      );
      const defaults = createDefaultUserSettings(this.userDataDir);
      await this.saveSettings(defaults);
      return { ...defaults };
    }

    const rawSettings = await readJsonFile<Partial<UserSettings>>(this.filePath);
    const normalized = this.applyDefaults(rawSettings);

    if (this.needsPersistence(rawSettings, normalized)) {
      await this.saveSettings(normalized);
    }

    return normalized;
  }

  public async saveSettings(settings: UserSettings): Promise<void> {
    const normalized = this.applyDefaults(settings);
    await writeJsonFile(this.filePath, normalized);
    this.logger.debug(`Settings saved successfully to ${this.filePath}`);
  }

  public getFilePath(): string {
    return this.filePath;
  }

  public getUserDataDir(): string {
    return this.userDataDir;
  }

  private applyDefaults(settings: Partial<UserSettings>): UserSettings {
    const projectFolders = Array.isArray(settings.projectFolders)
      ? settings.projectFolders
      : [];

    const providers = {
      ...DEFAULT_USER_SETTINGS.providers,
      ...(settings.providers ?? {}),
    };

    const incomingAgent = settings.agent ?? DEFAULT_USER_SETTINGS.agent;
    const mergedAgent = {
      ...DEFAULT_USER_SETTINGS.agent,
      ...incomingAgent,
    };

    const resolvedPromptDir = this.resolvePromptScriptsDirectory(
      settings.promptScriptsDirectory,
    );

    return {
      projectFolders: [...projectFolders],
      providers,
      agent: mergedAgent,
      promptScriptsDirectory: resolvedPromptDir,
    };
  }

  private resolvePromptScriptsDirectory(
    directory: string | undefined,
  ): string {
    if (directory && directory.trim().length > 0) {
      const trimmed = directory.trim();
      return path.isAbsolute(trimmed)
        ? trimmed
        : path.resolve(this.userDataDir, trimmed);
    }

    return path.join(this.userDataDir, "prompt-scripts");
  }

  private needsPersistence(
    original: Partial<UserSettings>,
    normalized: UserSettings,
  ): boolean {
    if (
      original.promptScriptsDirectory === normalized.promptScriptsDirectory &&
      original.promptScriptsDirectory !== undefined
    ) {
      return false;
    }

    if (!original.promptScriptsDirectory) {
      return true;
    }

    const trimmed = original.promptScriptsDirectory.trim();
    if (trimmed.length === 0) {
      return true;
    }

    if (!path.isAbsolute(trimmed)) {
      return true;
    }

    return (
      path.normalize(trimmed) !==
      path.normalize(normalized.promptScriptsDirectory)
    );
  }
}

export function createUserSettingsRepository(
  userDataDir: string,
): UserSettingsRepository {
  const filePath = path.join(userDataDir, "user-settings.json");
  return new UserSettingsRepository(filePath, userDataDir);
}
