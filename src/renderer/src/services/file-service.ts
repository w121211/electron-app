// src/renderer/src/services/file-service.ts

import { Logger } from "tslog";
import { trpcClient } from "../lib/trpc-client.js";

interface FileContent {
  content: string;
  fileType: string;
  absoluteFilePath: string;
  isBase64?: boolean;
}

export class FileService {
  private logger = new Logger({ name: "FileService" });

  async openFile(filePath: string): Promise<FileContent> {
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
  ): Promise<{ success: boolean }> {
    const result = await trpcClient.file.writeFile.mutate({
      filePath,
      content,
    });
    return result;
  }
}

export const fileService = new FileService();
