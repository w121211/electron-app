// src/renderer/src/utils/marked-atcommand-extension.ts

import type { MarkedExtension, Tokens } from "marked";

export interface AtCommandToken extends Tokens.Generic {
  type: "atCommand";
  raw: string;
  filePath: string;
  leadingSpace: string;
}

/**
 * Marked extension to parse @-commands (file paths) in todo items
 *
 * Matches patterns like:
 * - @file.txt
 * - @path/to/file.json
 * - @launched-chat-for-this-todo.chat.json
 * - @./relative/path.md
 * - @../parent/file.ts
 *
 * The @-command must be preceded by whitespace or start of line,
 * and followed by whitespace, punctuation, or end of line.
 */
export const atCommandExtension: MarkedExtension = {
  extensions: [
    {
      name: "atCommand",
      level: "inline",
      start(src: string) {
        return src.search(/(?:^|\s)@[^\s@]+/);
      },
      tokenizer(src: string) {
        // Match @-commands that:
        // - Start at beginning of string or after whitespace
        // - Begin with @
        // - Can start with ./ or ../ for relative paths, or alphanumeric for absolute/simple paths
        // - Contain valid file path characters (letters, numbers, dots, slashes, dashes, underscores)
        // - End at whitespace, punctuation, or end of string
        const rule =
          /^(\s*)@((?:\.\.?\/)?[a-zA-Z0-9][a-zA-Z0-9._/\-]*(?:\.[a-zA-Z0-9]+)?)/;
        const match = rule.exec(src);

        if (match) {
          const [fullMatch, leadingSpace, filePath] = match;

          return {
            type: "atCommand",
            raw: fullMatch,
            filePath,
            leadingSpace,
          } as AtCommandToken;
        }

        return undefined;
      },
      renderer(token: Tokens.Generic) {
        const atToken = token as AtCommandToken;
        const { filePath, leadingSpace } = atToken;

        return `${leadingSpace}<span class="at-command" data-file-path="${filePath}">@${filePath}</span>`;
      },
    },
  ],
};

/**
 * Helper function to extract @-commands from a markdown string
 */
export function extractAtCommands(markdown: string): string[] {
  const atCommands: string[] = [];
  const rule =
    /(?:^|\s)@((?:\.\.?\/)?[a-zA-Z0-9][a-zA-Z0-9._/\-]*(?:\.[a-zA-Z0-9]+)?)/g;
  let match: RegExpExecArray | null;

  while ((match = rule.exec(markdown)) !== null) {
    atCommands.push(match[1]);
  }

  return atCommands;
}

/**
 * Helper function to check if a todo item contains @-commands
 */
export function hasAtCommands(todoText: string): boolean {
  return /(?:^|\s)@(?:\.\.?\/)?[a-zA-Z0-9][a-zA-Z0-9._/\-]*(?:\.[a-zA-Z0-9]+)?/.test(
    todoText,
  );
}

/**
 * Helper function to get @-commands from a specific todo item
 */
export function getAtCommandsFromTodo(todoLine: string): string[] {
  // Remove todo checkbox syntax first
  const todoContent = todoLine.replace(/^(\s*)- \[([ x])\] /, "");
  return extractAtCommands(todoContent);
}
