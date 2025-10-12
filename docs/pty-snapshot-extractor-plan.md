# PTY Snapshot Extractor - TDD Development Plan

## 目標 (Objective)

針對 CLI agent（Claude, Codex, Gemini）的 terminal snapshot 寫 extractor，採用 test-driven development (TDD) 方式開發。

## 可捕捉的資料 (Capturable Data)

根據實際 snapshot 分析，我們可以提取以下資料：

### 1. Session Metadata
- CLI agent 類型 (claude, codex, gemini)
- 版本資訊 (e.g., "Claude Code v2.0.14", "OpenAI Codex v0.46.0")
- Model 資訊 (e.g., "Sonnet 4.5 · Claude Pro", "gpt-5-codex")
- Working directory
- Timestamp ranges

### 2. Session Boundaries
- Session start indicators (welcome screens, version banners)
- Session switches (e.g., `/clear` command creating new session within same agent)
- Multiple different agents in same terminal

### 3. Conversation Structure
- User prompts (marked with `>` or `›`)
- Assistant responses (marked with `⏺` or `•` bullets)
- Tool calls/function executions (Bash, Read, Write, Edit, etc.)
- Tool results (file contents, command outputs)
- Thinking/reasoning blocks
- Error messages and interruptions

### 4. Special Patterns
- MCP tool calls (playwright operations)
- Code blocks with syntax
- File paths and line numbers
- Progress indicators and status messages
- Context usage percentages
- Token counts

## Schema 設計 (Schema Design)

### 核心類型 (Core Types)

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
```

### Selector Patterns

每個 CLI agent 都有特定的 pattern：

```typescript
export interface AgentPatterns {
  bannerPattern?: RegExp;
  versionPattern?: RegExp;
  modelPattern?: RegExp;
  userPromptMarker?: RegExp;
  assistantResponseMarker?: RegExp;
  toolCallPattern?: RegExp;
  toolResultPattern?: RegExp;
  clearCommandPattern?: RegExp;
  contextIndicatorPattern?: RegExp;
}
```

## TDD 開發流程 (TDD Development Workflow)

### Phase 1: Basic Detection ✅
- [x] Detect agent type from snapshot
- [x] Extract agent metadata (version, model, directory)

### Phase 2: Section Splitting ✅ (1 minor issue)
- [x] Split snapshot into sections
- [⚠️] Calculate line numbers (starts at line 3 instead of 1 - minor fix needed)

### Phase 3: Message Extraction ✅
- [x] Extract user prompts
- [x] Extract assistant responses
- [x] Pair user prompts with assistant responses

### Phase 4: Tool Call Extraction ⚠️ (1 issue)
- [x] Extract tool calls
- [⚠️] "Search" tool not detected (pattern needs refinement)
- [x] Extract tool results

### Phase 5: Full Extraction ⚠️ (1 issue)
- [x] Perform complete extraction
- [⚠️] Conversation turns not properly grouped (0 conversations extracted)

### Phase 6: Output Generation ✅
- [x] Generate JSON output
- [x] Verify data structure

## 測試結果 (Test Results)

**Current Status: 10/13 tests passing (77%)**

### ✅ Passing Tests (10)
1. should detect agent type from Claude snapshot
2. should extract agent metadata from Claude banner
3. should identify number of sections in snapshot
4. should extract user prompts from Claude snapshot
5. should extract assistant responses from Claude snapshot
6. should pair user prompts with assistant responses
7. should extract tool results from Claude snapshot
8. should perform complete extraction on Claude snapshot
9. should generate JSON output for extracted data
10. should write extracted data to output file

### ❌ Failing Tests (3)

1. **Line number calculation** - Expected startLine to be 1, got 3
   - Minor issue: Banner detection starts at line 3 instead of 1
   - Fix: Adjust section boundary detection

2. **Tool call extraction** - "Search" tool not detected
   - Tool pattern only matches exact format `⏺ Search(`
   - Actual format in snapshot may be slightly different
   - Fix: Review actual "Search" tool syntax in snapshot

3. **Conversation structure** - 0 conversations extracted
   - Messages are extracted but not properly grouped into conversation turns
   - Fix: Refine conversation grouping logic in `extractSnapshot()`

## 下一步 (Next Steps)

### Immediate Fixes
1. Fix line number calculation (easy fix)
2. Debug and fix "Search" tool pattern (check actual syntax)
3. Fix conversation turn grouping logic

### Future Enhancements
1. Add support for Codex snapshots (different markers: `›` and `•`)
2. Add support for Gemini/MCP snapshots (browser-based patterns)
3. Implement save/export functionality
4. Add support for session boundary detection (`/clear` command)
5. Extract additional metadata (timestamps, context usage, token counts)

## 檔案結構 (File Structure)

```
src/core/services/pty/
├── snapshot-extractor-types.ts   # Type definitions and patterns
└── snapshot-extractor.ts         # Extractor implementation

tests/
├── pty-snapshot-extractor.test.ts  # TDD test suite
└── fixtures/
    ├── pty-snapshot-2025-10-09-20-24-04.txt  # Test snapshot (Claude)
    ├── pty-snapshot-2025-10-09-23-22-10.txt  # Test snapshot (Codex)
    └── ...  # More snapshots
```

## 使用方式 (Usage)

```typescript
import { extractSnapshot } from './snapshot-extractor.js';
import { readFileSync } from 'fs';

const content = readFileSync('snapshot.txt', 'utf-8');
const extracted = extractSnapshot(content, 'snapshot.txt');

console.log(`Found ${extracted.sections.length} sections`);
console.log(`Agent: ${extracted.sections[0]?.agent?.type}`);
console.log(`Sessions: ${extracted.sections[0]?.sessions.length}`);

// Save to JSON
import { writeFileSync } from 'fs';
writeFileSync('snapshot.extracted.json', JSON.stringify(extracted, null, 2));
```

## 開發原則 (Development Principles)

1. **Test First** - 先寫測試，再寫實作
2. **Incremental** - 每次只針對一個 snapshot 開發
3. **Simple** - Keep extractor and selector schema simple and clear
4. **Defensive** - Handle edge cases (empty lines, malformed content, missing markers)
5. **Extensible** - Easy to add new agent types and patterns
