// tests/unit/prompt-script-service.test.ts

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { EventBus } from "../../src/core/event-bus.js";
import {
  type ChatSessionData,
  type ChatSessionRepository,
} from "../../src/core/services/chat/chat-session-repository.js";
import { PromptScriptRepository } from "../../src/core/services/prompt-script/prompt-script-repository.js";
import { PromptScriptService } from "../../src/core/services/prompt-script/prompt-script-service.js";
import { ApiChatClient } from "../../src/core/services/chat-engine/api-chat-client.js";
import type { ToolRegistry } from "../../src/core/services/tool-call/tool-registry.js";
import { TerminalChatClient } from "../../src/core/services/external-chat/terminal-chat-client.js";
import { WebChatClient } from "../../src/core/services/external-chat/web-chat-client.js";

class InMemoryChatSessionRepository implements ChatSessionRepository {
  private readonly sessions = new Map<string, ChatSessionData>();

  async create(session: ChatSessionData): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async update(session: ChatSessionData): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async getById(sessionId: string): Promise<ChatSessionData | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async list(): Promise<ChatSessionData[]> {
    return Array.from(this.sessions.values());
  }

  async findByScriptPath(scriptPath: string): Promise<ChatSessionData | null> {
    const resolved = path.resolve(scriptPath);
    for (const session of this.sessions.values()) {
      if (session.scriptPath && path.resolve(session.scriptPath) === resolved) {
        return session;
      }
    }
    return null;
  }

  async findByScriptHash(scriptHash: string): Promise<ChatSessionData[]> {
    if (!scriptHash) {
      return [];
    }
    return Array.from(this.sessions.values()).filter(
      (session) => session.scriptHash === scriptHash,
    );
  }
}

function createToolRegistryStub(): ToolRegistry {
  return {
    registerTool() {},
    async registerMCPServer() {},
    getToolSet: () => ({}),
    getToolSetByNames: () => ({}),
    isBuiltInTool: () => false,
    isMCPTool: () => false,
    getTool: () => undefined,
    getMCPTool: () => undefined,
    getAllTools: () => new Map(),
    getToolMetadata: () => undefined,
    checkToolsHealth: () => ({
      totalTools: 0,
      healthyTools: 0,
      unhealthyTools: 0,
      mcpServers: { total: 0, healthy: 0, unhealthy: 0 },
      details: new Map(),
    }),
  };
}

describe("PromptScriptService.createLinkedChatSession", () => {
  let tempDir: string;
  let repository: InMemoryChatSessionRepository;
  let eventBus: EventBus;
  let apiChatClient: ApiChatClient;
  let terminalChatClient: TerminalChatClient;
  let webChatClient: WebChatClient;
  let promptScriptRepo: PromptScriptRepository;
  let service: PromptScriptService;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "prompt-script-service-"));
    repository = new InMemoryChatSessionRepository();
    eventBus = new EventBus({ environment: "server" });
    apiChatClient = new ApiChatClient({
      repository,
      eventBus,
      toolRegistry: createToolRegistryStub(),
    });
    terminalChatClient = new TerminalChatClient(eventBus, repository);
    webChatClient = new WebChatClient(eventBus, repository);
    promptScriptRepo = new PromptScriptRepository();
    service = new PromptScriptService({
      promptScriptRepo,
      chatSessionRepo: repository,
      apiChatClient,
      terminalChatClient,
      webChatClient,
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates and links an API chat session using script metadata", async () => {
    const scriptPath = path.join(tempDir, "api-session.prompt.md");
    const scriptContent = `---
title: API Prompt
modelId: api/test:demo-model
---

Hello from prompt script.
`;
    const promptScript = await promptScriptRepo.create(scriptPath, scriptContent);

    const linked = await service.createLinkedChatSession({
      scriptPath: promptScript.absolutePath,
      modelId: "api/test:demo-model",
      title: "API Prompt Session",
    });

    expect(linked.chatSession).not.toBeNull();
    expect(linked.chatSession.modelSurface).toBe("api");
    expect(linked.chatSession.scriptPath).toBe(promptScript.absolutePath);
    expect(linked.chatSession.scriptSnapshot).toContain("Hello from prompt script.");

    const storedSession = await repository.getById(linked.chatSession.id);
    expect(storedSession).not.toBeNull();
    const updatedScript = await promptScriptRepo.read(promptScript.absolutePath);
    expect(
      updatedScript.promptScriptParsed.metadata.chatSessionId,
    ).toBe(linked.chatSession.id);
    expect(storedSession?.scriptHash).toBe(updatedScript.hash);
  });

  it("requires a working directory for terminal models", async () => {
    const scriptPath = path.join(tempDir, "terminal-session.prompt.md");
    const scriptContent = `---
title: Terminal Prompt
modelId: cli/demo
---

Run a command.
`;
    const promptScript = await promptScriptRepo.create(scriptPath, scriptContent);

    await expect(
      service.createLinkedChatSession({
        scriptPath: promptScript.absolutePath,
        modelId: "cli/demo",
      }),
    ).rejects.toThrowError("Terminal chats require a working directory");
  });

  it("creates and links a terminal session when a working directory is provided", async () => {
    const scriptPath = path.join(tempDir, "terminal-session.prompt.md");
    const scriptContent = `---
title: Terminal Prompt
modelId: cli/demo
---

Run a command.
`;
    const promptScript = await promptScriptRepo.create(scriptPath, scriptContent);
    const workingDirectory = path.join(tempDir, "workspace");

    const linked = await service.createLinkedChatSession({
      scriptPath: promptScript.absolutePath,
      modelId: "cli/demo",
      workingDirectory,
    });

    expect(linked.chatSession.modelSurface).toBe("terminal");
    expect(
      linked.chatSession.metadata?.external?.workingDirectory,
    ).toBe(workingDirectory);

    const updatedScript = await promptScriptRepo.read(promptScript.absolutePath);
    expect(
      updatedScript.promptScriptParsed.metadata.chatSessionId,
    ).toBe(linked.chatSession.id);
  });
});
