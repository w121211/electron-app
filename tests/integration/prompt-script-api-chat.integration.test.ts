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
import { substituteArguments } from "../../src/core/services/prompt-script/prompt-script-parser.js";
import { getModelMessageContentString } from "../../src/core/utils/message-utils.js";

const hasGatewayCredentials = Boolean(process.env.AI_GATEWAY_API_KEY);

const describeIntegration = describe.runIf(hasGatewayCredentials);

describeIntegration("Prompt script API chat integration", () => {
  let repository: ChatSessionRepository;
  let client: ApiChatClient;
  let toolRegistry: ToolRegistry;
  let databasePath: string;
  let promptScriptRepo: PromptScriptRepository;
  let promptScriptService: PromptScriptService;
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
    promptScriptService = new PromptScriptService(promptScriptRepo, repository);
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
    engine: api
    modelId: openai/gpt-4o-mini
    ---
    
    <!-- user input="true" label="Name" -->
    Say hello to $1 and mention this is a prompt script integration test.
    `;
    await fs.writeFile(createdScript.absolutePath, scriptMarkdown);

    const preparedScript = await promptScriptRepo.read(
      createdScript.absolutePath,
    );

    const sessionInput: CreateChatSessionInput = {
      modelSurface: "api",
      metadata: {
        title: "Prompt Script Integration Test",
        modelId: preparedScript.promptScriptParsed.metadata
          .modelId as `${string}/${string}`,
        mode: "chat",
        maxTurns: 3,
      },
      script: {
        path: preparedScript.absolutePath,
        snapshot: preparedScript.promptScriptParsed.body.trim(),
      },
    };

    const session = await client.createSession(sessionInput);

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
    const promptText = substituteArguments(
      prompts[0]!.content,
      promptArgs,
    ).trim();

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
});
