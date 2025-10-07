// src/core/services/pty/pty-data-processor.ts
import type { PtyChatSession } from "./pty-chat-session.js";
import type { PtyInstance } from "./pty-instance-manager.js";

const SCREEN_REFRESH_SIGNAL = "\x1b[2J";
const AGENT_START_REGEX = /\$ (gemini|claude|agent)/;
// Matches a new, empty user prompt line, indicating the model has stopped generating.
const USER_PROMPT_MARKER_REGEX = /^(?:\x1b\[[0-9;:]*m)*>\s*\x1b\[0m\s*$/;

export class PtyDataProcessor {
  private buffer = "";
  private debounceTimer: NodeJS.Timeout | null = null;
  private isGenerating = false;

  constructor(
    private readonly ptyInstance: PtyInstance,
    private readonly session: PtyChatSession,
  ) {
    this.ptyInstance.onData((data) => this.handleData(data));
  }

  private handleData(data: string): void {
    this.buffer += data;

    // --- Signal Detection ---

    // 1. Detect screen refresh
    if (data.includes(SCREEN_REFRESH_SIGNAL)) {
      this.session.recordCliEvent("screenRefresh", {});
    }

    // 2. Detect new agent session start
    if (AGENT_START_REGEX.test(data)) {
      const command = data.trim();
      this.session.recordCliEvent("newSession", { command });
      this.isGenerating = true; // Assume generation starts after agent command
    }

    // 3. Detect definitive stop signal
    if (this.isGenerating && USER_PROMPT_MARKER_REGEX.test(data)) {
      this.isGenerating = false;
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      // Perform final update on stop signal
      this.session.updateFromSnapshot(this.buffer);
      return; // Stop further processing for this chunk
    }

    // --- Debounced Streaming Update ---
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.session.updateFromSnapshot(this.buffer);

      // After updating, check if the last message was from a user to set the generating state.
      const messages = this.session.toChatSessionData().messages;
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.message.role === "user") {
          // A user prompt was just submitted, so we are now in a generating state.
          this.isGenerating = true;
        }
      }
    }, 250);
  }

  public destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    // In the future, we might want to unsubscribe from onData if the pty-instance allows it
  }
}
