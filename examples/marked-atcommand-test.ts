// examples/marked-atcommand-test.ts

import { marked } from "marked";
import {
  atCommandExtension,
  extractAtCommands,
  getAtCommandsFromTodo,
  hasAtCommands,
} from "../src/renderer/src/utils/marked-atcommand-extension.js";

// Configure marked with the extension
marked.use(atCommandExtension);

// Test the extension with example markdown
const testMarkdown = `
# Todo List

- [ ] Buy milk and eggs
- [ ] A todo for launched chat @launched-chat-for-this-todo.chat.json and other stuff
- [x] Completed task with @file.txt reference
- [ ] Another task with @./relative/path.md and @../parent/file.ts
- [ ] Task without any @-commands
- [ ] Complex path @project/src/components/Button.svelte needs review

Some regular text with @inline-reference.json that should also work.
`;

const nestedListMarkdown = `
- [ ] todo item 1
continue next line
  - [ ] todo item 2
continue next line
    - [ ] todo item 3
  - [ ] todo item 4
`;

console.log("=== Testing Marked Extension ===");
console.log("Input markdown:");
console.log(testMarkdown);
console.log("\n=== Parsed HTML ===");
const html = marked.parse(testMarkdown);
console.log(html);

console.log("\n=== Marked Lexer Tokens ===");
const tokens = marked.lexer(testMarkdown);
console.log("Tokens structure:");
console.log(JSON.stringify(tokens, null, 2));

// Find and highlight @-command tokens specifically
console.log("\n=== @-Command Tokens ===");
function findAtCommandTokens(tokens: any[], depth = 0, parentPath = ""): void {
  const indent = "  ".repeat(depth);
  tokens.forEach((token, index) => {
    const currentPath = parentPath ? `${parentPath}[${index}]` : `[${index}]`;

    if (token.type === "atCommand") {
      console.log(`${indent}${currentPath} @-Command Token:`, {
        type: token.type,
        raw: token.raw,
        filePath: token.filePath,
        leadingSpace: token.leadingSpace || "(none)",
      });
    } else {
      // Check for tokens array
      if (token.tokens && Array.isArray(token.tokens)) {
        console.log(
          `${indent}${currentPath} ${token.type} (${token.tokens.length} sub-tokens)`,
        );
        findAtCommandTokens(token.tokens, depth + 1, currentPath);
      }

      // Check for items array (for lists)
      if (token.items && Array.isArray(token.items)) {
        console.log(
          `${indent}${currentPath} ${token.type} (${token.items.length} list items)`,
        );
        findAtCommandTokens(token.items, depth + 1, currentPath);
      }
    }
  });
}

findAtCommandTokens(tokens);

console.log("\n=== Testing Helper Functions ===");

// Test extractAtCommands
const allCommands = extractAtCommands(testMarkdown);
console.log("All @-commands found:", allCommands);

// Test individual todo lines
const todoLines = [
  "- [ ] A todo for launched chat @launched-chat-for-this-todo.chat.json and other stuff",
  "- [x] Completed task with @file.txt reference",
  "- [ ] Another task with @./relative/path.md and @../parent/file.ts",
  "- [ ] Task without any @-commands",
];

todoLines.forEach((line, index) => {
  console.log(`\nTodo ${index + 1}: ${line}`);
  console.log(`  Has @-commands: ${hasAtCommands(line)}`);
  console.log(`  @-commands: ${getAtCommandsFromTodo(line).join(", ")}`);
});

console.log("\n=== Testing Nested List Lexer ===");
console.log("Input markdown:");
console.log(nestedListMarkdown);

const nestedTokens = marked.lexer(nestedListMarkdown);
console.log("\n=== Full Token Structure ===");
console.log(JSON.stringify(nestedTokens, null, 2));
