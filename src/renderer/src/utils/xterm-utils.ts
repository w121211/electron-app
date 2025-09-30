// src/renderer/src/utils/xterm-utils.ts
import type { SerializeAddon } from "@xterm/addon-serialize";
import { Logger } from "tslog";
import type { ChatSessionData } from "../../../core/services/chat-engine/chat-session-repository";
import type { FileService } from "../services/file-service.js";
import { getModelMessageContentString } from "./message-helper.js";

const logger = new Logger({ name: "XtermUtils" });

// Check if CLI model is ready based on terminal content
// export const isCliModelReady = (serializeAddon: SerializeAddon): boolean => {
//   const terminalContent = serializeAddon.serialize();

//   // Common CLI ready patterns
//   const readyPatterns = [
//     '> [2mTry "', // claude code
//     "Type your message or @path/to/file", // gemini cli
//   ];

//   return readyPatterns.some((pattern) => terminalContent.includes(pattern));
// };

export const isCliModelReady = (streamData: string): boolean => {
  //   const terminalContent = serializeAddon.serialize();

  // Common CLI model ready patterns
  const readyPatterns = [
    '> [2mTry "', // claude
    "Type your message or @path/to/file", // gemini
    ">_ \u001b[22m\u001b[1mOpenAI Codex", // codex
    "To get started, describe a task or try one of these commands:", // codex
  ];

  return readyPatterns.some((pattern) => streamData.includes(pattern));
};

// Save terminal snapshot to file
export const saveTerminalSnapshotToFile = async (
  chatDir: string,
  chatId: string,
  serializeAddon: SerializeAddon,
  fileService: FileService,
): Promise<void> => {
  const serializedContent = serializeAddon.serialize();
  const htmlContent = serializeAddon.serializeAsHTML();

  // Generate timestamp for filenames
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  // Save both text and HTML versions
  const textFilename = `terminal-snapshot-${chatId}-${timestamp}.txt`;
  const htmlFilename = `terminal-snapshot-${chatId}-${timestamp}.html`;
  const textFilePath = `${chatDir}/${textFilename}`;
  const htmlFilePath = `${chatDir}/${htmlFilename}`;

  try {
    await Promise.all([
      fileService.writeFile(textFilePath, serializedContent),
      fileService.writeFile(htmlFilePath, htmlContent),
    ]);
    logger.info(
      `Terminal snapshots saved to: ${textFilePath} and ${htmlFilePath}`,
    );
  } catch (error) {
    logger.error("Failed to save terminal snapshots:", error);
  }
};

export const buildTerminatedSessionSnapshot = (
  chat: ChatSessionData,
): string => {
  const metadataSnapshot = chat.metadata?.external?.pty?.screenshot;
  if (metadataSnapshot && metadataSnapshot.trim().length > 0) {
    return metadataSnapshot;
  }

  const reconstructedSnapshot = chat.messages
    .map((entry) => {
      const content = getModelMessageContentString(entry.message);
      if (!content.trim()) {
        return "";
      }
      const prefix = entry.message.role === "user" ? "$ " : "";
      return `${prefix}${content}`;
    })
    .filter((line) => line.length > 0)
    .join("\n");

  if (reconstructedSnapshot.trim().length > 0) {
    return `${reconstructedSnapshot}\n[Session has ended]`;
  }

  return "";
};
