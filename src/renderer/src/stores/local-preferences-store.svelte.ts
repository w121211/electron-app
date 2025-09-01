// src/renderer/src/stores/local-preferences-store.svelte.ts

import type { ChatMode } from "../../../core/services/chat-engine/chat-session-repository.js";

interface PreferenceSchema {
  chatMode: ChatMode;
  selectedModel: string;
}

type PreferenceKey = keyof PreferenceSchema;

/**
 * Get preference value from localStorage
 */
export function getPreference<K extends PreferenceKey>(
  key: K
): PreferenceSchema[K] | null {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(key);
  return value ? JSON.parse(value) : null;
}

/**
 * Set preference value in localStorage  
 */
export function setPreference<K extends PreferenceKey>(
  key: K,
  value: PreferenceSchema[K]
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}
