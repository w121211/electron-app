// src/core/services/prompt-script/prompt-script-parser.ts
import matter from "gray-matter";

export type PromptScriptEngine = "api" | "pty";

export interface PromptScriptMetadata {
  title?: string;
  description?: string;
  tags?: string[];
  engine: PromptScriptEngine;
  engineDefinedInSource: boolean;
  model?: string;
  chatSessionId?: string;
  extras: Record<string, unknown>;
}

export interface PromptScriptPrompt {
  index: number;
  content: string;
  attributes?: Record<string, string>;
}

export interface ParsePromptScriptResult {
  metadata: PromptScriptMetadata;
  prompts: PromptScriptPrompt[];
  body: string;
  warnings: string[];
  delimiter: string;
}

const USER_DELIMITER_REGEX = /<!--\s*user(?<attributes>[^>]*)-->/gi;
const ATTRIBUTE_REGEX = /([a-zA-Z0-9_-]+)\s*=\s*"([^"]*)"|([a-zA-Z0-9_-]+)\s*=\s*'([^']*)'/g;

type RawFrontMatter = Record<string, unknown> | undefined;

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function parseFrontMatter(raw: RawFrontMatter): {
  metadata: PromptScriptMetadata;
  warnings: string[];
} {
  const warnings: string[] = [];
  const extras: Record<string, unknown> = {};

  const metadata: PromptScriptMetadata = {
    engine: "pty",
    engineDefinedInSource: false,
    extras,
  };

  if (!raw || typeof raw !== "object") {
    return { metadata, warnings };
  }

  const entries = Object.entries(raw);
  for (const [key, value] of entries) {
    switch (key) {
      case "title": {
        if (typeof value === "string") {
          metadata.title = value;
        } else if (value !== undefined) {
          warnings.push("Ignoring non-string title in prompt script front matter");
          extras[key] = value;
        }
        break;
      }
      case "description": {
        if (typeof value === "string") {
          metadata.description = value;
        } else if (value !== undefined) {
          warnings.push(
            "Ignoring non-string description in prompt script front matter",
          );
          extras[key] = value;
        }
        break;
      }
      case "tags": {
        if (Array.isArray(value)) {
          const tags = value.filter((item) => typeof item === "string");
          if (tags.length !== value.length) {
            warnings.push(
              "Some prompt script tags are not strings and were ignored",
            );
          }
          if (tags.length > 0) {
            metadata.tags = tags;
          }
        } else if (value !== undefined) {
          warnings.push("Ignoring non-array tags in prompt script front matter");
          extras[key] = value;
        }
        break;
      }
      case "engine": {
        if (value === "api" || value === "pty") {
          metadata.engine = value;
          metadata.engineDefinedInSource = true;
        } else if (value === undefined || value === null) {
          // Use default
        } else {
          warnings.push(
            "Invalid engine in prompt script front matter. Defaulting to 'pty'",
          );
        }
        break;
      }
      case "model": {
        if (typeof value === "string") {
          metadata.model = value;
        } else if (value !== undefined) {
          warnings.push(
            "Ignoring non-string model in prompt script front matter",
          );
          extras[key] = value;
        }
        break;
      }
      case "chatSessionId": {
        if (typeof value === "string" && value.trim().length > 0) {
          metadata.chatSessionId = value.trim();
        } else if (value !== undefined) {
          warnings.push(
            "Ignoring non-string chatSessionId in prompt script front matter",
          );
        }
        break;
      }
      default: {
        extras[key] = value;
      }
    }
  }

  return { metadata, warnings };
}

function parseDelimiterAttributes(raw: string | undefined): Record<string, string> | undefined {
  if (!raw) {
    return undefined;
  }

  const attributes: Record<string, string> = {};
  let match: RegExpExecArray | null;
  ATTRIBUTE_REGEX.lastIndex = 0;
  while ((match = ATTRIBUTE_REGEX.exec(raw)) !== null) {
    const key = match[1] ?? match[3];
    const value = match[2] ?? match[4];
    if (key && value !== undefined) {
      attributes[key] = value;
    }
  }

  return Object.keys(attributes).length > 0 ? attributes : undefined;
}

function detectPromptDelimiter(content: string): string {
  const match = content.match(/<!--\s*user[^>]*-->/i);
  return match ? match[0] : "<!-- user -->";
}

function extractPrompts(body: string): PromptScriptPrompt[] {
  const normalizedBody = normalizeNewlines(body);
  const prompts: PromptScriptPrompt[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let pendingAttributes: Record<string, string> | undefined;

  const pushPrompt = (segment: string) => {
    const content = segment.trim();
    if (content.length === 0) {
      return;
    }
    const prompt: PromptScriptPrompt = {
      index: prompts.length,
      content,
    };
    if (pendingAttributes) {
      prompt.attributes = pendingAttributes;
      pendingAttributes = undefined;
    }
    prompts.push(prompt);
  };

  USER_DELIMITER_REGEX.lastIndex = 0;
  while ((match = USER_DELIMITER_REGEX.exec(normalizedBody)) !== null) {
    const segment = normalizedBody.slice(lastIndex, match.index);
    pushPrompt(segment);

    const attributes = parseDelimiterAttributes(match.groups?.attributes);
    pendingAttributes = attributes;

    lastIndex = match.index + match[0].length;
  }

  const tailSegment = normalizedBody.slice(lastIndex);
  pushPrompt(tailSegment);

  return prompts;
}

export function parsePromptScriptContent(content: string): ParsePromptScriptResult {
  const parsed = matter(content);
  const frontMatterResult = parseFrontMatter(parsed.data as RawFrontMatter);
  const prompts = extractPrompts(parsed.content ?? "");
  const delimiter = detectPromptDelimiter(content);

  return {
    metadata: frontMatterResult.metadata,
    prompts,
    body: normalizeNewlines(parsed.content ?? ""),
    warnings: frontMatterResult.warnings,
    delimiter,
  };
}
