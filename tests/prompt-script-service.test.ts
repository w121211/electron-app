// tests/prompt-script-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PromptScriptRepository } from "../src/core/services/prompt-script/prompt-script-repository.js";
import { PromptScriptService } from "../src/core/services/prompt-script/prompt-script-service.js";
import {
  ChatSessionRepositoryImpl,
  type ChatSessionData,
  type ChatSessionRepository,
} from "../src/core/services/chat/chat-session-repository.js";
import { EventBus } from "../src/core/event-bus.js";
import { ApiChatClient } from "../src/core/services/chat-engine/api-chat-client.js";
import { TerminalChatClient } from "../src/core/services/external-chat/terminal-chat-client.js";
import { WebChatClient } from "../src/core/services/external-chat/web-chat-client.js";
import type { ToolRegistry } from "../src/core/services/tool-call/tool-registry.js";
import type {
  PromptEditRepository,
  PromptEdit,
} from "../src/core/services/prompt/prompt-edit-repository.js";

class InMemoryPromptEditRepository implements PromptEditRepository {
  private readonly edits = new Map<string, PromptEdit>();

  async create(edit: PromptEdit): Promise<PromptEdit> {
    this.edits.set(edit.id, edit);
    return edit;
  }

  async update(
    id: string,
    changes: Partial<Omit<PromptEdit, "id">>,
  ): Promise<PromptEdit> {
    const existing = this.edits.get(id);
    if (!existing) {
      throw new Error(`Prompt edit ${id} not found`);
    }
    const updated = { ...existing, ...changes };
    this.edits.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.edits.delete(id);
  }

  async findById(id: string): Promise<PromptEdit | null> {
    return this.edits.get(id) ?? null;
  }

  async findByScriptPath(scriptPath: string): Promise<PromptEdit | null> {
    const resolved = path.resolve(scriptPath);
    for (const edit of this.edits.values()) {
      if (edit.promptScriptPath && path.resolve(edit.promptScriptPath) === resolved) {
        return edit;
      }
    }
    return null;
  }

  async list(): Promise<PromptEdit[]> {
    return Array.from(this.edits.values());
  }

  async listRecent(limit?: number): Promise<PromptEdit[]> {
    const sorted = Array.from(this.edits.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
    return limit ? sorted.slice(0, limit) : sorted;
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

describe("PromptScriptService", () => {
  let tempDir: string;
  let databasePath: string;
  let promptScriptRepo: PromptScriptRepository;
  let chatSessionRepo: ChatSessionRepository;
  let promptEditRepo: PromptEditRepository;
  let eventBus: EventBus;
  let apiChatClient: ApiChatClient;
  let terminalChatClient: TerminalChatClient;
  let webChatClient: WebChatClient;
  let service: PromptScriptService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "prompt-script-test-"));
    databasePath = path.join(tempDir, "sessions.db");

    promptScriptRepo = new PromptScriptRepository();
    chatSessionRepo = new ChatSessionRepositoryImpl({
      databaseFilePath: databasePath,
    });
    promptEditRepo = new InMemoryPromptEditRepository();
    eventBus = new EventBus({ environment: "server" });

    apiChatClient = new ApiChatClient({
      repository: chatSessionRepo,
      eventBus,
      toolRegistry: createToolRegistryStub(),
    });
    terminalChatClient = new TerminalChatClient(eventBus, chatSessionRepo);
    webChatClient = new WebChatClient(eventBus, chatSessionRepo);

    service = new PromptScriptService({
      promptScriptRepo,
      chatSessionRepo,
      promptEditRepo,
      apiChatClient,
      terminalChatClient,
      webChatClient,
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  async function writeScriptFile(
    filePath: string,
    content: string,
  ): Promise<void> {
    await fs.writeFile(filePath, content, "utf8");
  }

  describe("createPromptScript", () => {
    it("creates prompt script with sequential numbering when no name provided", async () => {
      const result1 = await service.createPromptScript(tempDir);
      expect(result1.script.absolutePath).toBe(
        path.join(tempDir, "01.prompt.md"),
      );
      expect(result1.script.content).toBe("");
      expect(result1.edit.promptScriptPath).toBe(result1.script.absolutePath);

      const result2 = await service.createPromptScript(tempDir);
      expect(result2.script.absolutePath).toBe(
        path.join(tempDir, "02.prompt.md"),
      );

      const result3 = await service.createPromptScript(tempDir);
      expect(result3.script.absolutePath).toBe(
        path.join(tempDir, "03.prompt.md"),
      );
    });

    it("creates prompt script with custom name and unique suffix", async () => {
      const result1 = await service.createPromptScript(tempDir, "test");
      expect(result1.script.absolutePath).toBe(
        path.join(tempDir, "test.prompt.md"),
      );

      const result2 = await service.createPromptScript(tempDir, "test");
      expect(path.basename(result2.script.absolutePath)).toMatch(
        /^test\.prompt \(\d+\)\.md$/,
      );

      const result3 = await service.createPromptScript(tempDir, "test");
      expect(path.basename(result3.script.absolutePath)).toMatch(
        /^test\.prompt \(\d+\)\.md$/,
      );
    });

    it("creates prompt script from template with argument substitution", async () => {
      const templatePath = path.join(tempDir, "test-template.prompt.md");
      const templateContent = `---
title: Code Review Template
modelId: openai/gpt-4o-mini
---

Review the following code for $1:

File: $2

Focus on: $3
`;
      await writeScriptFile(templatePath, templateContent);

      const args = ["security issues", "auth.ts", "SQL injection and XSS"];
      const result = await service.createPromptScript(
        tempDir,
        "security-review",
        {
          templatePath,
          args,
        },
      );

      expect(result.script.absolutePath).toContain("security-review");
      expect(result.script.promptScriptParsed.metadata.title).toBe(
        "Code Review Template",
      );
      expect(result.script.promptScriptParsed.metadata.modelId).toBe(
        "openai/gpt-4o-mini",
      );
      expect(result.script.promptScriptParsed.body).toContain(
        "Review the following code for security issues",
      );
      expect(result.script.promptScriptParsed.body).toContain("File: auth.ts");
      expect(result.script.promptScriptParsed.body).toContain(
        "Focus on: SQL injection and XSS",
      );
    });

    it("creates prompt edit for new script", async () => {
      const result = await service.createPromptScript(tempDir, "new-script");

      expect(result.edit).toBeDefined();
      expect(result.edit.promptScriptPath).toBe(result.script.absolutePath);
      expect(result.edit.contentDraft).toBeNull();

      const absoluteScriptPath = result.script.absolutePath;
      const foundEdit = await promptEditRepo.findByScriptPath(absoluteScriptPath);
      expect(foundEdit?.id).toBe(result.edit.id);
    });

    it("updates existing prompt edit when promptEditId provided", async () => {
      const existingEdit = await promptEditRepo.create({
        id: randomUUID(),
        promptScriptPath: path.join(tempDir, "placeholder.md"),
        contentDraft: "draft content",
        updatedAt: new Date(),
      });

      const result = await service.createPromptScript(tempDir, "updated", {
        promptEditId: existingEdit.id,
      });

      expect(result.edit.id).toBe(existingEdit.id);
      expect(result.edit.promptScriptPath).toBe(result.script.absolutePath);
      expect(result.edit.contentDraft).toBeNull();
    });
  });

  describe("findLinkedChatSession", () => {
    it("finds session by chatSessionId", async () => {
      const sessionId = randomUUID();
      const scriptPath = path.join(tempDir, "test.prompt.md");
      const scriptContent = `---
chatSessionId: ${sessionId}
modelId: openai/gpt-4o-mini
---

Prompt content
`;

      await writeScriptFile(scriptPath, scriptContent);

      const session: ChatSessionData = {
        id: sessionId,
        modelSurface: "api",
        state: "terminated",
        messages: [],
        metadata: { modelId: "openai/gpt-4o-mini" },
        scriptPath,
        scriptHash: null,
        scriptSnapshot: null,
        scriptModifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await chatSessionRepo.create(session);

      const result = await service.findLinkedChatSession(scriptPath);

      expect(result.chatSession?.id).toBe(sessionId);
      expect(result.warnings).toHaveLength(0);
    });

    it("warns when session not found", async () => {
      const sessionId = randomUUID();
      const scriptPath = path.join(tempDir, "test.prompt.md");
      const scriptContent = `---
chatSessionId: ${sessionId}
---

Original prompt
`;

      await writeScriptFile(scriptPath, scriptContent);

      const result = await service.findLinkedChatSession(scriptPath);

      expect(result.chatSession).toBeNull();
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe("CHAT_SESSION_NOT_FOUND");
    });

    it("returns no warnings when no chatSessionId in metadata", async () => {
      const scriptPath = path.join(tempDir, "test.prompt.md");
      const scriptContent = `---
title: Unlinked Script
---

Content
`;

      await writeScriptFile(scriptPath, scriptContent);

      const result = await service.findLinkedChatSession(scriptPath);

      expect(result.chatSession).toBeNull();
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("linkChatSession", () => {
    it("links script to existing session and updates both", async () => {
      const sessionId = randomUUID();
      const scriptPath = path.join(tempDir, "test.prompt.md");
      const scriptContent = `---
title: Test Script
---

Content
`;

      await writeScriptFile(scriptPath, scriptContent);

      const session: ChatSessionData = {
        id: sessionId,
        modelSurface: "api",
        state: "terminated",
        messages: [],
        metadata: { modelId: "openai/gpt-4o-mini" },
        scriptPath: null,
        scriptHash: null,
        scriptSnapshot: null,
        scriptModifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await chatSessionRepo.create(session);

      const result = await service.linkChatSession(scriptPath, sessionId);

      expect(result.chatSession.id).toBe(sessionId);
      expect(result.promptScript.promptScriptParsed.metadata.chatSessionId).toBe(
        sessionId,
      );

      const updatedSession = await chatSessionRepo.getById(sessionId);
      expect(updatedSession?.scriptPath).toBe(path.resolve(scriptPath));
      expect(updatedSession?.scriptHash).toBe(result.promptScript.hash);
      expect(updatedSession?.scriptSnapshot).toBe(result.promptScript.content);
    });

    it("throws when session does not exist", async () => {
      const scriptPath = path.join(tempDir, "test.prompt.md");
      await writeScriptFile(scriptPath, "---\n---\nContent");

      await expect(
        service.linkChatSession(scriptPath, "nonexistent-id"),
      ).rejects.toThrow("Chat session nonexistent-id not found");
    });
  });

  describe("createLinkedChatSession", () => {
    it("creates and links an API chat session", async () => {
      const scriptPath = path.join(tempDir, "api-session.prompt.md");
      const scriptContent = `---
title: API Prompt
modelId: openai/gpt-4o-mini
---

Hello from prompt script.
`;
      await writeScriptFile(scriptPath, scriptContent);

      const result = await service.createLinkedChatSession({
        scriptPath,
        modelId: "openai/gpt-4o-mini",
        title: "API Prompt Session",
      });

      expect(result.chatSession).not.toBeNull();
      expect(result.chatSession.modelSurface).toBe("api");
      expect(result.chatSession.scriptPath).toBe(path.resolve(scriptPath));
      expect(result.chatSession.scriptSnapshot).toContain(
        "Hello from prompt script.",
      );

      const updatedScript = await promptScriptRepo.read(scriptPath);
      expect(updatedScript.promptScriptParsed.metadata.chatSessionId).toBe(
        result.chatSession.id,
      );
    });

    it("requires a working directory for terminal models", async () => {
      const scriptPath = path.join(tempDir, "terminal-session.prompt.md");
      const scriptContent = `---
title: Terminal Prompt
modelId: cli/demo
---

Run a command.
`;
      await writeScriptFile(scriptPath, scriptContent);

      await expect(
        service.createLinkedChatSession({
          scriptPath,
          modelId: "cli/demo",
        }),
      ).rejects.toThrow(
        "Terminal chats require a working directory (project path).",
      );
    });

    it("creates and links a terminal session when working directory is provided", async () => {
      const scriptPath = path.join(tempDir, "terminal-session.prompt.md");
      const scriptContent = `---
title: Terminal Prompt
modelId: cli/demo
---

Run a command.
`;
      await writeScriptFile(scriptPath, scriptContent);
      const workingDirectory = path.join(tempDir, "workspace");

      const result = await service.createLinkedChatSession({
        scriptPath,
        modelId: "cli/demo",
        workingDirectory,
      });

      expect(result.chatSession.modelSurface).toBe("terminal");
      expect(result.chatSession.metadata?.external?.workingDirectory).toBe(
        workingDirectory,
      );

      const updatedScript = await promptScriptRepo.read(scriptPath);
      expect(updatedScript.promptScriptParsed.metadata.chatSessionId).toBe(
        result.chatSession.id,
      );
    });

    it("creates and links a web chat session", async () => {
      const scriptPath = path.join(tempDir, "web-session.prompt.md");
      const scriptContent = `---
title: Web Prompt
modelId: web/chatgpt
---

Web chat content.
`;
      await writeScriptFile(scriptPath, scriptContent);

      const result = await service.createLinkedChatSession({
        scriptPath,
        modelId: "web/chatgpt",
        title: "Web Chat Session",
      });

      expect(result.chatSession).not.toBeNull();
      expect(result.chatSession.modelSurface).toBe("web");
      expect(result.chatSession.scriptPath).toBe(path.resolve(scriptPath));

      const updatedScript = await promptScriptRepo.read(scriptPath);
      expect(updatedScript.promptScriptParsed.metadata.chatSessionId).toBe(
        result.chatSession.id,
      );
    });
  });

  describe("unlinkChatSession", () => {
    it("removes chatSessionId from script and clears session linkage", async () => {
      const sessionId = randomUUID();
      const scriptPath = path.join(tempDir, "test.prompt.md");
      const scriptContent = `---
chatSessionId: ${sessionId}
---

Prompt
`;

      await writeScriptFile(scriptPath, scriptContent);

      const session: ChatSessionData = {
        id: sessionId,
        modelSurface: "api",
        state: "terminated",
        messages: [],
        metadata: {},
        scriptPath: path.resolve(scriptPath),
        scriptHash: "somehash",
        scriptSnapshot: scriptContent,
        scriptModifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await chatSessionRepo.create(session);

      const result = await service.unlinkChatSession({
        scriptPath,
        sessionId,
      });

      expect(
        result.promptScriptParsed.metadata.chatSessionId,
      ).toBeUndefined();

      const updatedSession = await chatSessionRepo.getById(sessionId);
      expect(updatedSession?.scriptPath).toBeNull();
      expect(updatedSession?.scriptHash).toBeNull();
      expect(updatedSession?.scriptSnapshot).toBeNull();
      expect(updatedSession?.scriptModifiedAt).toBeNull();
    });

    it("only removes chatSessionId from script when no sessionId provided", async () => {
      const sessionId = randomUUID();
      const scriptPath = path.join(tempDir, "test.prompt.md");
      const scriptContent = `---
chatSessionId: ${sessionId}
---

Prompt
`;

      await writeScriptFile(scriptPath, scriptContent);

      const session: ChatSessionData = {
        id: sessionId,
        modelSurface: "api",
        state: "terminated",
        messages: [],
        metadata: {},
        scriptPath: path.resolve(scriptPath),
        scriptHash: "somehash",
        scriptSnapshot: scriptContent,
        scriptModifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await chatSessionRepo.create(session);

      const result = await service.unlinkChatSession({ scriptPath });

      expect(
        result.promptScriptParsed.metadata.chatSessionId,
      ).toBeUndefined();

      const updatedSession = await chatSessionRepo.getById(sessionId);
      expect(updatedSession?.scriptPath).toBe(path.resolve(scriptPath));
    });
  });

  describe("openPromptScript", () => {
    it("opens script and creates prompt edit record", async () => {
      const scriptPath = path.join(tempDir, "open-test.prompt.md");
      const scriptContent = `---
title: Open Test
---

Content
`;
      await writeScriptFile(scriptPath, scriptContent);

      const result = await service.openPromptScript(scriptPath);

      expect(result.document.absolutePath).toBe(path.resolve(scriptPath));
      expect(result.document.kind).toBe("promptScript");
      expect(result.edit).toBeDefined();
      expect(result.edit.promptScriptPath).toBe(path.resolve(scriptPath));
      expect(result.edit.contentDraft).toBe("Content");

      const foundEdit = await promptEditRepo.findByScriptPath(
        path.resolve(scriptPath),
      );
      expect(foundEdit?.id).toBe(result.edit.id);
    });

    it("reuses existing prompt edit record", async () => {
      const scriptPath = path.join(tempDir, "reuse-test.prompt.md");
      const scriptContent = `---
title: Reuse Test
---

Content
`;
      await writeScriptFile(scriptPath, scriptContent);

      const existingEdit = await promptEditRepo.create({
        id: randomUUID(),
        promptScriptPath: path.resolve(scriptPath),
        contentDraft: "draft",
        updatedAt: new Date(),
      });

      const result = await service.openPromptScript(scriptPath);

      expect(result.edit.id).toBe(existingEdit.id);
      expect(result.edit.contentDraft).toBe("Content");
    });
  });

  describe("savePromptScript", () => {
    it("saves script content and updates prompt edit", async () => {
      const scriptPath = path.join(tempDir, "save-test.prompt.md");
      const originalContent = `---
title: Original
---

Original content
`;
      await writeScriptFile(scriptPath, originalContent);

      const edit = await promptEditRepo.create({
        id: randomUUID(),
        promptScriptPath: path.resolve(scriptPath),
        contentDraft: "draft",
        updatedAt: new Date(),
      });

      const newContent = `---
title: Updated
---

Updated content
`;

      const result = await service.savePromptScript({
        scriptPath,
        content: newContent,
        editId: edit.id,
      });

      expect(result.document.content).toBe(newContent);
      expect(result.edit.contentDraft).toBe("Updated content");

      const savedContent = await fs.readFile(scriptPath, "utf8");
      expect(savedContent).toBe(newContent);
    });

    it("creates prompt edit if none exists", async () => {
      const scriptPath = path.join(tempDir, "save-new.prompt.md");
      const content = `---
title: New Save
---

Content
`;
      await writeScriptFile(scriptPath, content);

      const newContent = `---
title: Updated Save
---

New content
`;

      const result = await service.savePromptScript({
        scriptPath,
        content: newContent,
      });

      expect(result.edit).toBeDefined();
      expect(result.edit.promptScriptPath).toBe(path.resolve(scriptPath));
      expect(result.edit.contentDraft).toBe("New content");

      const resolvedPath2 = path.resolve(scriptPath);
      const foundEdit = await promptEditRepo.findByScriptPath(resolvedPath2);
      expect(foundEdit?.id).toBe(result.edit.id);
    });

    it("throws when editId does not match script path", async () => {
      const scriptPath1 = path.join(tempDir, "script1.prompt.md");
      const scriptPath2 = path.join(tempDir, "script2.prompt.md");

      await writeScriptFile(scriptPath1, "---\n---\nContent 1");
      await writeScriptFile(scriptPath2, "---\n---\nContent 2");

      const edit = await promptEditRepo.create({
        id: randomUUID(),
        promptScriptPath: path.resolve(scriptPath1),
        contentDraft: null,
        updatedAt: new Date(),
      });

      await expect(
        service.savePromptScript({
          scriptPath: scriptPath2,
          content: "---\n---\nNew content",
          editId: edit.id,
        }),
      ).rejects.toThrow("Prompt edit path mismatch");
    });
  });
});
