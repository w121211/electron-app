// examples/search-files-demo.ts
import path from "node:path";
import { ProjectFolderService } from "../src/core/services/project-folder-service.js";
import { createUserSettingsRepository } from "../src/core/services/user-settings-repository.js";
import { FileWatcherService } from "../src/core/services/file-watcher-service.js";
import { createServerEventBus } from "../src/core/event-bus.js";

async function runSearchFilesDemo() {
  console.log("🔍 Testing searchFilesInProject() method");
  console.log("=====================================");

  try {
    // Create dependencies
    const eventBus = createServerEventBus();
    const tempUserDataDir = path.join(process.cwd(), ".tmp-demo-data");
    const userSettingsRepository = createUserSettingsRepository(tempUserDataDir);
    const fileWatcherService = new FileWatcherService(eventBus);
    
    // Create ProjectFolderService
    const projectFolderService = new ProjectFolderService(
      eventBus,
      userSettingsRepository,
      fileWatcherService
    );

    // Get current project directory (electron-app root)
    const currentProjectPath = path.resolve(process.cwd());
    console.log(`📁 Using project path: ${currentProjectPath}`);

    // Add current project as a project folder
    console.log("\n➕ Adding current directory as project folder...");
    await projectFolderService.addProjectFolder(currentProjectPath);
    console.log("✅ Project folder added successfully");

    // Test different search queries
    const testQueries = [
      "",           // Empty query (should return all files/folders)
      "src",        // Should match src folder and files in src
      "core",       // Should match core folder and files with core in name
      "srccore",    // Should match src/core specifically
      "service",    // Should match service files
      "project",    // Should match project-folder-service files
      "utils",      // Should match utils folder and files
      "svelte",     // Should match svelte files
      "nonexistent" // Should return empty results
    ];

    for (const query of testQueries) {
      console.log(`\n🔍 Searching for: "${query}" (limit: 10)`);
      console.log("-".repeat(50));
      
      const results = await projectFolderService.searchFilesInProject(
        query,
        currentProjectPath,
        10
      );

      if (results.length === 0) {
        console.log("❌ No results found");
      } else {
        console.log(`✅ Found ${results.length} results:`);
        results.forEach((result, index) => {
          console.log(`  ${index + 1}. ${result.relativePath}`);
          if (result.score !== undefined) {
            console.log(`     Score: ${result.score}`);
          }
          if (result.highlightTokens.length > 0) {
            const highlightedText = result.highlightTokens
              .map(token => token.isHighlighted ? `[${token.text}]` : token.text)
              .join("");
            console.log(`     Highlighted: ${highlightedText}`);
          }
        });
      }
    }

    // Test with different limits
    console.log(`\n🔍 Testing limit parameter with query "src":`);
    console.log("-".repeat(50));
    
    for (const limit of [3, 5, 20]) {
      const results = await projectFolderService.searchFilesInProject(
        "src",
        currentProjectPath,
        limit
      );
      console.log(`  Limit ${limit}: Found ${results.length} results`);
    }

    // Clean up - remove the project folder
    console.log("\n🧹 Cleaning up...");
    await projectFolderService.removeProjectFolder(currentProjectPath);
    console.log("✅ Project folder removed");

  } catch (error) {
    console.error("❌ Demo failed:", error);
    process.exit(1);
  }
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  runSearchFilesDemo()
    .then(() => {
      console.log("\n🎉 Demo completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Demo failed:", error);
      process.exit(1);
    });
}

export { runSearchFilesDemo };