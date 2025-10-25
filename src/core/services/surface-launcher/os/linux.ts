// src/core/services/surface-launcher/os/linux.ts
import { spawnSync } from "child_process";
import { escapeForDoubleQuotedString } from "./shared.js";
import focusWindowLinuxTemplate from "../scripts/focus-window.sh?raw";

export function focusLinuxWindowByTitle(title: string): boolean {
  const safeTitle = escapeForDoubleQuotedString(title);
  const script = focusWindowLinuxTemplate.replaceAll(
    "{{WINDOW_TITLE}}",
    safeTitle,
  );

  const result = spawnSync("sh", ["-c", script], {
    stdio: "ignore",
  });

  return result.status === 0;
}
