// src/core/services/document/document-service.ts
import * as path from "node:path";
import { getFileType, resolveDocumentKind } from "../../utils/file-utils.js";
import type { PromptScriptService } from "../prompt-script/prompt-script-service.js";
import type { PromptScriptLinkResult } from "../prompt-script/prompt-script-repository.js";
import {
  readDocument,
  saveDocument as saveDocumentHelper,
} from "./document-repository.js";
import type { DocumentFile } from "./document-repository.js";

export interface DocumentFileWithPromptScript extends DocumentFile {
  // Already includes PromptScriptFile via PromptScriptLinkResult
  promptScriptLink: PromptScriptLinkResult | null;
}

export class DocumentService {
  constructor(private readonly promptScriptService: PromptScriptService) {}

  async getDocument(filePath: string): Promise<DocumentFileWithPromptScript> {
    const absolutePath = path.resolve(filePath);
    const fileType = getFileType(absolutePath);
    const kind = resolveDocumentKind(absolutePath, fileType);

    if (kind === "promptScript") {
      const linkResult =
        await this.promptScriptService.findLinkedChatSession(absolutePath);

      return {
        ...linkResult.promptScript,
        promptScriptLink: linkResult,
      };
    }

    const document = await readDocument(absolutePath);

    return {
      ...document,
      promptScriptLink: null,
    };
  }

  async saveDocument(
    document: DocumentFile,
    options: {
      content?: string;
    } = {},
  ): Promise<DocumentFileWithPromptScript> {
    const savedDocument = await saveDocumentHelper(document, options);

    const fileType = getFileType(savedDocument.absolutePath);
    const kind = resolveDocumentKind(savedDocument.absolutePath, fileType);

    if (kind === "promptScript") {
      const linkResult = await this.promptScriptService.findLinkedChatSession(
        savedDocument.absolutePath,
      );

      return {
        ...savedDocument,
        promptScriptLink: linkResult,
      };
    }

    return {
      ...savedDocument,
      promptScriptLink: null,
    };
  }
}
