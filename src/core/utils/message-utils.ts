// src/core/utils/message-utils.ts
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { ILogObj, Logger } from "tslog";
import type { ModelMessage, UIMessage, UserModelMessage, TextPart } from "ai";
import { openFile } from "./file-utils.js";

// Module-level logger
const logger = new Logger<ILogObj>({ name: "MessageUtils" });

// Types for structured file reference processing
export interface ReferencedFile {
  path: string;
  content: string;
  status: "loaded" | "failed";
}

export interface ProcessedMessageResult {
  parts: TextPart[];
  referencedFiles: ReferencedFile[];
  error?: string;
}

// Utility functions to process ModelMessage

export function getUserModelMessageContentString(
  message: UserModelMessage,
): string {
  const content = message.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join(" ");
  }
  throw new Error(
    `Unsupported UserModelMessage content type: ${typeof content}`,
  );
}

export function getModelMessageContentString(
  message: ModelMessage,
): string {
  if (message.role === "user") {
    return getUserModelMessageContentString(message);
  }

  const content = message.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text")
      .map((part) => (part as { text: string }).text)
      .join(" ");
  }
  return String(content);
}

export function convertModelMessageContentToParts(
  modelMessage: ModelMessage,
): UIMessage["parts"] {
  if (modelMessage.role === "user") {
    const content = modelMessage.content;
    if (typeof content === "string") {
      return [{ type: "text", text: content }];
    }
    // Convert UserContent parts to UIMessage parts
    return content.map((part) => {
      switch (part.type) {
        case "text":
          return { type: "text", text: part.text };
        case "image":
          return {
            type: "data-image",
            id: uuidv4(),
            data: part.image,
          };
        case "file":
          return {
            type: "data-file",
            id: uuidv4(),
            data: { content: part.data },
          };
        default:
          throw new Error(
            `Unsupported content part type: ${(part as { type: string }).type}`,
          );
      }
    });
  } else if (modelMessage.role === "assistant") {
    const content = modelMessage.content;
    if (typeof content === "string") {
      return [{ type: "text", text: content }];
    }
    // Handle AssistantContent parts
    return content.map((part) => {
      switch (part.type) {
        case "text":
          return { type: "text", text: part.text };
        case "tool-call":
          return {
            type: `tool-${part.toolName}` as const,
            toolCallId: part.toolCallId,
            state: "output-available" as const,
            input: (part as unknown as { args: unknown }).args,
            output: "pending",
          };
        default:
          throw new Error(
            `Unsupported assistant content part type: ${(part as { type: string }).type}`,
          );
      }
    });
  } else {
    // For system and tool messages, assume text content
    return [{ type: "text", text: String(modelMessage.content) }];
  }
}

// Utility functions for message processing

export async function processFileReferences(
  message: string,
  projectPath: string,
): Promise<ProcessedMessageResult> {
  try {
    // Extract file references from the message
    const fileRefs = extractFileReferences(message);

    if (fileRefs.length === 0) {
      return {
        parts: [{ type: "text", text: message }],
        referencedFiles: [],
      };
    }

    // Load file contents
    const fileContentMap = await loadFileContents(fileRefs, projectPath);

    // Build parts array using AI SDK TextPart structure
    const parts: TextPart[] = [{ type: "text", text: message }];

    // Add separator if we have loaded files
    if (fileContentMap.size > 0) {
      parts.push({
        type: "text",
        text: "\n\n--- Content from referenced files ---",
      });
    }

    // Build referenced files array
    const referencedFiles: ReferencedFile[] = [];

    // Add loaded files
    for (const [filePath, content] of fileContentMap) {
      parts.push({
        type: "text",
        text: `\n\nContent from @${filePath}:\n${content}`,
      });
      referencedFiles.push({
        path: filePath,
        content,
        status: "loaded",
      });
    }

    // Add failed file references
    const failedRefs = fileRefs.filter((path) => !fileContentMap.has(path));
    for (const path of failedRefs) {
      referencedFiles.push({
        path,
        content: "",
        status: "failed",
      });
    }

    return {
      parts,
      referencedFiles,
    };
  } catch (error) {
    logger.error(`Error processing file references: ${error}`);
    return {
      parts: [{ type: "text", text: message }],
      referencedFiles: [],
      error: String(error),
    };
  }
}

export function extractFileReferences(message: string): string[] {
  const matches: string[] = [];

  // First, find quoted paths: @"path with spaces"
  const quotedRegex = /(^|\s)@"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = quotedRegex.exec(message)) !== null) {
    if (match[2]) {
      matches.push(match[2]);
    }
  }

  // Then find unquoted paths, avoiding already-matched quoted ones
  const unquotedRegex = /(^|\s)@([^\s"]+)/g;
  const quotedPositions = [...message.matchAll(/(^|\s)@"[^"]+"/g)].map((m) => ({
    start: m.index!,
    end: m.index! + m[0].length,
  }));

  while ((match = unquotedRegex.exec(message)) !== null) {
    const matchStart = match.index!;
    const isInQuotedSection = quotedPositions.some(
      (pos) => matchStart >= pos.start && matchStart < pos.end,
    );

    if (!isInQuotedSection && match[2]) {
      matches.push(match[2]);
    }
  }

  return matches;
}

async function loadFileContents(
  fileRefs: string[],
  projectPath: string,
): Promise<Map<string, string>> {
  const fileContentMap = new Map<string, string>();

  for (const filePath of fileRefs) {
    try {
      // Resolve the file path relative to the project
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(projectPath, filePath);

      // Check if the file is within the project folder
      const isInProject = absolutePath.startsWith(projectPath);
      if (!isInProject) {
        logger.warn(`File ${filePath} is outside project folder, skipping`);
        continue;
      }

      // Load the file content using FileService
      const fileContent = await openFile(absolutePath);
      fileContentMap.set(filePath, fileContent.content);

      logger.debug(`Loaded content for file: ${filePath}`);
    } catch (error) {
      logger.warn(`Failed to load file ${filePath}: ${error}`);
      // Don't add to map - will keep original @filename syntax
    }
  }

  return fileContentMap;
}

export function extractChatFileReferences(
  content: string,
): Array<{ path: string; md5: string }> {
  const fileRefs = extractFileReferences(content);

  return fileRefs.map((path) => ({
    path,
    md5: "placeholder", // TODO: Implement actual MD5 calculation if needed
  }));
}

export function processInputDataPlaceholders(
  message: string,
  inputData: Record<string, any>,
): string {
  const placeholderRegex = /\{\{([^}]+)\}\}/g;

  return message.replace(placeholderRegex, (match, key) => {
    const value = inputData[key];
    if (value !== undefined) {
      return String(value);
    }
    return match;
  });
}

export function extractInputDataPlaceholders(message: string): string[] {
  const placeholderRegex = /\{\{([^}]+)\}\}/g;
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = placeholderRegex.exec(message)) !== null) {
    if (match[1]) {
      matches.push(match[1]);
    }
  }

  return matches;
}
