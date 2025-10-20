// tests/integration/xterm-window.integration.test.ts
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { createMainProcessContext } from "../../src/main/context";
import { registerXtermWindowHandlers } from "../../src/main/ipc/xterm-window";
import type { MainProcessContext } from "../../src/main/context";

// Mock the electron module using vi.hoisted to ensure it runs before imports
const electronMocks = vi.hoisted(() => {
  const mockBrowserWindow = vi.fn(() => ({
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    on: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: {
      openDevTools: vi.fn(),
    },
  }));

  return {
    BrowserWindow: mockBrowserWindow,
    ipcMain: {
      handle: vi.fn(),
    },
    app: {
      getPath: vi.fn().mockReturnValue("/mock/path"),
      isReady: vi.fn().mockReturnValue(true),
    },
  };
});

vi.mock("electron", () => electronMocks);

// Mock @electron-toolkit/utils to prevent it from importing electron
vi.mock("@electron-toolkit/utils", () => ({
  is: {
    dev: false,
  },
}));

// Import after mock is set up
const { BrowserWindow, ipcMain } = await import("electron");

describe("Xterm Window Integration Test", () => {
  let context: MainProcessContext;

  beforeEach(() => {
    // Provide mock dependencies for creating the context
    const mockPtyInstanceManager = {};
    const mockTrpcServer = {
      getPtyInstanceManager: () => mockPtyInstanceManager,
    };

    context = createMainProcessContext({
      trpcServer: mockTrpcServer as any,
      ptyInstanceManager: mockPtyInstanceManager as any,
      userDataDir: "/mock/user-data",
    });

    // Register the handlers on the mocked ipcMain
    registerXtermWindowHandlers(context);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should create a new BrowserWindow when 'xterm-window:launch' is invoked", () => {
    const sessionId = "test-session-123";

    // Find the handler function that was registered with ipcMain.handle
    const launchHandler = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === "xterm-window:launch",
    )?.[1];

    expect(launchHandler).toBeDefined();

    // Directly invoke the handler, simulating an IPC call from the renderer
    launchHandler({}, sessionId);

    // 1. Verify that a new BrowserWindow was created
    expect(BrowserWindow).toHaveBeenCalledTimes(1);

    // 2. Verify that the new window was added to our context for tracking
    expect(context.getXtermWindows()).toHaveLength(1);

    // 3. Verify that the window was loaded with the correct URL and session ID
    const mockBrowserWindowInstance = (BrowserWindow as unknown as Mock).mock
      .results[0].value;

    // In development, loadURL is used
    if (process.env["ELECTRON_RENDERER_URL"]) {
      expect(mockBrowserWindowInstance.loadURL).toHaveBeenCalledTimes(1);
      expect(mockBrowserWindowInstance.loadURL).toHaveBeenCalledWith(
        expect.stringContaining(
          `/windows/xterm-window/index.html#ptySessionId=${sessionId}`,
        ),
      );
    } else {
      // In production, loadFile is used
      expect(mockBrowserWindowInstance.loadFile).toHaveBeenCalledTimes(1);
      expect(mockBrowserWindowInstance.loadFile).toHaveBeenCalledWith(
        expect.any(String),
        { hash: `ptySessionId=${sessionId}` },
      );
    }
  });
});
