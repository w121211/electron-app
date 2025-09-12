// src/renderer/src/utils/list-utils.ts

export interface ListInfo {
  type: "unordered" | "ordered" | "todo" | null;
  indent: string;
  number?: number;
  isChecked?: boolean;
}

/**
 * Detects the type of list and its properties from a line
 */
export function detectListType(line: string): ListInfo {
  const trimmed = line.trimStart();
  const indent = line.slice(0, line.length - trimmed.length);

  // Unordered list: - item
  if (trimmed.match(/^- /)) {
    return { type: "unordered", indent };
  }

  // Ordered list: 1. item, 2. item, etc.
  const orderedMatch = trimmed.match(/^(\d+)\. /);
  if (orderedMatch) {
    return {
      type: "ordered",
      indent,
      number: parseInt(orderedMatch[1]),
    };
  }

  // Todo list: - [ ] item or - [x] item
  const todoMatch = trimmed.match(/^- \[([ x])\] /);
  if (todoMatch) {
    return {
      type: "todo",
      indent,
      isChecked: todoMatch[1] === "x",
    };
  }

  return { type: null, indent: "" };
}

/**
 * Creates the next list item based on the current line
 */
export function continueList(currentLine: string): string {
  const listInfo = detectListType(currentLine);

  if (!listInfo.type) {
    return "";
  }

  switch (listInfo.type) {
    case "unordered":
      return `${listInfo.indent}- `;

    case "ordered":
      return `${listInfo.indent}${(listInfo.number || 0) + 1}. `;

    case "todo":
      // New todo items are always unchecked
      return `${listInfo.indent}- [ ] `;

    default:
      return "";
  }
}

/**
 * Checks if we should exit list mode (double Enter scenario)
 */
export function shouldExitList(value: string, cursorPos: number): boolean {
  const lines = value.split("\n");
  let currentLineIndex = 0;
  let position = 0;

  // Find current line index
  for (let i = 0; i < lines.length; i++) {
    if (position + lines[i].length >= cursorPos) {
      currentLineIndex = i;
      break;
    }
    position += lines[i].length + 1; // +1 for newline
  }

  const currentLine = lines[currentLineIndex];
  const listInfo = detectListType(currentLine);

  // Exit list if current line is empty list item
  if (listInfo.type) {
    const expectedListStart = continueList(currentLine);
    return currentLine.trim() === expectedListStart.trim();
  }

  return false;
}

/**
 * Handles indentation increase/decrease for current line
 */
export function handleIndentation(
  value: string,
  cursorPos: number,
  increase: boolean,
): { newValue: string; newCursorPos: number } {
  const lines = value.split("\n");
  let currentLineIndex = 0;
  let position = 0;

  // Find current line index
  for (let i = 0; i < lines.length; i++) {
    if (position + lines[i].length >= cursorPos) {
      currentLineIndex = i;
      break;
    }
    position += lines[i].length + 1; // +1 for newline
  }

  const currentLine = lines[currentLineIndex];
  let newLine: string;
  let cursorOffset = 0;

  if (increase) {
    // Add 2 spaces at beginning
    newLine = "  " + currentLine;
    cursorOffset = 2;
  } else {
    // Remove up to 2 spaces from beginning
    if (currentLine.startsWith("  ")) {
      newLine = currentLine.slice(2);
      cursorOffset = -2;
    } else if (currentLine.startsWith(" ")) {
      newLine = currentLine.slice(1);
      cursorOffset = -1;
    } else {
      newLine = currentLine;
      cursorOffset = 0;
    }
  }

  lines[currentLineIndex] = newLine;

  return {
    newValue: lines.join("\n"),
    newCursorPos: cursorPos + cursorOffset,
  };
}

/**
 * Gets current line and cursor position within that line
 */
export function getCurrentLine(
  value: string,
  cursorPos: number,
): { line: string; lineStart: number } {
  const lines = value.split("\n");
  let position = 0;

  for (let i = 0; i < lines.length; i++) {
    if (position + lines[i].length >= cursorPos) {
      return { line: lines[i], lineStart: position };
    }
    position += lines[i].length + 1; // +1 for newline
  }

  // Fallback to last line
  const lastLine = lines[lines.length - 1];
  return {
    line: lastLine,
    lineStart: value.length - lastLine.length,
  };
}

/**
 * Applies text change to textarea with proper event dispatching for undo/redo support
 */
export function executeTextareaChange(
  textarea: HTMLTextAreaElement,
  startPos: number,
  endPos: number,
  newText: string,
  inputType: string = "insertText",
): boolean {
  const beforeEvent = new InputEvent("beforeinput", {
    inputType,
    data: newText,
    bubbles: true,
    cancelable: true,
  });

  if (textarea.dispatchEvent(beforeEvent)) {
    textarea.setRangeText(newText, startPos, endPos, "end");

    const afterEvent = new InputEvent("input", {
      inputType,
      data: newText,
      bubbles: true,
    });
    textarea.dispatchEvent(afterEvent);
    return true;
  }
  return false;
}

/**
 * Handles Tab key indentation for the current line
 */
export function handleTabIndentation(
  textarea: HTMLTextAreaElement,
  value: string,
  cursorPos: number,
  isShift: boolean,
): boolean {
  const { lineStart } = getCurrentLine(value, cursorPos);

  if (isShift) {
    // Remove indentation - check for 2 spaces or 1 space at line start
    if (value.slice(lineStart, lineStart + 2) === "  ") {
      textarea.setSelectionRange(lineStart, lineStart + 2);
      
      if (executeTextareaChange(textarea, lineStart, lineStart + 2, "", "deleteContentBackward")) {
        textarea.setSelectionRange(cursorPos - 2, cursorPos - 2);
        return true;
      }
    } else if (value.slice(lineStart, lineStart + 1) === " ") {
      textarea.setSelectionRange(lineStart, lineStart + 1);
      
      if (executeTextareaChange(textarea, lineStart, lineStart + 1, "", "deleteContentBackward")) {
        textarea.setSelectionRange(cursorPos - 1, cursorPos - 1);
        return true;
      }
    }
  } else {
    // Add indentation - insert 2 spaces at line start
    const savedCursorPos = cursorPos;
    textarea.setSelectionRange(lineStart, lineStart);

    if (executeTextareaChange(textarea, lineStart, lineStart, "  ", "insertText")) {
      textarea.setSelectionRange(savedCursorPos + 2, savedCursorPos + 2);
      return true;
    }
  }
  
  return false;
}
