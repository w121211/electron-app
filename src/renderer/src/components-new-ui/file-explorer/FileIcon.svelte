<!-- src/renderer/src/components-new-ui/file-explorer/FileIcon.svelte -->
<script lang="ts">
  import {
    ChatDots,
    ChevronDown,
    ChevronRight,
    FileEarmark,
  } from "svelte-bootstrap-icons";

  interface FileIconProps {
    fileName: string;
    isDirectory: boolean;
    isExpanded?: boolean;
    size?: number;
    className?: string;
  }

  let {
    fileName,
    isDirectory,
    isExpanded = false,
    size = 12,
    className = "",
  }: FileIconProps = $props();
</script>

{#if isDirectory}
  {#if isExpanded}
    <ChevronDown width={size} height={size} class="text-muted {className}" />
  {:else}
    <ChevronRight width={size} height={size} class="text-muted {className}" />
  {/if}
{:else if fileName.endsWith(".chat.json")}
  <ChatDots width={size} height={size} class="text-muted {className}" />
{:else}
  <FileEarmark width={size} height={size} class="text-muted {className}" />
{/if}
