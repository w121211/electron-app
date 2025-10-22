// tests/multimodal-file-support.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import type { UserModelMessage } from "ai";
import {
  readFileAsBase64,
  writeTextFile,
} from "../src/core/utils/file-utils.js";
import {
  processMultimodalFileReferences,
  extractFileReferences,
} from "../src/core/utils/message-utils.js";
import {
  ChatSessionRepositoryImpl,
  type ChatSessionData,
  type ChatMessage,
  type ChatMetadata,
} from "../src/core/services/chat/chat-session-repository.js";
import { createServerEventBus } from "../src/core/event-bus.js";
import { Logger, ILogObj } from "tslog";
import { ToolRegistryImpl } from "../src/core/services/tool-call/tool-registry.js";
import { ApiChatClient } from "../src/core/services/chat-engine/api-chat-client.js";

function createMockUserMessage(content: string): UserModelMessage {
  return {
    role: "user",
    content,
  };
}

function createMockChatMessage(
  message: UserModelMessage,
  timestamp: Date = new Date(),
): ChatMessage {
  return {
    id: uuidv4(),
    message,
    metadata: {
      timestamp,
    },
  };
}

describe("Multimodal File Support", () => {
  let tempDir: string;
  let projectPath: string;

  beforeEach(async () => {
    tempDir = `/tmp/multimodal-test-${Date.now()}`;
    projectPath = path.join(tempDir, "project");
    await fs.mkdir(projectPath, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Directory might not exist, ignore cleanup error
    }
  });

  describe("readFileAsBase64", () => {
    it("should read a text file as base64", async () => {
      const filePath = path.join(projectPath, "test.txt");
      const content = "Hello, World!";
      await fs.writeFile(filePath, content);

      const base64 = await readFileAsBase64(filePath);
      expect(base64).toBe(Buffer.from(content).toString("base64"));
    });

    it("should read a binary file as base64", async () => {
      const filePath = path.join(projectPath, "test.bin");
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]);
      await fs.writeFile(filePath, buffer);

      const base64 = await readFileAsBase64(filePath);
      expect(base64).toBe(buffer.toString("base64"));
    });

    it("should read an image file as base64", async () => {
      const filePath = path.join(projectPath, "image.png");
      // Create a minimal 1x1 PNG file
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
        0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);
      await fs.writeFile(filePath, pngBuffer);

      const base64 = await readFileAsBase64(filePath);
      expect(base64).toBe(pngBuffer.toString("base64"));
    });

    it("should throw error for non-existent file", async () => {
      const filePath = path.join(projectPath, "nonexistent.txt");
      await expect(readFileAsBase64(filePath)).rejects.toThrow();
    });
  });

  describe("processMultimodalFileReferences", () => {
    it("should return plain text when no file references", async () => {
      const message = "Hello, how are you?";
      const result = await processMultimodalFileReferences(message, projectPath);

      expect(result).toBe(message);
    });

    it("should process text file references", async () => {
      const filePath = path.join(projectPath, "notes.txt");
      const fileContent = "These are my notes.";
      await fs.writeFile(filePath, fileContent);

      const message = "Please read @notes.txt and summarize it.";
      const result = await processMultimodalFileReferences(message, projectPath);

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ type: "text", text: message });
        expect(result[1].type).toBe("text");
        expect((result[1] as { text: string }).text).toContain("@notes.txt");
        expect((result[1] as { text: string }).text).toContain(fileContent);
      }
    });

    it("should process image file as ImagePart", async () => {
      const imagePath = path.join(projectPath, "photo.png");
      // Create a minimal 1x1 PNG file
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
        0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);
      await fs.writeFile(imagePath, pngBuffer);

      const message = "What's in this @photo.png image";
      const result = await processMultimodalFileReferences(message, projectPath);

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ type: "text", text: message });
        expect(result[1]).toMatchObject({
          type: "image",
          mediaType: "image/png",
        });
        expect((result[1] as { image: string }).image).toBe(
          pngBuffer.toString("base64"),
        );
      }
    });

    it("should process audio file as FilePart", async () => {
      const audioPath = path.join(projectPath, "recording.mp3");
      const audioBuffer = Buffer.from("fake-mp3-data");
      await fs.writeFile(audioPath, audioBuffer);

      const message = "Transcribe @recording.mp3";
      const result = await processMultimodalFileReferences(message, projectPath);

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ type: "text", text: message });
        expect(result[1]).toMatchObject({
          type: "file",
          mediaType: "audio/mpeg",
        });
        expect((result[1] as { data: string }).data).toBe(
          audioBuffer.toString("base64"),
        );
      }
    });

    it("should process video file as FilePart", async () => {
      const videoPath = path.join(projectPath, "clip.mp4");
      const videoBuffer = Buffer.from("fake-mp4-data");
      await fs.writeFile(videoPath, videoBuffer);

      const message = "Analyze @clip.mp4";
      const result = await processMultimodalFileReferences(message, projectPath);

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ type: "text", text: message });
        expect(result[1]).toMatchObject({
          type: "file",
          mediaType: "video/mp4",
        });
        expect((result[1] as { data: string }).data).toBe(
          videoBuffer.toString("base64"),
        );
      }
    });

    it("should process multiple files with mixed types", async () => {
      const textPath = path.join(projectPath, "doc.txt");
      const imagePath = path.join(projectPath, "img.png");
      await fs.writeFile(textPath, "Text content");
      await fs.writeFile(imagePath, Buffer.from("png-data"));

      const message = "Compare @doc.txt and @img.png";
      const result = await processMultimodalFileReferences(message, projectPath);

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ type: "text", text: message });
        expect(result[1].type).toBe("text");
        expect(result[2].type).toBe("image");
      }
    });

    it("should skip files outside project path", async () => {
      const outsidePath = path.join(tempDir, "outside.txt");
      await fs.writeFile(outsidePath, "Outside content");

      const message = `Read @${outsidePath}`;
      const result = await processMultimodalFileReferences(message, projectPath);

      expect(Array.isArray(result)).toBe(false);
      expect(result).toBe(message);
    });

    it("should handle non-existent files gracefully", async () => {
      const message = "Read @nonexistent.txt";
      const result = await processMultimodalFileReferences(message, projectPath);

      expect(Array.isArray(result)).toBe(false);
      expect(result).toBe(message);
    });

    it("should handle quoted file paths with spaces", async () => {
      const filePath = path.join(projectPath, "my notes.txt");
      await fs.writeFile(filePath, "Content with spaces");

      const message = 'Read @"my notes.txt"';
      const result = await processMultimodalFileReferences(message, projectPath);

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result).toHaveLength(2);
        expect(result[1].type).toBe("text");
        expect((result[1] as { text: string }).text).toContain(
          "Content with spaces",
        );
      }
    });
  });

  describe("ChatSessionRepository projectPath storage", () => {
    let repository: ChatSessionRepositoryImpl;
    let tempDbPath: string;

    beforeEach(async () => {
      tempDbPath = `/tmp/chat-session-multimodal-test-${Date.now()}.db`;
      repository = new ChatSessionRepositoryImpl({
        databaseFilePath: tempDbPath,
      });
    });

    afterEach(async () => {
      try {
        await fs.unlink(tempDbPath);
      } catch {
        // Database file might not exist, ignore cleanup error
      }
    });

    it("should store projectPath in metadata", async () => {
      const session: ChatSessionData = {
        id: uuidv4(),
        sessionType: "chat_engine",
        state: "active",
        messages: [],
        metadata: {
          projectPath: "/path/to/project",
          modelId: "openai/gpt-4o-mini",
        },
        scriptPath: null,
        scriptModifiedAt: null,
        scriptHash: null,
        scriptSnapshot: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.create(session);
      const retrieved = await repository.getById(session.id);

      expect(retrieved?.metadata?.projectPath).toBe("/path/to/project");
    });

    it("should update projectPath in metadata", async () => {
      const session: ChatSessionData = {
        id: uuidv4(),
        sessionType: "chat_engine",
        state: "active",
        messages: [],
        metadata: {
          projectPath: "/original/path",
          modelId: "openai/gpt-4o-mini",
        },
        scriptPath: null,
        scriptModifiedAt: null,
        scriptHash: null,
        scriptSnapshot: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.create(session);

      const updatedSession = {
        ...session,
        metadata: {
          ...session.metadata,
          projectPath: "/updated/path",
        },
        updatedAt: new Date(),
      };

      await repository.update(updatedSession);
      const retrieved = await repository.getById(session.id);

      expect(retrieved?.metadata?.projectPath).toBe("/updated/path");
    });

    it("should handle sessions without projectPath", async () => {
      const session: ChatSessionData = {
        id: uuidv4(),
        sessionType: "chat_engine",
        state: "active",
        messages: [],
        metadata: {
          modelId: "openai/gpt-4o-mini",
        },
        scriptPath: null,
        scriptModifiedAt: null,
        scriptHash: null,
        scriptSnapshot: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.create(session);
      const retrieved = await repository.getById(session.id);

      expect(retrieved?.metadata?.projectPath).toBeUndefined();
    });
  });

  describe("ApiChatClient multimodal integration", () => {
    let repository: ChatSessionRepositoryImpl;
    let tempDbPath: string;
    let chatClient: ApiChatClient;
    let eventBus: ReturnType<typeof createServerEventBus>;
    let toolRegistry: ToolRegistryImpl;

    beforeEach(async () => {
      tempDbPath = `/tmp/api-chat-multimodal-test-${Date.now()}.db`;
      repository = new ChatSessionRepositoryImpl({
        databaseFilePath: tempDbPath,
      });

      const logger = new Logger<ILogObj>({ name: "MultimodalTest" });
      eventBus = createServerEventBus({ logger });
      toolRegistry = new ToolRegistryImpl(eventBus, logger);

      chatClient = new ApiChatClient({
        repository,
        eventBus,
        toolRegistry,
      });
    });

    afterEach(async () => {
      try {
        await fs.unlink(tempDbPath);
      } catch {
        // Database file might not exist, ignore cleanup error
      }
    });

    it("should create session with projectPath in metadata", async () => {
      const session = await chatClient.createSession({
        sessionType: "chat_engine",
        metadata: {
          projectPath: projectPath,
          modelId: "openai/gpt-4o-mini",
        },
      });

      expect(session.metadata?.projectPath).toBe(projectPath);

      const retrieved = await chatClient.getSession(session.id);
      expect(retrieved?.metadata?.projectPath).toBe(projectPath);
    });

    it("should process multimodal files when projectPath is set", async () => {
      const audioPath = path.join(projectPath, "test.mp3");
      await fs.writeFile(audioPath, Buffer.from("fake-audio"));

      const session = await chatClient.createSession({
        sessionType: "chat_engine",
        metadata: {
          projectPath: projectPath,
          modelId: "openai/gpt-4o-mini",
        },
      });

      // Verify that the session has projectPath
      const retrieved = await chatClient.getSession(session.id);
      expect(retrieved?.metadata?.projectPath).toBe(projectPath);

      // Note: Full integration test with sendMessage would require mocking AI providers
      // This test verifies the metadata structure is properly stored
    });

    it("should handle sessions without projectPath", async () => {
      const session = await chatClient.createSession({
        sessionType: "chat_engine",
        metadata: {
          modelId: "openai/gpt-4o-mini",
        },
      });

      expect(session.metadata?.projectPath).toBeUndefined();

      const retrieved = await chatClient.getSession(session.id);
      expect(retrieved?.metadata?.projectPath).toBeUndefined();
    });
  });

  describe("File reference extraction", () => {
    it("should extract simple file references", () => {
      const message = "Read @file1.txt and @file2.md";
      const refs = extractFileReferences(message);

      expect(refs).toEqual(["file1.txt", "file2.md"]);
    });

    it("should extract quoted file references", () => {
      const message = 'Read @"my file.txt" and @"another file.md"';
      const refs = extractFileReferences(message);

      expect(refs).toEqual(["my file.txt", "another file.md"]);
    });

    it("should extract mixed references", () => {
      const message = 'Check @file.txt and @"my file.md" then @audio.mp3';
      const refs = extractFileReferences(message);

      expect(refs).toEqual(["my file.md", "file.txt", "audio.mp3"]);
    });

    it("should handle paths with directories", () => {
      const message = "Read @docs/readme.md and @src/main.ts";
      const refs = extractFileReferences(message);

      expect(refs).toEqual(["docs/readme.md", "src/main.ts"]);
    });

    it("should handle audio/video file extensions", () => {
      const message = "Transcribe @audio.mp3 @video.mp4 @sound.wav";
      const refs = extractFileReferences(message);

      expect(refs).toEqual(["audio.mp3", "video.mp4", "sound.wav"]);
    });

    it("should handle image file extensions", () => {
      const message = "Analyze @image.png @photo.jpg @graphic.gif";
      const refs = extractFileReferences(message);

      expect(refs).toEqual(["image.png", "photo.jpg", "graphic.gif"]);
    });
  });
});
