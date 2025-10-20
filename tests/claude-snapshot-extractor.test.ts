// tests/claude-snapshot-extractor.test.ts
import { describe, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { extractMessages } from "../src/core/services/chat/pty-chat/claude-snapshot-extractor.js";

describe("Claude Snapshot Extractor", () => {
  const snapshotFiles = [
    "pty-snapshot-claude-2025-10-05-06-35-31.txt",
    "pty-snapshot-claude-2025-10-05-22-52-02.txt",
    "pty-snapshot-claude-2025-10-05-22-52-39.txt",
  ];

  snapshotFiles.forEach((filename) => {
    it(`should extract messages from ${filename}`, () => {
      const snapshotPath = join(
        process.cwd(),
        "tests",
        "fixtures",
        filename
      );
      const snapshot = readFileSync(snapshotPath, "utf-8");

      console.log(`\n${"=".repeat(80)}`);
      console.log(`Testing: ${filename}`);
      console.log(`${"=".repeat(80)}\n`);

      const messages = extractMessages(snapshot);

      console.log(`Extracted ${messages.length} messages:\n`);

      messages.forEach((msg, index) => {
        console.log(`Message ${index + 1}:`);
        console.log(`  Role: ${msg.message.role}`);
        console.log(`  Content (first 200 chars):`);
        const preview = msg.message.content
          .substring(0, 200)
          .replace(/\n/g, "\\n");
        console.log(`    ${preview}${msg.message.content.length > 200 ? "..." : ""}`);
        console.log(`  Full length: ${msg.message.content.length} chars`);
        console.log("");
      });

      console.log(`\n${"=".repeat(80)}\n`);
    });
  });
});
