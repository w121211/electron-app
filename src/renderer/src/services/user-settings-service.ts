// apps/my-app-svelte/src/services/user-settings-service.ts
import { trpcClient } from '../lib/trpc-client.js';
import { 
  setUserSettings, 
  setUserSettingsLoading, 
  setUserSettingsError 
} from '../stores/user-settings-store.svelte.js';
import type { UserSettings } from '@repo/events-core/services/user-settings-repository';

export class UserSettingsService {
  async loadSettings() {
    setUserSettingsLoading(true);
    setUserSettingsError(null);
    
    try {
      const settings = await trpcClient.userSettings.getSettings.query();
      setUserSettings(settings);
      return settings;
    } catch (error) {
      console.error('Failed to load user settings:', error);
      setUserSettingsError(error instanceof Error ? error.message : 'Failed to load settings');
      throw error;
    } finally {
      setUserSettingsLoading(false);
    }
  }

  async updateSettings(settings: Record<string, unknown>) {
    try {
      const updatedSettings = await trpcClient.userSettings.updateSettings.mutate({
        settings
      });
      setUserSettings(updatedSettings);
      return updatedSettings;
    } catch (error) {
      console.error('Failed to update user settings:', error);
      setUserSettingsError(error instanceof Error ? error.message : 'Failed to update settings');
      throw error;
    }
  }

  async updateProviders(providers: UserSettings['providers']) {
    return this.updateSettings({ providers });
  }
}

export const userSettingsService = new UserSettingsService();