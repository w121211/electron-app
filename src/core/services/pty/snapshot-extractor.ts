// src/core/services/pty/snapshot-extractor.ts

import type {
  AgentType,
  AgentMetadata,
  ExtractedSnapshot,
  SnapshotSection,
  Message,
  ToolCall,
  ToolResult,
  ConversationTurn,
  ChatSession,
} from './snapshot-extractor-types.js';
import { AGENT_PATTERNS } from './snapshot-extractor-types.js';

/**
 * Detects the CLI agent type from snapshot content
 */
export function detectAgentType(content: string): AgentType {
  const firstLines = content.split('\n').slice(0, 50).join('\n');

  if (AGENT_PATTERNS.claude.bannerPattern?.test(firstLines)) {
    return 'claude';
  }
  if (AGENT_PATTERNS.codex.bannerPattern?.test(firstLines)) {
    return 'codex';
  }
  if (firstLines.includes('gemini.google.com')) {
    return 'gemini';
  }

  return 'unknown';
}

/**
 * Extracts agent metadata from content
 */
export function extractAgentMetadata(content: string): AgentMetadata {
  const agentType = detectAgentType(content);
  const patterns = AGENT_PATTERNS[agentType];

  const metadata: AgentMetadata = {
    type: agentType,
  };

  if (patterns.versionPattern) {
    const versionMatch = content.match(patterns.versionPattern);
    if (versionMatch?.[1]) {
      metadata.version = versionMatch[1];
    }
  }

  if (patterns.modelPattern) {
    const modelMatch = content.match(patterns.modelPattern);
    if (modelMatch?.[0]) {
      metadata.model = modelMatch[0].trim();
    }
  }

  // Extract working directory (common pattern across agents)
  const dirMatch = content.match(
    /(?:directory:|cwd:)\s*([^\n]+)|\/Users\/[\w/-]+/
  );
  if (dirMatch?.[1] || dirMatch?.[0]) {
    metadata.workingDirectory = (dirMatch[1] || dirMatch[0]).trim();
  }

  return metadata;
}

/**
 * Splits snapshot content into sections (different agents or sessions)
 */
export function splitIntoSections(content: string): SnapshotSection[] {
  const lines = content.split('\n');
  const sections: SnapshotSection[] = [];

  let currentSection: SnapshotSection | null = null;
  let currentAgent: AgentMetadata | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    const lineNum = i + 1;

    // Check if this line indicates a new agent session
    let detectedAgent: AgentType | null = null;

    if (AGENT_PATTERNS.claude.bannerPattern?.test(line)) {
      detectedAgent = 'claude';
    } else if (AGENT_PATTERNS.codex.bannerPattern?.test(line)) {
      detectedAgent = 'codex';
    }

    if (detectedAgent) {
      // Save previous section if exists
      if (currentSection) {
        currentSection.endLine = lineNum - 1;
        currentSection.rawContent = lines
          .slice(currentSection.startLine - 1, currentSection.endLine)
          .join('\n');
        sections.push(currentSection);
      }

      // Start new section
      const sectionContent = lines.slice(i).join('\n');
      currentAgent = extractAgentMetadata(sectionContent);

      currentSection = {
        type: 'agent_chat',
        agent: currentAgent,
        sessions: [],
        startLine: sections.length === 0 ? 1 : lineNum, // First section starts at line 1
        endLine: lines.length,
        rawContent: '',
      };
    }
  }

  // Save last section
  if (currentSection) {
    currentSection.endLine = lines.length;
    currentSection.rawContent = lines
      .slice(currentSection.startLine - 1, currentSection.endLine)
      .join('\n');
    sections.push(currentSection);
  }

  // If no sections detected, treat entire content as one section
  if (sections.length === 0) {
    const agent = extractAgentMetadata(content);
    sections.push({
      type: agent.type === 'unknown' ? 'unknown' : 'agent_chat',
      agent,
      sessions: [],
      startLine: 1,
      endLine: lines.length,
      rawContent: content,
    });
  }

  return sections;
}

/**
 * Extracts messages from content for a specific agent type
 */
export function extractMessages(
  content: string,
  agentType: AgentType
): Message[] {
  const lines = content.split('\n');
  const messages: Message[] = [];
  const patterns = AGENT_PATTERNS[agentType];

  if (!patterns.userPromptMarker && !patterns.assistantResponseMarker) {
    return messages;
  }

  let currentMessage: Partial<Message> | null = null;
  let currentRole: 'user' | 'assistant' | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    const lineNum = i + 1;

    // Check for user prompt marker
    if (patterns.userPromptMarker?.test(line)) {
      // Save previous message
      if (currentMessage && currentRole) {
        messages.push({
          role: currentRole,
          content: currentMessage.content || '',
          startLine: currentMessage.startLine || lineNum,
          endLine: lineNum - 1,
        });
      }

      // Start new user message
      const content = line.replace(patterns.userPromptMarker, '').trim();
      currentMessage = {
        content,
        startLine: lineNum,
      };
      currentRole = 'user';
    }
    // Check for assistant response marker
    else if (patterns.assistantResponseMarker?.test(line)) {
      // Save previous message
      if (currentMessage && currentRole) {
        messages.push({
          role: currentRole,
          content: currentMessage.content || '',
          startLine: currentMessage.startLine || lineNum,
          endLine: lineNum - 1,
        });
      }

      // Start new assistant message
      const content = line.replace(patterns.assistantResponseMarker, '').trim();
      currentMessage = {
        content,
        startLine: lineNum,
      };
      currentRole = 'assistant';
    }
    // Continue current message
    else if (currentMessage && currentRole) {
      // Skip tool result lines and empty continuation
      if (!line.startsWith('  ⎿') && !line.startsWith('  └')) {
        const trimmedLine = line.trim();
        if (trimmedLine) {
          currentMessage.content =
            (currentMessage.content || '') + '\n' + trimmedLine;
        }
      }
    }
  }

  // Save last message
  if (currentMessage && currentRole) {
    messages.push({
      role: currentRole,
      content: currentMessage.content || '',
      startLine: currentMessage.startLine || 1,
      endLine: lines.length,
    });
  }

  return messages;
}

/**
 * Extracts tool calls from content
 */
export function extractToolCalls(
  content: string,
  agentType: AgentType
): ToolCall[] {
  const lines = content.split('\n');
  const toolCalls: ToolCall[] = [];
  const patterns = AGENT_PATTERNS[agentType];

  if (!patterns.toolCallPattern) {
    return toolCalls;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    const lineNum = i + 1;

    if (patterns.toolCallPattern.test(line)) {
      // Extract tool name
      const toolMatch = line.match(
        /(?:⏺|•)\s+([A-Za-z]+)(?:\(|:|$|\s+\(MCP\))/
      );
      if (toolMatch?.[1]) {
        toolCalls.push({
          tool: toolMatch[1],
          startLine: lineNum,
          endLine: lineNum,
        });
      }
    }
  }

  return toolCalls;
}

/**
 * Extracts tool results from content
 */
export function extractToolResults(
  content: string,
  agentType: AgentType
): ToolResult[] {
  const lines = content.split('\n');
  const toolResults: ToolResult[] = [];
  const patterns = AGENT_PATTERNS[agentType];

  if (!patterns.toolResultPattern) {
    return toolResults;
  }

  let currentResult: Partial<ToolResult> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    const lineNum = i + 1;

    if (patterns.toolResultPattern.test(line)) {
      // Save previous result
      if (currentResult) {
        toolResults.push({
          tool: currentResult.tool || 'unknown',
          output: currentResult.output || '',
          startLine: currentResult.startLine || lineNum,
          endLine: lineNum - 1,
        });
      }

      // Start new result
      const output = line.replace(patterns.toolResultPattern, '').trim();
      currentResult = {
        tool: 'unknown', // Will be matched with tool call
        output,
        startLine: lineNum,
      };
    } else if (currentResult) {
      // Continue current result
      const trimmedLine = line.trim();
      if (trimmedLine) {
        currentResult.output = (currentResult.output || '') + '\n' + line;
      }
    }
  }

  // Save last result
  if (currentResult) {
    toolResults.push({
      tool: currentResult.tool || 'unknown',
      output: currentResult.output || '',
      startLine: currentResult.startLine || 1,
      endLine: lines.length,
    });
  }

  return toolResults;
}

/**
 * Extracts conversation turns (user message + assistant response + tools)
 */
export function extractConversationTurns(
  content: string,
  agentType: AgentType
): Array<{ userMessage: string; assistantResponse: string }> {
  const messages = extractMessages(content, agentType);
  const turns: Array<{ userMessage: string; assistantResponse: string }> = [];

  for (let i = 0; i < messages.length - 1; i++) {
    const current = messages[i];
    const next = messages[i + 1];

    if (current?.role === 'user' && next?.role === 'assistant') {
      turns.push({
        userMessage: current.content,
        assistantResponse: next.content,
      });
    }
  }

  return turns;
}

/**
 * Complete snapshot extraction
 */
export function extractSnapshot(
  content: string,
  filePath: string
): ExtractedSnapshot {
  const sections = splitIntoSections(content);
  const lines = content.split('\n');

  // Process each section to extract sessions
  for (const section of sections) {
    if (section.type === 'agent_chat' && section.agent) {
      const agentType = section.agent.type;

      // Extract messages, tools, etc.
      const messages = extractMessages(section.rawContent, agentType);
      const toolCalls = extractToolCalls(section.rawContent, agentType);
      const toolResults = extractToolResults(section.rawContent, agentType);

      // Group into conversation turns
      const conversations: ConversationTurn[] = [];
      let currentTurn: Partial<ConversationTurn> | null = null;

      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        if (!message) continue;

        if (message.role === 'user') {
          // Start new turn
          if (currentTurn && currentTurn.messages && currentTurn.messages.length > 0) {
            // Before saving, collect any tool calls/results after the last message
            const nextUserMessageLine = message.startLine;
            const turnStartLine = currentTurn.startLine || 0;
            const turnToolCalls = toolCalls.filter(
              (tc) =>
                tc.startLine >= turnStartLine &&
                tc.startLine < nextUserMessageLine
            );
            const turnToolResults = toolResults.filter(
              (tr) =>
                tr.startLine >= turnStartLine &&
                tr.startLine < nextUserMessageLine
            );

            conversations.push({
              messages: currentTurn.messages,
              toolCalls: turnToolCalls,
              toolResults: turnToolResults,
              startLine: turnStartLine,
              endLine: nextUserMessageLine - 1,
            });
          }

          currentTurn = {
            messages: [message],
            toolCalls: [],
            toolResults: [],
            startLine: message.startLine,
            endLine: message.endLine,
          };
        } else if (currentTurn) {
          // Add assistant message to current turn
          currentTurn.messages = [...(currentTurn.messages || []), message];
        }
      }

      // Save last turn
      if (currentTurn && currentTurn.messages && currentTurn.messages.length > 0) {
        // Collect tool calls/results after the last message until end of section
        const turnStartLine = currentTurn.startLine || 0;
        const turnToolCalls = toolCalls.filter(
          (tc) => tc.startLine >= turnStartLine
        );
        const turnToolResults = toolResults.filter(
          (tr) => tr.startLine >= turnStartLine
        );

        conversations.push({
          messages: currentTurn.messages,
          toolCalls: turnToolCalls,
          toolResults: turnToolResults,
          startLine: turnStartLine,
          endLine: section.endLine,
        });
      }

      // Create chat session
      const session: ChatSession = {
        sessionId: `${section.agent.type}-${Date.now()}`,
        agent: section.agent,
        conversations,
        startLine: section.startLine,
        endLine: section.endLine,
      };

      section.sessions.push(session);
    }
  }

  return {
    filePath,
    totalLines: lines.length,
    sections,
    extractedAt: new Date(),
  };
}
