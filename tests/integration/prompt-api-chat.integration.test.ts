// tests/integration/prompt-api-chat.integration.test.ts
// Run with: AI_GATEWAY_API_KEY=... npm test -- tests/integration/prompt-api-chat.integration.test.ts --run
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
import {
  PromptRepositoryImpl,
  type PromptRepository,
} from "../../src/core/services/prompt/prompt-repository.js";
import { PromptService } from "../../src/core/services/prompt/prompt-service.js";
import { getModelMessageContentString } from "../../src/core/utils/message-utils.js";
import { parseModelId } from "../../src/core/utils/model-utils-v2.js";

const hasGatewayCredentials = Boolean(process.env.AI_GATEWAY_API_KEY);

const describeIntegration = describe.runIf(hasGatewayCredentials);

describeIntegration("Prompt API chat integration", () => {
  let chatSessionRepository: ChatSessionRepository;
  let promptRepository: PromptRepository;
  let chatClient: ApiChatClient;
  let promptService: PromptService;
  let toolRegistry: ToolRegistry;
  let databasePath: string;

  beforeAll(async () => {
    databasePath = join(
      tmpdir(),
      `prompt-api-chat-integration-${randomUUID()}.db`,
    );

    chatSessionRepository = new ChatSessionRepositoryImpl({
      databaseFilePath: databasePath,
    });

    promptRepository = new PromptRepositoryImpl({
      databaseFilePath: databasePath,
    });

    const eventBus = new EventBus({ environment: "server" });

    toolRegistry = new ToolRegistryImpl(
      eventBus,
      new Logger({
        name: "PromptApiChatIntegrationTest",
      }),
    );

    chatClient = new ApiChatClient({
      repository: chatSessionRepository,
      eventBus,
      toolRegistry,
    });

    promptService = new PromptService({
      repository: promptRepository,
    });
  });

  afterAll(async () => {
    if (databasePath) {
      await fs.unlink(databasePath).catch(() => {
        // Ignore cleanup failures
      });
    }
  });

  it("creates a prompt, links it to a chat session, and executes it", async () => {
    const prompt = await promptService.createPrompt({
      slug: "greeting-test",
      content:
        "Say hello to {{name}} and mention this is a prompt integration test.",
      metadata: {
        title: "Prompt Integration Test",
        description: "Test prompt for integration testing",
        tags: ["test", "integration"],
        modelId: "api:aigateway:openai/gpt-4o-mini",
        variables: {
          name: {
            type: "string",
            label: "Name",
            required: true,
          },
        },
      },
    });

    expect(prompt.id).toBeDefined();
    expect(prompt.slug).toBe("greeting-test");
    expect(prompt.metadata?.title).toBe("Prompt Integration Test");
    expect(prompt.metadata?.modelId).toBe("api:aigateway:openai/gpt-4o-mini");

    const modelId = ModelIdSchema.parse(prompt.metadata!.modelId!);
    const modelSurface = parseModelId(modelId).surface;

    const sessionInput: CreateChatSessionInput = {
      modelSurface,
      sourcePromptId: prompt.id,
      metadata: {
        title: "Prompt Integration Test",
        modelId,
        mode: "chat",
        maxTurns: 3,
      },
    };

    const session = await chatClient.createSession(sessionInput);
    expect(session.modelSurface).toBe(modelSurface);
    expect(session.sourcePromptId).toBe(prompt.id);

    const snapshot = promptService.buildSnapshot(prompt, {
      name: "Codex integration",
    });

    expect(snapshot.promptId).toBe(prompt.id);
    expect(snapshot.args?.name).toBe("Codex integration");

    const promptText = promptService.applyPromptArgs(prompt.content, {
      name: "Codex integration",
    });

    expect(promptText).toContain("Codex integration");
    expect(promptText).not.toContain("{{name}}");

    const messageInput: SendChatMessageInput = {
      chatSessionId: session.id,
      input: {
        role: "user",
        content: promptText,
      },
    };

    const result = await chatClient.sendMessage(messageInput);

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

    const retrievedPrompt = await promptService.getPrompt(prompt.id);
    expect(retrievedPrompt).toBeDefined();
    expect(retrievedPrompt?.id).toBe(prompt.id);
  });

  it("searches and retrieves prompts with filters", async () => {
    await promptService.createPrompt({
      slug: "search-test-1",
      content: "This is a test prompt for searching functionality.",
      metadata: {
        title: "Search Test 1",
        tags: ["search", "test"],
      },
    });

    await promptService.createPrompt({
      slug: "search-test-2",
      content: "Another test prompt with different content.",
      metadata: {
        title: "Search Test 2",
        tags: ["search", "different"],
      },
    });

    const searchByText = await promptService.searchPrompts({
      text: "searching",
    });
    expect(searchByText.length).toBeGreaterThan(0);
    expect(searchByText.some((p) => p.slug === "search-test-1")).toBe(true);

    const searchByTag = await promptService.searchPrompts({
      tag: "search",
    });
    expect(searchByTag.length).toBeGreaterThanOrEqual(2);

    const allPrompts = await promptService.listPrompts();
    expect(allPrompts.length).toBeGreaterThanOrEqual(3);

    const foundBySlug = await promptService.findBySlug("search-test-1");
    expect(foundBySlug).toBeDefined();
    expect(foundBySlug?.slug).toBe("search-test-1");
  });

  it("updates a prompt and executes the updated version", async () => {
    const originalPrompt = await promptService.createPrompt({
      slug: "update-test",
      content: "Original prompt content: {{message}}",
      metadata: {
        title: "Update Test",
      },
    });

    const updatedPrompt = await promptService.updatePrompt(originalPrompt.id, {
      content: "Updated prompt content: {{message}} with extra context.",
      metadata: {
        title: "Update Test - Updated",
        tags: ["updated"],
      },
    });

    expect(updatedPrompt.id).toBe(originalPrompt.id);
    expect(updatedPrompt.content).toContain("Updated prompt content");
    expect(updatedPrompt.metadata?.title).toBe("Update Test - Updated");

    const appliedText = promptService.applyPromptArgs(updatedPrompt.content, {
      message: "Hello from updated prompt",
    });

    expect(appliedText).toContain("Hello from updated prompt");
    expect(appliedText).toContain("with extra context");
    expect(appliedText).not.toContain("{{message}}");
  });

  it("handles prompt execution with API model through chat session", async () => {
    const prompt = await promptService.createPrompt({
      slug: "api-model-test",
      content:
        "Generate a brief system prompt for {{topic}} focusing on reliability.",
      metadata: {
        title: "API Model Test",
        modelId: "api:aigateway:openai/gpt-4o-mini",
        variables: {
          topic: {
            type: "string",
            label: "Topic",
          },
        },
      },
    });

    const modelId = ModelIdSchema.parse(prompt.metadata!.modelId!);
    const modelSurface = parseModelId(modelId).surface;

    const sessionInput: CreateChatSessionInput = {
      modelSurface,
      sourcePromptId: prompt.id,
      metadata: {
        title: "API Model Test Session",
        modelId,
        mode: "chat",
        maxTurns: 3,
      },
    };

    const session = await chatClient.createSession(sessionInput);

    expect(session.modelSurface).toBe(modelSurface);
    expect(session.metadata?.modelId).toBe(modelId);
    expect(session.sourcePromptId).toBe(prompt.id);

    const promptText = promptService.applyPromptArgs(prompt.content, {
      topic: "integration test suites",
    });

    const messageInput: SendChatMessageInput = {
      chatSessionId: session.id,
      input: {
        role: "user",
        content: promptText,
      },
    };

    const result = await chatClient.sendMessage(messageInput);

    expect(result.session.metadata?.modelId).toBe(modelId);
    expect(result.session.metadata?.currentTurn).toBe(1);

    const userMessage = result.session.messages.find(
      (message) => message.message.role === "user",
    );
    expect(userMessage).toBeDefined();
    expect(getModelMessageContentString(userMessage!.message)).toContain(
      "integration test suites",
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
  }, 30000);
});
