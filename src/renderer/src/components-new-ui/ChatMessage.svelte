<!-- src/renderer/src/components/ChatMessage.svelte -->
<script lang="ts">
  import type {
    ModelMessage,
    AssistantContent,
    UserContent,
    ToolContent,
  } from "ai";
  import {
    Copy,
    Pencil,
    ThreeDots,
    FileEarmark,
    Download,
  } from "svelte-bootstrap-icons";
  import { showToast } from "../stores/ui-store.svelte.js";
  import { extractFileReferences } from "../stores/chat-store.svelte.js";
  import ToolResultDisplay from "./ToolResultDisplay.svelte";
  import type { ChatMessage } from "../../../core/services/chat-engine/chat-session-repository.js";

  interface Props {
    chatMessage: ChatMessage;
  }

  let { chatMessage }: Props = $props();

  const message = chatMessage.message;
  const metadata = chatMessage.metadata;

  // Message type discrimination
  const isSystem = message.role === "system";
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isTool = message.role === "tool";

  function formatTimestamp(timestamp: Date): string {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function handleCopyMessage(message: ModelMessage): void {
    const textContent = getTextContent(message);
    navigator.clipboard.writeText(textContent);
    showToast("Message copied to clipboard", "success");
  }

  function handleEditMessage(): void {
    showToast("Edit functionality not implemented yet", "info");
  }

  function handleMoreAction(action: string): void {
    showToast(`${action} functionality coming soon`, "info");
  }

  function handleFileReference(filePath: string): void {
    showToast(`Open ${filePath} functionality coming soon`, "info");
  }

  // Helper to get text content from message
  function getTextContent(message: ModelMessage): string {
    if (typeof message.content === "string") {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      return message.content
        .filter((part) => part.type === "text")
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("");
    }

    return "";
  }

  // Helper to get content parts for rendering
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  function getContentParts(
    content: AssistantContent | UserContent | ToolContent,
  ) {
    if (typeof content === "string") {
      return [{ type: "text" as const, text: content }];
    }
    return Array.isArray(content) ? content : [];
  }
</script>

{#if isSystem}
  <!-- System Message -->
  <div class="my-2 flex justify-center">
    <div
      class="bg-muted/20 text-muted-foreground rounded-full px-3 py-1 text-xs"
    >
      System: {typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content)}
    </div>
  </div>
{:else if isUser}
  <!-- User Message -->
  <div class="group flex w-full flex-col items-end">
    <div class="bg-[#2c2c2e] text-foreground rounded-2xl py-2.5 px-4 max-w-[80%]">
      <!-- Content Parts -->
      {#each getContentParts(message.content) as part, index (index)}
        {#if part.type === "text"}
          {@const fileReferences = extractFileReferences(part.text)}

          <!-- File References -->
          {#if fileReferences.length > 0}
            {#each fileReferences as ref (ref.path)}
              <button
                onclick={() => handleFileReference(ref.path)}
                class="text-accent hover:text-accent/80 ml-1 cursor-pointer"
              >
                {ref.syntax}{ref.path}
              </button>
            {/each}
          {/if}

          <span class="whitespace-pre-wrap">{part.text}</span>
        {:else if part.type === "image"}
          <img
            src={typeof part.image === "string"
              ? part.image
              : part.image instanceof URL
                ? part.image.toString()
                : ""}
            alt=""
            class="max-w-full rounded"
          />
        {:else if part.type === "file"}
          <div class="my-1 rounded border p-2">
            <FileEarmark class="mr-1 inline text-sm" />
            File: {part.filename || "Uploaded file"}
          </div>
        {:else}
          <div class="text-muted text-xs">
            {part.type}: {JSON.stringify(part)}
          </div>
        {/if}
      {/each}
    </div>

    <!-- Message Actions -->
    <div
      class="mt-1 mr-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
    >
      <button
        onclick={() => handleEditMessage()}
        class="text-muted hover:text-accent cursor-pointer"
        title="Edit"
      >
        <Pencil />
      </button>
    </div>
  </div>
{:else if isAssistant}
  <!-- Assistant Message -->
  {@const contentParts = getContentParts(message.content)}
  {@const hasArtifacts = contentParts.some(
    (part) =>
      part.type === "text" &&
      (part.text.includes("artifact") || part.text.includes("wireframe")),
  )}

  <div class="group flex flex-col items-start">
    <div class="mb-1 flex items-center gap-2">
      <span class="text-muted text-sm font-medium">Claude Sonnet 4</span>
    </div>

    <div class="text-foreground leading-normal">
      <!-- Content Parts -->
      {#each contentParts as part, index (index)}
        {#if part.type === "text"}
          <div class="whitespace-pre-wrap">{part.text}</div>
        {:else if part.type === "file"}
          <div class="my-1 rounded border p-2">
            <FileEarmark class="mr-1 inline text-sm" />
            File: {part.filename || "Generated file"}
          </div>
        {:else if part.type === "reasoning"}
          <div
            class="bg-muted/10 border-muted text-muted-foreground my-2 border-l-2 py-1 pl-3 text-sm"
          >
            <strong>Reasoning:</strong>
            {part.text}
          </div>
        {:else if part.type === "tool-call"}
          <div class="my-1 rounded border border-blue-200 bg-blue-50 p-2">
            <div class="text-sm font-medium text-blue-800">
              🔧 Calling {part.toolName}
            </div>
            <div class="mt-1 text-xs text-blue-600">
              {JSON.stringify(part.input, null, 2)}
            </div>
          </div>
        {:else if part.type === "tool-result"}
          <div class="my-1 rounded border border-green-200 bg-green-50 p-2">
            <div class="text-sm font-medium text-green-800">✅ Tool Result</div>
            <ToolResultDisplay output={part.output} />
          </div>
        {:else}
          <div class="text-muted text-xs">
            Unknown part type: {part.type}
            <pre class="mt-1">{JSON.stringify(part, null, 2)}</pre>
          </div>
        {/if}
      {/each}

      <!-- Artifacts -->
      {#if hasArtifacts}
        <div class="mt-2">
          <button
            onclick={() => handleMoreAction("Preview artifact")}
            class="border-border bg-panel hover:bg-hover text-foreground flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-px text-sm"
          >
            wireframe.html
            <span class="text-muted text-xs">v3</span>
            <Download class="text-muted hover:text-accent ml-1 cursor-pointer" />
          </button>
        </div>
      {/if}
    </div>

    <!-- Message Actions -->
    <div
      class="mt-2 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
    >
      <button
        onclick={() => handleCopyMessage(message)}
        class="text-muted hover:text-accent cursor-pointer"
        title="Copy"
      >
        <Copy />
      </button>
      <button
        onclick={() => handleMoreAction("More options")}
        class="text-muted hover:text-accent cursor-pointer"
        title="More"
      >
        <ThreeDots />
      </button>
    </div>
  </div>
{:else if isTool}
  <!-- Tool Message -->
  <div class="my-2 flex justify-center">
    <div class="max-w-lg rounded-lg border border-yellow-200 bg-yellow-50 p-3">
      <div class="mb-1 text-sm font-medium text-yellow-800">
        🔧 Tool Results
      </div>
      {#each Array.isArray(message.content) ? message.content : [] as part, index (index)}
        {#if part.type === "tool-result"}
          <div class="text-xs text-yellow-700">
            <strong>Tool:</strong>
            {part.toolName}<br />
            <strong>Call ID:</strong>
            {part.toolCallId}<br />
            <strong>Result:</strong>
            <ToolResultDisplay output={part.output} />
          </div>
        {:else}
          <div class="text-xs text-yellow-700">
            {JSON.stringify(part, null, 2)}
          </div>
        {/if}
      {/each}
    </div>
  </div>
{:else}
  <!-- Unknown message type -->
  <div class="my-2 flex justify-center">
    <div
      class="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-600"
    >
      Unknown message type: {(message as any).role}
      <pre class="mt-1">{JSON.stringify(message, null, 2)}</pre>
    </div>
  </div>
{/if}
