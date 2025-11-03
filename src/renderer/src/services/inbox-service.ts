// src/renderer/src/services/inbox-service.ts
import type { Prompt } from "../../../core/services/prompt/prompt-types.js";
import type { ChatSessionData } from "../../../core/services/chat/chat-session-repository.js";
import { trpcClient } from "../lib/trpc-client.js";

export type InboxEntry = Prompt | ChatSessionData;

export function isChatSession(entry: InboxEntry): entry is ChatSessionData {
  return "messages" in entry && "modelSurface" in entry;
}

export function isPrompt(entry: InboxEntry): entry is Prompt {
  return "content" in entry && !("messages" in entry);
}

export function getEntryId(entry: InboxEntry): string {
  return entry.id;
}

export function getEntryTitle(entry: InboxEntry): string {
  if (isChatSession(entry)) {
    return entry.metadata?.title || "Untitled Chat";
  }
  return entry.metadata?.title || "Untitled Prompt";
}

export function getEntryUpdatedAt(entry: InboxEntry): Date {
  return entry.updatedAt;
}

export async function fetchInboxEntries(
  limit?: number,
): Promise<InboxEntry[]> {
  const [prompts, chatSessions] = await Promise.all([
    trpcClient.prompt.list.query({ limit }),
    trpcClient.chatSession.list.query({ limit }),
  ]);

  const combined: InboxEntry[] = [...prompts, ...chatSessions];

  combined.sort((a, b) => {
    const timeA = getEntryUpdatedAt(a).getTime();
    const timeB = getEntryUpdatedAt(b).getTime();
    return timeB - timeA;
  });

  if (limit && combined.length > limit) {
    return combined.slice(0, limit);
  }

  return combined;
}
