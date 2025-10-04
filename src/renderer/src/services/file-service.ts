// src/renderer/src/services/file-service.ts

import { Logger } from "tslog";
import { trpcClient } from "../lib/trpc-client.js";
import type { CoreDocument } from "../../../core/services/document/document-service.js";

export class FileService {
  private logger = new Logger({ name: "FileService" });

  async openFile(filePath: string): Promise<CoreDocument> {
    const fileContent = await trpcClient.file.openFile.query({
      filePath,
    });
    return fileContent;
  }

  async getFileType(filePath: string): Promise<string> {
    const fileType = await trpcClient.file.getFileType.query({
      filePath,
    });
    return fileType;
  }

  async writeFile(
    filePath: string,
    content: string,
  ): Promise<CoreDocument> {
    const result = await trpcClient.file.writeFile.mutate({
      filePath,
      content,
    });
    return result;
  }
}

export const fileService = new FileService();
