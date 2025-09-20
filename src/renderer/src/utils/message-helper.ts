// src/renderer/src/utils/message-helper.ts

import type { ModelMessage } from "ai";

/**
 * Extracts a string representation from a ModelMessage's content,
 * which can be a string or an array of content parts.
 */
export function getModelMessageContentString(message: ModelMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}