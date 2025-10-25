// src/core/services/audio/audio-recording-service.ts
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Logger } from "tslog";
import type { UserSettingsRepository } from "../user-settings-repository.js";

const logger = new Logger({ name: "AudioRecordingService" });

export interface SaveAudioRecordingOptions {
  audioData: Buffer;
  format?: "webm" | "wav" | "mp3";
}

export interface AudioRecordingResult {
  absolutePath: string;
  relativePath: string;
  filename: string;
  fileSize: number;
  format: string;
}

export class AudioRecordingService {
  constructor(
    private readonly userSettingsRepository: UserSettingsRepository,
  ) {}

  async saveRecording(
    options: SaveAudioRecordingOptions,
  ): Promise<AudioRecordingResult> {
    const { audioData, format = "webm" } = options;

    const settings = await this.userSettingsRepository.getSettings();
    const workspaceDir = settings.project.defaultWorkspaceDirectory;

    const dateFolder = this.getDateFolderName();
    const audioDir = path.join(workspaceDir, "audio-recordings", dateFolder);

    await fs.mkdir(audioDir, { recursive: true });

    const timestamp = Date.now();
    const uuid = randomUUID().split("-")[0];
    const filename = `${timestamp}-${uuid}.${format}`;
    const absolutePath = path.join(audioDir, filename);

    await fs.writeFile(absolutePath, audioData);

    const relativePath = path.relative(workspaceDir, absolutePath);

    logger.info(`Saved audio recording: ${relativePath} (${audioData.length} bytes)`);

    return {
      absolutePath,
      relativePath,
      filename,
      fileSize: audioData.length,
      format,
    };
  }

  async deleteRecording(absolutePath: string): Promise<void> {
    try {
      await fs.unlink(absolutePath);
      logger.info(`Deleted audio recording: ${absolutePath}`);
    } catch (error) {
      logger.warn(`Failed to delete audio recording: ${absolutePath}`, error);
      throw error;
    }
  }

  async cleanupOldRecordings(daysToKeep: number = 30): Promise<number> {
    const settings = await this.userSettingsRepository.getSettings();
    const workspaceDir = settings.project.defaultWorkspaceDirectory;
    const audioDir = path.join(workspaceDir, "audio-recordings");

    try {
      const dateFolders = await fs.readdir(audioDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      let deletedCount = 0;

      for (const folder of dateFolders) {
        const folderDate = new Date(folder);
        if (folderDate < cutoffDate) {
          const folderPath = path.join(audioDir, folder);
          await fs.rm(folderPath, { recursive: true, force: true });
          deletedCount++;
          logger.info(`Deleted old audio recordings folder: ${folder}`);
        }
      }

      return deletedCount;
    } catch (error) {
      logger.warn("Failed to cleanup old recordings", error);
      return 0;
    }
  }

  private getDateFolderName(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}
