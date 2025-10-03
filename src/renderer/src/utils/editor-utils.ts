// src/renderer/src/utils/editor-utils.ts

import type { CursorPosition } from "../stores/editor-views.svelte.js";

export function offsetToLineColumn(
  text: string,
  offset: number,
): CursorPosition {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

export function lineColumnToOffset(
  text: string,
  pos: CursorPosition,
): number {
  let offset = 0;
  let currentLine = 1;
  while (currentLine < pos.line && offset < text.length) {
    if (text[offset] === "\n") {
      currentLine++;
    }
    offset++;
  }
  // We add pos.column - 1 to get to the right character in the line.
  return offset + pos.column - 1;
}

