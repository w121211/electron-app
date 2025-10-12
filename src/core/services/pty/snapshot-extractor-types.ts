// src/core/services/pty/snapshot-extractor-types.ts

/**
 * Types for PTY terminal snapshot extraction
 * Supports CLI agents: Claude Code, OpenAI Codex, Google Gemini
 */

export type AgentType = 'claude' | 'codex' | 'gemini' | 'unknown';

export interface AgentMetadata {
  type: AgentType;
  version?: string;
  model?: string;
  workingDirectory?: string;
}

export interface SessionBoundary {
  startLine: number;
  endLine: number;
  metadata: AgentMetadata;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  startLine: number;
  endLine: number;
  timestamp?: string;
}

export interface ToolCall {
  tool: string;
  parameters?: Record<string, unknown>;
  startLine: number;
  endLine: number;
}

export interface ToolResult {
  tool: string;
  output: string;
  startLine: number;
  endLine: number;
}

export interface ConversationTurn {
  messages: Message[];
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  startLine: number;
  endLine: number;
}

export interface ChatSession {
  sessionId: string;
  agent: AgentMetadata;
  conversations: ConversationTurn[];
  startLine: number;
  endLine: number;
  cleared?: boolean; // If session was cleared with /clear
}

export interface SnapshotSection {
  type: 'agent_chat' | 'shell' | 'unknown';
  agent?: AgentMetadata;
  sessions: ChatSession[];
  startLine: number;
  endLine: number;
  rawContent: string;
}

export interface ExtractedSnapshot {
  filePath: string;
  totalLines: number;
  sections: SnapshotSection[];
  extractedAt: Date;
}

/**
 * Selector patterns for different CLI agents
 */
export interface AgentPatterns {
  // Banner/welcome screen patterns
  bannerPattern?: RegExp;
  versionPattern?: RegExp;
  modelPattern?: RegExp;

  // Message patterns
  userPromptMarker?: RegExp;
  assistantResponseMarker?: RegExp;

  // Tool execution patterns
  toolCallPattern?: RegExp;
  toolResultPattern?: RegExp;

  // Session control
  clearCommandPattern?: RegExp;
  contextIndicatorPattern?: RegExp;
}

export const AGENT_PATTERNS: Record<AgentType, AgentPatterns> = {
  claude: {
    bannerPattern: /Claude Code v([\d.]+)/,
    versionPattern: /Claude Code v([\d.]+)/,
    modelPattern: /(Sonnet|Opus|Haiku)[\s\d.]*·\s*Claude\s*(Pro|Team)?/,
    userPromptMarker: /^>\s/,
    assistantResponseMarker: /^⏺\s/,
    toolCallPattern: /^⏺\s+(Read|Write|Edit|Update|Bash|Grep|Glob|Search|Task|WebFetch|TodoWrite|NotebookEdit)\(/,
    toolResultPattern: /^\s+⎿\s/,
    clearCommandPattern: /\/clear/,
    contextIndicatorPattern: /(\d+)% context left/,
  },
  codex: {
    bannerPattern: />_ OpenAI Codex \(v([\d.]+)\)/,
    versionPattern: />_ OpenAI Codex \(v([\d.]+)\)/,
    modelPattern: /model:\s+(gpt-[\w-]+)/,
    userPromptMarker: /^›\s/,
    assistantResponseMarker: /^•\s/,
    toolCallPattern: /^•\s+(Ran|Called|Explored|Edited|Added|Updated Plan)/,
    toolResultPattern: /^\s+└\s/,
    contextIndicatorPattern: /(\d+)% context left/,
  },
  gemini: {
    // Gemini uses Playwright MCP in browser, different pattern
    bannerPattern: /Gemini/,
    userPromptMarker: /^>\s/,
    assistantResponseMarker: /^⏺\s/,
  },
  unknown: {},
};
