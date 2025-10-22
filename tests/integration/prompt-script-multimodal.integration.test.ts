// tests/integration/prompt-script-multimodal.integration.test.ts
// Run with: AI_GATEWAY_API_KEY=... npx vitest run tests/integration/prompt-script-multimodal.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Logger } from "tslog";
import { EventBus } from "../../src/core/event-bus.js";
import {
  ChatSessionRepositoryImpl,
  type ChatSessionRepository,
} from "../../src/core/services/chat/chat-session-repository.js";
import {
  ApiChatClient,
  type CreateChatSessionInput,
  type SendChatMessageInput,
} from "../../src/core/services/chat-engine/api-chat-client.js";
import {
  ToolRegistryImpl,
  type ToolRegistry,
} from "../../src/core/services/tool-call/tool-registry.js";
import { PromptScriptRepository } from "../../src/core/services/prompt-script/prompt-script-repository.js";
import { PromptScriptService } from "../../src/core/services/prompt-script/prompt-script-service.js";
import { getModelMessageContentString } from "../../src/core/utils/message-utils.js";

const hasGatewayCredentials = Boolean(process.env.AI_GATEWAY_API_KEY);

const describeIntegration = describe.runIf(hasGatewayCredentials);

describeIntegration("Prompt script multimodal integration", () => {
  let repository: ChatSessionRepository;
  let client: ApiChatClient;
  let toolRegistry: ToolRegistry;
  let databasePath: string;
  let promptScriptRepo: PromptScriptRepository;
  let promptScriptService: PromptScriptService;
  let promptScriptDirectory: string;
  let projectDirectory: string;

  beforeAll(async () => {
    databasePath = join(
      tmpdir(),
      `prompt-script-multimodal-integration-${randomUUID()}.db`,
    );

    promptScriptDirectory = await fs.mkdtemp(
      join(tmpdir(), "prompt-script-multimodal-"),
    );

    projectDirectory = join(promptScriptDirectory, "project");
    await fs.mkdir(projectDirectory, { recursive: true });

    repository = new ChatSessionRepositoryImpl({
      databaseFilePath: databasePath,
    });

    const eventBus = new EventBus({ environment: "server" });

    toolRegistry = new ToolRegistryImpl(
      eventBus,
      new Logger({
        name: "PromptScriptMultimodalIntegrationTest",
      }),
    );

    client = new ApiChatClient({
      repository,
      eventBus,
      toolRegistry,
    });

    promptScriptRepo = new PromptScriptRepository();
    promptScriptService = new PromptScriptService(
      promptScriptRepo,
      repository,
      async () => promptScriptDirectory,
    );
  });

  afterAll(async () => {
    const cleanups: Array<Promise<void>> = [];

    if (databasePath) {
      cleanups.push(
        fs.unlink(databasePath).catch(() => {
          // Ignore cleanup failures
        }),
      );
    }

    if (promptScriptDirectory) {
      cleanups.push(
        fs
          .rm(promptScriptDirectory, { recursive: true, force: true })
          .catch(() => {
            // Ignore cleanup failures
          }),
      );
    }

    await Promise.all(cleanups);
  });

  it("transcribes audio file using multimodal file reference", async () => {
    const modelId = "google/gemini-2.5-flash-lite";

    const fixtureAudioPath = join(
      process.cwd(),
      "tests/fixtures/audio-recordings/test1.mp3",
    );
    const audioFilePath = join(projectDirectory, "recording.mp3");
    const audioData = await fs.readFile(fixtureAudioPath);
    await fs.writeFile(audioFilePath, audioData);

    const createdScript = await promptScriptService.createPromptScript(
      promptScriptDirectory,
    );

    const scriptMarkdown = `---
title: Audio Transcription Test
engine: api
---

<!-- user -->
Listen to the uploaded audio file @recording.mp3 and transcribe it
`;

    await fs.writeFile(createdScript.absolutePath, scriptMarkdown);

    const preparedScript = await promptScriptRepo.read(
      createdScript.absolutePath,
    );

    const sessionInput: CreateChatSessionInput = {
      sessionType: "chat_engine",
      metadata: {
        title: "Audio Transcription Test",
        modelId,
        mode: "chat",
        maxTurns: 3,
        projectPath: projectDirectory,
      },
      script: {
        path: preparedScript.absolutePath,
        snapshot: preparedScript.promptScriptParsed.body.trim(),
      },
    };

    const session = await client.createSession(sessionInput);

    expect(session.metadata?.projectPath).toBe(projectDirectory);

    const linkResult = await promptScriptService.linkChatSession(
      preparedScript.absolutePath,
      session.id,
    );

    expect(
      linkResult.promptScript.promptScriptParsed.metadata.chatSessionId,
    ).toBe(session.id);
    expect(linkResult.chatSession.id).toBe(session.id);
    expect(linkResult.chatSession.scriptPath).toBe(preparedScript.absolutePath);

    const prompts = linkResult.promptScript.promptScriptParsed.prompts;
    expect(prompts.length).toBeGreaterThan(0);

    const promptText = prompts[0]!.content.trim();

    const messageInput: SendChatMessageInput = {
      chatSessionId: session.id,
      input: {
        role: "user",
        content: promptText,
      },
    };

    const result = await client.sendMessage(messageInput);

    expect(result.turnResult.streamResult).toBeDefined();
    expect(result.session.metadata?.currentTurn).toBe(1);

    const userMessage = result.session.messages.find(
      (message) => message.message.role === "user",
    );
    expect(userMessage).toBeDefined();

    const userContent = userMessage!.message.content;
    if (Array.isArray(userContent)) {
      const hasFilePart = userContent.some(
        (part) => part.type === "file" && part.mediaType === "audio/mpeg",
      );
      expect(hasFilePart).toBe(true);

      const textPart = userContent.find((part) => part.type === "text");
      expect(textPart).toBeDefined();
      expect((textPart as { text: string }).text).toContain("@recording.mp3");
    } else {
      throw new Error("Expected user content to be multimodal array");
    }

    const assistantMessages = result.session.messages.filter(
      (message) => message.message.role === "assistant",
    );

    console.log(
      "Assistant messages:",
      JSON.stringify(assistantMessages, null, 2),
    );

    expect(assistantMessages.length).toBeGreaterThan(0);

    const hasNonEmptyResponse = assistantMessages.some((message) => {
      const content = message.message.content;
      if (typeof content === "string") {
        return content.trim().length > 0;
      }

      return content.some((part) => {
        if (part.type !== "text") {
          return false;
        }
        return part.text.trim().length > 0;
      });
    });

    expect(hasNonEmptyResponse).toBe(true);
  });

  it("processes image file using multimodal file reference", async () => {
    const modelId = "google/gemini-2.5-flash-lite";

    const imageFilePath = join(projectDirectory, "photo.png");
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    await fs.writeFile(imageFilePath, pngBuffer);

    const createdScript = await promptScriptService.createPromptScript(
      promptScriptDirectory,
    );

    const scriptMarkdown = `---
title: Image Analysis Test
engine: api
---

<!-- user -->
Describe what you see in @photo.png
`;

    await fs.writeFile(createdScript.absolutePath, scriptMarkdown);

    const preparedScript = await promptScriptRepo.read(
      createdScript.absolutePath,
    );

    const sessionInput: CreateChatSessionInput = {
      sessionType: "chat_engine",
      metadata: {
        title: "Image Analysis Test",
        modelId,
        mode: "chat",
        maxTurns: 3,
        projectPath: projectDirectory,
      },
      script: {
        path: preparedScript.absolutePath,
        snapshot: preparedScript.promptScriptParsed.body.trim(),
      },
    };

    const session = await client.createSession(sessionInput);

    const prompts = preparedScript.promptScriptParsed.prompts;
    const promptText = prompts[0]!.content.trim();

    const messageInput: SendChatMessageInput = {
      chatSessionId: session.id,
      input: {
        role: "user",
        content: promptText,
      },
    };

    const result = await client.sendMessage(messageInput);

    expect(result.turnResult.streamResult).toBeDefined();

    const userMessage = result.session.messages.find(
      (message) => message.message.role === "user",
    );
    expect(userMessage).toBeDefined();

    const userContent = userMessage!.message.content;
    if (Array.isArray(userContent)) {
      const hasImagePart = userContent.some(
        (part) => part.type === "image" && part.mediaType === "image/png",
      );
      expect(hasImagePart).toBe(true);

      const textPart = userContent.find((part) => part.type === "text");
      expect(textPart).toBeDefined();
      expect((textPart as { text: string }).text).toContain("@photo.png");
    } else {
      throw new Error("Expected user content to be multimodal array");
    }

    const assistantMessages = result.session.messages.filter(
      (message) => message.message.role === "assistant",
    );

    expect(assistantMessages.length).toBeGreaterThan(0);
  });

  it("processes mixed text and image files", async () => {
    const modelId = "google/gemini-2.5-flash-lite";

    const textFilePath = join(projectDirectory, "notes.txt");
    await fs.writeFile(textFilePath, "Meeting notes: Discuss project timeline");

    const imageFilePath = join(projectDirectory, "chart.png");
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    await fs.writeFile(imageFilePath, pngBuffer);

    const createdScript = await promptScriptService.createPromptScript(
      promptScriptDirectory,
    );

    const scriptMarkdown = `---
title: Mixed Media Test
engine: api
---

<!-- user -->
Review @notes.txt and describe @chart.png
`;

    await fs.writeFile(createdScript.absolutePath, scriptMarkdown);

    const preparedScript = await promptScriptRepo.read(
      createdScript.absolutePath,
    );

    const sessionInput: CreateChatSessionInput = {
      sessionType: "chat_engine",
      metadata: {
        title: "Mixed Media Test",
        modelId,
        mode: "chat",
        maxTurns: 3,
        projectPath: projectDirectory,
      },
      script: {
        path: preparedScript.absolutePath,
        snapshot: preparedScript.promptScriptParsed.body.trim(),
      },
    };

    const session = await client.createSession(sessionInput);

    const prompts = preparedScript.promptScriptParsed.prompts;
    const promptText = prompts[0]!.content.trim();

    const messageInput: SendChatMessageInput = {
      chatSessionId: session.id,
      input: {
        role: "user",
        content: promptText,
      },
    };

    const result = await client.sendMessage(messageInput);

    expect(result.turnResult.streamResult).toBeDefined();

    const userMessage = result.session.messages.find(
      (message) => message.message.role === "user",
    );
    expect(userMessage).toBeDefined();

    const userContent = userMessage!.message.content;
    if (Array.isArray(userContent)) {
      expect(userContent.length).toBeGreaterThan(2);

      const hasTextContent = userContent.some(
        (part) =>
          part.type === "text" &&
          (part as { text: string }).text.includes("Meeting notes"),
      );
      expect(hasTextContent).toBe(true);

      const hasImagePart = userContent.some(
        (part) => part.type === "image" && part.mediaType === "image/png",
      );
      expect(hasImagePart).toBe(true);
    } else {
      throw new Error("Expected user content to be multimodal array");
    }

    const assistantMessages = result.session.messages.filter(
      (message) => message.message.role === "assistant",
    );

    expect(assistantMessages.length).toBeGreaterThan(0);
  });
});
