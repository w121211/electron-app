// src/core/utils/file-utils.ts
import fs from "node:fs/promises";
import path from "node:path";

export interface FileContent {
  content: string;
  fileType: string;
  absoluteFilePath: string;
  isBase64?: boolean;
}

/**
 * Creates a directory if it doesn't exist
 */
export async function createDirectory(dirPath: string): Promise<string> {
  await fs.mkdir(dirPath, { recursive: true });
  return dirPath;
}

/**
 * Writes data to a JSON file with atomic write guarantees
 */
export async function writeJsonFile<T>(
  filePath: string,
  data: T
): Promise<void> {
  console.debug(`Writing to file: ${filePath}`);

  // Ensure directory exists before writing
  const dirPath = path.dirname(filePath);
  await createDirectory(dirPath);

  // Create a temporary file path with timestamp for uniqueness
  const tempFilePath = `${filePath}.${Date.now()}.tmp`;

  // Write data to the temporary file first
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tempFilePath, content, "utf8");

  // Log debug information about other files in the directory
  try {
    const dirPath = path.dirname(filePath);
    const files = await fs.readdir(dirPath);
    console.debug(`Files in ${dirPath}:`, files);
  } catch (err) {
    console.debug(`Unable to list directory ${path.dirname(filePath)}: ${err}`);
  }

  // Atomically rename the temporary file to the target file
  await fs.rename(tempFilePath, filePath);
}

/**
 * Reads and parses a JSON file
 */
export async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

/**
 * Checks if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lists contents of a directory
 */
export async function listDirectory(
  dirPath: string
): Promise<{ name: string; isDirectory: boolean }[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory(),
  }));
}

export async function openFile(
  absoluteFilePath: string
): Promise<FileContent> {
  // Skip chat files as they are handled by ChatService
  if (absoluteFilePath.endsWith(".chat.json")) {
    throw new Error("Chat files should be opened using the Chat service");
  }

  const fileType = getFileType(absoluteFilePath);

  // Check if file exists
  const exists = await fileExists(absoluteFilePath);
  if (!exists) {
    throw new Error(`File does not exist: ${absoluteFilePath}`);
  }

  // Read the file content based on type
  let content: string;
  let isBase64 = false;

  if (isBinaryFile(fileType)) {
    const buffer = await fs.readFile(absoluteFilePath);
    content = buffer.toString("base64");
    isBase64 = true;
  } else {
    content = await fs.readFile(absoluteFilePath, "utf8");
  }

  return {
    content,
    fileType,
    absoluteFilePath,
    isBase64,
  };
}

export function getFileType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  const fileTypeMap: Record<string, string> = {
    ".js": "javascript",
    ".ts": "typescript",
    ".jsx": "javascript",
    ".tsx": "typescript",
    ".html": "html",
    ".css": "css",
    ".json": "json",
    ".md": "markdown",
    ".txt": "text",
    ".py": "python",
    ".java": "java",
    ".c": "c",
    ".cpp": "cpp",
    ".go": "go",
    ".rs": "rust",
    ".rb": "ruby",
    ".php": "php",
    ".cs": "csharp",
    ".swift": "swift",
    ".kt": "kotlin",
    // Binary files
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".gif": "image",
    ".pdf": "pdf",
    ".zip": "archive",
    ".tar": "archive",
    ".gz": "archive",
  };

  return fileTypeMap[extension] || "unknown";
}

function isBinaryFile(fileType: string): boolean {
  const binaryTypes = ["image", "pdf", "archive"];
  return binaryTypes.includes(fileType);
}