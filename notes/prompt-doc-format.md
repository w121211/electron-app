# Prompt Document Format (`*.prompt.md`)

The Prompt Document format stores chat prompts in Markdown so humans can edit the active prompt while the system tracks conversational history through comment markers. Model responses and tool activity are externalized (linked by ID) so the file remains focused on user-editable content.

## File Layout

```
---
# YAML front matter (metadata)
---

# Conversation Title

### Context        (optional)
```pasted-content
...background material...
```

### Conversation   (required)
<!-- USER -->
Past user prompt
<!-- MODEL: response-db-id -->
<!-- TOOL_CALL: call-db-id -->
<!-- TOOL_RESULT: result-db-id -->
...repeat as needed...

Latest prompt (no marker)
```

Key sections:

- **YAML Front Matter** – delimited by `---` lines, always first. Holds canonical metadata used by services.
- **Conversation Title** – first-level heading keeping the doc readable and synchronised with metadata `title`.
- **Context** – optional fenced block labelled `pasted-content` for large snippets of reference material.
- **Conversation** – ordered history of prior turns plus the editable prompt at the very end.

## Metadata Reference

| Field        | Type              | Description |
|--------------|-------------------|-------------|
| `id`         | string            | Stable identifier for the prompt session (mirrors DB identifier). |
| `title`      | string            | Human-facing title. Synchronized with the H1 heading. |
| `created_at` | ISO 8601 string   | Creation timestamp. |
| `updated_at` | ISO 8601 string   | Last modification timestamp; updated on every write. |
| `model_id`   | string            | Current default model (e.g. `openai/gpt-4o-mini`). |
| `tags`       | array of strings  | Free-form labels for search/filtering. Strings with spaces are quoted automatically. |

## Conversation Markers

Markers are HTML comments so they never render in Markdown but are trivial to parse.

- `<!-- USER -->` marks a completed user turn. All Markdown until the next marker belongs to that prompt.
- `<!-- MODEL: <db-id> -->` points to the model response stored in the database.
- `<!-- TOOL_CALL: <db-id> -->` identifiers for tool invocations triggered by the model.
- `<!-- TOOL_RESULT: <db-id> -->` identifiers for tool outputs captured in the database.

The **latest prompt** is simply the trailing Markdown block after the last marker. It remains untagged so the user can edit freely. When the prompt is submitted programmatically, the service converts it into a `<!-- USER -->` block and appends the corresponding model/tool references.

## Editing Guidelines

- **Write at the end.** Keep historical sections intact; only update the latest prompt block unless you intend to edit prior turns deliberately.
- **Context updates.** Add or refine background material inside the `pasted-content` code fence to preserve formatting.
- **Metadata changes.** Editing the YAML front matter (title, tags, etc.) is supported; services will keep timestamps in sync when saving.
- **Links to results.** Do not hand-edit model/tool IDs unless correcting known mistakes—the IDs must match database records.

## Programmatic Integration

Backend modules responsible for this format:

- Parser (`src/core/services/prompt-doc/prompt-doc-parser.ts`) – validates YAML metadata, parses conversation blocks, and serializes Markdown.
- `PromptDocRepository` (`src/core/services/prompt-doc/prompt-doc-repository.ts`) – handles file system reads/writes and delegates to the parser for structure.
- `PromptDocService` (`src/core/services/prompt-doc/prompt-doc-service.ts`) – ensures documents live inside registered project folders, commits prompts, and appends model/tool references.
- `promptDoc` tRPC router (`src/core/server/routers/prompt-doc-router.ts`) – exposes creation, load, update, and commit operations to the renderer.

These utilities guarantee that metadata stays synchronized, markers remain well-formed, and user prompts are always easy to edit.
