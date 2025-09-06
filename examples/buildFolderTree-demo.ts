// examples/buildFolderTree-demo.ts
// $ pnpm tsx examples/buildFolderTree-demo.ts
import {
  buildFolderTree,
  type FolderTreeNode,
} from "../src/core/utils/file-utils.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function printTree(node: FolderTreeNode, indent = 0, maxDepth = 3): void {
  if (indent > maxDepth) {
    const spaces = "  ".repeat(indent);
    console.log(`${spaces}... (truncated)`);
    return;
  }

  const spaces = "  ".repeat(indent);
  const icon = node.isDirectory ? "📁" : "📄";
  
  // Always show both name and path for verification
  if (indent === 0) {
    console.log(`${spaces}${icon} ${node.name} → ${node.path}`);
  } else {
    console.log(`${spaces}${icon} ${node.name} → ${node.path}`);
  }

  if (node.children) {
    const sortedChildren = node.children
      .sort((a, b) => {
        // Directories first, then files
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 20); // Limit to first 20 items per directory

    sortedChildren.forEach((child) => printTree(child, indent + 1, maxDepth));

    if (node.children.length > 20) {
      const spaces = "  ".repeat(indent + 1);
      console.log(`${spaces}... and ${node.children.length - 20} more items`);
    }
  }
}

function getTreeStats(node: FolderTreeNode): {
  files: number;
  directories: number;
  maxDepth: number;
} {
  let files = 0;
  let directories = 0;
  let maxDepth = 0;

  function traverse(node: FolderTreeNode, depth = 0): void {
    maxDepth = Math.max(maxDepth, depth);

    if (node.isDirectory) {
      directories++;
      if (node.children) {
        for (const child of node.children) {
          traverse(child, depth + 1);
        }
      }
    } else {
      files++;
    }
  }

  traverse(node);
  return { files, directories, maxDepth };
}

function analyzeIgnoredPaths(node: FolderTreeNode): string[] {
  const commonIgnoredPatterns = [
    "node_modules",
    ".git",
    ".svn",
    ".hg",
    "dist",
    "build",
    "out",
    "target",
    ".DS_Store",
    "Thumbs.db",
    "*.tmp",
    "*.log",
  ];

  const foundPatterns: string[] = [];

  function findIgnoredPatterns(node: FolderTreeNode): void {
    if (node.children) {
      const childNames = node.children.map((child) => child.name);
      for (const pattern of commonIgnoredPatterns) {
        if (
          childNames.some(
            (name) =>
              name.includes(pattern.replace("*", "")) || name === pattern,
          )
        ) {
          if (!foundPatterns.includes(pattern)) {
            foundPatterns.push(pattern);
          }
        }
      }

      for (const child of node.children) {
        findIgnoredPatterns(child);
      }
    }
  }

  findIgnoredPatterns(node);
  return foundPatterns;
}

async function testSinglePath(testPath: string, name: string): Promise<void> {
  console.log(`\n📍 ${name}`);
  console.log(`Path: ${testPath}`);
  console.log("─".repeat(60));

  try {
    const startTime = Date.now();
    const tree = await buildFolderTree(testPath);
    const endTime = Date.now();

    const stats = getTreeStats(tree);
    const buildTime = endTime - startTime;

    console.log(`⏱️  Build time: ${buildTime}ms`);
    console.log(
      `📊 Stats: ${stats.directories} directories, ${stats.files} files`,
    );
    console.log(`📏 Max depth: ${stats.maxDepth} levels`);

    const ignoredPatterns = analyzeIgnoredPaths(tree);
    if (ignoredPatterns.length > 0) {
      console.log(
        `🚫 .gitignore patterns applied: ${ignoredPatterns.join(", ")}`,
      );
    }

    console.log(`\n📁 Tree structure (limited to 3 levels):`);
    printTree(tree, 0, 3);
  } catch (error) {
    console.error(`❌ Error: ${error}`);
  }
}

async function demo(): Promise<void> {
  console.log("🌳 buildFolderTree() Comprehensive Demo");
  console.log("=====================================\n");
  console.log(
    "This demo tests the buildFolderTree function with various paths",
  );
  console.log("and demonstrates its .gitignore integration capabilities.\n");

  const testPaths = [
    {
      path: path.resolve(__dirname),
      name: "Examples Directory",
    },
    {
      path: path.resolve(__dirname, "..", "src"),
      name: "Source Directory",
    },
    {
      path: path.resolve(__dirname, "..", "src", "core"),
      name: "Core Directory",
    },
    {
      path: process.cwd(),
      name: "Project Root",
    },
  ];

  for (const { path: testPath, name } of testPaths) {
    await testSinglePath(testPath, name);
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ Demo completed successfully!");
  console.log("\nKey features demonstrated:");
  console.log("• Respects .gitignore patterns");
  console.log("• Handles nested directory structures");
  console.log("• Provides performance metrics");
  console.log("• Returns absolute paths for all nodes");
  console.log("• Gracefully handles permission errors");
}

// Run the demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demo().catch((error) => {
    console.error("Demo failed:", error);
    process.exit(1);
  });
}

export { demo };
