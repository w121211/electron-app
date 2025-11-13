// tests/renderer/light-prompt-editor.test.ts
import "svelte/register";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount } from "svelte";
import type { Prompt } from "../../src/core/services/prompt/prompt-types.js";

const createSessionMock = vi.fn();
const refreshInboxEntriesMock = vi.fn();
const updateInboxEntryMock = vi.fn();
const searchFilesMock = vi.fn().mockResolvedValue([]);
const surfaceLaunchMock = vi.fn();

vi.mock("../../src/renderer/src/lib/trpc-client.js", () => ({
  trpcClient: {
    chat: {
      createSession: {
        mutate: createSessionMock,
      },
    },
    projectFolder: {
      searchFiles: {
        query: searchFilesMock,
      },
    },
  },
}));

vi.mock("../../src/renderer/src/stores/inbox-store.svelte.js", () => ({
  updateInboxEntry: updateInboxEntryMock,
  refreshInboxEntries: refreshInboxEntriesMock,
}));

const toastMock = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

vi.mock("svelte-sonner", () => ({
  toast: toastMock,
}));

vi.mock("../../src/renderer/src/services/renderer-prompt-service.js", () => ({
  rendererPromptService: {
    updatePrompt: vi.fn(async (id: string, updates: any) => ({
      id,
      slug: null,
      content: updates.content ?? "",
      metadata: updates.metadata ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  },
}));

vi.mock("../../src/renderer/src/services/project-service.js", () => ({
  projectService: {
    addProjectFolder: vi.fn(),
  },
}));

vi.mock("../../src/renderer/src/services/quick-prompt-service.js", () => ({
  generatePrompt: vi.fn().mockResolvedValue({
    generatedPrompt: "Generated",
    session: null,
  }),
}));

const { default: LightPromptEditor } = await import(
  "../../src/renderer/src/components/app-v2/LightPromptEditor.svelte"
);
const { projectState } = await import(
  "../../src/renderer/src/stores/project-store.svelte.js"
);
const { uiV2State } = await import(
  "../../src/renderer/src/stores/ui-v2-store.svelte.js"
);

function createPrompt(): Prompt {
  const now = new Date();
  return {
    id: "prompt-1",
    slug: null,
    content: "Discuss testing strategies",
    metadata: {
      title: "Testing",
      modelId: "web:chatgpt",
      projectPath: "/tmp/project-a",
    },
    createdAt: now,
    updatedAt: now,
  };
}

function createSessionResponse() {
  const now = new Date();
  return {
    id: "session-web-1",
    modelSurface: "web",
    state: "active",
    messages: [],
    metadata: {
      projectPath: "/tmp/project-a",
      modelId: "web:chatgpt",
    },
    createdAt: now,
    updatedAt: now,
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("LightPromptEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchFilesMock.mockResolvedValue([]);
    createSessionMock.mockResolvedValue(createSessionResponse());
    refreshInboxEntriesMock.mockResolvedValue(undefined);
    surfaceLaunchMock.mockResolvedValue({ success: true });
    Object.defineProperty(window, "api", {
      value: {
        showOpenDialog: vi.fn().mockResolvedValue(null),
        quickPrompt: {
          selectFiles: vi.fn().mockResolvedValue([]),
          saveAudio: vi.fn().mockResolvedValue("/tmp/audio.webm"),
        },
        surface: {
          launch: surfaceLaunchMock,
        },
      },
      configurable: true,
      writable: true,
    });

    projectState.projectFolders = [
      { name: "Project A", path: "/tmp/project-a" },
    ];
    uiV2State.availableModels = [
      {
        modelId: "web:chatgpt",
        displayName: "ChatGPT Web",
        url: "https://chat.openai.com",
        enabled: true,
      },
    ];
    uiV2State.selectedModel = null;
    localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    projectState.projectFolders = [];
    uiV2State.availableModels = [];
    uiV2State.selectedModel = null;
  });

  it("launches a web chat session via the Send button", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const component = mount(LightPromptEditor as any, {
      target,
      props: { promptEntry: createPrompt() },
    });

    await flushMicrotasks();

    const sendButton = target.querySelector<HTMLButtonElement>(
      'button[title="Send Prompt"]',
    );
    expect(sendButton).not.toBeNull();

    sendButton?.click();

    await flushMicrotasks();

    expect(createSessionMock).toHaveBeenCalledWith({
      modelId: "web:chatgpt",
      title: "Testing",
      sourcePromptId: "prompt-1",
      workingDirectory: "/tmp/project-a",
      metadata: {
        projectPath: "/tmp/project-a",
        modelId: "web:chatgpt",
      },
    });

    expect(refreshInboxEntriesMock).toHaveBeenCalledWith({
      selectId: "session-web-1",
    });

    expect(surfaceLaunchMock).not.toHaveBeenCalled();

    await unmount(component as any);
    target.remove();
  });
});
