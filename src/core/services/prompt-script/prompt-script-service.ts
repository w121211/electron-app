// src/core/services/prompt-script/prompt-script-service.ts
import path from "node:path";
import { Logger } from "tslog";
import {
  createDirectory,
  generateSequentiallyNumberedFilename,
  generateUniqueFileName,
} from "../../utils/file-utils.js";
import { substituteArguments } from "./prompt-script-parser.js";
import { PromptScriptRepository } from "./prompt-script-repository.js";
import type {
  ChatSessionData,
  ChatSessionRepository,
} from "../chat/chat-session-repository.js";
import type {
  PromptScriptFile,
  PromptScriptLinkResult,
  PromptScriptWarning,
  PromptScriptPrompt,
} from "./prompt-script-repository.js";

const logger = new Logger({ name: "PromptScriptService" });

export class PromptScriptService {
  constructor(
    private readonly promptScriptRepo: PromptScriptRepository,
    private readonly chatSessionRepo: ChatSessionRepository,
    private readonly resolveDefaultDirectory: () => Promise<string>,
  ) {}

  /**
   * Create an empty prompt script without link
   */
  async createPromptScript(
    directory?: string,
    name?: string,
  ): Promise<PromptScriptFile> {
    const trimmedDirectory = directory?.trim();
    const baseDirectory =
      trimmedDirectory && trimmedDirectory.length > 0
        ? trimmedDirectory
        : await this.resolveDefaultDirectory();

    const resolvedDirectory = path.resolve(baseDirectory);
    await createDirectory(resolvedDirectory);

    const trimmedName = name?.trim();
    let filePath: string;
    if (trimmedName && trimmedName.length > 0) {
      const baseName = `${trimmedName}.prompt.md`;
      filePath = await generateUniqueFileName(resolvedDirectory, baseName);
    } else {
      /*
      // Format: 20251003-143045
      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[-:T]/g, "")
        .replace(/(\d{8})(\d{6})/, "$1-$2");
      baseName = `${timestamp}.prompt.md`;
      */
      const fileName = await generateSequentiallyNumberedFilename(
        resolvedDirectory,
        ".prompt.md",
        3,
      );
      filePath = path.join(resolvedDirectory, fileName);
    }

    return this.promptScriptRepo.create(filePath);
  }

  /**
   * Find linked chat session for a prompt script file.
   *
   * LINKING STRATEGY:
   * - Uses only `chatSessionId` from front matter for matching
   * - No automatic modifications to the prompt script file
   * - No hash or path validation
   *
   * DESIGN RATIONALE:
   * This maximizes user flexibility by keeping the repository layer simple and
   * letting the frontend handle resolution. The service returns what it finds
   * (or doesn't find) with structured warnings, allowing the UI to present
   * options to the user.
   *
   * USE CASES HANDLED:
   * 1. User modifies content externally → found by chatSessionId (no validation)
   * 2. Prompt script file moved externally → found by chatSessionId
   * 3. Prompt script cloned → same as (2)
   * 4. User got prompt script from others (DB not shared) → not found, warning returned
   * 5. User manually edits chatSessionId → could point to wrong session (frontend handles)
   * 6. Session deleted but prompt script kept → stale chatSessionId (warning returned)
   *
   * TODO:
   * - Frontend should detect path mismatches (case 2/3) and offer to update session metadata
   * - Frontend should handle SESSION_NOT_FOUND warnings with user prompts
   */
  async findLinkedChatSession(
    filePath: string,
  ): Promise<PromptScriptLinkResult> {
    const promptScript = await this.promptScriptRepo.read(filePath);
    // logger.debug(promptScript);

    const warnings: PromptScriptWarning[] = [
      ...promptScript.promptScriptParsed.warnings,
    ];
    let session: ChatSessionData | null = null;

    if (promptScript.promptScriptParsed.metadata.chatSessionId) {
      session = await this.chatSessionRepo.getById(
        promptScript.promptScriptParsed.metadata.chatSessionId,
      );

      if (!session) {
        warnings.push({
          code: "CHAT_SESSION_NOT_FOUND",
          message: "Linked chat session no longer exists",
          chatSessionId: promptScript.promptScriptParsed.metadata.chatSessionId,
        });
      }
    }

    return {
      promptScript,
      chatSession: session,
      warnings,
    };
  }

  async linkChatSession(
    scriptPath: string,
    sessionId: string,
  ): Promise<PromptScriptLinkResult & { chatSession: ChatSessionData }> {
    let promptScript = await this.promptScriptRepo.read(scriptPath);
    const warnings: PromptScriptWarning[] = [
      ...promptScript.promptScriptParsed.warnings,
    ];

    const session = await this.chatSessionRepo.getById(sessionId);
    if (!session) {
      throw new Error(`Chat session ${sessionId} not found`);
    }

    if (promptScript.promptScriptParsed.metadata.chatSessionId !== session.id) {
      promptScript = await this.promptScriptRepo.save(promptScript, {
        metadata: {
          ...promptScript.promptScriptParsed.metadata,
          chatSessionId: session.id,
        },
      });
      this.mergeWarnings(warnings, promptScript.promptScriptParsed.warnings);
    }

    const resolvedSession = await this.updateSessionMetadata(
      session,
      promptScript,
    );

    if (warnings.length > 0) {
      promptScript = {
        ...promptScript,
        promptScriptParsed: {
          ...promptScript.promptScriptParsed,
          warnings,
        },
      };
    }

    return {
      promptScript,
      chatSession: resolvedSession,
      warnings,
    };
  }

  async unlinkChatSession(options: {
    scriptPath: string;
    sessionId?: string;
  }): Promise<PromptScriptFile> {
    let promptScript = await this.promptScriptRepo.read(options.scriptPath);
    const warnings: PromptScriptWarning[] = [
      ...promptScript.promptScriptParsed.warnings,
    ];

    if (promptScript.promptScriptParsed.metadata.chatSessionId) {
      const { chatSessionId, ...metadata } =
        promptScript.promptScriptParsed.metadata;
      promptScript = await this.promptScriptRepo.save(promptScript, {
        metadata,
      });
      this.mergeWarnings(warnings, promptScript.promptScriptParsed.warnings);
    }

    if (options.sessionId) {
      const session = await this.chatSessionRepo.getById(options.sessionId);
      if (session) {
        const updated: ChatSessionData = {
          ...session,
          scriptPath: null,
          scriptHash: null,
          scriptSnapshot: null,
          scriptModifiedAt: null,
          updatedAt: new Date(),
        };
        await this.chatSessionRepo.update(updated);
      }
    }

    return {
      ...promptScript,
      promptScriptParsed: {
        ...promptScript.promptScriptParsed,
        warnings,
      },
    };
  }

  /**
   * DEMO METHOD: This is a placeholder to demonstrate how to execute a prompt
   * with argument substitution. The actual implementation would call the
   * appropriate chat engine (API or PTY) with the substituted content.
   */
  async executePrompt(prompt: PromptScriptPrompt, args: string[]): Promise<void> {
    const substitutedContent = substituteArguments(prompt.content, args);

    logger.info(
      `Executing prompt index ${prompt.index} with substituted content:`,
    );
    logger.info(substitutedContent);

    // In a real implementation, you would now send `substitutedContent`
    // to the appropriate engine (e.g., apiChatClient or ptyChatClient)
    // based on the script's metadata.

    // For example:
    // const engine = promptScript.promptScriptParsed.metadata.engine;
    // if (engine === 'api') {
    //   await apiChatClient.sendMessage(substitutedContent);
    // } else {
    //   await ptyChatClient.sendCommand(substitutedContent);
    // }

    return Promise.resolve();
  }

  private async updateSessionMetadata(
    session: ChatSessionData,
    promptScript: PromptScriptFile,
  ): Promise<ChatSessionData> {
    const updatedSession: ChatSessionData = {
      ...session,
      scriptPath: path.resolve(promptScript.absolutePath),
      scriptHash: promptScript.hash,
      scriptModifiedAt: promptScript.metadata.modifiedAt,
      scriptSnapshot: promptScript.content,
      updatedAt: new Date(),
    };

    await this.chatSessionRepo.update(updatedSession);
    return updatedSession;
  }

  private mergeWarnings(
    target: PromptScriptWarning[],
    additions: PromptScriptWarning[],
  ): void {
    for (const warning of additions) {
      const exists = target.some(
        (w) => w.code === warning.code && w.message === warning.message,
      );
      if (!exists) {
        target.push(warning);
      }
    }
  }
}
