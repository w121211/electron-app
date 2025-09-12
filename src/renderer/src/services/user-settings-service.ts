// src/renderer/src/services/user-settings-service.ts
import { trpcClient } from "../lib/trpc-client.js";
import {
  setUserSettings,
  setUserSettingsLoading,
  setUserSettingsError,
} from "../stores/user-settings-store.svelte.js";
import type { UserSettings } from "../../../core/services/user-settings-repository.js";

export class UserSettingsService {
  async loadSettings() {
    setUserSettingsLoading(true);
    setUserSettingsError(null);

    try {
      const settings = await trpcClient.userSettings.getSettings.query();
      setUserSettings(settings);
      return settings;
    } catch (error) {
      console.error("Failed to load user settings:", error);
      setUserSettingsError(
        error instanceof Error ? error.message : "Failed to load settings",
      );
      throw error;
    } finally {
      setUserSettingsLoading(false);
    }
  }

  async updateSettings(settings: Record<string, unknown>) {
    try {
      const updatedSettings =
        await trpcClient.userSettings.updateSettings.mutate({
          settings,
        });
      setUserSettings(updatedSettings);
      return updatedSettings;
    } catch (error) {
      console.error("Failed to update user settings:", error);
      setUserSettingsError(
        error instanceof Error ? error.message : "Failed to update settings",
      );
      throw error;
    }
  }

  async updateProviders(providers: UserSettings["providers"]) {
    return this.updateSettings({ providers });
  }

  async setWorkspaceDirectory(
    workspaceDirectory: string,
  ): Promise<UserSettings> {
    try {
      const updatedSettings =
        await trpcClient.userSettings.setWorkspaceDirectory.mutate({
          workspaceDirectory,
        });
      setUserSettings(updatedSettings);
      return updatedSettings;
    } catch (error) {
      console.error("Failed to set workspace directory:", error);
      setUserSettingsError(
        error instanceof Error
          ? error.message
          : "Failed to set workspace directory",
      );
      throw error;
    }
  }

  async getWorkspaceDirectory(): Promise<string | null> {
    try {
      return await trpcClient.userSettings.getWorkspaceDirectory.query();
    } catch (error) {
      console.error("Failed to get workspace directory:", error);
      throw error;
    }
  }

  async setupWorkspaceDirectory(): Promise<UserSettings | null> {
    try {
      console.log("Setting up workspace directory");

      // Open folder selection dialog
      const workspaceDirectory = await window.api.showOpenDialog();
      if (!workspaceDirectory) {
        console.log("Workspace directory selection cancelled");
        return null;
      }

      // Set the workspace directory
      const updatedSettings =
        await this.setWorkspaceDirectory(workspaceDirectory);
      console.log("Workspace directory set:", workspaceDirectory);

      return updatedSettings;
    } catch (error) {
      console.error("Failed to setup workspace directory:", error);
      setUserSettingsError(
        error instanceof Error
          ? error.message
          : "Failed to setup workspace directory",
      );
      throw error;
    }
  }

  async setProviderApiKey(
    provider: string,
    apiKey: string,
    enabled = true,
  ): Promise<UserSettings> {
    try {
      const updatedSettings =
        await trpcClient.userSettings.setProviderApiKey.mutate({
          provider,
          apiKey,
          enabled,
        });
      setUserSettings(updatedSettings);
      return updatedSettings;
    } catch (error) {
      console.error(`Failed to set ${provider} API key:`, error);
      setUserSettingsError(
        error instanceof Error
          ? error.message
          : `Failed to set ${provider} API key`,
      );
      throw error;
    }
  }

  async getProviderApiKey(provider: string): Promise<string | null> {
    try {
      return await trpcClient.userSettings.getProviderApiKey.query({
        provider,
      });
    } catch (error) {
      console.error(`Failed to get ${provider} API key:`, error);
      throw error;
    }
  }

  async clearProviderApiKey(provider: string): Promise<UserSettings> {
    try {
      const updatedSettings =
        await trpcClient.userSettings.clearProviderApiKey.mutate({
          provider,
        });
      setUserSettings(updatedSettings);
      return updatedSettings;
    } catch (error) {
      console.error(`Failed to clear ${provider} API key:`, error);
      setUserSettingsError(
        error instanceof Error
          ? error.message
          : `Failed to clear ${provider} API key`,
      );
      throw error;
    }
  }
}

export const userSettingsService = new UserSettingsService();
