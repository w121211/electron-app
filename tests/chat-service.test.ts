// tests/chat-service.test.ts
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { ChatService } from "../src/core/services/chat/chat-service.js";
import type {
  ChatMessage,
  ChatMetadata,
  ChatSessionData,
  ModelSurfaceV2,
} from "../src/core/services/chat/chat-session-repository.js";
import type {
  CreateChatSessionInput,
  ApiTurnResult,
} from "../src/core/services/chat-engine/api-chat-client.js";
import type {
  CreateExternalSessionInput,
  IExternalChatClient,
} from "../src/core/services/external-chat/external-chat-client.interface.js";
import { PromptService } from "../src/core/services/prompt/prompt-service.js";
import type {
  Prompt,
  PromptMetadata,
} from "../src/core/services/prompt/prompt-types.js";
import type {
  PromptRepository,
  PromptRepositoryCreateInput,
  PromptRepositoryUpdateInput,
  PromptSearchFilters,
} from "../src/core/services/prompt/prompt-repository.js";

class InMemoryPromptRepository implements PromptRepository {
  private readonly prompts = new Map<string, Prompt>();
  private readonly slugIndex = new Map<string, string>();

  async create(input: PromptRepositoryCreateInput): Promise<Prompt> {
    const now = new Date();
    const createdAt = input.createdAt ?? now;
    const updatedAt = input.updatedAt ?? now;
    const prompt: Prompt = {
      id: input.id,
      slug: input.slug ?? null,
      content: input.content,
      metadata: input.metadata ?? null,
      createdAt,
      updatedAt,
    };
    this.prompts.set(prompt.id, this.clone(prompt));
    if (prompt.slug) {
      this.slugIndex.set(prompt.slug, prompt.id);
    }
    return this.clone(prompt);
  }

  async update(
    id: string,
    updates: PromptRepositoryUpdateInput,
  ): Promise<Prompt> {
    const existing = this.prompts.get(id);
    if (!existing) {
      throw new Error(`Prompt ${id} not found`);
    }

    const updated: Prompt = {
      ...existing,
      slug: updates.slug ?? existing.slug,
      content: updates.content ?? existing.content,
      metadata:
        updates.metadata === undefined
          ? existing.metadata
          : (updates.metadata ?? null),
      updatedAt: updates.updatedAt ?? new Date(),
    };

    this.prompts.set(id, this.clone(updated));
    if (existing.slug && existing.slug !== updated.slug) {
      this.slugIndex.delete(existing.slug);
    }
    if (updated.slug) {
      this.slugIndex.set(updated.slug, id);
    }

    return this.clone(updated);
  }

  async delete(id: string): Promise<void> {
    const existing = this.prompts.get(id);
    if (existing?.slug) {
      this.slugIndex.delete(existing.slug);
    }
    this.prompts.delete(id);
  }

  async getById(id: string): Promise<Prompt | null> {
    const prompt = this.prompts.get(id);
    return prompt ? this.clone(prompt) : null;
  }

  async findBySlug(slug: string): Promise<Prompt | null> {
    const id = this.slugIndex.get(slug);
    if (!id) {
      return null;
    }
    return this.getById(id);
  }

  async list(): Promise<Prompt[]> {
    return Array.from(this.prompts.values()).map((prompt) =>
      this.clone(prompt),
    );
  }

  async search(filters: PromptSearchFilters): Promise<Prompt[]> {
    const items = await this.list();
    if (!filters.text && !filters.tag) {
      return items;
    }

    return items.filter((prompt) => {
      if (filters.text) {
        const text = filters.text.toLowerCase();
        const metadataText = prompt.metadata
          ? JSON.stringify(prompt.metadata).toLowerCase()
          : "";
        if (
          !prompt.content.toLowerCase().includes(text) &&
          !metadataText.includes(text)
        ) {
          return false;
        }
      }

      if (filters.tag && prompt.metadata?.tags) {
        return prompt.metadata.tags.includes(filters.tag);
      }

      return filters.tag ? false : true;
    });
  }

  private clone(prompt: Prompt): Prompt {
    return {
      ...prompt,
      metadata: prompt.metadata ? { ...prompt.metadata } : null,
      createdAt: new Date(prompt.createdAt),
      updatedAt: new Date(prompt.updatedAt),
    };
  }
}

type CreateSessionFactory = (input: CreateChatSessionInput) => ChatSessionData;

class ApiChatClientStub {
  lastInput: CreateChatSessionInput | null = null;
  private readonly sessionFactory: CreateSessionFactory;

  constructor(sessionFactory?: CreateSessionFactory) {
    this.sessionFactory =
      sessionFactory ??
      ((input) =>
        createChatSessionData({
          modelSurface: input.modelSurface,
          metadata: input.metadata,
          sourcePromptId: input.sourcePromptId ?? null,
          messages: input.messages ?? [],
        }));
  }

  async createSession(input: CreateChatSessionInput): Promise<ChatSessionData> {
    this.lastInput = input;
    const metadata: ChatMetadata | undefined = input.metadata
      ? { ...input.metadata }
      : undefined;
    return this.sessionFactory({
      ...input,
      metadata,
    });
  }

  async getSession(): Promise<ChatSessionData | null> {
    throw new Error("not implemented");
  }

  async listSessions(): Promise<ChatSessionData[]> {
    throw new Error("not implemented");
  }

  async deleteSession(): Promise<void> {
    throw new Error("not implemented");
  }

  async sendMessage(): Promise<{
    turnResult: ApiTurnResult;
    session: ChatSessionData;
  }> {
    throw new Error("not implemented");
  }

  async confirmToolCall(): Promise<{
    turnResult: ApiTurnResult;
    session: ChatSessionData;
  }> {
    throw new Error("not implemented");
  }

  abort(): void {}
}

class ExternalChatClientStub implements IExternalChatClient {
  lastInput: CreateExternalSessionInput | null = null;
  private readonly surface: "cli" | "web";

  constructor(surface: "cli" | "web") {
    this.surface = surface;
  }

  async createSession(
    input: CreateExternalSessionInput,
  ): Promise<ChatSessionData> {
    this.lastInput = input;
    const metadata: ChatMetadata = {
      ...input.metadata,
      modelId: input.modelId,
      modelSurface: this.surface,
      external:
        this.surface === "cli"
          ? {
              ...input.metadata?.external,
              workingDirectory: input.workingDirectory,
            }
          : input.metadata?.external,
      promptSnapshot: input.promptSnapshot ?? input.metadata?.promptSnapshot,
    };
    return createChatSessionData({
      modelSurface: this.surface,
      metadata,
      sourcePromptId: input.sourcePromptId ?? null,
    });
  }

  async terminateSession(): Promise<ChatSessionData> {
    throw new Error("not implemented");
  }
}

class TerminalChatClientStub extends ExternalChatClientStub {
  constructor() {
    super("cli");
  }
}

class WebChatClientStub extends ExternalChatClientStub {
  constructor() {
    super("web");
  }
}

function createChatSessionData(options: {
  modelSurface: ModelSurfaceV2;
  metadata?: ChatMetadata;
  messages?: ChatMessage[];
  sourcePromptId?: string | null;
}): ChatSessionData {
  const timestamp = new Date();
  return {
    id: randomUUID(),
    modelSurface: options.modelSurface,
    state: "active",
    messages: options.messages ?? [],
    metadata: options.metadata,
    sourcePromptId: options.sourcePromptId ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("ChatService", () => {
  it("creates API chat session with prompt snapshot and rendered prompt message", async () => {
    const repository = new InMemoryPromptRepository();
    const promptService = new PromptService({ repository });
    const promptId = randomUUID();

    const promptMetadata: PromptMetadata = { title: "Greeting Prompt" };
    await repository.create({
      id: promptId,
      slug: "greeting",
      content: "Hello, {{name}}",
      metadata: promptMetadata,
    });

    const apiClient = new ApiChatClientStub();
    const terminalClient = new TerminalChatClientStub();
    const webClient = new WebChatClientStub();

    const service = new ChatService({
      promptService,
      apiChatClient: apiClient as any,
      terminalChatClient: terminalClient as any,
      webChatClient: webClient as any,
    });

    const session = await service.createChat({
      modelId: "api:openai:gpt-4o-mini",
      sourcePromptId: promptId,
      promptArgs: { name: "Alice" },
      initialMessages: [{ role: "assistant", content: "Hi there" }],
    });

    expect(session.modelSurface).toBe("api");
    expect(apiClient.lastInput).not.toBeNull();
    const input = apiClient.lastInput!;

    expect(input.modelSurface).toBe("api");
    expect(input.metadata?.modelId).toBe("api:openai:gpt-4o-mini");
    expect(input.metadata?.modelSurface).toBe("api");
    expect(input.metadata?.title).toBe("Greeting Prompt");
    expect(input.sourcePromptId).toBe(promptId);
    expect(input.messages).toHaveLength(2);
    expect(input.messages?.[0].message.role).toBe("user");
    expect(input.messages?.[0].message.content).toBe("Hello, Alice");
    expect(input.messages?.[1].message.content).toBe("Hi there");
    expect(input.metadata?.promptSnapshot?.promptId).toBe(promptId);
    expect(input.metadata?.promptSnapshot?.args).toEqual({ name: "Alice" });
  });

  it("throws when creating terminal chat without working directory", async () => {
    const repository = new InMemoryPromptRepository();
    const promptService = new PromptService({ repository });
    const apiClient = new ApiChatClientStub();
    const terminalClient = new TerminalChatClientStub();
    const webClient = new WebChatClientStub();

    const service = new ChatService({
      promptService,
      apiChatClient: apiClient as any,
      terminalChatClient: terminalClient as any,
      webChatClient: webClient as any,
    });

    await expect(
      service.createChat({
        modelId: "cli:claude",
      }),
    ).rejects.toThrow("Terminal chats require a working directory.");
  });

  it("creates terminal chat session with working directory metadata", async () => {
    const repository = new InMemoryPromptRepository();
    const promptService = new PromptService({ repository });
    const apiClient = new ApiChatClientStub();
    const terminalClient = new TerminalChatClientStub();
    const webClient = new WebChatClientStub();

    const service = new ChatService({
      promptService,
      apiChatClient: apiClient as any,
      terminalChatClient: terminalClient as any,
      webChatClient: webClient as any,
    });

    const session = await service.createChat({
      modelId: "cli:claude",
      title: "Terminal Run",
      workingDirectory: "/tmp/project",
    });

    expect(session.modelSurface).toBe("cli");
    expect(terminalClient.lastInput).not.toBeNull();
    const input = terminalClient.lastInput!;
    expect(input.modelId).toBe("cli:claude");
    expect(input.workingDirectory).toBe("/tmp/project");
    expect(input.metadata?.modelSurface).toBe("cli");
    expect(input.metadata?.title).toBe("Terminal Run");
    expect(session.metadata?.external?.workingDirectory).toBe("/tmp/project");
  });

  it("creates web chat session and forwards metadata", async () => {
    const repository = new InMemoryPromptRepository();
    const promptService = new PromptService({ repository });
    const apiClient = new ApiChatClientStub();
    const terminalClient = new TerminalChatClientStub();
    const webClient = new WebChatClientStub();

    const service = new ChatService({
      promptService,
      apiChatClient: apiClient as any,
      terminalChatClient: terminalClient as any,
      webChatClient: webClient as any,
    });

    const session = await service.createChat({
      modelId: "web:chatgpt",
      title: "Browser Chat",
      metadata: { tags: ["exploration"] },
    });

    expect(session.modelSurface).toBe("web");
    expect(webClient.lastInput).not.toBeNull();
    const input = webClient.lastInput!;
    expect(input.metadata?.modelSurface).toBe("web");
    expect(input.metadata?.title).toBe("Browser Chat");
    expect(session.metadata?.tags).toEqual(["exploration"]);
  });
});
