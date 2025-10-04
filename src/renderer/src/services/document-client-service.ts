// src/renderer/src/services/document-service.ts

import { Logger } from "tslog";
import { fileService } from "./file-service.js";
import {
  documents,
  type DocumentState,
  type PromptScriptState,
} from "../stores/documents.svelte.js";
import {
  editorViews,
  type EditorViewState,
} from "../stores/editor-views.svelte.js";
import { ui } from "../stores/ui.svelte.js";
import { chatSessionLinks } from "../stores/chat.svelte.js";
import { chatService } from "./chat-service.js";
import { trpcClient } from "../lib/trpc-client.js";
import { showToast } from "../stores/ui-store.svelte.js";
import type { PromptScriptFile } from "../../../core/services/prompt-script/prompt-script-repository.js";

interface OpenDocumentOptions {
  focus?: boolean;
}

interface SaveDocumentOptions {
  keepFocus?: boolean;
}

function ensureOpenFilePath(filePath: string): void {
  if (!ui.openFilePaths.includes(filePath)) {
    ui.openFilePaths.push(filePath);
  }
}

export class DocumentService {
  private readonly logger = new Logger({ name: "DocumentService" });

  async openDocument(
    filePath: string,
    options: OpenDocumentOptions = {},
  ): Promise<DocumentState> {
    const now = new Date().toISOString();
    this.logger.info("Opening document", { filePath, options });

    // 1. Get the full CoreDocument from the backend.
    const coreDoc = await fileService.openFile(filePath);

    // 2. Construct the frontend DocumentState, separating backend data from local state.
    const promptScriptState: PromptScriptState | null = coreDoc.parsedPromptScript
      ? { link: null, lastReconciledAt: null }
      : null;

    const document: DocumentState = {
      data: coreDoc,
      lastOpenedAt: now,
      promptScript: promptScriptState,
    };

    documents.set(filePath, document);

    // 3. Update editor views and UI state based on the new data structure.
    if (!coreDoc.isBase64) {
      const existingView = editorViews.get(filePath);
      const editorView: EditorViewState = {
        ...(existingView ?? {
          filePath,
          cursor: null,
          selections: [],
          scrollTop: 0,
          scrollLeft: 0,
        }),
        unsavedContent: coreDoc.content,
        isFocused: options.focus !== false,
        languageId: coreDoc.fileType,
        lastInteractionAt: now,
      };
      editorViews.set(filePath, editorView);
    }

    ensureOpenFilePath(filePath);
    if (options.focus !== false) {
      ui.activeFilePath = filePath;
    }

    // 4. Handle prompt script linking (frontend-specific runtime logic).
    if (document.promptScript) {
      const result = await trpcClient.promptScript.findLinkedSession.query({
        filePath,
      });

      const currentDocument = documents.get(filePath);
      if (currentDocument?.promptScript) {
        currentDocument.promptScript.link = {
          sessionId: result.session?.id ?? null,
          scriptHash: result.script.hash,
          status: result.linkType ? "none" : "session_missing",
          warnings: result.warnings,
          resolvedAt: now,
        };
        currentDocument.promptScript.lastReconciledAt = now;

        if (result.session) {
          await chatService.hydrateSession(result.session);
        }
      }
    }

    return documents.get(filePath)!;
  }

  closeDocument(filePath: string): void {
    this.logger.info("Closing document", { filePath });

    documents.delete(filePath);
    editorViews.delete(filePath);
    chatSessionLinks.delete(filePath);

    ui.openFilePaths = ui.openFilePaths.filter((path) => path !== filePath);

    if (ui.activeFilePath === filePath) {
      ui.activeFilePath = ui.openFilePaths[ui.openFilePaths.length - 1] ?? null;
    }
  }

  updateEditorViewState(
    filePath: string,
    updates: Partial<Omit<EditorViewState, "filePath">>,
    options?: { updateInteraction?: boolean },
  ): void {
    const view = editorViews.get(filePath);
    if (!view) {
      return;
    }

    const shouldUpdateInteraction = options?.updateInteraction ?? true;

    editorViews.set(filePath, {
      ...view,
      ...updates,
      ...(shouldUpdateInteraction && {
        lastInteractionAt: new Date().toISOString(),
      }),
    });
  }

  async saveDocument(
    filePath: string,
    options: SaveDocumentOptions = {},
  ): Promise<DocumentState> {
    const document = documents.get(filePath);
    const editorView = editorViews.get(filePath);

    if (!document || !editorView) {
      throw new Error(`Document ${filePath} is not open`);
    }

    const content = editorView.unsavedContent;

    // 1. Write file and get the updated CoreDocument directly from the backend.
    const updatedCoreDoc = await fileService.writeFile(filePath, content);

    // 2. Update the document's data and local state.
    const now = new Date().toISOString();
    document.data = updatedCoreDoc;
    document.lastOpenedAt = now;

    // 3. Re-run prompt script linking logic.
    if (document.promptScript) {
      document.promptScript.link = null; // Reset link state
      const result = await trpcClient.promptScript.findLinkedSession.query({
        filePath,
      });

      // Ensure document wasn't closed during async operation
      const currentDocument = documents.get(filePath);
      if (currentDocument?.promptScript) {
        currentDocument.promptScript.link = {
          sessionId: result.session?.id ?? null,
          scriptHash: result.script.hash,
          status: result.linkType ? "none" : "session_missing",
          warnings: result.warnings,
          resolvedAt: now,
        };
        currentDocument.promptScript.lastReconciledAt = now;
        if (result.session) {
          await chatService.hydrateSession(result.session);
        }
      }
    }

    documents.set(filePath, document);

    if (options.keepFocus !== true) {
      ui.activeFilePath = filePath;
    }

    return document;
  }

  async createPromptScript(
    directory: string,
    name?: string,
  ): Promise<PromptScriptFile> {
    this.logger.info("Creating prompt script in:", directory);
    const script = await trpcClient.promptScript.create.mutate({
      directory,
      name,
    });

    this.logger.info("Prompt script created:", script.absolutePath);
    showToast(`Prompt script created: ${script.absolutePath}`, "success");
    return script;
  }
}

export const documentClientService = new DocumentService();
