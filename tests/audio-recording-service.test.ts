// tests/audio-recording-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { AudioRecordingService } from "../src/core/services/audio/audio-recording-service.js";
import type {
  UserSettings,
  UserSettingsRepository,
} from "../src/core/services/user-settings-repository.js";

describe("AudioRecordingService", () => {
  let tempDir: string;
  let service: AudioRecordingService;
  let mockUserSettingsRepo: UserSettingsRepository;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "audio-recording-test-"));

    // Create a mock UserSettingsRepository
    mockUserSettingsRepo = {
      getSettings: async () =>
        ({
          project: {
            directories: [],
            defaultWorkspaceDirectory: tempDir,
          },
          promptScript: {
            chatsFolder: "chats",
            templatesFolder: "chats/templates",
          },
          providers: {},
        }) as UserSettings,
      saveSettings: async (settings: UserSettings) => settings,
      getFilePath: () => path.join(tempDir, "user-settings.json"),
      getDocumentsDir: () => tempDir,
    };

    service = new AudioRecordingService(mockUserSettingsRepo);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("saveRecording", () => {
    it("saves audio data to a file with correct structure", async () => {
      const audioData = Buffer.from("fake audio data");

      const result = await service.saveRecording({ audioData });

      expect(result.absolutePath).toBeTruthy();
      expect(result.relativePath).toBeTruthy();
      expect(result.filename).toMatch(/^\d+-[a-f0-9]+\.webm$/);
      expect(result.fileSize).toBe(audioData.length);
      expect(result.format).toBe("webm");

      const fileExists = await fs
        .access(result.absolutePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      const savedContent = await fs.readFile(result.absolutePath);
      expect(savedContent).toEqual(audioData);
    });

    it("creates date-based folder structure", async () => {
      const audioData = Buffer.from("test audio");

      const result = await service.saveRecording({ audioData });

      const dateFolder = new Date().toISOString().split("T")[0];
      expect(result.relativePath).toContain("audio-recordings");
      expect(result.relativePath).toContain(dateFolder);
    });

    it("supports different audio formats", async () => {
      const audioData = Buffer.from("test audio");

      const result = await service.saveRecording({
        audioData,
        format: "mp3",
      });

      expect(result.format).toBe("mp3");
      expect(result.filename).toMatch(/\.mp3$/);
    });

    it("creates unique filenames for multiple recordings", async () => {
      const audioData = Buffer.from("test");

      const result1 = await service.saveRecording({ audioData });
      const result2 = await service.saveRecording({ audioData });

      expect(result1.filename).not.toBe(result2.filename);
      expect(result1.absolutePath).not.toBe(result2.absolutePath);
    });
  });

  describe("deleteRecording", () => {
    it("deletes an existing recording", async () => {
      const audioData = Buffer.from("test audio");
      const result = await service.saveRecording({ audioData });

      await service.deleteRecording(result.absolutePath);

      const exists = await fs
        .access(result.absolutePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });

    it("throws error when deleting non-existent file", async () => {
      const fakePath = path.join(tempDir, "non-existent.webm");

      await expect(service.deleteRecording(fakePath)).rejects.toThrow();
    });
  });

  describe("cleanupOldRecordings", () => {
    it("deletes recordings older than specified days", async () => {
      const audioDir = path.join(tempDir, "audio-recordings");
      const oldFolder = path.join(audioDir, "2020-01-01");
      const recentFolder = path.join(audioDir, "2099-12-31");

      await fs.mkdir(oldFolder, { recursive: true });
      await fs.mkdir(recentFolder, { recursive: true });
      await fs.writeFile(path.join(oldFolder, "old.webm"), "old");
      await fs.writeFile(path.join(recentFolder, "new.webm"), "new");

      const deletedCount = await service.cleanupOldRecordings(30);

      expect(deletedCount).toBe(1);

      const oldExists = await fs
        .access(oldFolder)
        .then(() => true)
        .catch(() => false);
      const recentExists = await fs
        .access(recentFolder)
        .then(() => true)
        .catch(() => false);

      expect(oldExists).toBe(false);
      expect(recentExists).toBe(true);
    });

    it("returns 0 when no old recordings exist", async () => {
      const deletedCount = await service.cleanupOldRecordings(30);

      expect(deletedCount).toBe(0);
    });

    it("handles missing audio-recordings directory gracefully", async () => {
      const deletedCount = await service.cleanupOldRecordings(30);

      expect(deletedCount).toBe(0);
    });
  });
});
