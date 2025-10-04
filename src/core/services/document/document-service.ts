// src/core/services/document/document-service.ts
import * as crypto from "node:crypto";
import * as path from "node:path";
import {
  fileExists,
  getFileType,
  openFile,
  resolveDocumentKind,
  type DocumentKind,
} from "../../utils/file-utils.js";
import {
  PromptScriptRepository,
  type PromptScriptFile,
} from "../prompt-script/prompt-script-repository.js";
import type { ParsePromptScriptResult } from "../prompt-script/prompt-script-parser.js";

export interface DocumentMetadata {
  fileName: string;
  extension: string;
  charset: string;
  createdAt: string | null;
  modifiedAt: string | null;
}

export interface CoreDocument {
  filePath: string;
  kind: DocumentKind;
  content: string;
  hash: string;
  metadata: DocumentMetadata;
  parsedPromptScript: ParsePromptScriptResult | null;
  isBase64: boolean;
  fileType: string;
}

export class DocumentService {
  private psRepo = new PromptScriptRepository();

  async getDocument(filePath: string): Promise<CoreDocument> {
    const absolutePath = path.resolve(filePath);

    if (!(await fileExists(absolutePath))) {
      throw new Error(`File does not exist: ${absolutePath}`);
    }

    const fileType = getFileType(absolutePath);
    const kind = resolveDocumentKind(absolutePath, fileType);

    if (kind === "promptScript") {
      const psFile = await this.psRepo.read(absolutePath);
      return this.mapPromptScriptFileToCoreDocument(psFile);
    }

    return this.readGenericFile(absolutePath, kind, fileType);
  }

  private async readGenericFile(
    filePath: string,
    kind: DocumentKind,
    fileType: string,
  ): Promise<CoreDocument> {
    const fileContent = await openFile(filePath);
    const hash = crypto
      .createHash("sha256")
      .update(fileContent.content)
      .digest("hex");

    const metadata: DocumentMetadata = {
      fileName: path.basename(filePath),
      extension: path.extname(filePath).slice(1),
      charset: fileContent.isBase64 ? "binary" : "utf-8",
      createdAt: null,
      modifiedAt: null,
    };

    return {
      filePath,
      kind,
      content: fileContent.content,
      hash,
      metadata,
      parsedPromptScript: null,
      isBase64: fileContent.isBase64 ?? false,
      fileType,
    };
  }

  private mapPromptScriptFileToCoreDocument(
    psFile: PromptScriptFile,
  ): CoreDocument {
    return {
      filePath: psFile.absolutePath,
      kind: "promptScript",
      content: psFile.content,
      hash: psFile.hash,
      metadata: {
        fileName: path.basename(psFile.absolutePath),
        extension: path.extname(psFile.absolutePath).slice(1),
        charset: "utf-8",
        createdAt: null,
        modifiedAt: psFile.modifiedAt.toISOString(),
      },
      parsedPromptScript: {
        body: psFile.body,
        metadata: psFile.metadata,
        prompts: psFile.prompts,
        warnings: psFile.warnings,
        delimiter: psFile.delimiter,
      },
      isBase64: false,
      fileType: "markdown",
    };
  }
}
