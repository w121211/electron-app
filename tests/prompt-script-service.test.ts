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

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "prompt-script-test-"));
    scriptPath = path.join(tempDir, "test.prompt.md");
    databasePath = path.join(tempDir, "sessions.db");
    scriptRepository = new PromptScriptRepository();
    chatSessionRepository = new ChatSessionRepositoryImpl({
      databaseFilePath: databasePath,
    });
    service = new PromptScriptService(scriptRepository, chatSessionRepository);
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
      sessionType: overrides.sessionType ?? "chat_engine",
      sessionStatus: overrides.sessionStatus ?? "idle",
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

    expect(result.session?.id).toBe(sessionId);
    expect(result.linkType).toBe("chatSessionId");
    expect(result.script.metadata.chatSessionId).toBe(sessionId);
    expect(result.warnings).toHaveLength(0);

    const updated = await chatSessionRepository.getById(sessionId);
    expect(updated?.scriptPath).toBe(script.absolutePath);
    expect(updated?.scriptHash).toBe(script.hash);
  });

  it("falls back to script hash and updates chatSessionId in front matter", async () => {
    const sessionId = uuidv4();
    const scriptContent = `---
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

    expect(result.session?.id).toBe(sessionId);
    expect(result.linkType).toBe("scriptHash");
    expect(result.warnings).toHaveLength(0);

    // Script file should now include chatSessionId
    const persisted = await scriptRepository.read(scriptPath);
    expect(persisted.metadata.chatSessionId).toBe(sessionId);
  });

  it("clears stale chatSessionId when content hash changes", async () => {
    const sessionId = uuidv4();
    const originalContent = `---
chatSessionId: ${sessionId}
---

Original prompt
`;

    const script = await writeScript(originalContent);
    await createSessionForScript(script, {
      id: sessionId,
      metadata: { modelId: "openai/gpt-4o-mini" },
    });

    const modifiedContent = `---
chatSessionId: ${sessionId}
---

Modified prompt
`;
    await writeScript(modifiedContent);

    const result = await service.findLinkedChatSession(scriptPath);

    expect(result.session).toBeNull();
    expect(result.linkType).toBeUndefined();
    expect(result.warnings).toContain(
      "Prompt script content changed since the stored session was created. Cleared chatSessionId for safety.",
    );

    const updated = await scriptRepository.read(scriptPath);
    expect(updated.metadata.chatSessionId).toBeUndefined();
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

    expect(detached.metadata.chatSessionId).toBeUndefined();

    const session = await chatSessionRepository.getById(sessionId);
    expect(session?.scriptPath).toBeNull();
    expect(session?.scriptHash).toBeNull();
    expect(session?.scriptSnapshot).toBeNull();
    expect(session?.scriptModifiedAt).toBeNull();
  });
});
