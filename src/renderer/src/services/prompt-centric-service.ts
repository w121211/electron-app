// src/renderer/src/services/prompt-centric-service.ts

import path from "node:path";
import type { PromptEdit } from "../../../core/services/prompt/prompt-edit-repository.js";
import type { DocumentFileWithPromptScript } from "../../../core/services/document/document-service.js";
import type { PromptScriptWarning } from "../../../core/services/prompt-script/prompt-script-repository.js";
import type { ChatSessionData } from "../../../core/services/chat/chat-session-repository.js";
import {
  parseModelId,
  type ModelSurfaceV2,
} from "../../../core/utils/model-utils-v2.js";
import { trpcClient } from "../lib/trpc-client.js";
import { projectState } from "../stores/project-store.svelte.js";
import type { PromptListEntry } from "../stores/prompt-centric-store.svelte.js";

interface PromptScriptOpenResult {
  document: DocumentFileWithPromptScript;
  edit: PromptEdit;
}

interface CreateLinkedSessionParams {
  scriptPath: string;
  modelId: `${string}:${string}`;
  projectPath: string | null;
  title?: string;
}

const promptDraftTitleFallback = "Quick Prompt Draft";

export async function fetchPromptEntries(
  limit = 30,
): Promise<PromptListEntry[]> {
  const edits = await trpcClient.promptEdit.getRecentEdits.query({ limit });

  const entries = await Promise.all(
    edits.map(async (edit) => buildPromptEntry(edit)),
  );

  return entries.sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
}

export async function loadPromptScript(
  scriptPath: string,
): Promise<PromptScriptOpenResult> {
  return trpcClient.promptScript.open.query({ scriptPath });
}

export async function savePromptScript(params: {
  scriptPath: string;
  content: string;
  editId?: string;
}): Promise<PromptScriptOpenResult> {
  return trpcClient.promptScript.save.mutate({
    scriptPath: params.scriptPath,
    content: params.content,
    editId: params.editId,
  });
}

export async function createLinkedSession(
  params: CreateLinkedSessionParams,
): Promise<ChatSessionData> {
  const metadata = params.projectPath
    ? { projectPath: params.projectPath }
    : undefined;

  const result = await trpcClient.promptScript.createLinkedChatSession.mutate({
    promptScriptPath: params.scriptPath,
    modelId: params.modelId,
    title: params.title,
    workingDirectory: params.projectPath ?? undefined,
    metadata,
  });

  return result.chatSession;
}

async function buildPromptEntry(edit: PromptEdit): Promise<PromptListEntry> {
  const updatedAt =
    edit.updatedAt instanceof Date
      ? edit.updatedAt
      : new Date(edit.updatedAt ?? Date.now());

  if (!edit.promptScriptPath) {
    return {
      editId: edit.id,
      kind: "draft",
      title: deriveDraftTitle(edit.contentDraft),
      updatedAt,
      preview: edit.contentDraft ?? null,
      scriptPath: null,
      relativePath: null,
      contentDraft: edit.contentDraft ?? null,
      chatSession: null,
      projectPath: null,
      modelId: null,
      modelSurface: null,
      metadataEngine: null,
      warnings: null,
    };
  }

  const linkResult =
    await trpcClient.promptScript.findLinkedChatSession.query({
      filePath: edit.promptScriptPath,
    });

  const promptScript = linkResult.promptScript;
  const chatSession = linkResult.chatSession ?? null;
  const warnings = normalizeWarnings(linkResult.warnings);

  const metadata = promptScript.promptScriptParsed.metadata;
  const title =
    metadata.title ??
    deriveFileTitle(edit.promptScriptPath) ??
    promptDraftTitleFallback;

  const modelId =
    (chatSession?.metadata?.modelId ??
      (typeof metadata.modelId === "string" ? metadata.modelId : null)) ??
    null;
  const modelSurface = resolveModelSurface(chatSession, modelId);
  const projectPath =
    chatSession?.metadata?.projectPath ??
    resolveProjectPath(edit.promptScriptPath);

  return {
    editId: edit.id,
    kind: "script",
    title,
    updatedAt,
    preview: edit.contentDraft ?? null,
    scriptPath: edit.promptScriptPath,
    relativePath: resolveRelativePath(edit.promptScriptPath),
    contentDraft: edit.contentDraft ?? null,
    chatSession,
    projectPath,
    modelId,
    modelSurface,
    metadataEngine: metadata.engine ?? null,
    warnings,
  };
}

function deriveDraftTitle(content: string | null): string {
  if (!content) {
    return promptDraftTitleFallback;
  }

  const firstLine =
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";

  if (!firstLine) {
    return promptDraftTitleFallback;
  }

  return firstLine.slice(0, 120);
}

function deriveFileTitle(filePath: string | null): string | null {
  if (!filePath) {
    return null;
  }
  return path.basename(filePath).replace(/\.prompt\.md$/i, "") || null;
}

function resolveModelSurface(
  chatSession: ChatSessionData | null,
  modelId: string | null,
): ModelSurfaceV2 | null {
  if (chatSession) {
    return chatSession.modelSurface;
  }

  if (!modelId) {
    return null;
  }

  try {
    return parseModelId(modelId).surface;
  } catch {
    return null;
  }
}

function resolveRelativePath(filePath: string | null): string | null {
  if (!filePath) {
    return null;
  }

  for (const projectFolder of projectState.projectFolders) {
    const relative = path.relative(projectFolder.path, filePath);

    if (
      relative &&
      !relative.startsWith("..") &&
      !path.isAbsolute(relative)
    ) {
      return normalizePath(relative);
    }

    if (relative === "") {
      return path.basename(filePath);
    }
  }

  return normalizePath(filePath);
}

function resolveProjectPath(filePath: string | null): string | null {
  if (!filePath) {
    return null;
  }

  for (const projectFolder of projectState.projectFolders) {
    if (filePath.startsWith(projectFolder.path)) {
      return projectFolder.path;
    }
  }

  return null;
}

function normalizeWarnings(
  warnings: PromptScriptWarning[] | undefined,
): PromptScriptWarning[] | null {
  if (!warnings || warnings.length === 0) {
    return null;
  }
  return warnings;
}

function normalizePath(input: string): string {
  return input.replace(/\\/g, "/");
}
