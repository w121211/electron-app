// src/core/services/pty/pty-message-matcher.ts
import type { ChatMessage } from "../chat/chat-session-repository.js";

const DEFAULT_SIMILARITY_THRESHOLD = 0.95;
const DEFAULT_LENGTH_TOLERANCE = 0.9;

function normalizeContent(content: string): string {
  return content.replace(/\r/g, "").replace(/\s+/g, " ").trim();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }

  const aLength = a.length;
  const bLength = b.length;

  if (aLength === 0) {
    return bLength;
  }
  if (bLength === 0) {
    return aLength;
  }

  if (aLength > bLength) {
    return levenshteinDistance(b, a);
  }

  let previousRow: number[] = [];
  for (let i = 0; i <= aLength; i++) {
    previousRow[i] = i;
  }

  for (let i = 1; i <= bLength; i++) {
    const currentRow = [i];
    const bChar = b.charCodeAt(i - 1);

    for (let j = 1; j <= aLength; j++) {
      const cost = a.charCodeAt(j - 1) === bChar ? 0 : 1;
      currentRow[j] = Math.min(
        currentRow[j - 1] + 1,
        previousRow[j] + 1,
        previousRow[j - 1] + cost,
      );
    }

    previousRow = currentRow;
  }

  return previousRow[aLength] ?? 0;
}

function similarityScore(a: string, b: string): number {
  if (a === b) {
    return 1;
  }

  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) {
    return 1;
  }

  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLength;
}

export function messagesAreSimilar(
  existing: ChatMessage,
  candidate: ChatMessage,
): boolean {
  if (existing.message.role !== candidate.message.role) {
    return false;
  }

  const normalizedExisting = normalizeContent(existing.message.content);
  const normalizedCandidate = normalizeContent(candidate.message.content);

  if (normalizedExisting === normalizedCandidate) {
    return true;
  }

  if (
    normalizedExisting.length === 0 ||
    normalizedCandidate.length === 0
  ) {
    return normalizedExisting.length === normalizedCandidate.length;
  }

  const shorterLength = Math.min(
    normalizedExisting.length,
    normalizedCandidate.length,
  );
  const longerLength = Math.max(
    normalizedExisting.length,
    normalizedCandidate.length,
  );
  const lengthRatio = shorterLength / longerLength;

  if (lengthRatio < DEFAULT_LENGTH_TOLERANCE) {
    return false;
  }

  if (
    normalizedExisting.includes(normalizedCandidate) ||
    normalizedCandidate.includes(normalizedExisting)
  ) {
    return true;
  }

  const score = similarityScore(normalizedExisting, normalizedCandidate);
  return score >= DEFAULT_SIMILARITY_THRESHOLD;
}

export function findSimilarMessageIndex(
  existing: ChatMessage,
  candidates: ChatMessage[],
): number {
  for (let i = 0; i < candidates.length; i++) {
    if (messagesAreSimilar(existing, candidates[i] ?? existing)) {
      return i;
    }
  }
  return -1;
}
