// src/renderer/src/services/document-service.ts

import { Logger } from "tslog";
import { documents, type DocumentState } from "../stores/documents.svelte.js";
import {
  editorViews,
  type EditorViewState,
} from "../stores/editor-views.svelte.js";
import { ui } from "../stores/ui.svelte.js";
import { trpcClient } from "../lib/trpc-client.js";
import type { PromptScriptFile } from "../../../core/services/prompt-script/prompt-script-repository.js";

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

    const document: DocumentState = {
      data: documentFile,
      lastOpenedAt: now,
      // promptScript: promptScriptState,
    };

    documents[filePath] = document;

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
    this.logger.info("Saving document", { filePath, inputValue });
    // this.logger.info("Saving document", { filePath });

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

    // Update the document's data and local state.
    const now = new Date().toISOString();
    document.data = updatedDocumentFile;
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
    const script = await trpcClient.promptScript.create.mutate({
      directory,
      name,
    });
    return script;
  }
}

export const documentClientService = new DocumentService();
