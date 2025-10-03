// src/renderer/src/services/document-service.ts

import { Logger } from "tslog";
import { parsePromptScriptContent } from "../../../core/services/prompt-script/prompt-script-parser.js";
import { fileService } from "./file-service.js";
import {
  documents,
  type DocumentKind,
  type DocumentMetadata,
  type DocumentState,
  type PromptScriptState,
} from "../stores/documents.svelte.js";
import {
  editorViews,
  type CursorPosition,
  type EditorViewState,
  type SelectionRange,
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

function basename(filePath: string): string {
  const segments = filePath.split(/[/\\]/);
  return segments[segments.length - 1] ?? filePath;
}

function getExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf(".");
  if (lastDotIndex === -1) {
    return "";
  }
  return fileName.slice(lastDotIndex + 1);
}

function resolveDocumentKind(
  filePath: string,
  fileType: string,
  isBase64: boolean,
): DocumentKind {
  if (filePath.endsWith(".prompt.md")) {
    return "promptScript";
  }

  if (isBase64) {
    return "binary";
  }

  switch (fileType) {
    case "markdown":
      return "markdown";
    case "json":
      return "json";
    case "text":
    case "html":
    case "typescript":
    case "javascript":
    case "python":
    case "java":
    case "c":
    case "cpp":
    case "go":
    case "rust":
    case "ruby":
    case "php":
    case "csharp":
    case "swift":
    case "kotlin":
      return "code";
    default:
      return "text";
  }
}

function detectPromptDelimiter(content: string): string {
  const match = content.match(/<!--\s*user[^>]*-->/i);
  return match ? match[0] : "<!-- user -->";
}

async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function ensureOpenFilePath(filePath: string): void {
  if (!ui.openFilePaths.includes(filePath)) {
    ui.openFilePaths.push(filePath);
  }
}

function normalizePromptScriptState(content: string): PromptScriptState {
  const parsed = parsePromptScriptContent(content);
  return {
    metadata: parsed.metadata,
    prompts: parsed.prompts,
    delimiter: detectPromptDelimiter(content),
    link: null,
    lastReconciledAt: null,
    body: parsed.body,
    warnings: [...parsed.warnings],
  } satisfies PromptScriptState;
}

function mergeUniqueWarnings(
  base: string[],
  additions: string[],
): string[] {
  const unique = new Set<string>(base);
  for (const warning of additions) {
    if (warning) {
      unique.add(warning);
    }
  }
  return [...unique];
}

export class DocumentService {
  private readonly logger = new Logger({ name: "DocumentService" });

  async openDocument(
    filePath: string,
    options: OpenDocumentOptions = {},
  ): Promise<DocumentState> {
    const now = new Date().toISOString();

    this.logger.info("Opening document", { filePath, options });

    const file = await fileService.openFile(filePath);
    const kind = resolveDocumentKind(
      filePath,
      file.fileType,
      file.isBase64 ?? false,
    );
    const savedHash = await hashContent(file.content);
    const fileName = basename(filePath);
    const metadata: DocumentMetadata = {
      fileName,
      extension: getExtension(fileName),
      charset: file.isBase64 ? "binary" : "utf-8",
      createdAt: null,
      modifiedAt: null,
    };

    const promptScriptState =
      kind === "promptScript" ? normalizePromptScriptState(file.content) : null;

    const document: DocumentState = {
      filePath,
      kind,
      savedContent: file.content,
      savedHash,
      metadata,
      promptScript: promptScriptState,
      lastOpenedAt: now,
    };

    documents.set(filePath, document);

    if (!file.isBase64) {
      const existingView = editorViews.get(filePath);
      const editorView: EditorViewState = {
        ...(existingView ?? {
          filePath,
          unsavedContent: file.content,
          cursor: null,
          selections: [],
          scrollTop: 0,
          scrollLeft: 0,
          isFocused: false,
          languageId: file.fileType,
          lastInteractionAt: null,
        }),
        unsavedContent: file.content,
        lastInteractionAt: now,
        isFocused: options.focus !== false, // Also ensure focus is set
      };

      editorViews.set(filePath, editorView);
    }

    ensureOpenFilePath(filePath);
    if (options.focus !== false) {
      ui.activeFilePath = filePath;
    }

    if (promptScriptState) {
      const result = await trpcClient.promptScript.findLinkedSession.query({
        filePath,
      });

      const currentDocument = documents.get(filePath);
      const currentPromptScript = currentDocument?.promptScript;

      if (currentDocument && currentPromptScript) {
        const updatedPromptScript: PromptScriptState = {
          ...currentPromptScript,
          link: {
            sessionId: result.session?.id ?? null,
            scriptHash: result.script.hash,
            status: result.linkType ? "none" : "session_missing",
            warnings: result.warnings,
            resolvedAt: now,
          },
          lastReconciledAt: now,
          warnings: mergeUniqueWarnings(
            currentPromptScript.warnings,
            result.warnings,
          ),
        };

        const updatedDocument: DocumentState = {
          ...currentDocument,
          promptScript: updatedPromptScript,
        };

        documents.set(filePath, updatedDocument);

        if (result.session) {
          await chatService.hydrateSession(result.session);
        }
      }
    }

    return documents.get(filePath) ?? document;
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

  updateUnsavedContent(filePath: string, content: string): void {
    const view = editorViews.get(filePath);
    if (!view) {
      throw new Error(`Document ${filePath} is not found`);
    }

    editorViews.set(filePath, {
      ...view,
      unsavedContent: content,
      lastInteractionAt: new Date().toISOString(),
    });
  }

  updateCursor(filePath: string, cursor: CursorPosition | null): void {
    const view = editorViews.get(filePath);
    if (!view) {
      return;
    }

    editorViews.set(filePath, {
      ...view,
      cursor,
      lastInteractionAt: new Date().toISOString(),
    });
  }

  updateSelections(filePath: string, selections: SelectionRange[]): void {
    const view = editorViews.get(filePath);
    if (!view) {
      return;
    }

    editorViews.set(filePath, {
      ...view,
      selections,
      lastInteractionAt: new Date().toISOString(),
    });
  }

  updateScrollPosition(
    filePath: string,
    scrollTop: number,
    scrollLeft: number,
  ): void {
    const view = editorViews.get(filePath);
    if (!view) {
      return;
    }

    editorViews.set(filePath, { ...view, scrollTop, scrollLeft });
  }

  markFocused(filePath: string, isFocused: boolean): void {
    const view = editorViews.get(filePath);
    if (!view) {
      return;
    }

    editorViews.set(filePath, {
      ...view,
      isFocused,
      lastInteractionAt: new Date().toISOString(),
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
    await fileService.writeFile(filePath, content);

    const savedHash = await hashContent(content);
    const now = new Date().toISOString();
    let updatedDocument: DocumentState = {
      ...document,
      savedContent: content,
      savedHash,
      lastOpenedAt: now,
    };

    if (document.kind === "promptScript") {
      const parsed = parsePromptScriptContent(content);

      let promptScript: PromptScriptState = {
        metadata: parsed.metadata,
        prompts: parsed.prompts,
        delimiter: detectPromptDelimiter(content),
        link: null,
        lastReconciledAt: null,
        body: parsed.body,
        warnings: [...parsed.warnings],
      };

      try {
        const result = await trpcClient.promptScript.findLinkedSession.query({
          filePath,
        });

        promptScript = {
          ...promptScript,
          link: {
            sessionId: result.session?.id ?? null,
            scriptHash: result.script.hash,
            status: result.linkType ? "none" : "session_missing",
            warnings: result.warnings,
            resolvedAt: now,
          },
          lastReconciledAt: now,
          warnings: mergeUniqueWarnings(promptScript.warnings, result.warnings),
        };

        if (result.session) {
          await chatService.hydrateSession(result.session);
        }
      } catch (error) {
        this.logger.error("Failed to reattach prompt script after save", error);

        const fallbackWarnings = [
          error instanceof Error
            ? `Failed to attach prompt script: ${error.message}`
            : "Failed to attach prompt script",
        ];

        promptScript = {
          ...promptScript,
          warnings: mergeUniqueWarnings(
            promptScript.warnings,
            fallbackWarnings,
          ),
        };
      }

      updatedDocument = {
        ...updatedDocument,
        promptScript,
      };
    }

    documents.set(filePath, updatedDocument);

    if (options.keepFocus !== true) {
      ui.activeFilePath = filePath;
    }

    return updatedDocument;
  }

  async createPromptScript(
    directory: string,
    name?: string,
  ): Promise<PromptScriptFile> {
    try {
      this.logger.info("Creating prompt script in:", directory);
      const script = await trpcClient.promptScript.create.mutate({
        directory,
        name,
      });

      this.logger.info("Prompt script created:", script.absolutePath);
      showToast(`Prompt script created: ${script.absolutePath}`, "success");
      return script;
    } catch (error) {
      this.logger.error("Failed to create prompt script:", error);
      showToast(
        `Failed to create prompt script: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    }
  }
}

export const documentService = new DocumentService();
