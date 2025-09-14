<!-- src/renderer/src/components-new-ui/MarkdownRenderer.svelte -->
<script lang="ts">
  import { PlayCircle } from "svelte-bootstrap-icons";
  import { marked, type Token, type Tokens } from "marked";
  import { atCommandExtension } from "../utils/marked-atcommand-extension.js";
  import { loadFileForPanel } from "../stores/file-panel-store.svelte";
  import { showToast } from "../stores/ui-store.svelte";

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
  marked.use(atCommandExtension);

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
  {#if token.type === "heading"}
    {#if token.depth === 1}
      <h1 class="mt-6 mb-4 text-xl font-bold first:mt-0">{token.text}</h1>
    {:else if token.depth === 2}
      <h2 class="mt-5 mb-3 text-lg font-semibold">{token.text}</h2>
    {:else if token.depth === 3}
      <h3 class="mt-4 mb-2 text-base font-medium">{token.text}</h3>
    {:else}
      <h4 class="mt-3 mb-2 text-sm font-medium">{token.text}</h4>
    {/if}
  {:else if token.type === "paragraph"}
    <div class="mb-4">
      {#if token.tokens}
        {#each token.tokens as subToken, i (i)}
          {@render renderInlineToken(subToken)}
        {/each}
      {:else}
        {token.text}
      {/if}
    </div>
  {:else if token.type === "list"}
    <div class="mb-4">
      {#each token.items as item, i (i)}
        {@render renderListItem(item)}
      {/each}
    </div>
  {:else if token.type === "space"}
    <div class="h-4"></div>
  {:else if token.type === "code"}
    <pre
      class="bg-surface border-border mb-4 overflow-x-auto rounded border p-3"><code
        >{token.text}</code
      ></pre>
  {:else if token.type === "blockquote"}
    <blockquote class="border-accent text-muted mb-4 border-l-4 pl-4 italic">
      {#if token.tokens}
        {#each token.tokens as subToken, i (i)}
          {@render renderToken(subToken)}
        {/each}
      {/if}
    </blockquote>
  {:else}
    <div class="mb-2">
      {(token as Tokens.Generic).raw || (token as Tokens.Text).text || ""}
    </div>
  {/if}
{/snippet}

{#snippet renderListItem(item: Tokens.ListItem)}
  {#if item.task}
    <!-- Todo item with special handling -->
    <div class="group mb-1 flex items-center">
      <span class="flex-1">
        <span class="text-muted mr-2">{item.checked ? "✓" : "☐"}</span>
        {#if item.tokens}
          {#each item.tokens as token, i (i)}
            {@render renderInlineToken(token)}
          {/each}
        {:else}
          {item.text}
        {/if}
      </span>
      <button
        onclick={() => handleLaunchTodo(item.text)}
        class="text-muted hover:text-accent ml-2 opacity-0 transition-opacity group-hover:opacity-100"
        title="Launch Todo"
      >
        <PlayCircle />
      </button>
    </div>
  {:else}
    <!-- Regular list item -->
    <div class="mb-1">
      <span class="text-muted mr-2">•</span>
      {#if item.tokens}
        {#each item.tokens as token, i (i)}
          {@render renderInlineToken(token)}
        {/each}
      {:else}
        {item.text}
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet renderInlineToken(token: ExtendedToken)}
  {#if token.type === "text"}
    <span>{token.text}</span>
  {:else if token.type === "atCommand"}
    <button
      onclick={() => handleAtCommandClick(token.filePath)}
      class="text-foreground/70 mx-1 hover:cursor-pointer hover:underline"
      title="Navigate to {token.filePath}"
    >
      {token.filePath}
      <span class="text-muted">
        | [{getMockStatus(token.filePath)}]
      </span>
    </button>
  {:else if token.type === "strong"}
    <strong>{token.text}</strong>
  {:else if token.type === "em"}
    <em>{token.text}</em>
  {:else if token.type === "code"}
    <code class="bg-surface rounded px-1 py-0.5 font-mono text-sm"
      >{token.text}</code
    >
  {:else if token.type === "link"}
    <a
      href={token.href}
      class="text-accent hover:underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {token.text}
    </a>
  {:else if (token as Tokens.Generic).tokens && Array.isArray((token as Tokens.Generic).tokens)}
    {#each (token as Tokens.Generic).tokens || [] as subToken, i (i)}
      {@render renderInlineToken(subToken as ExtendedToken)}
    {/each}
  {:else}
    <span
      >{(token as Tokens.Generic).raw ||
        (token as Tokens.Text).text ||
        ""}</span
    >
  {/if}
{/snippet}

<div class="markdown-content">
  {#if markdownTokens().length > 0}
    {#each markdownTokens() as token, i (i)}
      {@render renderToken(token)}
    {/each}
  {:else}
    <pre style="white-space: pre-wrap; font-family: inherit;">{content}</pre>
  {/if}
</div>
