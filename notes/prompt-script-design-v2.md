# Prompt Script Design v3

## 1. Overview

A **Prompt Script** is a portable, human-readable text file designed to define and execute a sequence of user prompts. Its primary purpose is to provide a shareable, version-controllable "recipe" for a conversation with an AI or another process.

The file acts as a template or script for the user's side of a dialogue. It can accept dynamic inputs to make it reusable. It is executed by the application to generate a full conversation, which is then stored separately in the database. The script file itself remains unchanged by the execution process.

## 2. Core Principles

- **Portability & Shareability:** This is the primary goal. A Prompt Script must be self-contained. Anyone with the file should be able to run it and reproduce the conversational flow.

- **Script, Not a Log:** The file defines the **input** (the user's prompts) and is not a log of the **output** (the full conversation). It is a clean, executable script, not a record of a past session.

- **Separation of Concerns:** The system maintains a clear distinction between the input script and the output session.
  - **Prompt Script (File):** The shareable `.prompt.md` file that defines what the user will say.
  - **Chat Session (Database):** The resulting full conversation log created by running the script.

- **Simplicity & Human-Editability:** The format must be extremely simple and easy to read, write, and edit in any standard text editor. It prioritizes clarity and flexibility over a rigid structure.

## 3. Key Decisions (Q&A)

This section summarizes the key design decisions.

**Q: What is the main goal of the Prompt Script feature?**

> A: Portability and shareability. A script must be a self-contained "recipe" for a conversation that anyone can run on their own machine without needing access to the original creator's database or session history.

**Q: How can scripts accept dynamic inputs?**

> A: Scripts can accept dynamic inputs using shell-style positional parameters. This allows a single script to be reused in multiple contexts. For example, a script can use `$1`, `$2`, etc., to refer to arguments passed during execution. This keeps the script files clean and readable without requiring complex declarations.

**Q: Is the file a log of a conversation or a template?**

> A: It is strictly a template or a "script," not a "log." It only contains the user's inputs. The full conversation log (the output) is generated and stored in the database _after_ running the script.

**Q: Why not include model responses or database IDs in the file?**

> A: We still keep model responses out of the script so it remains a reusable template, and we avoid hard-coding arbitrary database IDs. The only exception is an optional `chatSessionId` that the app writes into front matter after the first run to help the local user reconnect with their previous session; anyone can delete that field to regain a fully portable script.

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
>    We also persist the original script text inside the session record. When hashes diverge but we still find a candidate by ID or path, the UI can surface a diff between the stored snapshot and the current file so the user decides whether to keep the old session, clone it, or start fresh.
>    If none of the lookups succeed we treat the script as new.

## 4. File Format (`*.prompt.md`)

### File Extension

The recommended file extension is `.prompt.md` to be descriptive and allow for Markdown rendering.

### Basic Structure

A Prompt Script consists of one or more user prompts. For files containing multiple prompts, a special HTML comment is used as a delimiter.

```
---
# Optional YAML front matter for metadata
---

This is the first user prompt, which can include arguments like $1.
<!-- user -->

This is the second user prompt.
```

### Metadata (Front Matter)

- The file can optionally begin with a YAML front matter block for descriptive purposes.
- **`engine`**: (Optional) Specifies which backend executes the script. Can be `api` (for AI provider api) or `pty` (for terminal). Defaults to `pty`.
- **`model`**: (Optional) Specifies which AI model to use (e.g., `openai/gpt-4o-mini`, `cli/codex`).
- **`chatSessionId`**: (Optional) Automatically inserted after the first run so the script can relink to its originating session on the same machine.

### Prompt Delimiter

- **`<!-- user -->`**: This HTML comment is the standard delimiter used to separate distinct user prompts within a single file.

### Arguments (Inputs)

Prompt Scripts can be parameterized using shell-style arguments, allowing them to function as reusable templates. When a script is executed with arguments, the runner will substitute the placeholders in the text before sending it to the AI.

**Syntax:**

-   `$1`, `$2`, `$3`, ...: Access individual arguments by their position.
-   `$ARGUMENTS`: Access all arguments as a single, space-separated string.
-   `${1:-defaultValue}`: A more robust syntax that provides a default value if an argument is not supplied.

**Example:**

A script named `review-pr.prompt.md` might look like this:

```markdown
Review PR #${1} with priority ${2:-normal}.

The user provided the following context: $ARGUMENTS
```

**Execution:**

If run with the command `/review-pr 456 high`, the resulting prompt would be:

> Review PR #456 with priority high.
>
> The user provided the following context: 456 high

### Outputs (Pending Design)

The ability for a script to return a structured output value is a planned feature. The design is currently pending to ensure the simplest possible solution is chosen, in alignment with the core principle of simplicity.

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

The workflow covers how prompt scripts are created, linked, executed, and reconciled.

1. **Script Entry Points**
   - _Create script_: The renderer calls `fileService.createPromptScript()` to scaffold an empty `.prompt.md`.
   - _Open script_: Selecting an existing script loads its contents and invokes `promptScriptService.attach({ path, content, modifiedAt })` to negotiate linkage with a chat session.

2. **Session Attachment & Reconciliation**
   - The backend runs the three-tier reconciliation (front-matter ID → content hash → stored path), returning the resolved `chatSessionId`.

3. **User Action Selection**
   - _Send prompt_: The user adds a new prompt; the renderer issues a command to the appropriate client (`apiChatClient` or `ptyChatClient`) to append the prompt and stream the response. If the script uses arguments (`$1`, etc.), the UI will provide a way to input these.

4. **Execution & Persistence**
   - The chat engine and PTY clients own the execution loops, stream events, and persist updates to the database.
   - After a successful run, `promptScriptService` is notified to update the script's `chatSessionId` in the front matter, refresh the content hash, and sync timestamps.
