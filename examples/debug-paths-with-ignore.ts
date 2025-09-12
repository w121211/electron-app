// examples/debug-paths-with-ignore.ts
import path from "node:path";
import fs from "node:fs/promises";
import ignore from "ignore";

// Simplified version of the functions to debug what's happening
async function createIgnoreInstance(projectPath: string) {
  const ig = ignore();

  try {
    const gitignorePath = path.join(projectPath, ".gitignore");
    const gitignoreContent = await fs.readFile(gitignorePath, "utf8");
    ig.add(gitignoreContent);
    console.log("✅ Loaded .gitignore rules");
  } catch {
    console.log("ℹ️  No .gitignore found, using default ignore rules");
  }

  // Add default ignore patterns
  ig.add(["node_modules/**", ".git/**", "*.log", ".DS_Store", "*.tmp"]);

  return ig;
}

async function debugGetPathsWithIgnore(
  relativePath: string,
  ig: ReturnType<typeof ignore>,
): Promise<string[]> {
  const paths: string[] = [];
  console.log(`🔍 Scanning: ${relativePath}`);

  try {
    const entries = await fs.readdir(relativePath, { withFileTypes: true });
    console.log(`📁 Found ${entries.length} entries in ${relativePath}`);

    for (const entry of entries) {
      const entryRelativePath = path.join(relativePath, entry.name);
      console.log(`  Checking: ${entryRelativePath}`);

      // Test with ignore rules - if ignored, skip this entry
      if (
        entryRelativePath &&
        ig.ignores(entryRelativePath + (entry.isDirectory() ? "/" : ""))
      ) {
        console.log(`    ❌ Ignored: ${entryRelativePath}`);
        continue;
      }

      console.log(`    ✅ Accepted: ${entryRelativePath}`);

      if (entry.isDirectory()) {
        paths.push(entryRelativePath); // Add directory to results
        console.log(`    📁 Added directory: ${entryRelativePath}`);
        const subPaths = await debugGetPathsWithIgnore(entryRelativePath, ig);
        paths.push(...subPaths);
      } else {
        paths.push(entryRelativePath);
        console.log(`    📄 Added file: ${entryRelativePath}`);
      }
    }
  } catch (error) {
    console.error(`❌ Error reading directory ${relativePath}:`, error);
  }

  return paths;
}

async function debugGetSearchablePaths() {
  console.log("🔍 Debugging getSearchablePaths step by step");
  console.log("=============================================");

  try {
    const projectPath = path.resolve(process.cwd());
    console.log(`📁 Project path: ${projectPath}`);

    const ig = await createIgnoreInstance(projectPath);
    console.log("\n🚫 Testing ignore rules:");

    // Test some paths with ignore rules
    const testPaths = [
      "src",
      "src/",
      "node_modules",
      "node_modules/",
      ".git",
      ".git/",
      "examples",
      "examples/",
    ];

    testPaths.forEach((testPath) => {
      const ignored = ig.ignores(testPath);
      console.log(`  ${testPath}: ${ignored ? "IGNORED" : "ALLOWED"}`);
    });

    console.log("\n📋 Calling getPathsWithIgnore...");
    const relativePaths = await debugGetPathsWithIgnore(projectPath, ig);

    console.log(`\n✅ Found ${relativePaths.length} relative paths`);
    if (relativePaths.length > 0) {
      console.log("First 10 paths:");
      relativePaths.slice(0, 10).forEach((p, i) => {
        console.log(`  ${i + 1}. ${p}`);
      });
    }

    console.log("\n🔄 Converting to FileSearchResult format...");
    const results = relativePaths.map((relativePath) => {
      const absolutePath = path.resolve(relativePath);
      const normalizedRelativePath = path.relative(projectPath, absolutePath);

      console.log(
        `  ${relativePath} -> ${normalizedRelativePath} (${absolutePath})`,
      );

      return {
        name: path.basename(normalizedRelativePath),
        relativePath: normalizedRelativePath,
        absolutePath,
      };
    });

    console.log(`\n🎯 Final results: ${results.length}`);
  } catch (error) {
    console.error("❌ Debug failed:", error);
    process.exit(1);
  }
}

// Run the debug
debugGetSearchablePaths()
  .then(() => {
    console.log("\n🎉 Debug completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Debug failed:", error);
    process.exit(1);
  });
