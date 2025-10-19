// src/core/services/external-chat/terminal-chat-session.ts
import { Logger } from "tslog";
import { ExternalChatSession } from "./external-chat-session.js";

const logger = new Logger({ name: "TerminalChatSession" });

export class TerminalChatSession extends ExternalChatSession {
  private get pid(): number | undefined {
    return this.data.metadata?.external?.pid;
  }

  public override terminate(): void {
    if (this.pid) {
      try {
        process.kill(this.pid);
      } catch (e) {
        logger.error(`Failed to kill process ${this.pid}`, e);
      }
    }
    super.terminate();
  }
}
