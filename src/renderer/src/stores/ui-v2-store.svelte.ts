// src/renderer/src/stores/ui-v2-store.svelte.ts
import type { ModelConfig, ModelId } from "../../../core/utils/model-utils-v2.js";

export type CenterPanelView = "inbox" | "settings" | "projects";

interface UiV2State {
  quickLauncherOpen: boolean;
  centerPanelView: CenterPanelView;
  availableModels: ModelConfig[];
  selectedModel: ModelId | null;
}

export const uiV2State: UiV2State = $state({
  quickLauncherOpen: false,
  centerPanelView: "inbox",
  availableModels: [],
  selectedModel: "cli:codex",
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

export function setAvailableModels(models: ModelConfig[]): void {
  uiV2State.availableModels = models;
}

export function setSelectedModel(modelId: ModelId): void {
  uiV2State.selectedModel = modelId;
}
