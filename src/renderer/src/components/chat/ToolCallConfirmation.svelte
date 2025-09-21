<!-- src/renderer/src/components/ToolCallConfirmation.svelte -->
<script lang="ts">
  import { Logger } from "tslog";
  import type { ModelMessage } from "ai";
  import { chatService } from "../../services/chat-service.js";

  interface Props {
    chatId: string;
    absoluteFilePath: string;
    lastAssistantMessage?: ModelMessage;
  }

  let { chatId, absoluteFilePath, lastAssistantMessage }: Props = $props();

  const logger = new Logger({ name: "ToolCallConfirmation" });

  // Extract tool calls from the last assistant message
  const toolCalls = $derived(() => {
    if (!lastAssistantMessage || lastAssistantMessage.role !== "assistant") {
      return [];
    }

    if (!Array.isArray(lastAssistantMessage.content)) {
      return [];
    }

    return lastAssistantMessage.content.filter(
      (part) => part.type === "tool-call",
    );
  });

  async function handleToolCallConfirmation(
    toolCallId: string,
    outcome: "yes" | "no" | "yes_always",
  ): Promise<void> {
    try {
      logger.info("Confirming tool call:", toolCallId, outcome);
      await chatService.confirmToolCall(
        absoluteFilePath,
        chatId,
        toolCallId,
        outcome,
      );
    } catch (error) {
      logger.error("Failed to confirm tool call:", error);
      // Error handling is done in the service
    }
  }
</script>

{#if toolCalls().length > 0}
  <div class="group flex flex-col items-start">
    <div class="mb-0.5 flex items-center gap-2">
      <span
        class="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white"
      >
        🔧
      </span>
      <span class="text-muted text-xs font-medium"
        >Tool Confirmation Required</span
      >
    </div>

    <div class="text-foreground pl-7 leading-normal">
      <div
        class="space-y-3 rounded-lg border border-orange-200 bg-orange-50 p-4"
      >
        <p class="text-sm font-medium text-orange-800">
          Claude wants to use tools to help with your request. Please review and
          approve:
        </p>

        {#each toolCalls() as toolCall (toolCall.toolCallId)}
          <div class="space-y-2 rounded border border-orange-300 bg-white p-3">
            <div class="text-sm font-medium text-orange-900">
              🔧 {toolCall.toolName}
            </div>
            <div
              class="overflow-x-auto rounded bg-orange-50 p-2 text-xs text-orange-700"
            >
              <pre>{JSON.stringify(toolCall.input, null, 2)}</pre>
            </div>
            <div class="flex gap-2">
              <button
                onclick={() =>
                  handleToolCallConfirmation(toolCall.toolCallId, "yes")}
                class="rounded bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-700"
              >
                Yes
              </button>
              <button
                onclick={() =>
                  handleToolCallConfirmation(toolCall.toolCallId, "no")}
                class="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700"
              >
                No
              </button>
              <button
                onclick={() =>
                  handleToolCallConfirmation(toolCall.toolCallId, "yes_always")}
                class="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
              >
                Always Allow
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
