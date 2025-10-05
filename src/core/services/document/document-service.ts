// src/core/services/document/document-service.ts
import * as path from "node:path";
import { Logger } from "tslog";
import { getFileType, resolveDocumentKind } from "../../utils/file-utils.js";
import type { PromptScriptService } from "../prompt-script/prompt-script-service.js";
import { mapPromptScriptLinkToDocumentFile } from "./document-repository.js";
import {
  DocumentRepository,
  type DocumentFileWithPromptScript,
} from "./document-repository.js";

const logger = new Logger({ name: "DocumentService" });

export class DocumentService {
  private readonly repository = new DocumentRepository();

  constructor(private readonly psService: PromptScriptService) {}

  async getDocument(filePath: string): Promise<DocumentFileWithPromptScript> {
    const absolutePath = path.resolve(filePath);
    const fileType = getFileType(absolutePath);
    const kind = resolveDocumentKind(absolutePath, fileType);

    if (kind === "promptScript") {
      const linkResult =
        await this.psService.findLinkedChatSession(absolutePath);

      logger.debug(linkResult);

      return mapPromptScriptLinkToDocumentFile(linkResult);
    }

    const document = await this.repository.read(absolutePath);

    return {
      ...document,
      parsedPromptScript: null,
    };
  }
}
