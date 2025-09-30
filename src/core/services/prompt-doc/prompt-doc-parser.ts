// src/core/services/prompt-doc/prompt-doc-parser.ts
import matter from "gray-matter";
import { z } from "zod";

export interface PromptDocMetadata {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  modelId: string;
  tags: string[];
}

export type PromptDocConversationEntry =
  | {
      kind: "user";
      content: string;
    }
  | {
      kind: "model";
      referenceId: string;
    }
  | {
      kind: "tool_call";
      referenceId: string;
    }
  | {
      kind: "tool_result";
      referenceId: string;
    };

export interface PromptDocContent {
  metadata: PromptDocMetadata;
  title: string;
  context?: string;
  conversation: PromptDocConversationEntry[];
  latestPrompt: string;
}

const promptDocMetadataSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  created_at: z.string().transform((value) => new Date(value)),
  updated_at: z.string().transform((value) => new Date(value)),
  model_id: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

type RawPromptDocMetadata = z.infer<typeof promptDocMetadataSchema>;

const userMarker = /^<!--\s*USER\s*-->$/i;
const modelMarker = /^<!--\s*MODEL:\s*(.+?)\s*-->$/i;
const toolCallMarker = /^<!--\s*TOOL_CALL:\s*(.+?)\s*-->$/i;
const toolResultMarker = /^<!--\s*TOOL_RESULT:\s*(.+?)\s*-->$/i;

export function parsePromptDoc(content: string): PromptDocContent {
  const parsed = matter(content);
  const metadata = promptDocMetadataSchema.parse(parsed.data) as RawPromptDocMetadata;
  const body = parsePromptDocBody(parsed.content);

  return {
    metadata: {
      id: metadata.id,
      title: metadata.title,
      createdAt: metadata.created_at,
      updatedAt: metadata.updated_at,
      modelId: metadata.model_id,
      tags: metadata.tags,
    },
    title: body.title,
    context: body.context,
    conversation: body.conversation,
    latestPrompt: body.latestPrompt,
  };
}

export function serializePromptDoc(content: PromptDocContent): string {
  const parts: string[] = [];
  parts.push(serializeFrontMatter(content.metadata));
  parts.push("");
  parts.push(`# ${content.title}`);
  parts.push("");

  if (content.context !== undefined) {
    parts.push("### Context");
    parts.push("");
    parts.push("```pasted-content");
    parts.push(normalizeNewlines(content.context));
    parts.push("```");
    parts.push("");
  }

  parts.push("### Conversation");
  parts.push("");

  for (const entry of content.conversation) {
    parts.push(serializeConversationEntry(entry));
    parts.push("");
  }

  const latest = normalizeNewlines(content.latestPrompt).trimEnd();
  if (latest.length > 0) {
    parts.push(latest);
  } else if (parts[parts.length - 1] !== "") {
    parts.push("");
  }

  const result = parts.join("\n");
  return result.endsWith("\n") ? result : `${result}\n`;
}

function parsePromptDocBody(body: string): {
  title: string;
  context?: string;
  conversation: PromptDocConversationEntry[];
  latestPrompt: string;
} {
  const lines = normalizeNewlines(body).split("\n");
  let index = 0;

  while (index < lines.length && lines[index]!.trim() === "") {
    index += 1;
  }

  if (index >= lines.length || !lines[index]!.startsWith("# ")) {
    throw new Error("PromptDoc is missing '# Conversation Title' heading");
  }

  const title = lines[index]!.slice(2).trim();
  index += 1;

  while (index < lines.length && lines[index]!.trim() === "") {
    index += 1;
  }

  let context: string | undefined;

  if (index < lines.length && lines[index]!.trim() === "### Context") {
    index += 1;
    while (index < lines.length && lines[index]!.trim() === "") {
      index += 1;
    }

    if (
      index >= lines.length ||
      !lines[index]!.startsWith("```pasted-content")
    ) {
      throw new Error("PromptDoc context section must start with ```pasted-content");
    }

    index += 1;
    const contextLines: string[] = [];
    while (index < lines.length && lines[index] !== "```") {
      contextLines.push(lines[index]!);
      index += 1;
    }

    if (index >= lines.length) {
      throw new Error("PromptDoc context section is missing closing ```");
    }

    context = trimBlankLineEdges(contextLines).join("\n");
    index += 1;

    while (index < lines.length && lines[index]!.trim() === "") {
      index += 1;
    }
  }

  if (index >= lines.length || lines[index]!.trim() !== "### Conversation") {
    throw new Error("PromptDoc is missing '### Conversation' section");
  }

  index += 1;

  const conversation: PromptDocConversationEntry[] = [];

  while (index < lines.length) {
    const current = lines[index]!;
    const trimmed = current.trim();

    if (trimmed === "") {
      const nextMarkerIndex = findNextNonEmptyLineIndex(lines, index + 1);
      if (nextMarkerIndex === undefined) {
        break;
      }

      if (isMarkerLine(lines[nextMarkerIndex]!.trim())) {
        index = nextMarkerIndex;
        continue;
      }

      const latestPrompt = lines
        .slice(index)
        .join("\n")
        .replace(/^\n+/, "");
      return {
        title,
        context,
        conversation,
        latestPrompt,
      };
    }

    if (userMarker.test(trimmed)) {
      index += 1;
      const messageLines: string[] = [];
      while (index < lines.length && !isMarkerLine(lines[index]!.trim())) {
        messageLines.push(lines[index]!);
        index += 1;
      }
      const content = trimBlankLineEdges(messageLines).join("\n");
      conversation.push({ kind: "user", content });
      continue;
    }

    const modelMatch = trimmed.match(modelMarker);
    if (modelMatch) {
      conversation.push({ kind: "model", referenceId: modelMatch[1]!.trim() });
      index += 1;
      continue;
    }

    const toolCallMatch = trimmed.match(toolCallMarker);
    if (toolCallMatch) {
      conversation.push({
        kind: "tool_call",
        referenceId: toolCallMatch[1]!.trim(),
      });
      index += 1;
      continue;
    }

    const toolResultMatch = trimmed.match(toolResultMarker);
    if (toolResultMatch) {
      conversation.push({
        kind: "tool_result",
        referenceId: toolResultMatch[1]!.trim(),
      });
      index += 1;
      continue;
    }

    const latestPrompt = lines.slice(index).join("\n");
    return {
      title,
      context,
      conversation,
      latestPrompt,
    };
  }

  return {
    title,
    context,
    conversation,
    latestPrompt: "",
  };
}

function serializeFrontMatter(metadata: PromptDocMetadata): string {
  const tagsValue = metadata.tags.length
    ? `[${metadata.tags.map(formatTag).join(", ")}]`
    : "[]";

  return [
    "---",
    `id: ${yamlQuote(metadata.id)}`,
    `title: ${yamlQuote(metadata.title)}`,
    `created_at: ${yamlQuote(metadata.createdAt.toISOString())}`,
    `updated_at: ${yamlQuote(metadata.updatedAt.toISOString())}`,
    `model_id: ${yamlQuote(metadata.modelId)}`,
    `tags: ${tagsValue}`,
    "---",
  ].join("\n");
}

function serializeConversationEntry(entry: PromptDocConversationEntry): string {
  if (entry.kind === "user") {
    const body =
      entry.content.length > 0 ? `${normalizeNewlines(entry.content)}\n` : "";
    return `<!-- USER -->\n${body}`.trimEnd();
  }

  if (entry.kind === "model") {
    return `<!-- MODEL: ${entry.referenceId} -->`;
  }

  if (entry.kind === "tool_call") {
    return `<!-- TOOL_CALL: ${entry.referenceId} -->`;
  }

  return `<!-- TOOL_RESULT: ${entry.referenceId} -->`;
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function trimBlankLineEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start]!.trim() === "") {
    start += 1;
  }

  while (end > start && lines[end - 1]!.trim() === "") {
    end -= 1;
  }

  return lines.slice(start, end);
}

function isMarkerLine(value: string): boolean {
  return (
    userMarker.test(value) ||
    modelMarker.test(value) ||
    toolCallMarker.test(value) ||
    toolResultMarker.test(value)
  );
}

function findNextNonEmptyLineIndex(
  lines: string[],
  startIndex: number,
): number | undefined {
  for (let i = startIndex; i < lines.length; i += 1) {
    if (lines[i]!.trim() !== "") {
      return i;
    }
  }
  return undefined;
}

function yamlQuote(value: string): string {
  const escaped = value.replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function formatTag(tag: string): string {
  if (/^[a-zA-Z0-9_-]+$/.test(tag)) {
    return tag;
  }
  return yamlQuote(tag);
}

export function ensurePromptDocContentConsistency<T extends PromptDocContent>(
  content: T,
): T {
  if (content.metadata.title !== content.title) {
    return {
      ...content,
      metadata: {
        ...content.metadata,
        title: content.title,
      },
    } as T;
  }
  return content;
}
