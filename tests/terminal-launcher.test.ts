// tests/terminal-launcher.test.ts
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";

const terminalMocks = vi.hoisted(() => {
  const readFileSyncMock = vi.fn((path: any) => {
    const pathStr = path.toString();
    if (pathStr.includes('launch-iterm.applescript')) {
      return 'tell application "iTerm" to activate {{SESSION_TITLE}} from {{CWD}} running "{{FULL_COMMAND}}"';
    }
    if (pathStr.includes('launch-terminal.applescript')) {
      return 'tell application "Terminal" to activate {{SESSION_TITLE}} from {{CWD}} running "{{FULL_COMMAND}}"';
    }
    return '';
  });

  return {
    spawnMock: vi.fn(),
    spawnSyncMock: vi.fn(),
    focusWindowsWindowByTitleMock: vi.fn(),
    focusLinuxWindowByTitleMock: vi.fn(),
    readFileSyncMock,
  };
});

vi.mock("node:fs", () => ({
  readFileSync: terminalMocks.readFileSyncMock,
}));

vi.mock("../src/core/services/surface-launcher/os/windows.js", () => ({
  focusWindowsWindowByTitle: terminalMocks.focusWindowsWindowByTitleMock,
}));

vi.mock("../src/core/services/surface-launcher/os/linux.js", () => ({
  focusLinuxWindowByTitle: terminalMocks.focusLinuxWindowByTitleMock,
}));

vi.mock("child_process", () => ({
  spawn: terminalMocks.spawnMock,
  spawnSync: terminalMocks.spawnSyncMock,
}));

import * as terminalLauncher from "../src/core/services/surface-launcher/terminal-launcher.js";

const {
  spawnMock,
  spawnSyncMock,
  focusWindowsWindowByTitleMock,
  focusLinuxWindowByTitleMock,
} = terminalMocks;

const { getCommandForModel, launchTerminalFromConfig, launchTerminal } =
  terminalLauncher;

function createChildProcessStub(pid: number = 4321): any {
  return {
    pid,
    on: vi.fn().mockReturnThis(),
    unref: vi.fn(),
  };
}

function mockPlatform(platform: NodeJS.Platform): () => void {
  const platformSpy = vi.spyOn(process, "platform", "get").mockReturnValue(
    platform,
  );
  return () => platformSpy.mockRestore();
}

beforeEach(() => {
  vi.clearAllMocks();
  spawnMock.mockReset();
  spawnSyncMock.mockReset();
  focusWindowsWindowByTitleMock.mockReset();
  focusLinuxWindowByTitleMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getCommandForModel", () => {
  it("returns command configuration when model is known and has a command", () => {
    expect(getCommandForModel("cli/claude")).toEqual({
      command: "claude",
      args: [],
    });
  });

  it("returns undefined for terminal model without a command", () => {
    expect(getCommandForModel("cli/debug")).toBeUndefined();
  });

  it("returns undefined for unknown model ids", () => {
    expect(getCommandForModel("cli/unknown")).toBeUndefined();
  });
});

describe("launchTerminalFromConfig", () => {
  it("returns an error when model configuration is missing", () => {
    const result = launchTerminalFromConfig({
      modelId: "cli/unknown",
      workingDirectory: "/tmp/project",
      sessionId: "session-1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid terminal model: cli/unknown");
  });

  it("launches using resolved command when model configuration exists", () => {
    const restorePlatform = mockPlatform("darwin");
    spawnSyncMock.mockReturnValue({ status: 0 });

    const result = launchTerminalFromConfig({
      modelId: "cli/claude",
      workingDirectory: "/tmp/project",
      macOSTerminal: "terminal",
      sessionId: "session-2",
    });

    expect(spawnSyncMock).toHaveBeenCalledWith(
      "osascript",
      [
        "-e",
        expect.stringContaining("/tmp/project"),
      ],
      { stdio: "ignore" },
    );

    expect(result).toEqual({
      success: true,
      message: "Activated Terminal session",
    });

    restorePlatform();
  });
});

describe("launchTerminal", () => {
  it("uses AppleScript to activate iTerm on macOS when invocation succeeds", () => {
    spawnSyncMock.mockReturnValue({ status: 0 });
    const restorePlatform = mockPlatform("darwin");

    const result = launchTerminal(
      "claude",
      ["--verbose"],
      "/Users/dev/project",
      "iterm",
      "Session Alpha",
    );

    expect(result).toEqual({
      success: true,
      message: "Activated iTerm session",
    });

    expect(spawnSyncMock).toHaveBeenCalledWith(
      "osascript",
      [
        "-e",
        expect.stringContaining("/Users/dev/project"),
      ],
      { stdio: "ignore" },
    );

    restorePlatform();
  });

  it("returns error when AppleScript exits with failure on macOS", () => {
    spawnSyncMock.mockReturnValue({ status: 1 });
    const restorePlatform = mockPlatform("darwin");

    const result = launchTerminal(
      "claude",
      [],
      "/Users/dev/project",
      "terminal",
      "session",
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "Terminal AppleScript exited with code 1",
    );

    restorePlatform();
  });

  it("focuses existing terminal on Windows when window title matches", () => {
    focusWindowsWindowByTitleMock.mockReturnValue(true);
    const restorePlatform = mockPlatform("win32");

    const result = launchTerminal(
      "claude",
      [],
      "C:\\project",
      "iterm",
      "Session Beta",
    );

    expect(result).toEqual({
      success: true,
      state: "focused",
      message: "Focused existing Windows terminal window",
    });

    expect(focusWindowsWindowByTitleMock).toHaveBeenCalledWith(
      "AI Chat Session-Beta",
    );
    expect(spawnMock).not.toHaveBeenCalled();

    restorePlatform();
  });

  it("spawns a new Command Prompt when Windows focus attempt fails", () => {
    focusWindowsWindowByTitleMock.mockReturnValue(false);
    spawnMock.mockReturnValue(createChildProcessStub(2468));
    const restorePlatform = mockPlatform("win32");

    const result = launchTerminal(
      "claude",
      ["--debug"],
      "C:\\project",
      "iterm",
      "Session Gamma",
    );

    expect(result.success).toBe(true);
    expect(result.pid).toBe(2468);
    expect(result.state).toBe("launched");

    expect(spawnMock).toHaveBeenCalledWith(
      "cmd",
      [
        "/c",
        "start",
        "",
        "cmd",
        "/k",
        expect.stringContaining("title AI Chat Session-Gamma"),
      ],
      { detached: true, stdio: "ignore" },
    );

    restorePlatform();
  });

  it("focuses existing terminal on Linux when window title matches", () => {
    focusLinuxWindowByTitleMock.mockReturnValue(true);
    const restorePlatform = mockPlatform("linux");

    const result = launchTerminal(
      "claude",
      [],
      "/home/dev/project",
      "iterm",
      "Session Delta",
    );

    expect(result).toEqual({
      success: true,
      state: "focused",
      message: "Focused existing Linux terminal window",
    });

    expect(focusLinuxWindowByTitleMock).toHaveBeenCalledWith(
      "AI Chat Session-Delta",
    );

    restorePlatform();
  });

  it("launches gnome-terminal on Linux when no existing window can be focused", () => {
    focusLinuxWindowByTitleMock.mockReturnValue(false);
    spawnMock.mockReturnValue(createChildProcessStub(1357));
    const restorePlatform = mockPlatform("linux");

    const result = launchTerminal(
      "claude",
      ["--inspect"],
      "/home/dev/project",
      "iterm",
      "Session Epsilon",
    );

    expect(result.success).toBe(true);
    expect(result.state).toBe("launched");
    expect(result.pid).toBe(1357);

    expect(spawnMock).toHaveBeenCalledWith(
      "gnome-terminal",
      [
        "--title",
        "AI Chat Session-Epsilon",
        "--working-directory",
        "/home/dev/project",
        "--",
        "bash",
        "-c",
        "claude --inspect",
      ],
      { detached: true, stdio: "ignore" },
    );

    restorePlatform();
  });
});
