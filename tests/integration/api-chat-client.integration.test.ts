// tests/integration/api-chat-client.integration.test.ts
// Run with: AI_GATEWAY_API_KEY=... npx vitest run tests/integration/api-chat-client.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Logger } from "tslog";
import {
  ApiChatClient,
  type CreateChatSessionInput,
  type SendChatMessageInput,
} from "../../src/core/services/chat-engine/api-chat-client.js";
import { EventBus } from "../../src/core/event-bus.js";
import {
  ChatSessionRepositoryImpl,
  type ChatSessionRepository,
} from "../../src/core/services/chat/chat-session-repository.js";
import {
  ToolRegistryImpl,
  type ToolRegistry,
} from "../../src/core/services/tool-call/tool-registry.js";

const hasGatewayCredentials =
  Boolean(process.env.AI_GATEWAY_API_KEY) ||
  Boolean(process.env.VERCEL_OIDC_TOKEN);

const describeIntegration = describe.runIf(hasGatewayCredentials);

describeIntegration("ApiChatClient (Gateway integration)", () => {
  let repository: ChatSessionRepository;
  let client: ApiChatClient;
  let toolRegistry: ToolRegistry;
  let databasePath: string;

  beforeAll(() => {
    databasePath = join(
      tmpdir(),
      `api-chat-client-integration-${randomUUID()}.db`,
    );

    repository = new ChatSessionRepositoryImpl({
      databaseFilePath: databasePath,
    });

    const eventBus = new EventBus({ environment: "server" });

    toolRegistry = new ToolRegistryImpl(
      eventBus,
      new Logger({
        name: "ApiChatClientIntegrationTest",
      }),
    );

    client = new ApiChatClient({
      repository,
      eventBus,
      toolRegistry,
    });
  });

  afterAll(async () => {
    if (!databasePath) {
      return;
    }

    try {
      await fs.unlink(databasePath);
    } catch {
      // Ignore missing tmp file cleanup failures
    }
  });

  it("streams a response through the real AI SDK", async () => {
    const modelId =
      (process.env.AI_GATEWAY_MODEL_ID as `${string}/${string}` | undefined) ??
      "openai/gpt-4o-mini";

    const sessionInput: CreateChatSessionInput = {
      sessionType: "chat_engine",
      metadata: {
        modelId,
        maxTurns: 3,
      },
    };

    const session = await client.createSession(sessionInput);

    const messageInput: SendChatMessageInput = {
      chatSessionId: session.id,
      input: {
        role: "user",
        content: "Say a short hello and mention this is an integration test.",
      },
    };

    const result = await client.sendMessage(messageInput);

    expect(result.turnResult.streamResult).toBeDefined();
    expect(result.session.metadata?.currentTurn).toBe(1);

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
});

// describe.skipIf(hasGatewayCredentials)(
//   "ApiChatClient (Gateway integration)",
//   () => {
//     it("skips when gateway credentials are not configured", () => {
//       expect(hasGatewayCredentials).toBe(false);
//     });
//   },
// );
