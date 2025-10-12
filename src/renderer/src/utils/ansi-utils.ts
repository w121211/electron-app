// src/renderer/src/utils/ansi-utils.ts

export function stripAnsi(payload: string): string {
  return payload.replace(/\x1b\[[0-9;:?]*[A-Za-z]/g, "");
}
