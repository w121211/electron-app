// src/core/services/surface-launcher/os/windows.ts
import { spawnSync } from "child_process";
import { readFileSync } from "node:fs";
import { escapeForDoubleQuotedString } from "./shared.js";

const focusWindowPowerShellTemplate = readFileSync(
  new URL("../scripts/focus-window.ps1", import.meta.url),
  "utf8",
);

export function focusWindowsWindowByTitle(title: string): boolean {
  const safeTitle = escapeForDoubleQuotedString(title);
  const script = focusWindowPowerShellTemplate.replaceAll(
    "{{WINDOW_TITLE}}",
    safeTitle,
  );

  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-Command", script],
    { stdio: "ignore" },
  );

  return result.status === 0;
}
