// src/renderer/src/stores/inbox-ui-store.svelte.ts

export const inboxUiState = $state({
  quickLauncherOpen: false,
  settingsPanelOpen: false,
});

export function toggleQuickLauncher(): void {
  inboxUiState.quickLauncherOpen = !inboxUiState.quickLauncherOpen;
}

export function closeQuickLauncher(): void {
  inboxUiState.quickLauncherOpen = false;
}

export function openQuickLauncher(): void {
  inboxUiState.quickLauncherOpen = true;
}

export function toggleSettings(): void {
  inboxUiState.settingsPanelOpen = !inboxUiState.settingsPanelOpen;
}

export function closeSettings(): void {
  inboxUiState.settingsPanelOpen = false;
}

export function openSettings(): void {
  inboxUiState.settingsPanelOpen = true;
}

export function closeAllOverlays(): void {
  inboxUiState.quickLauncherOpen = false;
  inboxUiState.settingsPanelOpen = false;
}
