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
import { chatService } from "./chat-service.js";

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

function resolveDocumentKind(filePath: string, fileType: string, isBase64: boolean): DocumentKind {
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

  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  const cryptoModule = await import("node:crypto");
  return cryptoModule.createHash("sha256").update(content).digest("hex");
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

function mergeUniqueWarnings(target: string[], additions: string[]): void {
  for (const warning of additions) {
    if (!target.includes(warning)) {
      target.push(warning);
    }
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

    const file = await fileService.openFile(filePath);
    const kind = resolveDocumentKind(filePath, file.fileType, file.isBase64 ?? false);
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
      const editorView: EditorViewState = existingView ?? {
        filePath,
        unsavedContent: file.content,
        cursor: null,
        selections: [],
        scrollTop: 0,
        scrollLeft: 0,
        isFocused: false,
        languageId: file.fileType,
        lastInteractionAt: null,
      };

      editorView.unsavedContent = file.content;
      editorView.lastInteractionAt = now;

      editorViews.set(filePath, editorView);
    }

    ensureOpenFilePath(filePath);
    if (options.focus !== false) {
      ui.activeFilePath = filePath;
    }

    if (promptScriptState) {
      try {
        const link = await chatService.attachPromptScript({
          filePath,
          metadata: promptScriptState.metadata,
          contentHash: savedHash,
        });

        const target = documents.get(filePath)?.promptScript;
        if (target) {
          target.link = {
            sessionId: link.sessionId,
            scriptHash: link.scriptHash,
            status: link.status,
            warnings: link.warnings.map((warning) => warning.message),
            resolvedAt: link.lastAttachedAt ?? now,
          };
          target.lastReconciledAt = link.lastAttachedAt ?? now;
          mergeUniqueWarnings(
            target.warnings,
            link.warnings.map((warning) => warning.message),
          );
        }
      } catch (error) {
        this.logger.error("Failed to attach prompt script", error);
        const target = documents.get(filePath)?.promptScript;
        if (target) {
          mergeUniqueWarnings(target.warnings, [
            error instanceof Error
              ? `Failed to attach prompt script: ${error.message}`
              : "Failed to attach prompt script",
          ]);
        }
      }
    }

    return document;
  }

  closeDocument(filePath: string): void {
    this.logger.info("Closing document", { filePath });

    documents.delete(filePath);
    editorViews.delete(filePath);
    chatService.detachSessionLink(filePath);

    ui.openFilePaths = ui.openFilePaths.filter((path) => path !== filePath);

    if (ui.activeFilePath === filePath) {
      ui.activeFilePath = ui.openFilePaths[ui.openFilePaths.length - 1] ?? null;
    }
  }

  updateUnsavedContent(filePath: string, content: string): void {
    const view = editorViews.get(filePath);
    if (!view) {
      return;
    }

    view.unsavedContent = content;
    view.lastInteractionAt = new Date().toISOString();
  }

  updateCursor(filePath: string, cursor: CursorPosition | null): void {
    const view = editorViews.get(filePath);
    if (!view) {
      return;
    }

    view.cursor = cursor;
    view.lastInteractionAt = new Date().toISOString();
  }

  updateSelections(filePath: string, selections: SelectionRange[]): void {
    const view = editorViews.get(filePath);
    if (!view) {
      return;
    }

    view.selections = selections;
    view.lastInteractionAt = new Date().toISOString();
  }

  updateScrollPosition(filePath: string, scrollTop: number, scrollLeft: number): void {
    const view = editorViews.get(filePath);
    if (!view) {
      return;
    }

    view.scrollTop = scrollTop;
    view.scrollLeft = scrollLeft;
  }

  markFocused(filePath: string, isFocused: boolean): void {
    const view = editorViews.get(filePath);
    if (!view) {
      return;
    }

    view.isFocused = isFocused;
    view.lastInteractionAt = new Date().toISOString();
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

    document.savedContent = content;
    document.savedHash = savedHash;
    document.lastOpenedAt = now;

    if (document.kind === "promptScript") {
      const parsed = parsePromptScriptContent(content);
      document.promptScript = {
        metadata: parsed.metadata,
        prompts: parsed.prompts,
        delimiter: detectPromptDelimiter(content),
        link: null,
        lastReconciledAt: null,
        body: parsed.body,
        warnings: [...parsed.warnings],
      };

      try {
        const link = await chatService.attachPromptScript({
          filePath,
          metadata: parsed.metadata,
          contentHash: savedHash,
        });

        if (document.promptScript) {
          document.promptScript.link = {
            sessionId: link.sessionId,
            scriptHash: link.scriptHash,
            status: link.status,
            warnings: link.warnings.map((warning) => warning.message),
            resolvedAt: link.lastAttachedAt ?? now,
          };
          document.promptScript.lastReconciledAt = link.lastAttachedAt ?? now;
          mergeUniqueWarnings(
            document.promptScript.warnings,
            link.warnings.map((warning) => warning.message),
          );
        }
      } catch (error) {
        this.logger.error("Failed to reattach prompt script after save", error);
        if (document.promptScript) {
          mergeUniqueWarnings(document.promptScript.warnings, [
            error instanceof Error
              ? `Failed to attach prompt script: ${error.message}`
              : "Failed to attach prompt script",
          ]);
        }
      }
    }

    if (options.keepFocus !== true) {
      ui.activeFilePath = filePath;
    }

    return document;
  }
}

export const documentService = new DocumentService();
