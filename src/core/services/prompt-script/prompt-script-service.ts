// src/core/services/prompt-script/prompt-script-service.ts
import path from "node:path";
import {
  type ChatSessionData,
  type ChatSessionRepository,
} from "../chat/chat-session-repository.js";
import {
  PromptScriptRepository,
  type PromptScriptFile,
} from "./prompt-script-repository.js";
import type { PromptScriptMetadata } from "./prompt-script-parser.js";
import {
  generateUniqueFileName,
  writeTextFile,
} from "../../utils/file-utils.js";

export type PromptScriptLinkType =
  | "chatSessionId"
  | "scriptHash"
  | "scriptPath";

export interface PromptScriptLinkResult {
  script: PromptScriptFile;
  session: ChatSessionData | null;
  linkType?: PromptScriptLinkType;
  alternateMatches: ChatSessionData[];
  warnings: string[];
}

export class PromptScriptService {
  constructor(
    private readonly promptScriptRepo: PromptScriptRepository,
    private readonly chatSessionRepo: ChatSessionRepository,
  ) {}

  async createPromptScript(
    directory: string,
    name?: string,
  ): Promise<PromptScriptFile> {
    let baseName: string;
    if (name) {
      baseName = `${name}.prompt.md`;
    } else {
      // Format: 20251003-143045
      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[-:T]/g, "")
        .replace(/(\d{8})(\d{6})/, "$1-$2");
      baseName = `${timestamp}.prompt.md`;
    }
    const filePath = await generateUniqueFileName(directory, baseName);

    await writeTextFile(filePath, "");

    return this.promptScriptRepo.read(filePath);
  }

  async findLinkedChatSession(
    filePath: string,
  ): Promise<PromptScriptLinkResult> {
    let script = await this.promptScriptRepo.read(filePath);
    const warnings = [...script.warnings];
    const alternateMatches: ChatSessionData[] = [];

    let session: ChatSessionData | null = null;
    let linkType: PromptScriptLinkType | undefined;

    // Step 1: Attempt to link by front matter chatSessionId
    if (script.metadata.chatSessionId) {
      const sessionById = await this.chatSessionRepo.getById(
        script.metadata.chatSessionId,
      );

      if (sessionById) {
        if (!sessionById.scriptHash || sessionById.scriptHash === script.hash) {
          session = await this.updateSessionMetadata(sessionById, script);
          linkType = "chatSessionId";
        } else {
          warnings.push(
            "Prompt script content changed since the stored session was created. Cleared chatSessionId for safety.",
          );
          const metadata = this.cloneMetadata(script.metadata);
          delete metadata.chatSessionId;
          script = await this.promptScriptRepo.save(script, { metadata });
          this.mergeWarnings(warnings, script.warnings);
        }
      } else {
        warnings.push(
          "Linked chat session no longer exists. Cleared chatSessionId.",
        );
        const metadata = this.cloneMetadata(script.metadata);
        delete metadata.chatSessionId;
        script = await this.promptScriptRepo.save(script, { metadata });
        this.mergeWarnings(warnings, script.warnings);
      }
    }

    // Step 2: Attempt to link by script hash if still not linked
    if (!session) {
      const sessionsByHash = await this.chatSessionRepo.findByScriptHash(
        script.hash,
      );
      if (sessionsByHash.length === 1) {
        session = await this.updateSessionMetadata(sessionsByHash[0], script);
        linkType = "scriptHash";
        if (script.metadata.chatSessionId !== session.id) {
          const metadata = this.cloneMetadata(script.metadata);
          metadata.chatSessionId = session.id;
          script = await this.promptScriptRepo.save(script, { metadata });
          this.mergeWarnings(warnings, script.warnings);
        }
      } else if (sessionsByHash.length > 1) {
        alternateMatches.push(...sessionsByHash);
        const [latest] = sessionsByHash;
        session = await this.updateSessionMetadata(latest, script);
        linkType = "scriptHash";
        warnings.push(
          "Multiple sessions share this prompt script hash. Linked to the most recent session.",
        );
        if (script.metadata.chatSessionId !== latest.id) {
          const metadata = this.cloneMetadata(script.metadata);
          metadata.chatSessionId = latest.id;
          script = await this.promptScriptRepo.save(script, { metadata });
          this.mergeWarnings(warnings, script.warnings);
        }
      }
    }

    // Step 3: Attempt to link by resolved script path if still not linked
    if (!session) {
      const sessionByPath = await this.chatSessionRepo.findByScriptPath(
        script.absolutePath,
      );

      if (sessionByPath) {
        if (
          !sessionByPath.scriptHash ||
          sessionByPath.scriptHash === script.hash
        ) {
          session = await this.updateSessionMetadata(sessionByPath, script);
          linkType = "scriptPath";
          if (script.metadata.chatSessionId !== session.id) {
            const metadata = this.cloneMetadata(script.metadata);
            metadata.chatSessionId = session.id;
            script = await this.promptScriptRepo.save(script, { metadata });
            this.mergeWarnings(warnings, script.warnings);
          }
        } else {
          warnings.push(
            "Prompt script content no longer matches the stored session. Keeping script detached for a fresh run.",
          );
          if (script.metadata.chatSessionId) {
            const metadata = this.cloneMetadata(script.metadata);
            delete metadata.chatSessionId;
            script = await this.promptScriptRepo.save(script, { metadata });
            this.mergeWarnings(warnings, script.warnings);
          }
        }
      }
    }

    return {
      script,
      session,
      linkType,
      alternateMatches,
      warnings,
    };
  }

  async linkChatSession(options: {
    scriptPath: string;
    sessionId: string;
  }): Promise<{ script: PromptScriptFile; session: ChatSessionData }>;
  async linkChatSession(options: {
    scriptPath: string;
    session: ChatSessionData;
  }): Promise<{ script: PromptScriptFile; session: ChatSessionData }>;
  async linkChatSession(options: {
    scriptPath: string;
    sessionId?: string;
    session?: ChatSessionData;
  }): Promise<{ script: PromptScriptFile; session: ChatSessionData }> {
    let script = await this.promptScriptRepo.read(options.scriptPath);
    const warnings = [...script.warnings];

    const session = options.session
      ? options.session
      : await this.requireSession(options.sessionId);

    const resolvedSession = await this.updateSessionMetadata(session, script);

    if (script.metadata.chatSessionId !== resolvedSession.id) {
      const metadata = this.cloneMetadata(script.metadata);
      metadata.chatSessionId = resolvedSession.id;
      script = await this.promptScriptRepo.save(script, { metadata });
      this.mergeWarnings(warnings, script.warnings);
    }

    if (warnings.length > 0) {
      // Persist aggregated warnings on returned script for the caller to display
      script = {
        ...script,
        warnings,
      };
    }

    return {
      script,
      session: resolvedSession,
    };
  }

  async unlinkChatSession(options: {
    scriptPath: string;
    sessionId?: string;
  }): Promise<PromptScriptFile> {
    let script = await this.promptScriptRepo.read(options.scriptPath);
    const warnings = [...script.warnings];

    if (script.metadata.chatSessionId) {
      const metadata = this.cloneMetadata(script.metadata);
      delete metadata.chatSessionId;
      script = await this.promptScriptRepo.save(script, { metadata });
      this.mergeWarnings(warnings, script.warnings);
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
      ...script,
      warnings,
    };
  }

  private async updateSessionMetadata(
    session: ChatSessionData,
    script: PromptScriptFile,
  ): Promise<ChatSessionData> {
    const updatedSession: ChatSessionData = {
      ...session,
      scriptPath: path.resolve(script.absolutePath),
      scriptHash: script.hash,
      scriptModifiedAt: script.modifiedAt,
      scriptSnapshot: script.content,
      updatedAt: new Date(),
    };

    await this.chatSessionRepo.update(updatedSession);
    return updatedSession;
  }

  private async requireSession(
    sessionId: string | undefined,
  ): Promise<ChatSessionData> {
    if (!sessionId) {
      throw new Error("sessionId is required when session is not provided");
    }

    const session = await this.chatSessionRepo.getById(sessionId);
    if (!session) {
      throw new Error(`Chat session ${sessionId} not found`);
    }
    return session;
  }

  private cloneMetadata(metadata: PromptScriptMetadata): PromptScriptMetadata {
    const cloned: PromptScriptMetadata = {
      ...metadata,
      tags: metadata.tags ? [...metadata.tags] : undefined,
      extras: { ...metadata.extras },
    };
    return cloned;
  }

  private mergeWarnings(target: string[], additions: string[]): void {
    for (const warning of additions) {
      if (!target.includes(warning)) {
        target.push(warning);
      }
    }
  }
}
