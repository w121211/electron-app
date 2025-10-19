# Prompt Script Design v2

## 1. Overview

A **Prompt Script** is a portable, human-readable text file designed to define and execute a sequence of user prompts. Its primary purpose is to provide a shareable, version-controllable "recipe" for a conversation with an AI or another process.

The file acts as a template or script for the user's side of a dialogue. It is executed by the application to generate a full conversation, which is then stored separately in the database. The script file itself remains unchanged by the execution process.

## 2. Core Principles

- **Portability & Shareability:** This is the primary goal. A Prompt Script must be self-contained. Anyone with the file should be able to run it and reproduce the conversational flow without needing access to any prior data or external database.

- **Script, Not a Log:** The file defines the **input** (the user's prompts) and is not a log of the **output** (the full conversation). It is a clean, executable script, not a record of a past session.

- **Separation of Concerns:** The system maintains a clear distinction between the input script and the output session.
  - **Prompt Script (File):** The shareable `.prompt.md` file that defines what the user will say.
  - **Chat Session (Database):** The resulting full conversation log created by running the script, including all model responses and tool calls.

- **Simplicity & Human-Editability:** The format must be extremely simple and easy to read, write, and edit in any standard text editor. It prioritizes clarity and flexibility over a rigid structure.

## 3. Key Decisions (Q&A)

This section summarizes the key design decisions made during our discussion.

**Q: What is the main goal of the Prompt Script feature?**

> A: Portability and shareability. A script must be a self-contained "recipe" for a conversation that anyone can run on their own machine without needing access to the original creator's database or session history.

**Q: Is the file a log of a conversation or a template?**

> A: It is strictly a template or a "script," not a "log." It only contains the user's inputs. The full conversation log (the output) is generated and stored in the database _after_ running the script.

**Q: Why not include model responses or database IDs in the file?**

> A: We still keep model responses out of the script so it remains a reusable template, and we avoid hard-coding arbitrary database IDs. The only exception is an optional `chatSessionId` that the app writes into front matter after the first run to help the local user reconnect with their previous session; anyone can delete that field to regain a fully portable script.

**Q: What database technology was chosen and why?**

> A: We chose `Kysely` (a type-safe query builder) with `better-sqlite3` (an embedded SQLite driver). This stack provides the best balance of rapid MVP development, type safety, and robust, persistent storage, without the perceived overhead of a full ORM like Prisma.

**Q: Can a script be used for more than just AI chats?**

> A: Yes. By using an `engine: pty` property in the script's metadata, the prompts can be executed as commands in a terminal session. This makes Prompt Scripts a versatile automation tool for various tasks.

**Q: How do we reconnect a prompt script to an existing chat session?**

> A: We use a three-step lookup and sanity-check cycle each time the file opens:
>
> 1. Read the `chatSessionId` from front matter (if present) and try to load that session. When it exists we compare the stored `scriptHash` with the current content hash.
>    - If the hashes match, we simply relink and, if the path changed, we update `scriptPath` to the new location.
>    - If the hashes differ, the script has been edited since the session was recorded. We keep the old session for history but remove the embedded `chatSessionId` so the next run produces a fresh session for the new content.
> 2. If the ID lookup fails (missing or stale), we fall back to the current hash. A unique hash match reattaches the session and rewrites the front-matter `chatSessionId`; if several sessions share the hash we pick the most recent one and flag the ambiguity in the UI.
> 3. As a final fallback we try the stored `scriptPath`. When the path matches but the hash does not, we treat it like an edited script: keep prior sessions for history, clear the stale ID, and prepare to create a new session on the next run.
>    We also persist the original script text inside the session record. When hashes diverge but we still find a candidate by ID or path, the UI can surface a diff between the stored snapshot and the current file so the user decides whether to keep the old session, clone it, or start fresh. That makes it easy to recover from external edits or accidental hash drift while keeping the app's data model consistent.
>    If none of the lookups succeed we treat the script as new. This sequence lets local users keep the original linkage while still allowing the file to stay portable—anyone can remove the `chatSessionId` line or copy the script to a new machine and the app will naturally create a fresh session.

**Q: What happens when a prompt script runs with `engine: pty`?**

> A: The runner streams each user prompt into the external CLI session, but only persists the user inputs in our own database. We capture occasional snapshots of the external conversation for later viewing, so the authoritative assistant responses live in the CLI transcript rather than in our chat database. The docs call this out so users understand the limitation.

## 4. File Format (`*.prompt.md`)

### File Extension

The recommended file extension is `.prompt.md` to be descriptive and allow for Markdown rendering.

### Basic Structure

A Prompt Script consists of one or more user prompts. For files containing multiple prompts, a special HTML comment is used as a delimiter.

```
---
# Optional YAML front matter for metadata
---

This is the first user prompt.
<!-- user -->

This is the second user prompt.
```

### Metadata (Front Matter)

- The file can optionally begin with a YAML front matter block.
- This metadata is for descriptive purposes and is **not required** for the script to be valid or executable.
- **`engine`**: (Optional) Specifies which backend executes the script. Can be `api` (for AI provider api) or `pty` (for terminal). Defaults to `pty`.
- **`model`**: (Optional) Specifies which AI model to use (e.g., `openai/gpt-4o-mini`, `cli/codex`).
- **`chatSessionId`**: (Optional) Automatically inserted after the first run so the script can relink to its originating session on the same machine. Delete it if you want a clean, portable script.

- **Example:**
  ```yaml
  ---
  title: "Generate a Python script"
  description: "Use GPT-4o mini to create a script that fetches data from an API."
  engine: api
  model: openai/gpt-4o-mini
  tags: [python, api, codegen]
  ---
  ```

The runner appends `chatSessionId` to the front matter after the first successful run. If you plan to share the script, remove that line so it remains portable.

### Prompt Delimiter

- **`<!-- user -->`**: This HTML comment is the standard delimiter used to separate distinct user prompts within a single file.

### Enhanced Delimiters (for Future Use)

To support more advanced features in the future (like diffing a script against a completed session), the delimiter can be enriched with data.

- **Example:** `<!-- user key="abc123" session="cli-1" -->`

- **Recommended attributes:**
  - `key`: stable script-scoped identifier (`<!-- user key="intro" -->`).
  - `session`: PTY-only override that routes a prompt to a specific external shell (`<!-- user session="cli-2" -->`).

For the current "Run Script" workflow, this extra information is **ignored**. The parser only needs to identify the `<!-- user -->` marker itself. This ensures backward compatibility and keeps the core execution simple.

## 5. Database Design

The result of running a Prompt Script is a **Chat Session**, which is stored in a local SQLite database using `Kysely` and `better-sqlite3`.

### `ChatSessions` Table

| Field              | Type   | Description                                                                                                   |
| :----------------- | :----- | :------------------------------------------------------------------------------------------------------------ |
| `id`               | string | **Primary Key.** A unique UUID for the session.                                                               |
| `sessionType`      | string | Enum string such as `chat_engine`, `chat_draft`, `external_chat`, or `pty_chat`.                              |
| `sessionStatus`    | string | Current status (`idle`, `processing`, etc.).                                                                  |
| `metadata`         | JSON   | Flexible metadata block (title, tags, modelId, tool configuration, external session info, etc.).              |
| `scriptPath`       | string | Absolute path to the prompt script at the moment it was run; used for quick lookup when the file is reopened. |
| `scriptModifiedAt` | string | Last known modified timestamp (ISO 8601) recorded when the script ran; helps detect file moves or edits.      |
| `scriptHash`       | string | Content hash of the script captured at run time; fallback key when the path changes.                          |
| `scriptSnapshot`   | TEXT   | Raw script content stored at execution time so we can show a diff when the file changes later.                |
| `createdAt`        | string | ISO 8601 timestamp when the session was created.                                                              |
| `updatedAt`        | string | ISO 8601 timestamp for the last modification.                                                                 |

### `Messages` Table

| Field           | Type   | Description                                                                                |
| :-------------- | :----- | :----------------------------------------------------------------------------------------- |
| `id`            | string | **Primary Key.** A unique UUID for the message.                                            |
| `chatSessionId` | string | **Foreign Key.** Links back to `ChatSessions.id`.                                          |
| `order`         | number | Turn index so we can stream messages in arrival order.                                     |
| `payload`       | JSON   | Full `ModelMessage` object (role, content, tool calls, etc.) emitted by the chat engine.   |
| `metadata`      | JSON   | Flexible metadata block (timestamps, file references, task IDs, external session markers). |

## 6. End-to-End Workflow

The updated workflow covers how prompt scripts are created, linked to chat sessions, executed, and reconciled across renderer and backend services.

1. **Script Entry Points**
   - _Create script_: The renderer calls `fileService.createPromptScript()` to scaffold an empty `.prompt.md`, optionally seeds front matter.
   - _Open script_: Selecting an existing script loads its contents, runs the shared parser in the renderer, and invokes `promptScriptService.attach({ path, content, modifiedAt })` to negotiate linkage with a chat session.

2. **Session Attachment & Reconciliation**
   - The backend runs the three-tier reconciliation (front-matter ID → content hash → stored path), returning the resolved `chatSessionId`, prior snapshot metadata, and any drift warnings.
   - The renderer subscribes to the chat session events, compares parsed prompts with persisted messages, and surfaces available actions (send, replay suffix, replay all) based on the drift state.

3. **User Action Selection**
   - _Send prompt_: The user adds a new prompt after the final delimiter; the renderer issues either `apiChatClient.sendPrompt({ chatSessionId, prompt, source: "script" })` or `ptyChatClient.sendPrompt({ chatSessionId, prompt, source: "script" })` based on the engine type to append and stream the response.
   - _Replay from edit point_: When history diverges mid-script, the renderer identifies the first mismatched prompt, packages the trailing prompts, and calls the appropriate client's `replayFrom({ chatSessionId, startIndex, prompts, engineOverride? })` method.
   - _Replay entire script_: Changing models or engines prompts the renderer to call the appropriate client's `replayAll({ chatSessionId, prompts, engine, model })` method, archiving the previous run and executing the full sequence anew.

4. **Execution & Persistence**
   - Chat engine and PTY clients own execution loops, stream events, and persist updates to `ChatSessions` and `Messages` while the renderer reflects real-time progress.
   - After a successful run they notify `promptScriptService` to:
     1. Update prompt script content like front matter's `chatSessionId` and user delimiter.
     2. Refresh the stored content hash
     3. Sync `scriptModifiedAt` and `scriptSnapshot`
   - PTY runs only persist user prompts locally; assistant output remains in the external terminal transcript.

## 7. Examples

### Example 1: Simplest Form (Plain Text)

```
// File: simple-query.prompt.md
What are the top 3 benefits of ...
```

### Example 2: Multi-Prompt Script (pty chat session)

Users can launch or swap CLI-backed models with control prompts.

```
// File: server-start.prompt.md
---
engine: pty
---
!codex
<!-- user -->

Write a python script that ...
<!-- user -->

/new
<!-- user -->

Fix type error in ...
<!-- user -->

!gemini
```

- `!codex` starts selected CLI model (e.g., Claude Code).
- `/new` requests a fresh CLI session; the external model owns the new session’s state.
- `!gemini` switches to a different CLI model (e.g., Gemini).

### Example 3: Script with AI Model Specified

```
// File: python-script.prompt.md
---
title: "Generate a Python script"
model: openai/gpt-4o-mini
---
Write a python script that ...
<!-- user id="msg_abc" -->

Now, add error handling ...
<!-- user -->

Finally, refactor the code ...
```
