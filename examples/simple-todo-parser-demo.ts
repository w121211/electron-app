// examples/simple-todo-parser-demo.ts

import {
  parseMarkdownTodos,
  type ParsedLine,
} from "../src/renderer/src/utils/markdown-todo-parser.js";

// --- DEMONSTRATION ---

const markdown = `
# Todo List

- [ ] A regular todo item
  - [x] A nested and completed item
- [] An item with no space in brackets
A plain text line.
`;

console.log("=== Testing Simple Todo Parser ===");
console.log("\nInput Markdown:");
console.log(markdown);

const parsedLines = parseMarkdownTodos(markdown);

console.log("\n=== Parsed Line Objects ===");
console.log(JSON.stringify(parsedLines, null, 2));

console.log("\n=== Simulated Rendering ===");

function renderToHtml(lines: ParsedLine[]): string {
  return lines
    .map((line) => {
      if (line.type === "todo") {
        const indent = " ".repeat(line.indentation);
        const checked = line.checked ? "checked" : "";
        return `<div>${indent}- [${line.checked ? "x" : " "}] ${line.content}<button>launch-todo</button></div>`;
      }
      return `<div>${line.raw}</div>`;
    })
    .join("\n");
}

const htmlOutput = renderToHtml(parsedLines);
console.log(htmlOutput);
