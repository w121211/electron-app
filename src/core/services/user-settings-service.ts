// src/core/services/user-settings-service.ts
import fs from "node:fs/promises";
import path from "node:path";
import { safeStorage } from "electron";
import { Logger, ILogObj } from "tslog";
import type {
  UserSettingsRepository,
  UserSettings,
} from "./user-settings-repository.js";

// Define safe user settings update type that excludes projectFolders
type SafeUserSettingsUpdate = Omit<Partial<UserSettings>, "projectFolders"> &
  Record<string, unknown>;

const envVarMap: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
  aiGateway: "AI_GATEWAY_API_KEY",
};

export class UserSettingsService {
  private readonly logger: Logger<ILogObj>;
  private readonly userSettingsRepository: UserSettingsRepository;

  constructor(userSettingsRepository: UserSettingsRepository) {
    this.logger = new Logger({ name: "UserSettingsService" });
    this.userSettingsRepository = userSettingsRepository;
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
    await this.userSettingsRepository.saveSettings(updatedSettings);

    this.logger.info("User settings updated successfully");
    return updatedSettings;
  }

  // COMMENTED OUT: Workspace directory feature not needed
  // public async setWorkspaceDirectory(
  //   workspaceDirectory: string,
  // ): Promise<UserSettings> {
  //   this.logger.info(`Setting workspace directory: ${workspaceDirectory}`);

  //   // Validate workspace directory path
  //   if (!workspaceDirectory.trim()) {
  //     throw new Error("Workspace directory cannot be empty");
  //   }

  //   // Validate that the path is absolute
  //   if (!path.isAbsolute(workspaceDirectory)) {
  //     throw new Error(
  //       `Workspace directory must be absolute, received: ${workspaceDirectory}`,
  //     );
  //   }

  //   // Validate that the directory exists and is actually a directory
  //   const isValid = await this.validateWorkspaceDirectory(workspaceDirectory);
  //   if (!isValid) {
  //     throw new Error(
  //       `Invalid workspace directory path: ${workspaceDirectory}`,
  //     );
  //   }

  //   return this.updateUserSettings({ workspaceDirectory });
  // }

  // public async getWorkspaceDirectory(): Promise<string | null> {
  //   const settings = await this.userSettingsRepository.getSettings();
  //   return settings.workspaceDirectory || null;
  // }

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

  private async validateWorkspaceDirectory(
    workspaceDirectory: string,
  ): Promise<boolean> {
    try {
      const stats = await fs.stat(workspaceDirectory);
      return stats.isDirectory();
    } catch (error) {
      this.logger.error(`Error validating workspace directory: ${error}`);
      return false;
    }
  }
}

export function createUserSettingsService(
  userSettingsRepository: UserSettingsRepository,
): UserSettingsService {
  return new UserSettingsService(userSettingsRepository);
}
