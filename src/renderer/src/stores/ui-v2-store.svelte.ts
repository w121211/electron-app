// src/renderer/src/stores/ui-v2-store.svelte.ts

export type CenterPanelView = "inbox" | "settings" | "projects";

interface UiV2State {
  quickLauncherOpen: boolean;
  centerPanelView: CenterPanelView;
}

export const uiV2State: UiV2State = $state({
  quickLauncherOpen: false,
  centerPanelView: "inbox",
});

export function toggleQuickLauncher(): void {
  uiV2State.quickLauncherOpen = !uiV2State.quickLauncherOpen;
}

export function closeQuickLauncher(): void {
  uiV2State.quickLauncherOpen = false;
}

export function openQuickLauncher(): void {
  uiV2State.quickLauncherOpen = true;
}

export function setCenterPanelView(view: CenterPanelView): void {
  uiV2State.centerPanelView = view;
}

export function closeAllOverlays(): void {
  uiV2State.quickLauncherOpen = false;
}
