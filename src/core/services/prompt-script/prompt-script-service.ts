// src/core/services/prompt-script/prompt-script-service.ts
import path from "node:path";
import {
  type ChatSessionData,
  type ChatSessionRepository,
} from "../chat-engine/chat-session-repository.js";
import {
  PromptScriptRepository,
  type PromptScriptFile,
} from "./prompt-script-repository.js";
import type { PromptScriptMetadata } from "./prompt-script-parser.js";

export type PromptScriptLinkType =
  | "chatSessionId"
  | "scriptHash"
  | "scriptPath";

export interface PromptScriptAttachmentResult {
  script: PromptScriptFile;
  session: ChatSessionData | null;
  linkType?: PromptScriptLinkType;
  alternateMatches: ChatSessionData[];
  warnings: string[];
}

export class PromptScriptService {
  constructor(
    private readonly repository: PromptScriptRepository,
    private readonly chatSessions: ChatSessionRepository,
  ) {}

  async attachScript(filePath: string): Promise<PromptScriptAttachmentResult> {
    let script = await this.repository.read(filePath);
    const warnings = [...script.warnings];
    const alternateMatches: ChatSessionData[] = [];

    let session: ChatSessionData | null = null;
    let linkType: PromptScriptLinkType | undefined;

    // Step 1: Attempt to link by front matter chatSessionId
    if (script.metadata.chatSessionId) {
      const sessionById = await this.chatSessions.getById(
        script.metadata.chatSessionId,
      );

      if (sessionById) {
        if (!sessionById.scriptHash || sessionById.scriptHash === script.hash) {
          session = await this.ensureSessionMetadata(sessionById, script);
          linkType = "chatSessionId";
        } else {
          warnings.push(
            "Prompt script content changed since the stored session was created. Cleared chatSessionId for safety.",
          );
          const metadata = this.cloneMetadata(script.metadata);
          delete metadata.chatSessionId;
          script = await this.repository.save(script, { metadata });
          this.mergeWarnings(warnings, script.warnings);
        }
      } else {
        warnings.push("Linked chat session no longer exists. Cleared chatSessionId.");
        const metadata = this.cloneMetadata(script.metadata);
        delete metadata.chatSessionId;
        script = await this.repository.save(script, { metadata });
        this.mergeWarnings(warnings, script.warnings);
      }
    }

    // Step 2: Attempt to link by script hash if still not linked
    if (!session) {
      const sessionsByHash = await this.chatSessions.findByScriptHash(script.hash);
      if (sessionsByHash.length === 1) {
        session = await this.ensureSessionMetadata(sessionsByHash[0], script);
        linkType = "scriptHash";
        if (script.metadata.chatSessionId !== session.id) {
          const metadata = this.cloneMetadata(script.metadata);
          metadata.chatSessionId = session.id;
          script = await this.repository.save(script, { metadata });
          this.mergeWarnings(warnings, script.warnings);
        }
      } else if (sessionsByHash.length > 1) {
        alternateMatches.push(...sessionsByHash);
        const [latest] = sessionsByHash;
        session = await this.ensureSessionMetadata(latest, script);
        linkType = "scriptHash";
        warnings.push(
          "Multiple sessions share this prompt script hash. Linked to the most recent session.",
        );
        if (script.metadata.chatSessionId !== latest.id) {
          const metadata = this.cloneMetadata(script.metadata);
          metadata.chatSessionId = latest.id;
          script = await this.repository.save(script, { metadata });
          this.mergeWarnings(warnings, script.warnings);
        }
      }
    }

    // Step 3: Attempt to link by resolved script path if still not linked
    if (!session) {
      const sessionByPath = await this.chatSessions.findByScriptPath(
        script.absolutePath,
      );

      if (sessionByPath) {
        if (!sessionByPath.scriptHash || sessionByPath.scriptHash === script.hash) {
          session = await this.ensureSessionMetadata(sessionByPath, script);
          linkType = "scriptPath";
          if (script.metadata.chatSessionId !== session.id) {
            const metadata = this.cloneMetadata(script.metadata);
            metadata.chatSessionId = session.id;
            script = await this.repository.save(script, { metadata });
            this.mergeWarnings(warnings, script.warnings);
          }
        } else {
          warnings.push(
            "Prompt script content no longer matches the stored session. Keeping script detached for a fresh run.",
          );
          if (script.metadata.chatSessionId) {
            const metadata = this.cloneMetadata(script.metadata);
            delete metadata.chatSessionId;
            script = await this.repository.save(script, { metadata });
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

  async linkScriptToSession(options: {
    scriptPath: string;
    sessionId: string;
  }): Promise<{ script: PromptScriptFile; session: ChatSessionData }>
  async linkScriptToSession(options: {
    scriptPath: string;
    session: ChatSessionData;
  }): Promise<{ script: PromptScriptFile; session: ChatSessionData }>
  async linkScriptToSession(options: {
    scriptPath: string;
    sessionId?: string;
    session?: ChatSessionData;
  }): Promise<{ script: PromptScriptFile; session: ChatSessionData }> {
    let script = await this.repository.read(options.scriptPath);
    const warnings = [...script.warnings];

    const session = options.session
      ? options.session
      : await this.requireSession(options.sessionId);

    const resolvedSession = await this.ensureSessionMetadata(session, script);

    if (script.metadata.chatSessionId !== resolvedSession.id) {
      const metadata = this.cloneMetadata(script.metadata);
      metadata.chatSessionId = resolvedSession.id;
      script = await this.repository.save(script, { metadata });
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

  async detachScript(options: {
    scriptPath: string;
    sessionId?: string;
  }): Promise<PromptScriptFile> {
    let script = await this.repository.read(options.scriptPath);
    const warnings = [...script.warnings];

    if (script.metadata.chatSessionId) {
      const metadata = this.cloneMetadata(script.metadata);
      delete metadata.chatSessionId;
      script = await this.repository.save(script, { metadata });
      this.mergeWarnings(warnings, script.warnings);
    }

    if (options.sessionId) {
      const session = await this.chatSessions.getById(options.sessionId);
      if (session) {
        const updated: ChatSessionData = {
          ...session,
          scriptPath: null,
          scriptHash: null,
          scriptSnapshot: null,
          scriptModifiedAt: null,
          updatedAt: new Date(),
        };
        await this.chatSessions.update(updated);
      }
    }

    return {
      ...script,
      warnings,
    };
  }

  private async ensureSessionMetadata(
    session: ChatSessionData,
    script: PromptScriptFile,
  ): Promise<ChatSessionData> {
    const resolvedPath = path.resolve(script.absolutePath);
    let requiresUpdate = false;

    const nextSession: ChatSessionData = {
      ...session,
    };

    if (session.scriptPath !== resolvedPath) {
      nextSession.scriptPath = resolvedPath;
      requiresUpdate = true;
    }

    if (session.scriptHash !== script.hash) {
      nextSession.scriptHash = script.hash;
      requiresUpdate = true;
    }

    if (!session.scriptModifiedAt || session.scriptModifiedAt.getTime() !== script.modifiedAt.getTime()) {
      nextSession.scriptModifiedAt = script.modifiedAt;
      requiresUpdate = true;
    }

    if (session.scriptSnapshot !== script.content) {
      nextSession.scriptSnapshot = script.content;
      requiresUpdate = true;
    }

    if (requiresUpdate) {
      nextSession.updatedAt = new Date();
      await this.chatSessions.update(nextSession);
    }

    return requiresUpdate ? nextSession : session;
  }

  private async requireSession(sessionId: string | undefined): Promise<ChatSessionData> {
    if (!sessionId) {
      throw new Error("sessionId is required when session is not provided");
    }

    const session = await this.chatSessions.getById(sessionId);
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
