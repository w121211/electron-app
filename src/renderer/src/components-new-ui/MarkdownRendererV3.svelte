<!-- src/renderer/src/components-new-ui/MarkdownRendererV3.svelte -->
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
    <ul>
      {#each token.items as item, i (i)}
        {@render renderListItem(item)}
      {/each}
    </ul>
  {:else if token.type === "paragraph"}
    {#each (token as Tokens.Paragraph).tokens as t}
      {(t as Tokens.Text).text}
    {/each}
  {:else if token.type === "text"}
    {(token as Tokens.Text).text}
  {:else if (token as AtCommandToken).type === "atCommand"}
    <div>
      <button
        onclick={() => handleAtCommandClick((token as AtCommandToken).filePath)}
        class="text-foreground/70 hover:cursor-pointer hover:underline"
        title="Navigate to {(token as AtCommandToken).filePath}"
      >
        {(token as AtCommandToken).filePath} | [{getMockStatus(
          (token as AtCommandToken).filePath,
        )}]
      </button>
    </div>
  {:else if token.type === "space"}
    <!-- Render blank lines between blocks as a vertical line break -->
    <div class="h-4"></div>
  {:else}
    <!-- Fallback for blocks like hr, and other things -->
    <div style="white-space: pre;">{(token as Tokens.Generic).raw}</div>
  {/if}
{/snippet}

{#snippet renderListItem(item: Tokens.ListItem)}
  <li>
    <div class="flex items-center">
      {#if item.task}
        <span style="white-space: pre;"
          >{item.raw.substring(0, item.raw.indexOf(item.text))}</span
        >
      {/if}

      {#if item.tokens && item.tokens.length > 0 && (item.tokens[0].type === "text" || item.tokens[0].type === "paragraph")}
        {@render renderToken(item.tokens[0])}
      {/if}

      <button
        onclick={() => handleLaunchTodo(item.text)}
        class="text-muted hover:text-accent ml-2"
        title="Launch Todo"
      >
        {#if item.task}
          <PlayCircle />
        {:else}
          Mock Button
        {/if}
      </button>
    </div>

    {#if item.tokens && item.tokens.length > 1}
      {#each item.tokens.slice(1) as token, i (i)}
        {@render renderToken(token)}
      {/each}
    {/if}
  </li>
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
