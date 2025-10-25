// tests/integration/surface-launcher.integration.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { spawn } from "child_process";
import { createSurfaceLauncher } from "../../src/core/services/surface-launcher/surface-launcher.js";

describe("Surface Launcher Integration", () => {
  let surfaceLauncher: ReturnType<typeof createSurfaceLauncher>;

  beforeEach(() => {
    surfaceLauncher = createSurfaceLauncher({
      openUrl: async (url: string) => {
        // Use platform-specific command to open URL
        const command =
          process.platform === "darwin"
            ? "open"
            : process.platform === "win32"
              ? "start"
              : "xdg-open";

        spawn(command, [url], {
          detached: true,
          stdio: "ignore",
        }).unref();
      },
    });
    vi.clearAllMocks();
  });

  describe("CLI Terminal Models", () => {
    it("should launch Claude CLI model", async () => {
      const result = await surfaceLauncher.launch({
        sessionId: "test-cli-claude",
        modelId: "cli/claude",
        projectPath: process.cwd(),
      });

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
    });

    it("should launch Gemini CLI model", async () => {
      const result = await surfaceLauncher.launch({
        sessionId: "test-cli-gemini",
        modelId: "cli/gemini",
        projectPath: process.cwd(),
      });

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
    });
  });

  describe("Web Browser Models", () => {
    it("should launch ChatGPT web model", async () => {
      const result = await surfaceLauncher.launch({
        sessionId: "test-web-chatgpt",
        modelId: "web/chatgpt",
        projectPath: null,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
    });

    it("should launch Claude web model", async () => {
      const result = await surfaceLauncher.launch({
        sessionId: "test-web-claude",
        modelId: "web/claude",
        projectPath: null,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    it("should return error for unknown model", async () => {
      const result = await surfaceLauncher.launch({
        sessionId: "test-unknown",
        modelId: "cli/unknown" as any,
        projectPath: process.cwd(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
