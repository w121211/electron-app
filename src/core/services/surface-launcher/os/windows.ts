// src/core/services/surface-launcher/os/windows.ts
import { spawnSync } from "child_process";
import { escapeForDoubleQuotedString } from "./shared.js";
import focusWindowPowerShellTemplate from "../scripts/focus-window.ps1?raw";

export function focusWindowsWindowByTitle(title: string): boolean {
  const safeTitle = escapeForDoubleQuotedString(title);
  const script = focusWindowPowerShellTemplate.replaceAll(
    "{{WINDOW_TITLE}}",
    safeTitle,
  );

  const result = spawnSync("powershell", ["-NoProfile", "-Command", script], {
    stdio: "ignore",
  });

  return result.status === 0;
}
