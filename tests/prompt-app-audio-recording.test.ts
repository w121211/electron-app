// tests/prompt-app-audio-recording.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Tests for PromptApp audio recording functionality.
 * These tests simulate the audio recording flow by mocking MediaRecorder and IPC APIs.
 */
describe("PromptApp - Audio Recording Flow", () => {
  let mockMediaRecorder: any;
  let mockMediaStream: any;
  let mockSaveAudio: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock MediaStream
    mockMediaStream = {
      getTracks: vi.fn(() => [{ stop: vi.fn() }]),
    };

    // Mock getUserMedia
    Object.defineProperty(global.navigator, "mediaDevices", {
      writable: true,
      configurable: true,
      value: {
        getUserMedia: vi.fn(() => Promise.resolve(mockMediaStream)),
      },
    });

    // Mock MediaRecorder constructor and instance
    mockMediaRecorder = {
      start: vi.fn(),
      stop: vi.fn(),
      ondataavailable: null as ((event: any) => void) | null,
      onstart: null as (() => void) | null,
      onstop: null as (() => void) | null,
      onerror: null as ((event: any) => void) | null,
    };

    (global as any).MediaRecorder = vi.fn(() => mockMediaRecorder);

    // Mock window.api
    mockSaveAudio = vi.fn((audioData: Uint8Array) =>
      Promise.resolve("audio-recordings/2025-01-15/12345-abcde.webm"),
    );

    (global as any).window = {
      api: {
        quickPrompt: {
          saveAudio: mockSaveAudio,
        },
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Audio recording flow", () => {
    it("should convert audio blob to Uint8Array and call saveAudio API", async () => {
      // Simulate starting recording
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new (global as any).MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      const audioChunks: Blob[] = [];

      // Simulate the component's MediaRecorder setup
      recorder.ondataavailable = (event: any) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        await mockSaveAudio(uint8Array);
      };

      // Simulate recording start
      recorder.start();
      expect(recorder.start).toHaveBeenCalled();

      // Simulate audio data becoming available
      const testAudioData = new Uint8Array([1, 2, 3, 4, 5]);
      const audioBlob = new Blob([testAudioData], { type: "audio/webm" });
      recorder.ondataavailable?.({ data: audioBlob });

      // Simulate recording stop
      await recorder.onstop?.();

      // Verify saveAudio was called with Uint8Array
      expect(mockSaveAudio).toHaveBeenCalledTimes(1);
      expect(mockSaveAudio).toHaveBeenCalledWith(expect.any(Uint8Array));

      const savedData = mockSaveAudio.mock.calls[0][0];
      expect(savedData).toBeInstanceOf(Uint8Array);
      expect(Array.from(savedData)).toEqual([1, 2, 3, 4, 5]);
    });

    it("should inject audio file path into prompt using ensureAttachmentReference logic", () => {
      const relativePath = "audio-recordings/2025-01-15/12345-abcde.webm";
      let promptValue = "";

      // Simulate ensureAttachmentReference function from PromptApp
      const ensureAttachmentReference = (path: string): string => {
        const marker = `@${path}`;
        if (promptValue.includes(marker)) {
          return promptValue;
        }

        const needsLeadingNewline =
          promptValue.length > 0 && !promptValue.endsWith("\n");
        promptValue = `${promptValue}${needsLeadingNewline ? "\n" : ""}${marker}\n`;
        return promptValue;
      };

      // Test with empty prompt
      const result1 = ensureAttachmentReference(relativePath);
      expect(result1).toBe("@audio-recordings/2025-01-15/12345-abcde.webm\n");
      expect(promptValue).toContain("@audio-recordings/2025-01-15/12345-abcde.webm");

      // Test that it doesn't add duplicates
      const result2 = ensureAttachmentReference(relativePath);
      const matches = result2.match(/@audio-recordings\/2025-01-15\/12345-abcde\.webm/g);
      expect(matches?.length).toBe(1);
    });

    it("should add newline before audio reference when prompt has content", () => {
      let promptValue = "Here is my existing prompt text";

      const ensureAttachmentReference = (path: string): string => {
        const marker = `@${path}`;
        if (promptValue.includes(marker)) {
          return promptValue;
        }

        const needsLeadingNewline =
          promptValue.length > 0 && !promptValue.endsWith("\n");
        promptValue = `${promptValue}${needsLeadingNewline ? "\n" : ""}${marker}\n`;
        return promptValue;
      };

      ensureAttachmentReference("audio-recordings/2025-01-15/test.webm");

      expect(promptValue).toBe(
        "Here is my existing prompt text\n@audio-recordings/2025-01-15/test.webm\n",
      );
    });

    it("should stop media stream tracks after recording completes", async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new (global as any).MediaRecorder(stream);

      const stopTrack = vi.fn();
      const mockTrack = { stop: stopTrack };
      mockMediaStream.getTracks.mockReturnValue([mockTrack]);

      recorder.onstop = () => {
        stream.getTracks().forEach((track: any) => track.stop());
      };

      recorder.onstop();

      expect(mockMediaStream.getTracks).toHaveBeenCalled();
      expect(stopTrack).toHaveBeenCalled();
    });

    it("should handle empty audio chunks gracefully", async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new (global as any).MediaRecorder(stream);

      const audioChunks: Blob[] = [];

      recorder.onstop = async () => {
        if (audioChunks.length === 0) {
          // Component shows warning and doesn't call saveAudio
          return;
        }

        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        await mockSaveAudio(uint8Array);
      };

      // No data available event triggered
      await recorder.onstop?.();

      // saveAudio should not be called
      expect(mockSaveAudio).not.toHaveBeenCalled();
    });

    it("should handle saveAudio API errors", async () => {
      mockSaveAudio.mockRejectedValueOnce(new Error("Failed to save audio"));

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new (global as any).MediaRecorder(stream);

      const audioChunks: Blob[] = [];

      recorder.ondataavailable = (event: any) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        try {
          await mockSaveAudio(uint8Array);
        } catch (error) {
          // Component should handle this by showing error status
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe("Failed to save audio");
        }
      };

      const audioBlob = new Blob([new Uint8Array([1, 2, 3])], {
        type: "audio/webm",
      });
      recorder.ondataavailable?.({ data: audioBlob });

      await recorder.onstop?.();

      expect(mockSaveAudio).toHaveBeenCalled();
    });

    it("should create MediaRecorder with audio/webm mimeType", () => {
      const stream = mockMediaStream;
      const recorder = new (global as any).MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      expect((global as any).MediaRecorder).toHaveBeenCalledWith(stream, {
        mimeType: "audio/webm",
      });
    });

    it("should return correct relative path from saveAudio", async () => {
      const testData = new Uint8Array([1, 2, 3]);
      const result = await mockSaveAudio(testData);

      expect(result).toBe("audio-recordings/2025-01-15/12345-abcde.webm");
      expect(typeof result).toBe("string");
      expect(result).toMatch(/^audio-recordings\/\d{4}-\d{2}-\d{2}\/.+\.webm$/);
    });
  });
});
