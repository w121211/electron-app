// src/core/services/chat-engine/chat-draft-service.ts
import { v4 as uuidv4 } from "uuid";
import { parseChatTemplate } from "../../utils/chat-template-parser.js";
import type { ProjectFolderService } from "../project-folder-service.js";
import type { TaskService } from "../task-service.js";
import type {
  ChatMode,
  ChatSessionData,
  ChatSessionRepository,
} from "./chat-session-repository.js";
import { isDraftSession } from "./chat-session-repository.js";

export interface CreateChatDraftConfig {
  mode?: ChatMode;
  knowledge?: string[];
  promptDraft?: string;
  newTask?: boolean;
}

export interface UpdateChatDraftInput {
  metadata?: ChatSessionData["metadata"];
  maxTurns?: number;
}

export class ChatDraftService {
  constructor(
    private readonly chatSessionRepository: ChatSessionRepository,
    private readonly taskService: TaskService,
    private readonly projectFolderService: ProjectFolderService,
  ) {}

  async createDraft(
    targetDirectory: string,
    config?: CreateChatDraftConfig,
  ): Promise<ChatSessionData> {
    const directory = await this.resolveTargetDirectory(
      targetDirectory,
      config,
    );

    const now = new Date();
    const draftData: Omit<ChatSessionData, "absoluteFilePath"> = {
      _type: "chat_draft",
      id: uuidv4(),
      messages: [],
      modelId: undefined,
      sessionStatus: "idle",
      fileStatus: "active",
      currentTurn: 0,
      maxTurns: 20,
      createdAt: now,
      updatedAt: now,
      metadata: {
        mode: config?.mode ?? "chat",
        knowledge: config?.knowledge ?? [],
        promptDraft: config?.promptDraft,
        title: "New Chat",
      },
    };

    const filePath = await this.chatSessionRepository.createNewFile(
      directory,
      draftData,
    );

    return await this.chatSessionRepository.loadFromFile(filePath);
  }

  async createDraftFromTemplate(
    templatePath: string,
    targetDirectory: string,
    args: string[],
    config?: CreateChatDraftConfig,
  ): Promise<ChatSessionData> {
    const prompt = await parseChatTemplate(templatePath, args);
    return await this.createDraft(targetDirectory, {
      ...config,
      promptDraft: prompt,
    });
  }

  async getDraft(absoluteFilePath: string): Promise<ChatSessionData> {
    const data =
      await this.chatSessionRepository.loadFromFile(absoluteFilePath);

    if (!isDraftSession(data)) {
      throw new Error(`Chat file ${absoluteFilePath} is not a draft session.`);
    }

    return data;
  }

  async updateDraft(
    absoluteFilePath: string,
    updates: UpdateChatDraftInput,
  ): Promise<void> {
    const draft = await this.getDraft(absoluteFilePath);

    if (updates.metadata) {
      draft.metadata = {
        ...(draft.metadata ?? {}),
        ...updates.metadata,
      };
    }

    if (updates.maxTurns !== undefined) {
      draft.maxTurns = updates.maxTurns;
    }

    draft.updatedAt = new Date();

    await this.chatSessionRepository.saveToFile(absoluteFilePath, draft);
  }

  async deleteDraft(absoluteFilePath: string): Promise<void> {
    await this.chatSessionRepository.deleteFile(absoluteFilePath);
  }


  private async resolveTargetDirectory(
    targetDirectory: string,
    config?: CreateChatDraftConfig,
  ): Promise<string> {
    const isInProjectFolder =
      await this.projectFolderService.isPathInProjectFolder(targetDirectory);

    if (!isInProjectFolder) {
      throw new Error(
        `Cannot create chat outside of project folders. Path ${targetDirectory} is not within any registered project folder.`,
      );
    }

    if (config?.newTask) {
      const result = await this.taskService.createTask(
        "New Chat Task",
        {},
        targetDirectory,
      );
      return result.absoluteDirectoryPath;
    }

    return targetDirectory;
  }
}
