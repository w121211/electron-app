<!-- src/renderer/src/components-new-ui/ChatPanel.svelte -->
<script lang="ts">
  import { tick } from "svelte";
  import {
    Share,
    Download,
    Pencil,
    Paperclip,
    ChevronDown,
    ChevronRight,
    House,
    Search,
    LayoutSidebar,
  } from "svelte-bootstrap-icons";
  import { Logger } from "tslog";
  import { chatService } from "../services/chat-service.js";
  import { fileSearchService } from "../services/file-search-service.js";
  import {
    chatState,
    updateMessageInput,
  } from "../stores/chat-store.svelte.js";
  import {
    uiState,
    showToast,
    toggleLeftPanel,
  } from "../stores/ui-store.svelte.js";
  import { fileSearchState } from "../stores/file-search-store.svelte.js";
  import { setPreference } from "../stores/local-preferences-store.svelte.js";
  import { projectState } from "../stores/project-store.svelte.js";
  import AiGenerationDisplay from "./AiGenerationDisplay.svelte";
  import ChatMessage from "./ChatMessage.svelte";
  import ToolCallConfirmation from "./ToolCallConfirmation.svelte";
  import FileSearchDropdown from "./file-explorer/FileSearchDropdown.svelte";

  const logger = new Logger({ name: "NewChatPanel" });

  // Derived loading states
  const isLoadingOpenChat = $derived(
    uiState.loadingStates["openChat"] || false,
  );
  const isLoadingSubmitMessage = $derived(
    uiState.loadingStates["submitMessage"] || false,
  );

  // Derived chat states
  const hasCurrentChat = $derived(chatState.currentChat !== null);
  const currentChatMessages = $derived(chatState.currentChat?.messages || []);
  const currentChatBreadcrumb = $derived(() => {
    if (!chatState.currentChat) return null;

    const pathParts = chatState.currentChat.absoluteFilePath.split("/");
    const fileName = pathParts.pop();

    // Find the project that contains this chat file
    const chatFilePath = chatState.currentChat.absoluteFilePath;
    const containingProject = projectState.projectFolders.find((project) =>
      chatFilePath.startsWith(project.path),
    );

    const projectName = containingProject
      ? containingProject.name
      : pathParts.slice(-2, -1)[0] || "Unknown";

    return {
      parentDir: projectName,
      fileName,
      fullPath: chatState.currentChat.absoluteFilePath,
    };
  });

  let messageInputElement = $state<HTMLTextAreaElement>();
  let messagesContainer = $state<HTMLDivElement>();
  let draftTimeout: ReturnType<typeof setTimeout>;

  // Auto-scroll to bottom when new messages arrive using $effect
  $effect(() => {
    if (currentChatMessages && messagesContainer) {
      tick().then(() => {
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      });
    }
  });

  // Auto-focus input when a new chat is opened using $effect
  let previousChatId: string | null = null;
  $effect(() => {
    const currentChatId = chatState.currentChat?.id || null;

    // Only focus if we're switching to a different chat (including from no chat to a chat)
    if (
      currentChatId &&
      currentChatId !== previousChatId &&
      messageInputElement
    ) {
      tick().then(() => {
        if (messageInputElement) {
          messageInputElement.focus();
        }
      });
    }

    previousChatId = currentChatId;
  });

  // Sync selected model with current chat's modelId
  $effect(() => {
    if (chatState.currentChat && chatState.currentChat.messages.length > 0) {
      // Chat has messages, set selectedModel to the chat's current modelId
      chatState.selectedModel = chatState.currentChat.modelId;
    }
  });

  // Save chat preferences to localStorage when they change
  $effect(() => {
    setPreference("chatMode", chatState.chatMode);
    setPreference("selectedModel", chatState.selectedModel);
  });

  async function handleSendMessage(): Promise<void> {
    if (!chatState.messageInput.trim() || !chatState.currentChat) return;

    const message = chatState.messageInput.trim();
    const chatId = chatState.currentChat.id;

    // Only pass modelId for the first message (when no messages exist)
    const modelId =
      chatState.currentChat.messages.length === 0
        ? chatState.selectedModel
        : undefined;

    await chatService.sendMesage(
      chatState.currentChat.absoluteFilePath,
      chatId,
      message,
      undefined, // attachments
      modelId,
    );
  }

  function handleInputChange(value: string): void {
    updateMessageInput(value);

    // Handle @ file reference detection
    fileSearchService.detectFileReference(value, messageInputElement ?? null);

    // Save draft when user actively types (including clearing content)
    if (chatState.currentChat) {
      clearTimeout(draftTimeout);
      draftTimeout = setTimeout(() => {
        chatService.savePromptDraft(
          chatState.currentChat!.absoluteFilePath,
          value,
        );
      }, 1500);
    }
  }

  // Handle file selection from dropdown
  function handleFileSelect(file: any): void {
    fileSearchService.handleFileSelect(
      file,
      messageInputElement ?? null,
      chatState.messageInput,
    );
  }

  // Handle search menu cancel
  function handleSearchCancel(): void {
    fileSearchService.handleSearchCancel(messageInputElement ?? null);
  }

  // Handle search menu hover (for keyboard navigation)
  function handleSearchHover(index: number): void {
    fileSearchService.handleSearchHover(index);
  }

  function handleKeyPress(event: KeyboardEvent): void {
    // Handle search menu navigation
    const handled = fileSearchService.handleSearchKeydown(
      event,
      messageInputElement ?? null,
      chatState.messageInput,
    );

    if (handled) return;

    // Normal message sending
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  }

  function handleShare(): void {
    showToast("Share functionality coming soon", "info");
  }

  function handleDownload(): void {
    showToast("Download functionality coming soon", "info");
  }

  function handleEdit(): void {
    showToast("Edit functionality coming soon", "info");
  }

  // Chat mode and model options
  const modelOptions = [
    { value: "anthropic/claude", label: "Claude 3.5" },
    { value: "google/gemini", label: "GPT-4" },
    { value: "terminal/claude-code", label: "Gemini Pro" },
  ];

  // Cleanup timeouts on component destroy using $effect
  $effect(() => {
    return () => {
      clearTimeout(draftTimeout);
      fileSearchService.cleanup();
    };
  });
</script>

<section class="flex min-w-0 flex-1 flex-col">
  {#if hasCurrentChat}
    <!-- Breadcrumb Header -->
    <header class="bg-surface flex h-12 items-center justify-between px-4">
      <div class="flex items-center gap-2">
        <!-- Show navigation buttons when left panel is closed -->
        {#if !uiState.leftPanelOpen}
          <button
            class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
            title="Home"
          >
            <House class="text-base" />
          </button>
          <button
            class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
            title="Search"
          >
            <Search class="text-base" />
          </button>
          <button
            onclick={toggleLeftPanel}
            class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
            title="Toggle Sidebar"
          >
            <LayoutSidebar class="text-base" />
          </button>
        {/if}

        {#if currentChatBreadcrumb()}
          {@const breadcrumb = currentChatBreadcrumb()}
          {#if breadcrumb}
            <span
              class="text-muted text-xs {!uiState.leftPanelOpen ? 'ml-3' : ''}"
              >{breadcrumb.parentDir}</span
            >
            <ChevronRight class="text-muted text-xs" />
            <span class="text-muted text-xs">{breadcrumb.fileName}</span>
          {/if}
        {/if}
      </div>
      <div class="flex items-center gap-2">
        <button
          onclick={handleShare}
          class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
          title="Share"
        >
          <Share class="text-base" />
        </button>
        <button
          onclick={handleDownload}
          class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
          title="Export"
        >
          <Download class="text-base" />
        </button>
        <button
          onclick={handleEdit}
          class="text-muted hover:text-accent cursor-pointer rounded p-1.5"
          title="Edit"
        >
          <Pencil class="text-base" />
        </button>
      </div>
    </header>

    <!-- Messages -->
    <div
      bind:this={messagesContainer}
      class="scrollbar-thin bg-background flex-1 overflow-y-auto px-8 py-6"
    >
      <div class="mx-auto max-w-2xl space-y-12">
        {#each currentChatMessages as chatMessage (chatMessage.id)}
          <ChatMessage {chatMessage} />
        {/each}

        <!-- AI Generation Display -->
        {#if chatState.currentChat?.sessionStatus === "processing"}
          <AiGenerationDisplay chatSession={chatState.currentChat} />
        {/if}

        <!-- Tool Call Confirmation Block -->
        {#if chatState.currentChat?.sessionStatus === "waiting_confirmation"}
          {@const lastMessage =
            currentChatMessages[currentChatMessages.length - 1]?.message}
          <ToolCallConfirmation
            chatId={chatState.currentChat.id}
            absoluteFilePath={chatState.currentChat.absoluteFilePath}
            lastAssistantMessage={lastMessage}
          />
        {/if}
      </div>
    </div>

    <!-- Input Area -->
    <footer class="bg-background px-6 py-3">
      <div class="mx-auto max-w-2xl">
        <div
          class="bg-input-background border-border relative flex items-center gap-2 rounded-2xl border p-2"
        >
          <textarea
            bind:this={messageInputElement}
            bind:value={chatState.messageInput}
            oninput={(e) => handleInputChange(e.currentTarget.value)}
            onkeypress={handleKeyPress}
            onkeydown={handleKeyPress}
            rows="3"
            placeholder="How can I help?"
            class="text-foreground placeholder-muted min-h-[72px] w-full resize-none border-none bg-transparent px-2 text-[15px] leading-6 outline-none"
            disabled={isLoadingSubmitMessage ||
              chatState.currentChat?.sessionStatus !== "idle"}
          ></textarea>

          <!-- File Search Dropdown -->
          <FileSearchDropdown
            results={fileSearchState.results}
            selectedIndex={fileSearchState.selectedIndex}
            visible={fileSearchState.showMenu}
            loading={fileSearchState.isSearching}
            onselect={handleFileSelect}
            oncancel={handleSearchCancel}
            onhover={handleSearchHover}
          />
        </div>

        <!-- Controls under input -->
        <div class="mt-2 flex items-center justify-between px-4">
          <div class="flex items-center gap-3">
            <button
              title="Attach"
              class="text-muted hover:text-accent cursor-pointer"
            >
              <Paperclip class="text-lg" />
            </button>
            <!-- Model selector dropdown -->
            <div class="relative">
              <button
                class="text-muted hover:text-accent flex cursor-pointer items-center gap-1 text-sm"
                title="Select Model"
              >
                <span id="selected-model"
                  >{modelOptions.find(
                    (m) => m.value === chatState.selectedModel,
                  )?.label || "Claude 3.5"}</span
                >
                <ChevronDown class="text-xs" />
              </button>
              <!-- Dropdown content would be shown on click -->
            </div>
          </div>
        </div>
      </div>
    </footer>
  {:else}
    <!-- No Chat Selected -->
    <div class="bg-background flex flex-1 items-center justify-center">
      <div class="text-muted text-center">
        <div class="mx-auto mb-4 text-5xl">💬</div>
        <p class="mb-2">Select a chat file to start</p>
        <p class="text-xs opacity-75">
          Create a new chat from the file explorer
        </p>
      </div>
    </div>
  {/if}
</section>

<style>
  .scrollbar-thin::-webkit-scrollbar {
    width: 6px;
  }
  .scrollbar-thin::-webkit-scrollbar-thumb {
    background: #2c2c2e;
    border-radius: 3px;
  }
  .scrollbar-thin::-webkit-scrollbar-track {
    background: transparent;
  }
</style>
