// tests/e2e/quick-prompt-app.e2e.spec.ts
import { test, expect, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.describe("QuickPromptApp E2E", () => {
  let electronApp: ElectronApplication;
  let mainWindow: Page;
  let quickPromptWindow: Page | undefined;

  test.beforeAll(async () => {
    // Launch Electron app
    electronApp = await electron.launch({
      args: ["."],
      env: {
        ...process.env,
        // NODE_ENV: "development",
      },
    });

    // Wait for initial window load and assign it
    mainWindow = await electronApp.firstWindow();
  });

  test.afterAll(async () => {
    await electronApp?.close();
  });

  // Test to ensure the window opens correctly
  test("should open the Quick Prompt window", async () => {
    // Use the preload API to show the window, which is the correct, user-like way.
    await mainWindow.evaluate(async () => {
      (window as any).api.quickPromptWindow.show();
    });

    // Wait for the new window to appear and get a handle on it.
    quickPromptWindow = await electronApp.waitForEvent("window", {
      predicate: (page) => {
        // console.log(page.url());
        return page.url().includes("quick-prompt");
      },
    });

    // Expect the window to have the correct URL
    expect(quickPromptWindow.url()).toContain("quick-prompt");
    await quickPromptWindow.waitForLoadState("domcontentloaded");

    // Expect the window to be visible
    await expect(quickPromptWindow.locator("body")).toBeVisible();
  });

  test("should generate prompt from user input", async () => {
    // Ensure the window is available from the previous test
    if (!quickPromptWindow) {
      test.skip();
      return;
    }

    // Find the textarea and type into it
    const textarea = quickPromptWindow.locator("textarea");
    await expect(textarea).toBeVisible();
    const userInput = "write a function to calculate fibonacci numbers";
    await textarea.fill(userInput);
    await expect(textarea).toHaveValue(userInput);

    // Find and click the "Generate prompt" button
    const generateButton = quickPromptWindow.locator(
      'button[title="Generate prompt"]',
    );
    await expect(generateButton).toBeVisible();
    await generateButton.click();

    // Wait for the success status message, giving it a generous timeout
    const successMessage = quickPromptWindow.locator(
      "text=Prompt generated successfully.",
    );
    await expect(successMessage).toBeVisible({ timeout: 30000 });

    // Verify that the textarea now contains the generated content
    const generatedContent = await textarea.inputValue();
    expect(generatedContent).toContain("<!-- raw prompt");
    expect(generatedContent).toContain(userInput);
    expect(generatedContent.length).toBeGreaterThan(userInput.length);
  });

  test("should show error when generating with empty input", async () => {
    if (!quickPromptWindow) {
      test.skip();
      return;
    }

    const textarea = quickPromptWindow.locator("textarea");
    await textarea.fill("");

    const generateButton = quickPromptWindow.locator(
      'button[title="Generate prompt"]',
    );
    await generateButton.click();

    const errorMessage = quickPromptWindow.locator(
      "text=Enter a description to generate a prompt.",
    );
    await expect(errorMessage).toBeVisible();
  });

  test("should copy generated prompt to clipboard", async () => {
    if (!quickPromptWindow) {
      test.skip();
      return;
    }

    const textarea = quickPromptWindow.locator("textarea");
    const testContent = "Test prompt for clipboard";
    await textarea.fill(testContent);

    const copyButton = quickPromptWindow.locator('button[title="Copy prompt"]');
    await copyButton.click();

    const successMessage = quickPromptWindow.locator(
      "text=Prompt copied to clipboard.",
    );
    await expect(successMessage).toBeVisible();

    // Verify clipboard content
    const clipboardContent = await mainWindow.evaluate(async () => {
      return await navigator.clipboard.readText();
    });
    expect(clipboardContent).toBe(testContent);
  });

  test("should show error when launching chat with empty input", async () => {
    if (!quickPromptWindow) {
      test.skip();
      return;
    }

    const textarea = quickPromptWindow.locator("textarea");
    await textarea.fill("");

    const sendButton = quickPromptWindow.locator('button[title="Launch chat"]');
    await sendButton.click();

    const errorMessage = quickPromptWindow.locator(
      "text=Enter a prompt or use voice input before launching.",
    );
    await expect(errorMessage).toBeVisible();
  });
});
