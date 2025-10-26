// tests/integration/generate-prompt.integration.test.ts
// Run with: AI_GATEWAY_API_KEY=... npx vitest run tests/integration/generate-prompt.integration.test.ts
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
import { PromptScriptRepository } from "../../src/core/services/prompt-script/prompt-script-repository.js";
import { PromptScriptService } from "../../src/core/services/prompt-script/prompt-script-service.js";
import { TerminalChatClient } from "../../src/core/services/external-chat/terminal-chat-client.js";
import { WebChatClient } from "../../src/core/services/external-chat/web-chat-client.js";
import { UserSettingsRepositoryImpl } from "../../src/core/services/user-settings-repository.js";
import { getModelMessageContentString } from "../../src/core/utils/message-utils.js";

const hasGatewayCredentials = Boolean(process.env.AI_GATEWAY_API_KEY);

const describeIntegration = describe.runIf(hasGatewayCredentials);

describeIntegration("generatePrompt integration", () => {
  let repository: ChatSessionRepository;
  let client: ApiChatClient;
  let toolRegistry: ToolRegistry;
  let databasePath: string;
  let promptScriptRepo: PromptScriptRepository;
  let promptScriptService: PromptScriptService;
  let terminalChatClient: TerminalChatClient;
  let webChatClient: WebChatClient;
  let workspaceDirectory: string;
  let userSettingsRepo: UserSettingsRepositoryImpl;
  let templateDirectory: string;

  beforeAll(async () => {
    // Create temporary workspace
    workspaceDirectory = await fs.mkdtemp(
      join(tmpdir(), "generate-prompt-test-"),
    );

    // Create database
    databasePath = join(tmpdir(), `generate-prompt-test-${randomUUID()}.db`);

    repository = new ChatSessionRepositoryImpl({
      databaseFilePath: databasePath,
    });

    // Setup event bus
    const eventBus = new EventBus({ environment: "server" });

    // Setup tool registry
    toolRegistry = new ToolRegistryImpl(
      eventBus,
      new Logger({
        name: "GeneratePromptIntegrationTest",
      }),
    );

    // Setup API chat client
    client = new ApiChatClient({
      repository,
      eventBus,
      toolRegistry,
    });

    // Setup user settings with template directory
    templateDirectory = join(workspaceDirectory, "templates");
    await fs.mkdir(templateDirectory, { recursive: true });

    // Create the generate-prompt template
    const templateContent = `---
title: Generate Prompt
modelId: api/aigateway:google/gemini-2.5-flash-lite
---

Generate a prompt based on the user request: $1
`;
    await fs.writeFile(
      join(templateDirectory, "generate-prompt.prompt.md"),
      templateContent,
    );

    // Create chats directory
    const chatsDirectory = join(workspaceDirectory, "chats");
    await fs.mkdir(join(chatsDirectory, "generate-prompt"), {
      recursive: true,
    });

    // Setup user settings repository
    const settingsPath = join(workspaceDirectory, "settings.json");
    userSettingsRepo = new UserSettingsRepositoryImpl(settingsPath);
    await userSettingsRepo.saveSettings({
      project: {
        workspaceDirectory,
      },
      promptScript: {
        templatesFolder: "templates",
        chatsFolder: "chats",
        defaultSaveTo: "chats",
      },
      projectFolders: [],
      providers: {},
    });

    // Setup prompt script service
    promptScriptRepo = new PromptScriptRepository();
    terminalChatClient = new TerminalChatClient(eventBus, repository);
    webChatClient = new WebChatClient(eventBus, repository);
    promptScriptService = new PromptScriptService({
      promptScriptRepo,
      chatSessionRepo: repository,
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

    if (workspaceDirectory) {
      cleanups.push(
        fs
          .rm(workspaceDirectory, { recursive: true, force: true })
          .catch(() => {
            // Ignore cleanup failures
          }),
      );
    }

    await Promise.all(cleanups);
  });

  it("generates a prompt from user input using template substitution", async () => {
    const userInput = "write a function that calculates fibonacci numbers";

    // Get user settings
    const settings = await userSettingsRepo.getSettings();
    const templatePath = join(templateDirectory, "generate-prompt.prompt.md");
    const saveDirectory = join(
      settings.project.workspaceDirectory,
      settings.promptScript.chatsFolder,
      "generate-prompt",
    );

    // Step 1: Create prompt script with template substitution
    const script = await promptScriptService.createPromptScriptFromTemplate({
      directory: saveDirectory,
      templatePath,
      args: [userInput],
    });

    // Verify script was created with correct substitution
    expect(script.promptScriptParsed.prompts[0]?.content).toContain(userInput);
    expect(script.promptScriptParsed.metadata.modelId).toBe(
      "api/aigateway:google/gemini-2.5-flash-lite",
    );

    // Step 2: Create linked chat session
    const sessionData = await client.createSession({
      modelSurface: "api",
      metadata: {
        title: "Generate Prompt Test",
        modelId: "api/aigateway:google/gemini-2.5-flash-lite",
        mode: "chat",
        maxTurns: 3,
      },
      script: {
        path: script.absolutePath,
        snapshot: script.promptScriptParsed.body.trim(),
      },
    });

    const linked = await promptScriptService.linkChatSession(
      script.absolutePath,
      sessionData.id,
    );

    expect(linked.chatSession).toBeDefined();
    expect(linked.chatSession.scriptPath).toBe(script.absolutePath);

    // Step 3: Send first message
    const firstPrompt = script.promptScriptParsed.prompts[0]!.content;
    const result = await client.sendMessage({
      chatSessionId: linked.chatSession.id,
      input: {
        role: "user",
        content: firstPrompt,
      },
    });

    // Verify message was sent
    expect(result.session.messages.length).toBeGreaterThan(0);

    // Verify user message contains the substituted content
    const userMessage = result.session.messages.find(
      (msg) => msg.message.role === "user",
    );
    expect(userMessage).toBeDefined();
    expect(getModelMessageContentString(userMessage!.message)).toContain(
      userInput,
    );

    // Verify assistant response exists
    const assistantMessages = result.session.messages.filter(
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
  }, 30000); // 30s timeout for API call
});
