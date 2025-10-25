// src/core/services/surface-launcher/os/macos.ts
import { spawnSync } from "child_process";
import focusChromeAppleScriptTemplate from "../scripts/focus-chrome.applescript?raw";
import focusSafariAppleScriptTemplate from "../scripts/focus-safari.applescript?raw";

const DEFAULT_BROWSER_APP = "Google Chrome";

export interface FocusMacBrowserOptions {
  url: string;
  browserApp?: string;
}

export interface FocusMacBrowserResult {
  success: boolean;
  browserApp: string;
}

export function focusMacBrowserTab({
  url,
  browserApp = DEFAULT_BROWSER_APP,
}: FocusMacBrowserOptions): FocusMacBrowserResult {
  const isSafari = browserApp.toLowerCase().includes("safari");
  const template = isSafari
    ? focusSafariAppleScriptTemplate
    : focusChromeAppleScriptTemplate;

  const script = template
    .replaceAll("{{TARGET_URL}}", url)
    .replaceAll("{{BROWSER_NAME}}", browserApp);

  const result = spawnSync("osascript", ["-e", script], {
    stdio: "pipe",
    encoding: "utf8",
  });

  return { success: result.status === 0, browserApp };
}
