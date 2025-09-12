// examples/debug-search-paths.ts
import path from "node:path";
import { getSearchablePaths } from "../src/core/utils/file-utils.js";

async function debugSearchablePaths() {
  console.log("🔍 Debugging getSearchablePaths function");
  console.log("==========================================");

  try {
    const currentProjectPath = path.resolve(process.cwd());
    console.log(`📁 Using project path: ${currentProjectPath}`);

    console.log("\n📋 Calling getSearchablePaths...");
    const results = await getSearchablePaths(currentProjectPath);

    console.log(`✅ Found ${results.length} total paths:`);

    if (results.length === 0) {
      console.log(
        "❌ No paths found - this indicates an issue with the function",
      );
    } else {
      console.log("\n📁 First 20 results:");
      results.slice(0, 20).forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.relativePath} (${result.name})`);
        console.log(`     Absolute: ${result.absolutePath}`);
      });

      if (results.length > 20) {
        console.log(`     ... and ${results.length - 20} more`);
      }
    }
  } catch (error) {
    console.error("❌ Debug failed:", error);
    process.exit(1);
  }
}

// Run the debug
debugSearchablePaths()
  .then(() => {
    console.log("\n🎉 Debug completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Debug failed:", error);
    process.exit(1);
  });
