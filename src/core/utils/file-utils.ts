// src/core/utils/file-utils.ts
import fs from "node:fs/promises";
import path from "node:path";
import { ILogObj, Logger } from "tslog";
import ignore from "ignore";

export interface FileContent {
  content: string;
  fileType: string;
  absoluteFilePath: string;
  isBase64?: boolean;
}

const logger: Logger<ILogObj> = new Logger({ name: "FileUtils" });

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
  data: T,
): Promise<void> {
  // console.debug(`Writing to file: ${filePath}`);

  // Ensure directory exists before writing
  const dirPath = path.dirname(filePath);
  await createDirectory(dirPath);

  // Create a temporary file path with timestamp for uniqueness
  const tempFilePath = `${filePath}.${Date.now()}.tmp`;

  // Write data to the temporary file first
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tempFilePath, content, "utf8");

  // Log debug information about other files in the directory
  // try {
  //   const dirPath = path.dirname(filePath);
  //   const files = await fs.readdir(dirPath);
  //   console.debug(`Files in ${dirPath}:`, files);
  // } catch (err) {
  //   console.debug(`Unable to list directory ${path.dirname(filePath)}: ${err}`);
  // }

  // Atomically rename the temporary file to the target file
  await fs.rename(tempFilePath, filePath);
}

/**
 * Writes text content to a file with atomic write guarantees
 */
export async function writeTextFile(
  filePath: string,
  content: string,
): Promise<void> {
  // Ensure directory exists before writing
  const dirPath = path.dirname(filePath);
  await createDirectory(dirPath);

  // Create a temporary file path with timestamp for uniqueness
  const tempFilePath = `${filePath}.${Date.now()}.tmp`;

  // Write content to the temporary file first
  await fs.writeFile(tempFilePath, content, "utf8");

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
  dirPath: string,
): Promise<{ name: string; isDirectory: boolean }[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory(),
  }));
}

export async function openFile(absoluteFilePath: string): Promise<FileContent> {
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

// File validation constants
export const INVALID_FILE_CHARS = /[<>:"/\\|?*]/;

// Default ignore patterns applied to all projects
export const DEFAULT_IGNORES = [
  "**/.git",
  "**/.svn",
  "**/.hg",
  "**/.DS_Store",
  "**/Thumbs.db",
  "**/node_modules/",
  // ".*", // dot files
  "**/*.tmp",
  "**/*.log",
];

// Default patterns to exclude from .gitignore rules
export const DEFAULT_EXCLUDE_IGNORES: string[] = ["/chats"];

// Types for project folder operations
export interface FolderTreeNode {
  name: string;
  path: string; // Absolute path
  isDirectory: boolean;
  children?: FolderTreeNode[];
}

export interface FileSearchResult {
  name: string; // "world.txt"
  relativePath: string; // "docs/world.txt"
  absolutePath: string; // "/project/docs/world.txt"
  score?: number; // fuzzy search relevance
}

export async function createFolderAtPath(
  parentPath: string,
  folderName: string,
): Promise<string> {
  // Check if parent exists and is a directory
  const parentStats = await fs.stat(parentPath);
  if (!parentStats.isDirectory()) {
    throw new Error(`Parent path is not a directory: ${parentPath}`);
  }

  // Validate folder name
  if (!folderName.trim()) {
    throw new Error("Folder name cannot be empty");
  }

  // Check for invalid characters in folder name
  if (INVALID_FILE_CHARS.test(folderName)) {
    throw new Error("Folder name contains invalid characters");
  }

  // Build folder path
  const folderPath = path.join(parentPath, folderName);

  // Check if folder already exists
  try {
    await fs.stat(folderPath);
    throw new Error(`A file or directory named "${folderName}" already exists`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  // Create the folder
  await fs.mkdir(folderPath);

  return folderPath;
}

export async function generateUniqueFileName(
  parentDir: string,
  baseName: string,
): Promise<string> {
  const ext = path.extname(baseName);
  const nameWithoutExt = path.basename(baseName, ext);

  let counter = 1;
  let candidatePath = path.join(parentDir, baseName);

  // Check if the original name is available
  try {
    await fs.stat(candidatePath);
    // If we get here, file exists, so we need to generate a new name
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // File doesn't exist, original name is available
      return candidatePath;
    }
    throw error;
  }

  // Generate numbered variants until we find an available name
  while (true) {
    const newName = ext
      ? `${nameWithoutExt} (${counter})${ext}`
      : `${nameWithoutExt} (${counter})`;
    candidatePath = path.join(parentDir, newName);

    try {
      await fs.stat(candidatePath);
      counter++;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // Found an available name
        return candidatePath;
      }
      throw error;
    }
  }
}

export async function validateProjectFolderPath(
  absoluteProjectFolderPath: string,
): Promise<boolean> {
  try {
    const stats = await fs.stat(absoluteProjectFolderPath);
    return stats.isDirectory();
  } catch (error) {
    return false;
  }
}

async function createIgnoreInstance(
  projectPath: string,
  excludeIgnores: string[] = DEFAULT_EXCLUDE_IGNORES,
): Promise<ReturnType<typeof ignore>> {
  try {
    const gitignorePath = path.join(projectPath, ".gitignore");
    const gitignoreContent = await fs.readFile(gitignorePath, "utf8");

    // Filter out excluded patterns
    const filteredContent = gitignoreContent
      .split("\n")
      .filter((line) => !excludeIgnores.includes(line.trim()))
      .join("\n");

    return ignore().add(DEFAULT_IGNORES).add(filteredContent);
  } catch (error) {
    // .gitignore doesn't exist or can't be read, use default ignores
    return ignore().add(DEFAULT_IGNORES);
  }
}

async function getPathsWithIgnore(
  currentDir: string,
  rootDir: string,
  ig: ReturnType<typeof ignore>,
): Promise<string[]> {
  const paths: string[] = [];

  try {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryAbsolutePath = path.join(currentDir, entry.name);
      const entryRelativePath = path.relative(rootDir, entryAbsolutePath);

      // Test with ignore rules - if ignored, skip this entry
      if (
        entryRelativePath &&
        ig.ignores(entryRelativePath + (entry.isDirectory() ? "/" : ""))
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        paths.push(entryAbsolutePath); // Add directory to results
        const subPaths = await getPathsWithIgnore(
          entryAbsolutePath,
          rootDir,
          ig,
        );
        paths.push(...subPaths);
      } else {
        paths.push(entryAbsolutePath);
      }
    }
  } catch (error) {
    // Skip directories we can't read
  }

  return paths;
}

export async function getSearchablePaths(
  projectPath: string,
  excludeIgnores: string[] = DEFAULT_EXCLUDE_IGNORES,
): Promise<FileSearchResult[]> {
  const ig = await createIgnoreInstance(projectPath, excludeIgnores);
  const absolutePaths = await getPathsWithIgnore(projectPath, projectPath, ig);

  return absolutePaths.map((absolutePath) => {
    const relativePath = path.relative(projectPath, absolutePath);
    return {
      name: path.basename(relativePath),
      relativePath,
      absolutePath,
    };
  });
}

export async function buildFolderTree(
  targetPath: string,
  excludeIgnores: string[] = DEFAULT_EXCLUDE_IGNORES,
): Promise<FolderTreeNode> {
  const baseName = path.basename(targetPath);

  const stats = await fs.stat(targetPath);

  if (!stats.isDirectory()) {
    // It's a file, return file node
    return {
      name: baseName,
      path: targetPath, // Use absolute path
      isDirectory: false,
    };
  }

  // Load .gitignore rules
  const ig = await createIgnoreInstance(targetPath, excludeIgnores);

  async function buildNodeRecursive(
    currentPath: string,
    projectRoot: string,
  ): Promise<FolderTreeNode> {
    const stats = await fs.stat(currentPath);
    const name = path.basename(currentPath);

    if (!stats.isDirectory()) {
      return { name, path: currentPath, isDirectory: false };
    }

    const node: FolderTreeNode = {
      name,
      path: currentPath,
      isDirectory: true,
      children: [],
    };

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(projectRoot, fullPath);

        // Test with ignore rules - if ignored, skip this entry
        if (
          relativePath &&
          ig.ignores(relativePath + (entry.isDirectory() ? "/" : ""))
        ) {
          continue;
        }

        const childNode = await buildNodeRecursive(fullPath, projectRoot);
        node.children!.push(childNode);
      }
    } catch (error) {
      // Skip directories we can't read
    }

    return node;
  }

  return buildNodeRecursive(targetPath, targetPath);
}

export function flattenTreeToFiles(
  node: FolderTreeNode,
  projectPath: string,
): FileSearchResult[] {
  const files: FileSearchResult[] = [];

  if (!node.isDirectory) {
    // It's a file, add it to the results
    const relativePath = path.relative(projectPath, node.path);
    files.push({
      name: node.name,
      relativePath,
      absolutePath: node.path,
    });
  } else if (node.children) {
    // It's a directory, recursively process children
    for (const child of node.children) {
      files.push(...flattenTreeToFiles(child, projectPath));
    }
  }

  return files;
}

export function validateFileName(name: string): void {
  if (!name.trim()) {
    throw new Error("Name cannot be empty");
  }

  if (INVALID_FILE_CHARS.test(name)) {
    throw new Error("Name contains invalid characters");
  }
}
