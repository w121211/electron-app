// tests/integration/generate-prompt.integration.test.ts
// Run with: npm test -- tests/integration/generate-prompt.integration.test.ts --run
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
import { ApiChatClient } from "../../src/core/services/chat-engine/api-chat-client.js";
import {
  ToolRegistryImpl,
  type ToolRegistry,
} from "../../src/core/services/tool-call/tool-registry.js";
import {
  PromptRepositoryImpl,
  type PromptRepository,
} from "../../src/core/services/prompt/prompt-repository.js";
import { PromptService } from "../../src/core/services/prompt/prompt-service.js";
import { ChatService } from "../../src/core/services/chat/chat-service.js";
import { TerminalChatClient } from "../../src/core/services/external-chat/terminal-chat-client.js";
import { WebChatClient } from "../../src/core/services/external-chat/web-chat-client.js";
import { getModelMessageContentString } from "../../src/core/utils/message-utils.js";

const hasGatewayCredentials = Boolean(process.env.AI_GATEWAY_API_KEY);

const describeIntegration = describe.runIf(hasGatewayCredentials);

describeIntegration("generatePrompt integration", () => {
  let chatSessionRepository: ChatSessionRepository;
  let promptRepository: PromptRepository;
  let apiChatClient: ApiChatClient;
  let promptService: PromptService;
  let chatService: ChatService;
  let toolRegistry: ToolRegistry;
  let databasePath: string;
  let terminalChatClient: TerminalChatClient;
  let webChatClient: WebChatClient;

  beforeAll(async () => {
    databasePath = join(tmpdir(), `generate-prompt-test-${randomUUID()}.db`);

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
        name: "GeneratePromptIntegrationTest",
      }),
    );

    apiChatClient = new ApiChatClient({
      repository: chatSessionRepository,
      eventBus,
      toolRegistry,
    });

    promptService = new PromptService({
      repository: promptRepository,
    });

    terminalChatClient = new TerminalChatClient(
      eventBus,
      chatSessionRepository,
    );
    webChatClient = new WebChatClient(eventBus, chatSessionRepository);

    chatService = new ChatService({
      promptService,
      apiChatClient,
      terminalChatClient,
      webChatClient,
    });
  });

  afterAll(async () => {
    if (databasePath) {
      await fs.unlink(databasePath).catch(() => {
        // Ignore cleanup failures
      });
    }
  });

  it("generates a prompt from user input using the generate-prompt template", async () => {
    const userInput = "write a function that calculates fibonacci numbers";

    // Step 1: Create the generate-prompt template
    const generatePromptTemplate = await promptService.createPrompt({
      slug: "generate-prompt",
      content: "Generate a prompt based on the user request: {{userInput}}",
      metadata: {
        title: "Generate Prompt",
        modelId: "api:aigateway:google/gemini-2.0-flash-lite",
        variables: {
          userInput: {
            type: "string",
            label: "User Input",
            required: true,
          },
        },
      },
    });

    expect(generatePromptTemplate.id).toBeDefined();
    expect(generatePromptTemplate.slug).toBe("generate-prompt");
    expect(generatePromptTemplate.metadata?.modelId).toBe(
      "api:aigateway:google/gemini-2.0-flash-lite",
    );

    // Step 2: Create chat session with prompt args
    const session = await chatService.createChat({
      modelId: "api:aigateway:google/gemini-2.0-flash-lite",
      sourcePromptId: generatePromptTemplate.id,
      promptArgs: { userInput },
      metadata: {
        title: "Generate Prompt",
        mode: "chat",
        maxTurns: 3,
      },
    });

    // Verify session was created
    expect(session.id).toBeDefined();
    expect(session.sourcePromptId).toBe(generatePromptTemplate.id);
    expect(session.metadata?.modelId).toBe(
      "api:aigateway:google/gemini-2.0-flash-lite",
    );
    expect(session.metadata?.promptSnapshot).toBeDefined();
    expect(session.metadata?.promptSnapshot?.args?.userInput).toBe(userInput);

    // Step 3: Verify the initial message contains the substituted content
    const userMessage = session.messages.find(
      (msg) => msg.message.role === "user",
    );
    expect(userMessage).toBeDefined();
    const userMessageContent = getModelMessageContentString(
      userMessage!.message,
    );
    expect(userMessageContent).toContain(userInput);
    expect(userMessageContent).not.toContain("{{userInput}}");

    // Step 4: Verify assistant response exists
    const assistantMessages = session.messages.filter(
      (msg) => msg.message.role === "assistant",
    );
    expect(assistantMessages.length).toBeGreaterThan(0);

    // Verify assistant response is non-empty
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

    // Step 5: Extract the generated prompt from the last assistant message
    const lastMessage = session.messages[session.messages.length - 1];
    expect(lastMessage).toBeDefined();
    expect(lastMessage?.message.role).toBe("assistant");

    const generatedPrompt = getModelMessageContentString(lastMessage!.message);
    expect(generatedPrompt).toBeDefined();
    expect(generatedPrompt.trim().length).toBeGreaterThan(0);

    console.log("Generated prompt:", generatedPrompt);
  }, 30000); // 30s timeout for API call

  it("generates a prompt and uses it to create a new chat session", async () => {
    const userInput = "explain how async/await works in JavaScript";

    // Step 1: Get the generate-prompt template
    const generatePromptTemplate =
      await promptService.findBySlug("generate-prompt");
    if (!generatePromptTemplate) {
      throw new Error("generate-prompt template not found");
    }

    // Step 2: Create chat session with the generate-prompt template
    const generateSession = await chatService.createChat({
      modelId: "api:aigateway:google/gemini-2.0-flash-lite",
      sourcePromptId: generatePromptTemplate.id,
      promptArgs: { userInput },
      metadata: {
        title: "Generate Prompt",
        mode: "chat",
        maxTurns: 3,
      },
    });

    // Step 3: Extract the generated prompt
    const lastMessage =
      generateSession.messages[generateSession.messages.length - 1];
    expect(lastMessage?.message.role).toBe("assistant");
    const generatedPrompt = getModelMessageContentString(lastMessage!.message);

    // Step 4: Create a new chat session with the generated prompt
    const newSession = await chatService.createChat({
      modelId: "api:aigateway:openai/gpt-4o-mini",
      initialMessages: [
        {
          role: "user",
          content: generatedPrompt,
        },
      ],
      metadata: {
        title: "Using generated prompt",
        mode: "chat",
        maxTurns: 5,
      },
    });

    // Verify new session was created
    expect(newSession.id).toBeDefined();
    expect(newSession.id).not.toBe(generateSession.id);

    // Verify the new session has the generated prompt
    const newUserMessage = newSession.messages.find(
      (msg) => msg.message.role === "user",
    );
    expect(newUserMessage).toBeDefined();
    expect(getModelMessageContentString(newUserMessage!.message)).toBe(
      generatedPrompt,
    );

    // Verify the new session has a response
    const newAssistantMessages = newSession.messages.filter(
      (msg) => msg.message.role === "assistant",
    );
    expect(newAssistantMessages.length).toBeGreaterThan(0);

    console.log("Original user input:", userInput);
    console.log("Generated prompt:", generatedPrompt);
  }, 60000); // 60s timeout for two API calls
});
