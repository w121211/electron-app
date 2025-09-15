<!-- src/renderer/src/components-new-ui/MarkdownRenderer.svelte -->
<script lang="ts">
  import { PlayCircle } from "svelte-bootstrap-icons";
  import {
    parseMarkdownTodos,
    type ParsedLine,
  } from "../utils/markdown-todo-parser.js";

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
        <span style="white-space: pre;">{line.raw}</span>
        <button
          onclick={() => handleLaunchTodo(line.content)}
          class="text-muted hover:text-accent ml-2"
          title="Launch Todo"
        >
          <PlayCircle />
        </button>
      </div>
    {:else if line.raw.trim() === ""}
      <div class="h-4"></div>
    {:else}
      <div style="white-space: pre;">{line.raw}</div>
    {/if}
  {/each}
</div>
