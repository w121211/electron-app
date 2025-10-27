// src/core/services/user-settings-service.ts
import path from "node:path";
import fs from "node:fs/promises";
import { safeStorage } from "electron";
import { Logger, type ILogObj } from "tslog";
import type {
  UserSettingsRepository,
  UserSettings,
} from "./user-settings-repository.js";
import { fileExists } from "../utils/file-utils.js";
import { getPromptScriptTemplatesDirectory } from "../utils/user-settings-utils.js";

// Define safe user settings update type that excludes projectFolders
type SafeUserSettingsUpdate = Omit<Partial<UserSettings>, "projectFolders"> &
  Record<string, unknown>;

const DEFAULT_RESOURCE_TEMPLATE_PATH = path.join("resources", "templates"); // relative to appResourcePath

const envVarMap: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
  aigateway: "AI_GATEWAY_API_KEY",
};

export class UserSettingsService {
  private readonly logger: Logger<ILogObj> = new Logger({
    name: "UserSettingsService",
  });
  private readonly userSettingsRepository: UserSettingsRepository;
  private readonly appResourcesPath: string;

  constructor(
    userSettingsRepository: UserSettingsRepository,
    appResourcesPath: string,
  ) {
    this.userSettingsRepository = userSettingsRepository;
    this.appResourcesPath = appResourcesPath;
  }

  public async getUserSettings(): Promise<UserSettings> {
    return this.userSettingsRepository.getSettings();
  }

  public async updateUserSettings(
    settingsUpdate: SafeUserSettingsUpdate, // Type-safe: prevents projectFolders updates at compile time
  ): Promise<UserSettings> {
    this.logger.info("Updating user settings");

    // Get current settings
    const currentSettings = await this.userSettingsRepository.getSettings();

    // Note: projectFolders should be updated through the ProjectFolderService,
    // so we exclude that field here using type constraints at compile time
    const updatedSettings: UserSettings = {
      ...currentSettings,
      ...settingsUpdate,
    };

    // TODO: Need to move to project service, similar to handle projects update
    // Check if workspace directory is changing
    const workspaceChanged =
      settingsUpdate.project?.workspaceDirectory &&
      settingsUpdate.project.workspaceDirectory !==
        currentSettings.project.workspaceDirectory;

    if (workspaceChanged) {
      // Migrate settings file to new workspace directory
      await this.migrateToNewWorkspace(
        currentSettings.project.workspaceDirectory,
        updatedSettings.project.workspaceDirectory,
      );
    }

    // Save updated settings
    const normalizedSettings =
      await this.userSettingsRepository.saveSettings(updatedSettings);

    if (workspaceChanged) {
      await this.setupWorkspace(normalizedSettings);
    }

    this.logger.info("User settings updated successfully");
    return normalizedSettings;
  }

  public async setupWorkspace(settings: UserSettings): Promise<void> {
    const sourceTemplatesDir = path.join(
      this.appResourcesPath,
      DEFAULT_RESOURCE_TEMPLATE_PATH,
    );
    const destTempaltesDir = getPromptScriptTemplatesDirectory({ settings });

    try {
      // Check if destination directory exists
      if (await fileExists(destTempaltesDir)) {
        this.logger.debug(
          `Chat templates directory already exists at ${destTempaltesDir}, skipping provisioning`,
        );
        return;
      }

      await fs.mkdir(destTempaltesDir, { recursive: true });
      await fs.cp(sourceTemplatesDir, destTempaltesDir, {
        recursive: true,
        errorOnExist: false,
        force: false,
      });
      this.logger.info(
        `Provisioned prompt templates from ${sourceTemplatesDir} to ${destTempaltesDir}`,
      );
    } catch (error) {
      console.warn(
        `Failed to provision prompt templates from ${sourceTemplatesDir} to ${destTempaltesDir}`,
        error,
      );
    }
  }

  private async migrateToNewWorkspace(
    oldWorkspaceDir: string,
    newWorkspaceDir: string,
  ): Promise<void> {
    this.logger.info(
      `Migrating workspace from ${oldWorkspaceDir} to ${newWorkspaceDir}`,
    );

    const oldSettingsPath = path.join(oldWorkspaceDir, "user-settings.json");
    const newSettingsPath = path.join(newWorkspaceDir, "user-settings.json");

    // Check if old settings file exists
    const oldExists = await fileExists(oldSettingsPath);
    const newExists = await fileExists(newSettingsPath);

    // Copy settings to new workspace if needed
    if (oldExists && !newExists) {
      // Ensure new workspace directory exists
      await fs.mkdir(newWorkspaceDir, { recursive: true });

      // Copy settings file
      await fs.copyFile(oldSettingsPath, newSettingsPath);
      this.logger.info(`Copied settings file to ${newSettingsPath}`);
    }

    // Update repository to use new workspace directory
    await this.userSettingsRepository.updateWorkspaceDirectory(newWorkspaceDir);
  }

  public async setProviderApiKey(
    provider: string,
    apiKey: string,
    enabled = true,
  ): Promise<UserSettings> {
    this.logger.info(`Setting ${provider} API key`);

    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Encryption is not available on this system");
    }

    if (!apiKey.trim()) {
      throw new Error("API key cannot be empty");
    }

    const encryptedKey = safeStorage.encryptString(apiKey.trim());
    const encryptedKeyString = encryptedKey.toString("base64");

    const currentSettings = await this.userSettingsRepository.getSettings();

    const updatedSettings = await this.updateUserSettings({
      providers: {
        ...currentSettings.providers,
        [provider]: {
          enabled,
          apiKey: encryptedKeyString,
        },
      },
    });

    // Load the updated API key to environment
    await this.loadApiKeysToEnvironment();

    return updatedSettings;
  }

  public async getProviderApiKey(provider: string): Promise<string | null> {
    const settings = await this.userSettingsRepository.getSettings();

    if (!settings.providers[provider]?.apiKey) {
      return null;
    }

    try {
      const encryptedBuffer = Buffer.from(
        settings.providers[provider].apiKey,
        "base64",
      );
      const decryptedKey = safeStorage.decryptString(encryptedBuffer);
      return decryptedKey;
    } catch (error) {
      this.logger.error(`Error decrypting ${provider} API key: ${error}`);
      return null;
    }
  }

  public async clearProviderApiKey(provider: string): Promise<UserSettings> {
    this.logger.info(`Clearing ${provider} API key`);

    const currentSettings = await this.userSettingsRepository.getSettings();

    return this.updateUserSettings({
      providers: {
        ...currentSettings.providers,
        [provider]: undefined,
      },
    });
  }

  public async loadApiKeysToEnvironment(): Promise<void> {
    this.logger.info("Loading provider API keys to environment variables");

    const settings = await this.userSettingsRepository.getSettings();

    for (const [provider, config] of Object.entries(settings.providers)) {
      if (config?.apiKey && config.enabled) {
        const apiKey = await this.getProviderApiKey(provider);
        if (apiKey) {
          if (!envVarMap.hasOwnProperty(provider)) {
            throw new Error(`Unknown provider: ${provider}`);
          }
          const envVarName = envVarMap[provider];
          process.env[envVarName] = apiKey;
          this.logger.info(`Set ${envVarName} environment variable`);
        }
      }
    }
    // this.logger.debug(process.env);
  }
}

export function createUserSettingsService(
  userSettingsRepository: UserSettingsRepository,
  appResourcesPath: string,
): UserSettingsService {
  return new UserSettingsService(userSettingsRepository, appResourcesPath);
}
