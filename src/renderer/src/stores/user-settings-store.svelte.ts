// apps/my-app-svelte/src/stores/user-settings-store.svelte.ts
import type { UserSettings } from '@repo/events-core/services/user-settings-repository';

interface UserSettingsState {
  settings: UserSettings;
  loading: boolean;
  error: string | null;
}

// User settings state - configuration and providers
export const userSettingsState = $state<UserSettingsState>({
  settings: {
    projectFolders: [],
    providers: {}
  },
  loading: false,
  error: null
});

// Internal store functions - used by service layer
// These handle only the state updates, not business logic

/**
 * Internal function to update user settings
 * Should be called by service layer, not directly by components
 */
export function setUserSettings(settings: UserSettings) {
  userSettingsState.settings = { ...settings };
  userSettingsState.error = null;
}

/**
 * Set loading state
 */
export function setUserSettingsLoading(loading: boolean) {
  userSettingsState.loading = loading;
}

/**
 * Set error state
 */
export function setUserSettingsError(error: string | null) {
  userSettingsState.error = error;
}

/**
 * Update providers configuration
 */
export function updateProviders(providers: UserSettings['providers']) {
  userSettingsState.settings.providers = { ...providers };
}