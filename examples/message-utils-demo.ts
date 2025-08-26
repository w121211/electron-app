// examples/message-utils-demo.ts

import {
  processFileReferences,
  extractFileReferences,
  processInputDataPlaceholders,
  extractInputDataPlaceholders,
} from "../src/core/utils/message-utils";

async function main() {
  console.log("🛠️  Message Processing Utils Demo\n");

  // Test extractFileReferences
  console.log("📋 Testing extractFileReferences:");
  const testMessages = [
    "Hello world!",
    "Please review @package.json",
    "Check @package.json and @README.md for details",
    'Look at @"src/services/chat-service.ts" implementation',
    "Mix of @file1.txt and regular text @file2.js here",
    "No file references here",
    "@", // Edge case
    "@ ", // Edge case
    "email@domain.com should not match", // Should not match emails
    '@"path with spaces.txt"', // Test quoted paths
  ];

  testMessages.forEach((message, index) => {
    const refs = extractFileReferences(message);
    console.log(`${index + 1}. "${message}"`);
    console.log(`   → File references: [${refs.join(", ")}]`);
  });

  // Test processFileReferences
  console.log("\n🔄 Testing processFileReferences:");

  const processTestMessages = [
    "Please review @package.json",
    "Check @README.md for documentation",
    "Look at @src/utils.ts and @package.json",
    "Non-existent @missing.txt file",
    "Mix @package.json with @missing.txt and @README.md",
  ];

  for (const [index, message] of processTestMessages.entries()) {
    console.log(`${index + 1}. Original: "${message}"`);
    try {
      const processed = await processFileReferences(message, "/project");
      const processedText = processed.parts.map((p) => p.text).join("");
      console.log(`   Processed: "${processedText}"`);
    } catch (error) {
      console.log(`   Error: ${error}`);
    }
    console.log("");
  }

  // Test input data processing
  console.log("🔧 Testing Input Data Processing:");

  const inputDataTestMessages = [
    "Hello {{name}}!",
    "The user {{username}} has {{count}} items",
    "No placeholders here",
    "Mix of {{data}} and normal text",
    "{{missing}} placeholder",
  ];

  const inputData = {
    name: "John",
    username: "john_doe",
    count: 42,
    data: "important information",
  };

  inputDataTestMessages.forEach((message, index) => {
    const placeholders = extractInputDataPlaceholders(message);
    const processed = processInputDataPlaceholders(message, inputData);

    console.log(`${index + 1}. Original: "${message}"`);
    console.log(`   Placeholders: [${placeholders.join(", ")}]`);
    console.log(`   Processed: "${processed}"`);
    console.log("");
  });

  // Test complex scenarios
  console.log("🚀 Testing Complex Scenarios:");

  const complexMessages = [
    "Review @package.json for user {{username}} with {{priority}} priority",
    "Files @file1.txt and @file2.txt for project {{project_name}}",
    "No replacements needed here",
    "@config.json has {{setting_count}} settings for {{env}} environment",
  ];

  const complexInputData = {
    username: "alice",
    priority: "high",
    project_name: "MyApp",
    setting_count: 15,
    env: "production",
  };

  for (const [index, message] of complexMessages.entries()) {
    console.log(`${index + 1}. Original: "${message}"`);

    try {
      // First process file references
      const afterFilesResult = await processFileReferences(message, "/project");
      const afterFiles = afterFilesResult.parts.map((p) => p.text).join("");
      console.log(`   After file processing: "${afterFiles}"`);

      // Then process input data
      const final = processInputDataPlaceholders(afterFiles, complexInputData);
      console.log(`   Final result: "${final}"`);
    } catch (error) {
      console.log(`   Error: ${error}`);
    }
    console.log("");
  }

  // Performance test
  console.log("⚡ Performance Test:");
  const largeMessage =
    "Check " +
    Array.from({ length: 100 }, (_, i) => `@file${i}.txt`).join(" and ") +
    " files";

  console.time("extractFileReferences-large");
  const largeRefs = extractFileReferences(largeMessage);
  console.timeEnd("extractFileReferences-large");
  console.log(
    `Extracted ${largeRefs.length} file references from large message`,
  );

  console.time("processFileReferences-large");
  try {
    const processedLargeResult = await processFileReferences(
      largeMessage,
      "/project",
    );
    const processedLarge = processedLargeResult.parts
      .map((p) => p.text)
      .join("");
    console.timeEnd("processFileReferences-large");
    console.log(`Processed large message (${processedLarge.length} chars)`);
  } catch (error) {
    console.timeEnd("processFileReferences-large");
    console.log(`Large message processing completed with warnings`);
  }

  console.log("\n✅ Message Processing Utils Demo completed!");
}

// Run the demo
main().catch((error) => {
  console.error("❌ Error running demo:", error);
  process.exit(1);
});
