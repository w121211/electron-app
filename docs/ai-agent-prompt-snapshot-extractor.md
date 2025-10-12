# AI Agent Prompt: PTY Snapshot Extractor - Fix & Enhance

## Task Overview

You are taking over a **PTY terminal snapshot extractor** project that uses **Test-Driven Development (TDD)**. The project extracts structured data from CLI agent terminal sessions (Claude Code, OpenAI Codex, Google Gemini).

**Current Status**: 10/13 tests passing (77% complete)
**Your Goal**: Fix the 3 failing tests, then extend support to Codex and Gemini snapshots.

---

## Project Context

### What is this?

CLI agents like Claude Code, OpenAI Codex, and Google Gemini run in terminals and generate conversation logs. These "snapshots" contain:
- User prompts and AI responses
- Tool executions (Read, Write, Edit, Bash, etc.)
- Session metadata (model, version, working directory)
- Multiple conversation turns

We need to **parse these snapshots** into structured JSON for analysis, replay, and archiving.

### What's Been Done

✅ **Completed**:
1. Schema design with TypeScript types
2. Agent detection (Claude, Codex, Gemini)
3. Metadata extraction (version, model, directory)
4. Message extraction (user prompts, AI responses)
5. Tool call/result extraction
6. Section splitting (multi-agent snapshots)
7. Test suite with 13 tests (10 passing)

⚠️ **Issues** (3 failing tests):
1. Line number calculation off by 2 lines
2. "Search" tool not detected by pattern
3. **Conversation turn grouping broken** (main issue - 0 conversations extracted)

---

## File Structure

```
src/core/services/pty/
├── snapshot-extractor-types.ts   # Types and patterns ✅ COMPLETE
└── snapshot-extractor.ts         # Implementation ⚠️ NEEDS FIXES

tests/
├── pty-snapshot-extractor.test.ts   # Test suite (13 tests)
└── fixtures/
    ├── pty-snapshot-2025-10-09-20-24-04.txt  # Claude snapshot (current test)
    ├── pty-snapshot-2025-10-09-23-22-10.txt  # Codex snapshot
    ├── pty-snapshot-2025-10-10-09-28-14.txt  # Gemini snapshot
    └── ... (5 more snapshots)

docs/
├── pty-snapshot-extractor-plan.md        # Development plan ✅
└── ai-agent-prompt-snapshot-extractor.md # This file
```

---

## Snapshot Format Examples

### Claude Code Snapshot Pattern
```
cw@Cs-MacBook-Pro electron-app % claude

 ▐▛███▜▌   Claude Code v2.0.11
▝▜█████▛▘  Sonnet 4.5 · Claude Pro
  ▘▘ ▝▝    /Users/cw/Documents/GitHub/electron-app

> @src/renderer/src/components/file-explorer/RunningChats.svelte
1. each node should show the file name, now all display as electron-app
investigate

⏺ I'll investigate why all nodes in the RunningChats component are displaying "electron-app"

⏺ Read(src/renderer/src/components/file-explorer/RunningChats.svelte)
  ⎿  Read 199 lines

⏺ Now let me check how PTY chat sessions are structured:

⏺ Search(pattern: "scriptPath|metadata.*title", path: "src/core/services", glob: "*.ts")
  ⎿  Found 195 lines (ctrl+o to expand)
```

**Key Patterns**:
- User prompt: `> message`
- AI response: `⏺ message`
- Tool call: `⏺ ToolName(params)`
- Tool result: `  ⎿  output`

### Codex Snapshot Pattern
```
╭───────────────────────────────────────────────────────╮
│ >_ OpenAI Codex (v0.46.0)                             │
│ model:     gpt-5-codex   /model to change             │
│ directory: ~/Documents/GitHub/my-playwright-extractor │
╰───────────────────────────────────────────────────────╯

› Task: Write a simple extractor script

• Updated Plan
  └ □ Inspect existing project structure

• Ran npm install node-html-parser@latest
  └ (no output)
```

**Key Patterns**:
- User prompt: `› message`
- AI response: `• message`
- Tool execution: `• Ran command` or `• Explored file`
- Tool result: `  └ output`

---

## Current Code

### Type Definitions (`snapshot-extractor-types.ts`)

<details>
<summary>Click to view complete types (already working ✅)</summary>

```typescript
export type AgentType = 'claude' | 'codex' | 'gemini' | 'unknown';

export interface AgentMetadata {
  type: AgentType;
  version?: string;
  model?: string;
  workingDirectory?: string;
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
  cleared?: boolean;
}

export interface ExtractedSnapshot {
  filePath: string;
  totalLines: number;
  sections: SnapshotSection[];
  extractedAt: Date;
}

export const AGENT_PATTERNS: Record<AgentType, AgentPatterns> = {
  claude: {
    bannerPattern: /Claude Code v([\d.]+)/,
    userPromptMarker: /^>\s/,
    assistantResponseMarker: /^⏺\s/,
    toolCallPattern: /^⏺\s+(Read|Write|Edit|Bash|Grep|Glob|Task|WebFetch|TodoWrite)\(/,
    // ... more patterns
  },
  codex: {
    bannerPattern: />_ OpenAI Codex \(v([\d.]+)\)/,
    userPromptMarker: /^›\s/,
    assistantResponseMarker: /^•\s/,
    toolCallPattern: /^•\s+(Ran|Called|Explored|Edited|Added|Updated Plan)/,
    // ... more patterns
  },
  // ... gemini, unknown
};
```
</details>

### Main Implementation (`snapshot-extractor.ts`)

The file contains these functions:
- ✅ `detectAgentType(content)` - Working
- ✅ `extractAgentMetadata(content)` - Working
- ✅ `splitIntoSections(content)` - Working (minor line number issue)
- ✅ `extractMessages(content, agentType)` - Working
- ⚠️ `extractToolCalls(content, agentType)` - Missing "Search" tool
- ✅ `extractToolResults(content, agentType)` - Working
- ✅ `extractConversationTurns(content, agentType)` - Working
- ❌ `extractSnapshot(content, filePath)` - **BROKEN** (0 conversations extracted)

**Main Issue**: The `extractSnapshot()` function doesn't properly group messages into conversation turns. It extracts messages but the `conversations` array ends up empty.

---

## Test Suite

Run tests with:
```bash
npm test -- pty-snapshot-extractor.test.ts
```

### Failing Tests

1. **Test**: "should calculate correct line numbers for sections"
   - **Expected**: `startLine = 1`
   - **Actual**: `startLine = 3`
   - **Location**: `tests/pty-snapshot-extractor.test.ts:68`
   - **Fix**: Adjust section boundary detection in `splitIntoSections()`

2. **Test**: "should extract tool calls from Claude snapshot"
   - **Expected**: Tool names include `'Search'`
   - **Actual**: `['Read', 'Read', 'Bash', ...]` (no 'Search')
   - **Location**: `tests/pty-snapshot-extractor.test.ts:124`
   - **Fix**: Update `toolCallPattern` in `AGENT_PATTERNS.claude` or fix tool name extraction

3. **Test**: "should extract complete conversation structure"
   - **Expected**: `conversations.length > 0`
   - **Actual**: `conversations.length = 0`
   - **Location**: `tests/pty-snapshot-extractor.test.ts:164`
   - **Fix**: Debug `extractSnapshot()` conversation grouping logic (lines 422-496 in `snapshot-extractor.ts`)

---

## Your Tasks

### Phase 1: Fix Failing Tests (Priority 1)

1. **Fix conversation grouping** (main issue)
   - Debug `extractSnapshot()` function (line ~422)
   - Ensure messages are properly grouped into `ConversationTurn` objects
   - Verify tool calls and results are associated with correct turns

2. **Fix "Search" tool detection**
   - Check actual "Search" tool syntax in snapshot
   - Update pattern in `AGENT_PATTERNS.claude.toolCallPattern`
   - Or fix tool name extraction regex

3. **Fix line number calculation**
   - Adjust `splitIntoSections()` to start at line 1
   - Handle snapshots that don't start with banner (offset issue)

### Phase 2: Extend to Other Agents (After all tests pass)

4. **Add Codex support**
   - Use snapshot: `tests/fixtures/pty-snapshot-2025-10-09-23-22-10.txt`
   - Create tests for Codex patterns (`›` and `•` markers)
   - Verify Codex-specific tool patterns (`Ran`, `Explored`, `Edited`)

5. **Add Gemini support**
   - Use snapshot: `tests/fixtures/pty-snapshot-2025-10-10-09-28-14.txt`
   - Gemini uses Playwright MCP in browser, different format
   - May need special handling

### Phase 3: Output Generation (Optional)

6. **Implement save functionality**
   - Write extracted JSON to `tests/fixtures/<snapshot-name>.extracted.json`
   - Create helper function `saveExtractedData(extracted, filename)`

---

## Development Workflow

### TDD Approach (Follow This!)

1. **Run tests first**: `npm test -- pty-snapshot-extractor.test.ts`
2. **Read the failure**: Understand what's expected vs actual
3. **Read the snapshot**: Open `tests/fixtures/pty-snapshot-2025-10-09-20-24-04.txt` and find examples
4. **Fix the code**: Make minimal changes to pass the test
5. **Verify**: Re-run tests, ensure no regressions
6. **Repeat**: Move to next failing test

### Debugging Tips

1. **Add console.log in tests** to see extracted data:
   ```typescript
   const messages = extractMessages(content, 'claude');
   console.log('Messages extracted:', messages.length);
   console.log('First message:', messages[0]);
   ```

2. **Test individual functions** in isolation:
   ```typescript
   // Add a focused test
   it.only('debug conversation grouping', () => {
     const content = readSnapshot(FIRST_SNAPSHOT);
     const extracted = extractSnapshot(content, FIRST_SNAPSHOT);
     console.log('Sections:', extracted.sections.length);
     console.log('Sessions:', extracted.sections[0]?.sessions.length);
     console.log('Conversations:', extracted.sections[0]?.sessions[0]?.conversations.length);
   });
   ```

3. **Read the actual snapshot** - The test fixtures are real terminal output. Study the patterns.

4. **Use TypeScript effectively** - Types are your guide. If `ConversationTurn` expects `messages: Message[]`, ensure you're building that correctly.

---

## Expected Output

After fixes, `extractSnapshot()` should produce:

```json
{
  "filePath": "pty-snapshot-2025-10-09-20-24-04.txt",
  "totalLines": 768,
  "sections": [
    {
      "type": "agent_chat",
      "agent": {
        "type": "claude",
        "version": "2.0.11",
        "model": "Sonnet 4.5 · Claude Pro",
        "workingDirectory": "/Users/cw/Documents/GitHub/electron-app"
      },
      "sessions": [
        {
          "sessionId": "claude-1234567890",
          "agent": { /* same as above */ },
          "conversations": [
            {
              "messages": [
                {
                  "role": "user",
                  "content": "@src/renderer/src/components/file-explorer/RunningChats.svelte\n1. each node should show the file name...",
                  "startLine": 41,
                  "endLine": 42
                },
                {
                  "role": "assistant",
                  "content": "I'll investigate why all nodes...",
                  "startLine": 46,
                  "endLine": 48
                }
              ],
              "toolCalls": [
                { "tool": "Read", "startLine": 55, "endLine": 55 },
                { "tool": "Search", "startLine": 77, "endLine": 77 }
              ],
              "toolResults": [
                { "tool": "Read", "output": "Read 199 lines", "startLine": 56, "endLine": 56 }
              ],
              "startLine": 41,
              "endLine": 100
            }
            // ... more conversation turns
          ],
          "startLine": 1,
          "endLine": 768
        }
      ],
      "startLine": 1,
      "endLine": 768,
      "rawContent": "cw@Cs-MacBook-Pro..."
    }
  ],
  "extractedAt": "2025-10-12T12:00:00.000Z"
}
```

---

## Success Criteria

- [ ] All 13 tests pass (10 already passing, fix 3 failing)
- [ ] Line numbers correctly calculated (start at 1)
- [ ] "Search" tool detected in tool calls
- [ ] Conversation turns properly grouped (length > 0)
- [ ] JSON output is valid and complete
- [ ] Code follows existing style and patterns
- [ ] No regressions (10 passing tests still pass)

## Bonus Goals (Optional)

- [ ] Add Codex snapshot tests (new file: `pty-snapshot-extractor-codex.test.ts`)
- [ ] Add Gemini snapshot tests
- [ ] Implement `saveExtractedData()` function
- [ ] Add support for session boundaries (`/clear` command detection)
- [ ] Extract timestamps and token counts

---

## Questions to Answer

If you get stuck, ask yourself:

1. **Why are conversations empty?**
   - Are messages being extracted? (✅ Yes - test passes)
   - Is `currentTurn` being created? (Check in `extractSnapshot()`)
   - Is `currentTurn` being pushed to `conversations` array?
   - Are the line number ranges correct for grouping?

2. **Why is "Search" not detected?**
   - What does the actual "Search" line look like in the snapshot?
   - Does it match the pattern `^⏺\s+Search\(`?
   - Is it `Search(` or `Search (` (space before paren)?
   - Should the pattern be more flexible?

3. **Why line 3 instead of 1?**
   - Where does `splitIntoSections()` detect the banner?
   - Is there content before the Claude banner?
   - Should we trim leading empty lines?

---

## Getting Started

1. **Read the current code**:
   - Open `src/core/services/pty/snapshot-extractor.ts`
   - Focus on `extractSnapshot()` function (line ~422)
   - Understand the conversation grouping loop

2. **Read the test snapshot**:
   - Open `tests/fixtures/pty-snapshot-2025-10-09-20-24-04.txt`
   - Find examples of user prompts, AI responses, tool calls
   - Note the line numbers

3. **Run the tests**:
   ```bash
   npm test -- pty-snapshot-extractor.test.ts
   ```

4. **Fix issues one by one**:
   - Start with conversation grouping (biggest impact)
   - Then fix "Search" tool detection
   - Finally adjust line number calculation

5. **Verify and iterate**:
   - Re-run tests after each fix
   - Ensure no regressions
   - Add debug logging if needed

---

## Additional Context

### Why This Matters

These snapshots are valuable for:
- **Debugging**: Replay agent conversations to understand behavior
- **Training**: Use as examples for improving AI agents
- **Analysis**: Study tool usage patterns and conversation structures
- **Archiving**: Store terminal sessions in structured format

### Design Principles

1. **Simple & Clear**: Keep patterns readable, avoid over-engineering
2. **Defensive**: Handle missing markers, malformed content, edge cases
3. **Extensible**: Easy to add new agent types (Codex, Gemini, future agents)
4. **TDD**: Tests guide development, catch regressions early
5. **Type-Safe**: TypeScript ensures correctness at compile time

---

## Summary

You're taking over a 77%-complete project. The foundation is solid - agent detection, message extraction, and tool parsing all work. The main issue is **conversation turn grouping** in `extractSnapshot()`.

**Your immediate goal**: Fix the 3 failing tests by debugging the conversation grouping logic, adjusting the tool call pattern, and fixing line number calculation.

**Then**: Extend support to Codex and Gemini snapshots using the same TDD approach.

Good luck! The tests will guide you. Trust the TDD process. 🚀
