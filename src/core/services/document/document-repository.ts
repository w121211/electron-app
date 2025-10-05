// src/core/services/document/document-repository.ts
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import * as path from "node:path";
import {
  fileExists,
  getFileType,
  openFile,
  resolveDocumentKind,
  writeTextFile,
  type DocumentKind,
} from "../../utils/file-utils.js";

export interface DocumentMetadata {
  fileName: string;
  extension: string;
  createdAt: Date;
  modifiedAt: Date;
}

export interface DocumentFile {
  absolutePath: string;
  kind: DocumentKind;
  content: string;
  hash: string;
  metadata: DocumentMetadata;
  isBase64: boolean;
  charset: string;
  fileType: string; // MIME type
}

export async function readDocument(filePath: string): Promise<DocumentFile> {
  const absolutePath = path.resolve(filePath);

  if (!(await fileExists(absolutePath))) {
    throw new Error(`File does not exist: ${absolutePath}`);
  }

  const fileType = getFileType(absolutePath);
  const kind = resolveDocumentKind(absolutePath, fileType);
  const fileContent = await openFile(absolutePath);
  const stats = await stat(absolutePath);

  const hash = createHash("sha256").update(fileContent.content).digest("hex");

  const metadata: DocumentMetadata = {
    fileName: path.basename(absolutePath),
    extension: path.extname(absolutePath).slice(1),
    createdAt: stats.birthtime,
    modifiedAt: stats.mtime,
  };

  return {
    absolutePath,
    kind,
    content: fileContent.content,
    hash,
    metadata,
    isBase64: fileContent.isBase64 ?? false,
    charset: fileContent.isBase64 ? "binary" : "utf-8",
    fileType,
  };
}

export async function saveDocument(
  document: DocumentFile,
  options: {
    content?: string;
  } = {},
): Promise<DocumentFile> {
  const content = options.content ?? document.content;

  await writeTextFile(document.absolutePath, content);

  return readDocument(document.absolutePath);
}
