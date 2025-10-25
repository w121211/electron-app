// src/renderer/src/stores/user-settings-store.svelte.ts
// import { DEFAULT_USER_SETTINGS } from "../../../core/services/user-settings-repository.js";
import type { UserSettings } from "../../../core/services/user-settings-repository.js";

interface UserSettingsState {
  settings: UserSettings | null;
  loading: boolean;
  error: string | null;
}

// User settings state - configuration and providers
export const userSettingsState = $state<UserSettingsState>({
  settings: null,
  loading: false,
  error: null,
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
export function updateProviders(providers: UserSettings["providers"]) {
  if (!userSettingsState.settings) {
    throw new Error("User settings not initialized");
  }
  userSettingsState.settings.providers = { ...providers };
}
