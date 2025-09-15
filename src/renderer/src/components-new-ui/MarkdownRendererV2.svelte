<!-- src/renderer/src/components-new-ui/MarkdownRendererV2.svelte -->
<script lang="ts">
  import { PlayCircle } from "svelte-bootstrap-icons";
  import { marked, type Token, type Tokens } from "marked";
  import { atCommandExtension } from "../utils/marked-atcommand-extension.js";
  import { loadFileForPanel } from "../stores/file-panel-store.svelte";
  import { showToast } from "../stores/ui-store.svelte";
  import { listDirectory } from "../../../core/utils/file-utils.js";

  interface Props {
    content: string;
  }

  let { content }: Props = $props();

  // Extended token type that includes our custom atCommand token
  interface AtCommandToken {
    type: "atCommand";
    filePath: string;
    raw?: string;
    text?: string;
  }

  type ExtendedToken = Token | AtCommandToken;

  // Configure marked with atCommand extension
  // marked.use(atCommandExtension);

  const markdownTokens = $derived(() => {
    if (!content) return [];
    try {
      return marked.lexer(content);
    } catch (error) {
      console.error("Error parsing markdown:", error);
      return [];
    }
  });

  function handleAtCommandClick(atCommand: string): void {
    loadFileForPanel(atCommand);
  }

  function handleLaunchTodo(todoText: string): void {
    // For now, just show a toast - could be enhanced to create actual tasks
    showToast(`Todo: ${todoText}`, "info");
  }

  function getMockStatus(atCommand: string): string {
    // Mock statuses for demo - in real implementation, this would query backend services
    const mockStatuses = ["running", "scheduled", "completed", "failed"];
    const hash = atCommand.split("").reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);
    return mockStatuses[Math.abs(hash) % mockStatuses.length];
  }
</script>

{#snippet renderToken(token: ExtendedToken)}
  {#if token.type === "list"}
    {console.log(token)}
    <div>
      {#each token.items as item, i (i)}
        {@render renderListItem(item)}
      {/each}
    </div>
    <!-- {#if token.type === "list_item" && token.task}
    {@render renderListItem(token as Tokens.ListItem)} -->
  {:else if (token as AtCommandToken).type === "atCommand"}
    <button
      onclick={() => handleAtCommandClick((token as AtCommandToken).filePath)}
      class="text-foreground/70 hover:cursor-pointer hover:underline"
      title="Navigate to {(token as AtCommandToken).filePath}"
    >
      {(token as AtCommandToken).filePath} | [{getMockStatus(
        (token as AtCommandToken).filePath,
      )}]
    </button>
  {:else if token.type === "space"}
    <!-- Render blank lines between blocks as a vertical line break -->
    <div class="h-4"></div>
  {:else}
    <!-- Fallback for blocks like hr, and other things -->
    <div style="white-space: pre;">{(token as Tokens.Generic).raw}</div>
  {/if}
{/snippet}

{#snippet renderListItem(item: Tokens.ListItem)}
  {#if item.task}
    <div class="flex items-center">
      <span style="white-space: pre;"
        >{item.raw.substring(0, item.raw.indexOf(item.text))}</span
      >
      {#if item.tokens}
        {#each item.tokens as token, i (i)}
          {@render renderToken(token)}
        {/each}
      {/if}
      <button
        onclick={() => handleLaunchTodo(item.text)}
        class="text-muted hover:text-accent ml-2"
        title="Launch Todo"
      >
        <PlayCircle />
      </button>
    </div>
  {:else}
    <!-- Regular list items are rendered as raw text -->
    <!-- <div style="white-space: pre;">{item.raw}</div> -->
    {@render renderToken(item)}
  {/if}
{/snippet}

<div class="markdown-content font-sans text-[13px] leading-7">
  {#if markdownTokens().length > 0}
    {#each markdownTokens() as token, i (i)}
      {@render renderToken(token)}
    {/each}
  {:else}
    <div style="white-space: pre-wrap;">{content}</div>
  {/if}
</div>
