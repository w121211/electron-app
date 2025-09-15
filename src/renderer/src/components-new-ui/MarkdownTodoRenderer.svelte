<!-- src/renderer/src/components-new-ui/MarkdownTodoRenderer.svelte -->
<script lang="ts">
  import { PlayCircle } from "svelte-bootstrap-icons";
  import { parseAtCommands } from "../utils/at-command-parser.js";
  import { parseMarkdownTodos } from "../utils/markdown-todo-parser.js";
  import type { ParsedLine } from "../utils/markdown-todo-parser.js";

  interface Props {
    content: string;
  }

  let { content }: Props = $props();

  const parsedLines = $derived.by((): ParsedLine[] => {
    if (!content) {
      return [];
    }
    return parseMarkdownTodos(content);
  });

  function handleLaunchTodo(todoContent: string): void {
    console.log("Launch todo:", todoContent);
    // This could be enhanced to create actual tasks.
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
