// tests/prompt-script-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import {
  PromptScriptRepository,
  type PromptScriptFile,
} from "../src/core/services/prompt-script/prompt-script-repository.js";
import { PromptScriptService } from "../src/core/services/prompt-script/prompt-script-service.js";
import {
  ChatSessionRepositoryImpl,
  type ChatSessionData,
} from "../src/core/services/chat/chat-session-repository.js";

describe("PromptScriptService", () => {
  let tempDir: string;
  let scriptPath: string;
  let databasePath: string;
  let scriptRepository: PromptScriptRepository;
  let chatSessionRepository: ChatSessionRepositoryImpl;
  let service: PromptScriptService;
  let defaultPromptDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "prompt-script-test-"));
    scriptPath = path.join(tempDir, "test.prompt.md");
    databasePath = path.join(tempDir, "sessions.db");
    scriptRepository = new PromptScriptRepository();
    chatSessionRepository = new ChatSessionRepositoryImpl({
      databaseFilePath: databasePath,
    });
    defaultPromptDir = path.join(tempDir, "default-prompts");
    service = new PromptScriptService(
      scriptRepository,
      chatSessionRepository,
      // async () => defaultPromptDir,
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  async function writeScript(content: string): Promise<PromptScriptFile> {
    await fs.writeFile(scriptPath, content, "utf8");
    return scriptRepository.read(scriptPath);
  }

  async function createSessionForScript(
    script: PromptScriptFile,
    overrides: Partial<ChatSessionData> = {},
  ): Promise<ChatSessionData> {
    const session: ChatSessionData = {
      id: overrides.id ?? uuidv4(),
      modelSurface: overrides.modelSurface ?? "api",
      state: overrides.state ?? "terminated",
      messages: overrides.messages ?? [],
      metadata: overrides.metadata,
      scriptPath: overrides.scriptPath ?? script.absolutePath,
      scriptHash: overrides.scriptHash ?? script.hash,
      scriptSnapshot: overrides.scriptSnapshot ?? script.content,
      scriptModifiedAt: overrides.scriptModifiedAt ?? script.modifiedAt,
      createdAt: overrides.createdAt ?? new Date(),
      updatedAt: overrides.updatedAt ?? new Date(),
    };

    await chatSessionRepository.create(session);
    return session;
  }

  it("attaches using chatSessionId when hashes match", async () => {
    const sessionId = uuidv4();
    const scriptContent = `---
chatSessionId: ${sessionId}
model: openai/gpt-4o-mini
---

First prompt
`;

    const script = await writeScript(scriptContent);
    const session = await createSessionForScript(script, {
      id: sessionId,
      metadata: { modelId: "openai/gpt-4o-mini" },
    });

    const result = await service.findLinkedChatSession(scriptPath);

    expect(result.chatSession?.id).toBe(sessionId);
    expect(result.promptScript.promptScriptParsed.metadata.chatSessionId).toBe(
      sessionId,
    );
    expect(result.warnings).toHaveLength(0);
  });

  it("finds session by chatSessionId", async () => {
    const sessionId = uuidv4();
    const scriptContent = `---
chatSessionId: ${sessionId}
model: openai/gpt-4o-mini
---

Prompt content
`;

    const script = await writeScript(scriptContent);
    await createSessionForScript(script, {
      id: sessionId,
      metadata: { modelId: "openai/gpt-4o-mini" },
    });

    const result = await service.findLinkedChatSession(scriptPath);

    expect(result.chatSession?.id).toBe(sessionId);
    expect(result.warnings).toHaveLength(0);
  });

  it("warns when session not found", async () => {
    const sessionId = uuidv4();
    const scriptContent = `---
chatSessionId: ${sessionId}
---

Original prompt
`;

    await writeScript(scriptContent);

    const result = await service.findLinkedChatSession(scriptPath);

    expect(result.chatSession).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe("CHAT_SESSION_NOT_FOUND");
  });

  it("detaches script and clears session linkage", async () => {
    const sessionId = uuidv4();
    const scriptContent = `---
chatSessionId: ${sessionId}
---

Prompt
`;

    const script = await writeScript(scriptContent);
    await createSessionForScript(script, { id: sessionId });

    const detached = await service.unlinkChatSession({
      scriptPath,
      sessionId,
    });

    expect(detached.promptScriptParsed.metadata.chatSessionId).toBeUndefined();

    const session = await chatSessionRepository.getById(sessionId);
    expect(session?.scriptPath).toBeNull();
    expect(session?.scriptHash).toBeNull();
    expect(session?.scriptSnapshot).toBeNull();
    expect(session?.scriptModifiedAt).toBeNull();
  });

  describe("createPromptScript", () => {
    let createTempDir: string;

    beforeEach(async () => {
      createTempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "prompt-create-test-"),
      );
    });

    afterEach(async () => {
      await fs
        .rm(createTempDir, { recursive: true, force: true })
        .catch(() => {});
    });

    it("creates prompt script with sequential numbering when no name provided", async () => {
      const script1 = await service.createPromptScript(createTempDir);
      expect(script1.absolutePath).toBe(
        path.join(createTempDir, "001.prompt.md"),
      );
      expect(script1.content).toBe("");

      const script2 = await service.createPromptScript(createTempDir);
      expect(script2.absolutePath).toBe(
        path.join(createTempDir, "002.prompt.md"),
      );

      const script3 = await service.createPromptScript(createTempDir);
      expect(script3.absolutePath).toBe(
        path.join(createTempDir, "003.prompt.md"),
      );
    });

    it("creates prompt script with custom name and unique suffix", async () => {
      const script1 = await service.createPromptScript(createTempDir, "test");
      expect(script1.absolutePath).toBe(
        path.join(createTempDir, "test.prompt.md"),
      );

      const script2 = await service.createPromptScript(createTempDir, "test");
      expect(path.basename(script2.absolutePath)).toMatch(
        /^test\.prompt \(\d+\)\.md$/,
      );

      const script3 = await service.createPromptScript(createTempDir, "test");
      expect(path.basename(script3.absolutePath)).toMatch(
        /^test\.prompt \(\d+\)\.md$/,
      );
    });

    // it("creates prompt script in default directory when no directory provided", async () => {
    //   const script = await service.createPromptScript();
    //   expect(script.absolutePath.startsWith(defaultPromptDir)).toBe(true);
    //   const exists = await fs
    //     .access(script.absolutePath)
    //     .then(() => true)
    //     .catch(() => false);
    //   expect(exists).toBe(true);
    // });

    it("fills gaps in sequential numbering", async () => {
      await service.createPromptScript(createTempDir); // 001
      await service.createPromptScript(createTempDir); // 002
      await service.createPromptScript(createTempDir); // 003

      // Delete 002
      await fs.unlink(path.join(createTempDir, "002.prompt.md"));

      // Next creation should be 004, not 002 (sequential continues from max)
      const script = await service.createPromptScript(createTempDir);
      expect(script.absolutePath).toBe(
        path.join(createTempDir, "004.prompt.md"),
      );
    });

    it("handles existing sequential files correctly", async () => {
      // Create files manually
      await fs.writeFile(path.join(createTempDir, "001.prompt.md"), "content1");
      await fs.writeFile(path.join(createTempDir, "005.prompt.md"), "content5");

      // Next creation should be 006 (max + 1)
      const script = await service.createPromptScript(createTempDir);
      expect(script.absolutePath).toBe(
        path.join(createTempDir, "006.prompt.md"),
      );
    });
  });
});
