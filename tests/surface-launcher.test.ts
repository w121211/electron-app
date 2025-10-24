// tests/surface-launcher.test.ts
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import {
  SurfaceLauncher,
  createSurfaceLauncher,
} from "../src/core/services/surface-launcher/surface-launcher.js";
import * as modelUtils from '../src/core/utils/model-utils.js';

const surfaceMocks = vi.hoisted(() => ({
  launchTerminalFromConfigMock: vi.fn(),
  focusMacBrowserTabMock: vi.fn(),
  focusWindowsWindowByTitleMock: vi.fn(),
  focusLinuxWindowByTitleMock: vi.fn(),
}));

vi.mock("../src/core/services/surface-launcher/terminal-launcher.js", () => ({
  launchTerminalFromConfig: surfaceMocks.launchTerminalFromConfigMock,
}));

vi.mock("../src/core/services/surface-launcher/os/macos.js", () => ({
  focusMacBrowserTab: surfaceMocks.focusMacBrowserTabMock,
}));

vi.mock("../src/core/services/surface-launcher/os/windows.js", () => ({
  focusWindowsWindowByTitle: surfaceMocks.focusWindowsWindowByTitleMock,
}));

vi.mock("../src/core/services/surface-launcher/os/linux.js", () => ({
  focusLinuxWindowByTitle: surfaceMocks.focusLinuxWindowByTitleMock,
}));

const {
  launchTerminalFromConfigMock,
  focusMacBrowserTabMock,
  focusWindowsWindowByTitleMock,
  focusLinuxWindowByTitleMock,
} = surfaceMocks;

function mockPlatform(platform: NodeJS.Platform): () => void {
  const platformSpy = vi.spyOn(process, "platform", "get").mockReturnValue(
    platform,
  );
  return () => platformSpy.mockRestore();
}

function stubWebModel({
  url,
  windowTitle,
}: {
  url: string | null;
  windowTitle?: string | null;
}): () => void {
  const urlSpy = vi
    .spyOn(modelUtils, "getWebModelUrl")
    .mockReturnValue(url ?? null);
  const titleSpy = vi
    .spyOn(modelUtils, "getWebModelWindowTitle")
    .mockReturnValue(windowTitle ?? null);
  return () => {
    urlSpy.mockRestore();
    titleSpy.mockRestore();
  };
}

let openUrlMock: ReturnType<typeof vi.fn>;
let launcher: SurfaceLauncher;

beforeEach(() => {
  openUrlMock = vi.fn().mockResolvedValue(undefined);
  launcher = createSurfaceLauncher({ openUrl: openUrlMock });
  launchTerminalFromConfigMock.mockReset();
  focusMacBrowserTabMock.mockReset();
  focusWindowsWindowByTitleMock.mockReset();
  focusLinuxWindowByTitleMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SurfaceLauncher", () => {
  it("returns early for API surfaces", async () => {
    const result = await launcher.launch({
      sessionId: "session-1",
      modelId: "openai/gpt-4o",
      surface: "api",
    });

    expect(result).toEqual({
      success: true,
      message: "No surface launch required.",
    });
  });

  it("requires a project path for terminal surfaces", async () => {
    const result = await launcher.launch({
      sessionId: "session-2",
      modelId: "cli/claude",
      surface: "terminal",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "Terminal models require a project directory.",
    );
    expect(launchTerminalFromConfigMock).not.toHaveBeenCalled();
  });

  it("delegates to terminal launcher when configuration is valid", async () => {
    launchTerminalFromConfigMock.mockReturnValue({
      success: true,
      pid: 12345,
      state: "launched",
    });

    const result = await launcher.launch({
      sessionId: "session-3",
      modelId: "cli/claude",
      surface: "terminal",
      projectPath: "/tmp/project",
    });

    expect(launchTerminalFromConfigMock).toHaveBeenCalledWith({
      modelId: "cli/claude",
      workingDirectory: "/tmp/project",
      sessionId: "session-3",
    });

    expect(result).toEqual({
      success: true,
      pid: 12345,
      message: "Launched terminal surface.",
    });
  });

  it("returns error when no launch URL exists for web surfaces", async () => {
    const restoreWebModel = stubWebModel({
      url: null,
    });

    const result = await launcher.launch({
      sessionId: "session-4",
      modelId: "web/claude",
      surface: "web",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "No launch URL configured for model web/claude.",
    );

    restoreWebModel();
  });

  it("focuses macOS browser tab when AppleScript succeeds", async () => {
    const restorePlatform = mockPlatform("darwin");
    const restoreWebModel = stubWebModel({
      url: "https://example.com",
    });
    focusMacBrowserTabMock.mockReturnValue({
      success: true,
      browserApp: "Safari",
    });

    const result = await launcher.launch({
      sessionId: "session-5",
      modelId: "web/claude",
      surface: "web",
    });

    expect(focusMacBrowserTabMock).toHaveBeenCalledWith({
      url: "https://example.com",
    });
    expect(result).toEqual({
      success: true,
      message: "Focused browser tab.",
    });
    expect(openUrlMock).not.toHaveBeenCalled();

    restoreWebModel();
    restorePlatform();
  });

  it("falls back to openUrl on macOS when browser focus fails", async () => {
    const restorePlatform = mockPlatform("darwin");
    const restoreWebModel = stubWebModel({
      url: "https://example.com",
    });
    focusMacBrowserTabMock.mockReturnValue({
      success: false,
      browserApp: "Safari",
    });

    const result = await launcher.launch({
      sessionId: "session-6",
      modelId: "web/claude",
      surface: "web",
    });

    expect(openUrlMock).toHaveBeenCalledWith("https://example.com");
    expect(result).toEqual({
      success: true,
      message: "Opened browser window.",
    });

    restoreWebModel();
    restorePlatform();
  });

  it("focuses Windows browser window when title matches", async () => {
    const restorePlatform = mockPlatform("win32");
    const restoreWebModel = stubWebModel({
      url: "https://example.com",
      windowTitle: "ChatGPT",
    });
    focusWindowsWindowByTitleMock.mockReturnValue(true);

    const result = await launcher.launch({
      sessionId: "session-7",
      modelId: "web/chatgpt",
      surface: "web",
    });

    expect(focusWindowsWindowByTitleMock).toHaveBeenCalledWith("ChatGPT");
    expect(result).toEqual({
      success: true,
      message: "Focused browser window.",
    });
    expect(openUrlMock).not.toHaveBeenCalled();

    restoreWebModel();
    restorePlatform();
  });

  it("opens browser when Windows focus attempt fails", async () => {
    const restorePlatform = mockPlatform("win32");
    const restoreWebModel = stubWebModel({
      url: "https://example.com",
      windowTitle: "ChatGPT",
    });
    focusWindowsWindowByTitleMock.mockReturnValue(false);

    const result = await launcher.launch({
      sessionId: "session-8",
      modelId: "web/chatgpt",
      surface: "web",
    });

    expect(focusWindowsWindowByTitleMock).toHaveBeenCalledWith("ChatGPT");
    expect(openUrlMock).toHaveBeenCalledWith("https://example.com");
    expect(result).toEqual({
      success: true,
      message: "Opened browser window.",
    });

    restoreWebModel();
    restorePlatform();
  });

  it("focuses Linux browser window when title matches", async () => {
    const restorePlatform = mockPlatform("linux");
    const restoreWebModel = stubWebModel({
      url: "https://example.com",
      windowTitle: "Claude",
    });
    focusLinuxWindowByTitleMock.mockReturnValue(true);

    const result = await launcher.launch({
      sessionId: "session-9",
      modelId: "web/claude",
      surface: "web",
    });

    expect(focusLinuxWindowByTitleMock).toHaveBeenCalledWith("Claude");
    expect(result).toEqual({
      success: true,
      message: "Focused browser window.",
    });
    expect(openUrlMock).not.toHaveBeenCalled();

    restoreWebModel();
    restorePlatform();
  });

  it("uses openUrl fallback on Linux when window focus fails", async () => {
    const restorePlatform = mockPlatform("linux");
    const restoreWebModel = stubWebModel({
      url: "https://example.com",
      windowTitle: "Claude",
    });
    focusLinuxWindowByTitleMock.mockReturnValue(false);

    const result = await launcher.launch({
      sessionId: "session-10",
      modelId: "web/claude",
      surface: "web",
    });

    expect(focusLinuxWindowByTitleMock).toHaveBeenCalledWith("Claude");
    expect(openUrlMock).toHaveBeenCalledWith("https://example.com");
    expect(result).toEqual({
      success: true,
      message: "Opened browser window.",
    });

    restoreWebModel();
    restorePlatform();
  });

  it("returns error when openUrl callback rejects", async () => {
    const restorePlatform = mockPlatform("linux");
    const restoreWebModel = stubWebModel({
      url: "https://example.com",
    });
    focusLinuxWindowByTitleMock.mockReturnValue(false);
    openUrlMock.mockRejectedValue(new Error("Failed to open browser"));

    const result = await launcher.launch({
      sessionId: "session-11",
      modelId: "web/claude",
      surface: "web",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to open browser");

    restoreWebModel();
    restorePlatform();
  });
});
