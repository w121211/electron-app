// src/core/services/surface-launcher/os/shared.ts
export function escapeForDoubleQuotedString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
