<!-- src/renderer/src/components/MarkdownTodoRenderer.svelte -->
<script lang="ts">
  import { PlayCircle } from "svelte-bootstrap-icons";
  import { parseAtCommands } from "../utils/at-command-parser.js";
  import { parseMarkdownTodos } from "../utils/markdown-todo-parser.js";
  import type { ParsedLine } from "../utils/markdown-todo-parser.js";
  import { showToast } from "../stores/ui-store.svelte.js";
  import { userSettingsState } from "../stores/user-settings-store.svelte.js";

  interface Props {
    content: string;
    projectPath: string;
  }

  let { content, projectPath }: Props = $props();

  const parsedLines = $derived.by((): ParsedLine[] => {
    if (!content) {
      return [];
    }
    return parseMarkdownTodos(content);
  });

  async function handleLaunchTodo(todoContent: string): Promise<void> {
    const settings = userSettingsState.settings;

    if (!projectPath) {
      showToast("Could not determine the project path.", "error");
      console.error("Project path is not available.");
      return;
    }

    if (!settings || !settings.agent) {
      showToast("Agent settings are not configured.", "error");
      console.error("Agent settings not found in user settings.");
      return;
    }

    showToast(
      "Markdown TODO launch will return soon. Create a prompt script manually for now.",
      "info",
    );
  }
</script>

<div class="markdown-renderer text-[13px] leading-7">
  {#each parsedLines as line, i (i)}
    {#if "indentation" in line}
      <div class="group flex items-center">
        <div style="white-space: pre;">
          {" ".repeat(line.indentation)}- [{line.checked ? "x" : " "}]
          {#each parseAtCommands(line.content) as token, i (i)}
            {#if token.type === "text"}
              <span>{token.raw}</span>
            {:else if token.type === "at-command"}
              <button
                class="text-muted hover:text-accent cursor-pointer"
                title="File: {token.filePath}">{token.raw} [running]</button
              >
            {/if}
          {/each}
        </div>
        <button
          onclick={() => handleLaunchTodo(line.content)}
          class=" text-muted hover:text-accent ml-2 cursor-pointer"
          title="Launch Todo"
        >
          <PlayCircle width={13} height={13} />
        </button>
      </div>
    {:else if line.raw.trim() === ""}
      <div class="h-4"></div>
    {:else}
      <div style="white-space: pre;">{line.raw}</div>
    {/if}
  {/each}
</div>
