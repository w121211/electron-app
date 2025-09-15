// src/renderer/src/utils/markdown-todo-parser.ts

// Define the structure for our parsed line objects
export interface TextLine {
  type: "text";
  raw: string;
}

export interface TodoLine {
  type: "todo";
  raw: string;
  indentation: number;
  checked: boolean;
  content: string;
}

export type ParsedLine = TextLine | TodoLine;

/**
 * A simple parser that splits markdown text into lines and identifies todo items.
 * @param markdown The markdown text to parse.
 * @returns An array of ParsedLine objects.
 */
export function parseMarkdownTodos(markdown: string): ParsedLine[] {
  const lines = markdown.split("\n");
  const todoRegex = /^(\s*)- \[( |x)?\] (.*)$/;

  return lines.map((line) => {
    const match = line.match(todoRegex);
    if (match) {
      const indentation = match[1].length;
      const checked = match[2] === "x";
      const content = match[3];
      const todoLine: TodoLine = {
        type: "todo",
        raw: line,
        indentation,
        checked,
        content,
      };
      return todoLine;
    } else {
      const textLine: TextLine = {
        type: "text",
        raw: line,
      };
      return textLine;
    }
  });
}