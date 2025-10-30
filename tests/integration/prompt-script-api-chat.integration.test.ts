// tests/integration/prompt-script-api-chat.integration.test.ts
// Run with: AI_GATEWAY_API_KEY=... npx vitest run tests/integration/prompt-script-api-chat.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Logger } from "tslog";
import { EventBus } from "../../src/core/event-bus.js";
import {
  ChatSessionRepositoryImpl,
  ModelIdSchema,
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
import { TerminalChatClient } from "../../src/core/services/external-chat/terminal-chat-client.js";
import { WebChatClient } from "../../src/core/services/external-chat/web-chat-client.js";
import {
  PromptEditRepositoryImpl,
  type PromptEditRepository,
} from "../../src/core/services/prompt/prompt-edit-repository.js";
import { substituteArgs } from "../../src/core/services/prompt-script/prompt-script-parser.js";
import { getModelMessageContentString } from "../../src/core/utils/message-utils.js";
import { getModelSurface } from "../../src/core/utils/model-utils.js";

const hasGatewayCredentials = Boolean(process.env.AI_GATEWAY_API_KEY);

const describeIntegration = describe.runIf(hasGatewayCredentials);

describeIntegration("Prompt script API chat integration", () => {
  let repository: ChatSessionRepository;
  let client: ApiChatClient;
  let toolRegistry: ToolRegistry;
  let databasePath: string;
  let promptScriptRepo: PromptScriptRepository;
  let promptEditRepo: PromptEditRepository;
  let promptScriptService: PromptScriptService;
  let terminalChatClient: TerminalChatClient;
  let webChatClient: WebChatClient;
  let promptScriptDirectory: string;

  beforeAll(async () => {
    databasePath = join(
      tmpdir(),
      `prompt-script-api-chat-integration-${randomUUID()}.db`,
    );

    promptScriptDirectory = await fs.mkdtemp(
      join(tmpdir(), "prompt-script-api-chat-"),
    );

    repository = new ChatSessionRepositoryImpl({
      databaseFilePath: databasePath,
    });

    const eventBus = new EventBus({ environment: "server" });

    toolRegistry = new ToolRegistryImpl(
      eventBus,
      new Logger({
        name: "PromptScriptApiChatIntegrationTest",
      }),
    );

    client = new ApiChatClient({
      repository,
      eventBus,
      toolRegistry,
    });

    promptScriptRepo = new PromptScriptRepository();
    promptEditRepo = new PromptEditRepositoryImpl({
      databaseFilePath: databasePath,
    });
    terminalChatClient = new TerminalChatClient(eventBus, repository);
    webChatClient = new WebChatClient(eventBus, repository);
    promptScriptService = new PromptScriptService({
      promptScriptRepo,
      chatSessionRepo: repository,
      promptEditRepo,
      apiChatClient: client,
      terminalChatClient,
      webChatClient,
    });
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

  it("creates, links, and executes a prompt script through the API chat engine", async () => {
    const scriptMarkdown = `---
title: Prompt Script Integration Test
modelId: api/openai:gpt-4o-mini
---

<!-- user input="true" label="Name" -->
Say hello to $1 and mention this is a prompt script integration test.
`;
    const createResult = await promptScriptService.createPromptScript(
      promptScriptDirectory,
      "prompt-script-integration-test",
    );
    await fs.writeFile(createResult.script.absolutePath, scriptMarkdown);

    const preparedScript = await promptScriptRepo.read(
      createResult.script.absolutePath,
    );
    const modelId = ModelIdSchema.parse(
      preparedScript.promptScriptParsed.metadata.modelId,
    );

    const modelSurface = getModelSurface(modelId);
    const sessionInput: CreateChatSessionInput = {
      modelSurface,
      metadata: {
        title: "Prompt Script Integration Test",
        modelId,
        mode: "chat",
        maxTurns: 3,
      },
      script: {
        path: preparedScript.absolutePath,
        snapshot: preparedScript.promptScriptParsed.body.trim(),
      },
    };

    const session = await client.createSession(sessionInput);
    expect(session.modelSurface).toBe(modelSurface);

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

    const promptArgs = ["Codex integration"];
    const promptText = substituteArgs(prompts[0]!.content, promptArgs).trim();

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
    expect(getModelMessageContentString(userMessage!.message)).toContain(
      "Codex integration",
    );

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

    const updatedScript = await promptScriptRepo.read(
      preparedScript.absolutePath,
    );
    expect(updatedScript.promptScriptParsed.metadata.chatSessionId).toBe(
      session.id,
    );
  });

  it("creates, links, and executes a prompt script that specifies an API modelId", async () => {
    const scriptMarkdown = `---
title: Prompt Script API ModelId Test
modelId: api/aigateway:google/gemini-2.5-flash-lite
---

<!-- user input="true" label="Topic" -->
Generate a focused system prompt for $1 that emphasizes integration reliability.
`;
    const createResult = await promptScriptService.createPromptScript(
      promptScriptDirectory,
      "prompt-script-api-model-id-test",
    );
    await fs.writeFile(createResult.script.absolutePath, scriptMarkdown);

    const preparedScript = await promptScriptRepo.read(
      createResult.script.absolutePath,
    );
    const modelId = ModelIdSchema.parse(
      preparedScript.promptScriptParsed.metadata.modelId,
    );

    const modelSurface = getModelSurface(modelId);
    const sessionInput: CreateChatSessionInput = {
      modelSurface,
      metadata: {
        title: "Prompt Script API ModelId Test",
        modelId,
        mode: "chat",
        maxTurns: 3,
      },
      script: {
        path: preparedScript.absolutePath,
        snapshot: preparedScript.promptScriptParsed.body.trim(),
      },
    };

    const session = await client.createSession(sessionInput);

    expect(session.modelSurface).toBe(modelSurface);
    expect(session.metadata?.modelId).toBe(modelId);

    const linkResult = await promptScriptService.linkChatSession(
      preparedScript.absolutePath,
      session.id,
    );

    expect(linkResult.chatSession.metadata?.modelId).toBe(modelId);

    const prompts = linkResult.promptScript.promptScriptParsed.prompts;
    expect(prompts.length).toBeGreaterThan(0);

    const promptArgs = ["Svelte integration test suites"];
    const promptText = substituteArgs(prompts[0]!.content, promptArgs).trim();

    const messageInput: SendChatMessageInput = {
      chatSessionId: session.id,
      input: {
        role: "user",
        content: promptText,
      },
    };

    const result = await client.sendMessage(messageInput);

    expect(result.session.metadata?.modelId).toBe(modelId);
    expect(result.session.metadata?.currentTurn).toBe(1);

    const userMessage = result.session.messages.find(
      (message) => message.message.role === "user",
    );
    expect(userMessage).toBeDefined();
    expect(getModelMessageContentString(userMessage!.message)).toContain(
      "Svelte integration test suites",
    );

    const assistantMessages = result.session.messages.filter(
      (message) => message.message.role === "assistant",
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

    const updatedScript = await promptScriptRepo.read(
      preparedScript.absolutePath,
    );
    expect(updatedScript.promptScriptParsed.metadata.chatSessionId).toBe(
      session.id,
    );
  });
});
