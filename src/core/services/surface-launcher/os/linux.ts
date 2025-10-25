// src/core/services/surface-launcher/os/linux.ts
import { spawnSync } from "child_process";
import { readFileSync } from "node:fs";
import { escapeForDoubleQuotedString } from "./shared.js";

const focusWindowLinuxTemplate = readFileSync(
  new URL("../scripts/focus-window.sh", import.meta.url),
  "utf8",
);

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
