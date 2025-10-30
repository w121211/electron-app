// src/renderer/src/services/document-client-service.ts

import { Logger } from "tslog";
import { documents, type DocumentState } from "../stores/documents.svelte.js";
import {
  editorViews,
  type EditorViewState,
} from "../stores/editor-views.svelte.js";
import { ui } from "../stores/ui.svelte.js";
import { trpcClient } from "../lib/trpc-client.js";
import type {
  PromptScriptFile,
  PromptScriptLinkResult,
} from "../../../core/services/prompt-script/prompt-script-repository.js";
import type { ChatSessionData } from "../../../core/services/chat/chat-session-repository.js";
import { setChatSession } from "../stores/chat.svelte.js";

function ensureOpenFilePath(filePath: string): void {
  if (!ui.openFilePaths.includes(filePath)) {
    ui.openFilePaths.push(filePath);
  }
}

export class DocumentService {
  private readonly logger = new Logger({ name: "DocumentService" });

  async openDocument(
    filePath: string,
    { focus }: { focus: boolean },
  ): Promise<DocumentState> {
    const now = new Date().toISOString();
    this.logger.info("Opening document", { filePath });

    // Get the full Document from the backend.
    const documentFile = await trpcClient.document.getDocument.query({
      filePath,
    });

    // If document has a linked chat session, extract and store it in chatSessions store
    if (documentFile.promptScriptLink?.chatSession) {
      setChatSession(documentFile.promptScriptLink.chatSession);
    }

    // Normalize: replace full chatSession with just the ID
    const normalizedDocument: DocumentState = {
      data: {
        ...documentFile,
        promptScriptLink: documentFile.promptScriptLink
          ? {
              ...documentFile.promptScriptLink,
              chatSession: undefined, // Remove full session object
              chatSessionId: documentFile.promptScriptLink.chatSession?.id ?? null,
            }
          : null,
      },
      lastOpenedAt: now,
    };
    documents[filePath] = normalizedDocument;

    // Update editor views and UI state based on the new data structure.
    if (!documentFile.isBase64) {
      if (!Object.hasOwn(editorViews, filePath)) {
        const editorView: EditorViewState = {
          filePath,
          cursor: null,
          selections: [],
          scrollTop: 0,
          scrollLeft: 0,
          unsavedContent: documentFile.content,
          languageId: documentFile.fileType,
          lastInteractionAt: now,
        };
        editorViews[filePath] = editorView;
      }
    }

    ensureOpenFilePath(filePath);

    if (focus) {
      ui.activeFilePath = filePath;
    }

    return documents[filePath]!;
  }

  closeDocument(filePath: string): void {
    this.logger.info("Closing document", { filePath });

    delete documents[filePath];
    delete editorViews[filePath];

    ui.openFilePaths = ui.openFilePaths.filter((path) => path !== filePath);

    if (ui.activeFilePath === filePath) {
      ui.activeFilePath = ui.openFilePaths[ui.openFilePaths.length - 1] ?? null;
    }
  }

  async saveDocument(
    filePath: string,
    inputValue?: string,
  ): Promise<DocumentState> {
    // this.logger.info("Saving document", { filePath, inputValue });

    const document = documents[filePath];
    const editorView = editorViews[filePath];

    if (!document || !editorView) {
      throw new Error(`Document ${filePath} is not open`);
    }

    // Save document and get the updated Document from the backend.
    const updatedDocumentFile = await trpcClient.document.saveDocument.mutate({
      filePath,
      content: inputValue ?? editorView.unsavedContent,
    });

    // If document has a linked chat session, extract and store it in chatSessions store
    if (updatedDocumentFile.promptScriptLink?.chatSession) {
      setChatSession(updatedDocumentFile.promptScriptLink.chatSession);
    }

    // Update the document's data and local state with normalized promptScriptLink
    const now = new Date().toISOString();
    document.data = {
      ...updatedDocumentFile,
      promptScriptLink: updatedDocumentFile.promptScriptLink
        ? {
            promptScript: updatedDocumentFile.promptScriptLink.promptScript,
            chatSession: undefined,
            chatSessionId:
              updatedDocumentFile.promptScriptLink.chatSession?.id ?? null,
            warnings: updatedDocumentFile.promptScriptLink.warnings,
          }
        : null,
    };
    document.lastOpenedAt = now;

    return document;
  }

  updateEditorViewState(
    filePath: string,
    updates: Partial<Omit<EditorViewState, "filePath">>,
    options?: { updateInteraction?: boolean },
  ): void {
    const editorView = editorViews[filePath];
    if (!editorView) {
      throw new Error("Editor view not found");
    }

    const shouldUpdateInteraction = options?.updateInteraction ?? true;

    editorViews[filePath] = {
      ...editorView,
      ...updates,
      ...(shouldUpdateInteraction && {
        lastInteractionAt: new Date().toISOString(),
      }),
    };
  }

  async createPromptScript(
    directory: string,
    name?: string,
  ): Promise<PromptScriptFile> {
    const payload: { directory: string; name?: string } = {
      directory,
    };

    if (name && name.trim().length > 0) {
      payload.name = name;
    }

    const result = await trpcClient.promptScript.create.mutate(payload);
    return result.script;
  }

  async createPromptScriptWithContent(
    directory: string,
    content: string,
    name?: string,
  ): Promise<PromptScriptFile> {
    const script = await this.createPromptScript(directory, name);
    await trpcClient.document.saveDocument.mutate({
      filePath: script.absolutePath,
      content,
    });
    return script;
  }

  async linkPromptScriptToChatSession(
    promptScriptPath: string,
    chatSessionId: string,
  ): Promise<PromptScriptLinkResult> {
    const linked = await trpcClient.promptScript.linkChatSession.mutate({
      promptScriptPath,
      chatSessionId,
    });

    this.applyPromptScriptLinkResult(promptScriptPath, linked);

    return linked;
  }

  applyPromptScriptLinkResult(
    promptScriptPath: string,
    linked: PromptScriptLinkResult & { chatSession?: ChatSessionData | null },
  ): void {
    if (linked.chatSession) {
      setChatSession(linked.chatSession);
    }

    const document = documents[promptScriptPath];
    const editorView = editorViews[promptScriptPath];

    if (document) {
      document.data = {
        ...linked.promptScript,
        promptScriptLink: {
          promptScript: linked.promptScript,
          chatSession: undefined,
          chatSessionId: linked.chatSession?.id ?? null,
          warnings: linked.warnings,
        },
      };
    }

    if (editorView) {
      editorView.unsavedContent = linked.promptScript.content;
    }
  }
}

export const documentClientService = new DocumentService();
