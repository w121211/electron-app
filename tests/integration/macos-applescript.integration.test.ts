// tests/integration/macos-applescript.integration.test.ts
import { describe, it, expect } from "vitest";

describe("macOS AppleScript Integration", () => {
  describe("focusMacBrowserTab", () => {
    it("should execute AppleScript to focus browser tab", async () => {
      // Skip this test on non-macOS platforms
      if (process.platform !== "darwin") {
        console.log("Skipping macOS-specific test on", process.platform);
        return;
      }

      const { focusMacBrowserTab } = await import(
        "../../src/core/services/surface-launcher/os/macos.js"
      );

      const result = focusMacBrowserTab({
        url: "https://claude.ai",
        browserApp: "Google Chrome",
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("browserApp", "Google Chrome");
    });

    // it("should handle AppleScript execution with Safari", async () => {
    //   // Skip this test on non-macOS platforms
    //   if (process.platform !== "darwin") {
    //     console.log("Skipping macOS-specific test on", process.platform);
    //     return;
    //   }

    //   const { focusMacBrowserTab } = await import(
    //     "../../src/core/services/surface-launcher/os/macos.js"
    //   );

    //   const result = focusMacBrowserTab({
    // url: "https://example.com",
    //     browserApp: "Safari",
    //   });

    //   expect(result).toBeDefined();
    //   expect(result).toHaveProperty("success", true);
    //   expect(result).toHaveProperty("browserApp", "Safari");
    // });

    // it("should use default browser when not specified", async () => {
    //   // Skip this test on non-macOS platforms
    //   if (process.platform !== "darwin") {
    //     console.log("Skipping macOS-specific test on", process.platform);
    //     return;
    //   }

    //   const { focusMacBrowserTab } = await import(
    //     "../../src/core/services/surface-launcher/os/macos.js"
    //   );

    //   const result = focusMacBrowserTab({
    //     url: "https://google.com",
    //   });

    //   expect(result).toBeDefined();
    //   expect(result).toHaveProperty("success", true);
    //   expect(result).toHaveProperty("browserApp", "Google Chrome");
    // });

    // it("should handle different URL formats", async () => {
    //   // Skip this test on non-macOS platforms
    //   if (process.platform !== "darwin") {
    //     console.log("Skipping macOS-specific test on", process.platform);
    //     return;
    //   }

    //   const { focusMacBrowserTab } = await import(
    //     "../../src/core/services/surface-launcher/os/macos.js"
    //   );

    //   const urls = [
    //     "https://claude.ai/chat",
    //     "http://localhost:3000",
    //     "https://github.com/user/repo",
    //   ];

    //   for (const url of urls) {
    //     const result = focusMacBrowserTab({
    //       url,
    //       browserApp: "Google Chrome",
    //     });

    //     expect(result).toBeDefined();
    //     expect(result).toHaveProperty("success", true);
    //   }
    // });
  });
});
