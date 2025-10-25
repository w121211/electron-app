// src/core/services/user-settings-service.ts
import path from "node:path";
import fs from "node:fs/promises";
import { safeStorage } from "electron";
import { Logger, type ILogObj } from "tslog";
import type {
  UserSettingsRepository,
  UserSettings,
} from "./user-settings-repository.js";

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
  private readonly logger: Logger<ILogObj>;
  // private readonly userSettingsRepository: UserSettingsRepository;
  // private readonly appResourcesPath: string;

  constructor(
    readonly userSettingsRepository: UserSettingsRepository,
    readonly appResourcesPath: string,
  ) {
    this.logger = new Logger({ name: "UserSettingsService" });
    // this.userSettingsRepository = userSettingsRepository;
    // this.appResourcesPath = options?.appResourcesPath;
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

    // Save updated settings
    const normalizedSettings =
      await this.userSettingsRepository.saveSettings(updatedSettings);

    await this.setupDefaultWorkspace(normalizedSettings);

    this.logger.info("User settings updated successfully");
    return normalizedSettings;
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
          // const envVarName = envVarMap.
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

  async setupDefaultWorkspace(settings: UserSettings): Promise<void> {
    const sourceDir = path.join(
      this.appResourcesPath,
      DEFAULT_RESOURCE_TEMPLATE_PATH,
    );
    const destDir = path.join(
      settings.project.defaultWorkspaceDirectory,
      settings.promptScript.templatesSubfolder,
    );

    try {
      await fs.mkdir(destDir, { recursive: true });
      await fs.cp(sourceDir, destDir, {
        recursive: true,
        errorOnExist: false,
        force: false,
      });
    } catch (error) {
      console.warn(
        `Failed to provision prompt templates from ${sourceDir} to ${destDir}`,
        error,
      );
    }
  }
}

export function createUserSettingsService(
  userSettingsRepository: UserSettingsRepository,
  appResourcesPath: string,
): UserSettingsService {
  return new UserSettingsService(userSettingsRepository, appResourcesPath);
}
