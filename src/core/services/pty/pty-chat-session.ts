// src/core/services/pty/pty-chat-session.ts
import { Logger, type ILogObj } from "tslog";
import type { IEventBus } from "../../event-bus.js";
import type {
  PtyDataReceivedEvent,
  PtyExitedEvent,
} from "../../event-types.js";
import type { ChatSessionData } from "../chat-engine/chat-session-repository.js";
import type { ProjectFolderService } from "../project-folder-service.js";

export class PtyChatSession {
  id: ChatSessionData["id"];
  absoluteFilePath: ChatSessionData["absoluteFilePath"];
  messages: ChatSessionData["messages"] = [];
  modelId: ChatSessionData["modelId"];
  sessionStatus: ChatSessionData["sessionStatus"] = "idle";
  fileStatus: ChatSessionData["fileStatus"] = "active";
  currentTurn: ChatSessionData["currentTurn"] = 0;
  maxTurns: ChatSessionData["maxTurns"] = 20;
  createdAt: ChatSessionData["createdAt"];
  updatedAt: ChatSessionData["updatedAt"];
  metadata?: ChatSessionData["metadata"];

  private logger: Logger<ILogObj>;

  constructor(
    data: ChatSessionData,
    private readonly eventBus: IEventBus,
    private readonly _projectFolderService: ProjectFolderService,
  ) {
    this.id = data.id;
    this.absoluteFilePath = data.absoluteFilePath;
    this.messages = data.messages;
    this.modelId = data.modelId;
    this.sessionStatus = data.sessionStatus;
    this.fileStatus = data.fileStatus;
    this.currentTurn = data.currentTurn;
    this.maxTurns = data.maxTurns;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.metadata = data.metadata;

    this.logger = new Logger({ name: `PtyChatSession-${this.id}` });

    this.subscribeToPtyEvents();
  }

  private subscribeToPtyEvents(): void {
    const sessionId = this.metadata?.external?.sessionId;
    if (!sessionId) {
      return;
    }

    this.eventBus.subscribe(
      "PtyDataReceived",
      (event: PtyDataReceivedEvent) => {
        if (event.sessionId === sessionId) {
          // TODO: Append to a new assistant message, handle streaming
          console.log("PTY DATA:", event.data);
        }
      },
    );

    this.eventBus.subscribe("PtyExited", (event: PtyExitedEvent) => {
      if (event.sessionId === sessionId) {
        this.sessionStatus = "external_terminated";
        this.updatedAt = new Date();
        this.logger.info(`PTY session ${sessionId} exited.`);
        // TODO: Emit chat updated event
      }
    });
  }

  toJSON(): ChatSessionData {
    return {
      _type: "pty_chat",
      id: this.id,
      absoluteFilePath: this.absoluteFilePath,
      messages: this.messages,
      modelId: this.modelId,
      sessionStatus: this.sessionStatus,
      fileStatus: this.fileStatus,
      currentTurn: this.currentTurn,
      maxTurns: this.maxTurns,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      metadata: this.metadata,
    };
  }
}
