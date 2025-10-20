// src/core/services/surface-launcher/os/macos.ts
import { spawnSync } from "child_process";
import focusBrowserAppleScriptTemplate from "../scripts/focus-browser.applescript?raw";

export interface FocusMacBrowserOptions {
  url: string;
  browserApp?: string;
}

export interface FocusMacBrowserResult {
  success: boolean;
  browserApp: string;
}

const DEFAULT_BROWSER_APP = "Google Chrome";

export function focusMacBrowserTab({
  url,
  browserApp = DEFAULT_BROWSER_APP,
}: FocusMacBrowserOptions): FocusMacBrowserResult {
  const script = focusBrowserAppleScriptTemplate
    .replaceAll("{{TARGET_URL}}", url)
    .replaceAll("{{BROWSER_NAME}}", browserApp);

  const result = spawnSync("osascript", ["-e", script], {
    stdio: "ignore",
  });

  return { success: result.status === 0, browserApp };
}
