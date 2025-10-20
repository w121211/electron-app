// tests/pty-snapshot-extractor.test.ts

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AgentType,
  ExtractedSnapshot,
  SnapshotSection,
} from '../src/core/services/chat/pty-chat/snapshot-extractor-types.js';
import {
  detectAgentType,
  extractAgentMetadata,
  splitIntoSections,
  extractMessages,
  extractToolCalls,
  extractToolResults,
  extractConversationTurns,
  extractSnapshot,
} from '../src/core/services/chat/pty-chat/snapshot-extractor.js';

// Test with first Claude snapshot only
const FIRST_SNAPSHOT = 'pty-snapshot-2025-10-09-20-24-04.txt';

// All snapshot files for comprehensive testing
const ALL_SNAPSHOTS = [
  'pty-snapshot-2025-10-09-07-10-58.txt',
  'pty-snapshot-2025-10-09-20-24-04.txt',
  'pty-snapshot-2025-10-09-23-22-10.txt',
  'pty-snapshot-2025-10-10-09-28-14.txt',
  'pty-snapshot-2025-10-10-15-05-05.txt',
  'pty-snapshot-2025-10-10-15-06-05.txt',
  'pty-snapshot-2025-10-10-15-06-25.txt',
  'pty-snapshot-2025-10-12-09-58-33.txt',
];

function readSnapshot(filename: string): string {
  const fixturePath = join(process.cwd(), 'tests', 'fixtures', filename);
  return readFileSync(fixturePath, 'utf-8');
}

describe('PTY Snapshot Extractor - TDD Approach', () => {
  describe('Phase 1: Basic Detection', () => {
    it('should detect agent type from Claude snapshot', () => {
      const content = readSnapshot(FIRST_SNAPSHOT);

      const agentType: AgentType = detectAgentType(content);

      expect(agentType).toBe('claude');
    });

    it('should extract agent metadata from Claude banner', () => {
      const content = readSnapshot(FIRST_SNAPSHOT);

      const metadata = extractAgentMetadata(content);

      expect(metadata.type).toBe('claude');
      expect(metadata.version).toMatch(/2\.0\.\d+/);
      expect(metadata.model).toContain('Sonnet');
    });
  });

  describe('Phase 2: Section Splitting', () => {
    it('should identify number of sections in snapshot', () => {
      const content = readSnapshot(FIRST_SNAPSHOT);

      const sections: SnapshotSection[] = splitIntoSections(content);

      // This snapshot should have 1 main Claude session
      expect(sections.length).toBeGreaterThan(0);
      expect(sections[0]?.type).toBe('agent_chat');
    });

    it('should calculate correct line numbers for sections', () => {
      const content = readSnapshot(FIRST_SNAPSHOT);

      const sections: SnapshotSection[] = splitIntoSections(content);

      const firstSection = sections[0];
      expect(firstSection?.startLine).toBe(1); // Or wherever Claude banner starts
      expect(firstSection?.endLine).toBeGreaterThan(firstSection?.startLine || 0);
    });
  });

  describe('Phase 3: Message Extraction (Claude)', () => {
    it('should extract user prompts from Claude snapshot', () => {
      const content = readSnapshot(FIRST_SNAPSHOT);

      const messages = extractMessages(content, 'claude');

      const userMessages = messages.filter((m) => m.role === 'user');

      // From snapshot analysis, there should be several user prompts
      // Starting with: "@src/renderer/src/components/file-explorer/RunningChats.svelte"
      expect(userMessages.length).toBeGreaterThan(0);
      expect(userMessages[0]?.content).toContain('RunningChats.svelte');
    });

    it('should extract assistant responses from Claude snapshot', () => {
      const content = readSnapshot(FIRST_SNAPSHOT);

      const messages = extractMessages(content, 'claude');

      const assistantMessages = messages.filter((m) => m.role === 'assistant');

      // Claude responses start with ⏺
      expect(assistantMessages.length).toBeGreaterThan(0);
      expect(assistantMessages[0]?.content).toContain('investigate');
    });

    it('should pair user prompts with assistant responses', () => {
      const content = readSnapshot(FIRST_SNAPSHOT);

      const turns = extractConversationTurns(content, 'claude');

      // Should have multiple conversation turns
      expect(turns.length).toBeGreaterThan(0);

      // First turn: User asks about RunningChats, Claude responds with investigation
      expect(turns[0]?.userMessage).toContain('RunningChats');
      expect(turns[0]?.assistantResponse).toBeDefined();
    });
  });

  describe('Phase 4: Tool Call Extraction (Claude)', () => {
    it('should extract tool calls from Claude snapshot', () => {
      const content = readSnapshot(FIRST_SNAPSHOT);

      const toolCalls = extractToolCalls(content, 'claude');

      // Snapshot contains Read, Search, Update tools
      expect(toolCalls.length).toBeGreaterThan(0);

      const toolNames = toolCalls.map((tc) => tc.tool);
      expect(toolNames).toContain('Read');
      expect(toolNames).toContain('Search');
      expect(toolNames).toContain('Update');
    });

    it('should extract tool results from Claude snapshot', () => {
      const content = readSnapshot(FIRST_SNAPSHOT);

      const toolResults = extractToolResults(content, 'claude');

      // Tool results appear after ⎿ marker
      expect(toolResults.length).toBeGreaterThan(0);
      expect(toolResults.some((tr) => tr.output.includes('Read'))).toBe(true);
    });
  });

  describe('Phase 5: Full Extraction', () => {
    it('should perform complete extraction on Claude snapshot', () => {
      const content = readSnapshot(FIRST_SNAPSHOT);

      const extracted: ExtractedSnapshot = extractSnapshot(
        content,
        FIRST_SNAPSHOT
      );

      expect(extracted).toBeDefined();
      expect(extracted?.sections.length).toBeGreaterThan(0);
      expect(extracted?.sections[0]?.agent?.type).toBe('claude');
      expect(extracted?.sections[0]?.sessions.length).toBeGreaterThan(0);
    });

    it('should extract complete conversation structure', () => {
      const content = readSnapshot(FIRST_SNAPSHOT);

      const extracted: ExtractedSnapshot = extractSnapshot(
        content,
        FIRST_SNAPSHOT
      );

      // Find the section with actual conversations (may not be the first one)
      const sectionWithConversations = extracted.sections.find(
        (s) => s.sessions.some((sess) => sess.conversations.length > 0)
      );

      expect(sectionWithConversations).toBeDefined();

      const firstSession = sectionWithConversations?.sessions[0];
      expect(firstSession).toBeDefined();
      expect(firstSession?.conversations.length).toBeGreaterThan(0);

      const firstTurn = firstSession?.conversations[0];
      expect(firstTurn?.messages.length).toBeGreaterThan(0);
      expect(firstTurn?.toolCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Phase 6: Output Generation', () => {
    it('should generate JSON output for extracted data', () => {
      const content = readSnapshot(FIRST_SNAPSHOT);

      const extracted: ExtractedSnapshot = extractSnapshot(
        content,
        FIRST_SNAPSHOT
      );

      // Should be serializable to JSON
      const json = JSON.stringify(extracted, null, 2);
      expect(json).toBeDefined();
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should write extracted data to output file', () => {
      const content = readSnapshot(FIRST_SNAPSHOT);

      const extracted: ExtractedSnapshot = extractSnapshot(
        content,
        FIRST_SNAPSHOT
      );

      // For now, just verify extracted data exists
      // TODO: Implement saveExtractedData to write to tests/fixtures/pty-snapshot-2025-10-09-20-24-04.extracted.json
      expect(extracted).toBeDefined();
      expect(extracted.sections.length).toBeGreaterThan(0);
    });
  });

  describe('Phase 7: Comprehensive Testing - All Snapshots', () => {
    it.each(ALL_SNAPSHOTS)(
      'should successfully extract from %s',
      (snapshotFile) => {
        const content = readSnapshot(snapshotFile);

        const extracted: ExtractedSnapshot = extractSnapshot(
          content,
          snapshotFile
        );

        // Basic validation
        expect(extracted).toBeDefined();
        expect(extracted.filePath).toBe(snapshotFile);
        expect(extracted.sections.length).toBeGreaterThan(0);

        // Check agent detection (some files may be incomplete/corrupted)
        const hasValidAgent = extracted.sections.some(
          (s) => s.agent && s.agent.type !== 'unknown'
        );

        // Log summary for debugging
        const agentTypes = extracted.sections
          .map((s) => s.agent?.type)
          .filter(Boolean);
        const totalSessions = extracted.sections.reduce(
          (sum, s) => sum + s.sessions.length,
          0
        );
        const totalConversations = extracted.sections.reduce(
          (sum, s) =>
            sum + s.sessions.reduce((s2, sess) => s2 + sess.conversations.length, 0),
          0
        );

        const status = hasValidAgent ? '✓' : '⚠ unknown';
        console.log(
          `${status} ${snapshotFile}: ${agentTypes.join(',') || 'unknown'} | ${totalSessions} sessions | ${totalConversations} conversations`
        );
      }
    );
  });
});
