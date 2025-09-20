// examples/at-command-parser-demo.ts

import {
  parseAtCommands,
  type Token,
} from "../src/renderer/src/utils/at-command-parser";

function runDemo() {
  console.log("=== At-Command Parser Demo ===\n");

  const testCases = [
    "Check the implementation in @src/utils/parser.ts for details",
    "Multiple files: @package.json and @src/main.ts need updates",
    "Relative paths work too: @../config.json and @./local.env",
    "@file.txt at start, middle @src/app.js, and @end.json",
    "No at-commands in this text",
    "@dotfile.config @src/components/Button.svelte @docs/readme.md",
    "Edge case: @@ double at or @",
    "Mixed: See @src/types.ts and read the docs at @README.md carefully",
    'Quoted paths: @"path with spaces/file name.txt" and @"config files/app.json"',
    'Mixed quoted/unquoted: @src/main.ts and @"build output/dist/bundle.js"',
    'Special chars in quotes: @"path/file-name_v2.1.ts" works fine',
    'Quoted without spaces: @"src/file.ts" and @"package.json"',
    'Both formats: @src/main.ts vs @"src/main.ts" (same result)',
  ];

  testCases.forEach((text, index) => {
    console.log(`Test Case ${index + 1}:`);
    console.log(`Input: "${text}"`);

    const tokens = parseAtCommands(text);
    console.log("Parsed tokens:");

    tokens.forEach((token: Token, tokenIndex) => {
      if (token.type === "text") {
        console.log(`  [${tokenIndex}] TEXT: "${token.raw}"`);
      } else {
        console.log(
          `  [${tokenIndex}] AT-COMMAND: "${token.raw}" → file: "${token.filePath}"`,
        );
      }
    });

    console.log("---\n");
  });

  // Demonstrate token reconstruction
  console.log("=== Token Reconstruction Test ===");
  const originalText = "Check @src/main.ts and @package.json files";
  console.log(`Original: "${originalText}"`);

  const tokens = parseAtCommands(originalText);
  const reconstructed = tokens.map((token) => token.raw).join("");
  console.log(`Reconstructed: "${reconstructed}"`);
  console.log(`Match: ${originalText === reconstructed ? "✅" : "❌"}\n`);

  // Extract just the file paths
  console.log("=== File Path Extraction ===");
  const textWithFiles =
    'Update @src/components/App.svelte, @"build output/main.js", and @package.json';
  const filePaths = parseAtCommands(textWithFiles)
    .filter((token) => token.type === "at-command")
    .map((token) => token.filePath);

  console.log(`Text: "${textWithFiles}"`);
  console.log("Extracted file paths:", filePaths);
}

// Run the demo
runDemo();
