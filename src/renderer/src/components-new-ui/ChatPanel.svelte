<!-- src/renderer/src/components-new-ui/ChatPanel.svelte -->
<script lang="ts">
  import { tick } from "svelte";
  import {
    Share,
    Download,
    Pencil,
    PencilSquare,
    Paperclip,
    ChevronDown,
    ChevronRight,
    House,
    Search,
    LayoutSidebar,
  } from "svelte-bootstrap-icons";
  import { chatService } from "../services/chat-service.js";
  import { fileSearchService } from "../services/file-search-service.js";
  import {
    chatState,
    updateMessageInput,
    savePromptCursorPosition,
    clearPromptCursorPosition,
  } from "../stores/chat-store.svelte.js";
  import {
    uiState,
    showToast,
    toggleLeftPanel,
  } from "../stores/ui-store.svelte.js";
  import {
    fileSearchState,
    type FileSearchResult,
  } from "../stores/file-search-store.svelte.js";
  import { setPreference } from "../stores/local-preferences-store.svelte.js";
  import { projectState } from "../stores/project-store.svelte.js";
  import AiGenerationDisplay from "./AiGenerationDisplay.svelte";
  import ChatMessage from "./ChatMessage.svelte";
  import ToolCallConfirmation from "./ToolCallConfirmation.svelte";
  import FileSearchDropdown from "./file-explorer/FileSearchDropdown.svelte";
  import PromptEditor from "./PromptEditor.svelte";

  // Derived loading states
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
  let showModelDropdown = $state(false);

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

    // Auto-resize textarea
    if (messageInputElement) {
      messageInputElement.style.height = "auto";
      messageInputElement.style.height =
        Math.min(messageInputElement.scrollHeight, 200) + "px";
    }

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
  function handleFileSelect(file: FileSearchResult): void {
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

  function toggleModelDropdown(): void {
    showModelDropdown = !showModelDropdown;
  }

  function selectModel(modelValue: string): void {
    chatState.selectedModel = modelValue;
    showModelDropdown = false;
  }

  // Chat mode and model options
  const modelOptions = [
    { value: "anthropic/claude", label: "Claude 3.5" },
    { value: "google/gemini", label: "GPT-4" },
    { value: "terminal/claude-code", label: "Gemini Pro" },
  ];

  // Close model dropdown when clicking outside
  $effect(() => {
    function handleClickOutside(event: MouseEvent): void {
      const target = event.target as HTMLElement;
      const modelDropdown = document.querySelector(".relative");

      if (
        showModelDropdown &&
        modelDropdown &&
        !modelDropdown.contains(target)
      ) {
        showModelDropdown = false;
      }
    }

    if (showModelDropdown) {
      document.addEventListener("click", handleClickOutside, true);
      return () =>
        document.removeEventListener("click", handleClickOutside, true);
    }
    return undefined;
  });

  // Auto-resize textarea when messageInput changes (e.g., from prompt editor)
  let previousPromptEditorOpen = uiState.promptEditorOpen;
  $effect(() => {
    // If prompt editor is opening, save current cursor position
    if (
      !previousPromptEditorOpen &&
      uiState.promptEditorOpen &&
      messageInputElement
    ) {
      savePromptCursorPosition(
        messageInputElement.selectionStart,
        messageInputElement.selectionEnd,
      );
    }

    // If prompt editor was just closed, focus the textarea and restore cursor position
    if (
      previousPromptEditorOpen &&
      !uiState.promptEditorOpen &&
      messageInputElement
    ) {
      tick().then(() => {
        if (messageInputElement) {
          messageInputElement.focus();
          // Restore cursor position if we have one saved
          if (chatState.promptCursorPosition) {
            messageInputElement.setSelectionRange(
              chatState.promptCursorPosition.start,
              chatState.promptCursorPosition.end,
            );
            clearPromptCursorPosition(); // Clear after use
          }
        }
      });
    }

    // Auto-resize when messageInput changes
    if (messageInputElement && chatState.messageInput) {
      tick().then(() => {
        if (messageInputElement) {
          messageInputElement.style.height = "auto";
          messageInputElement.style.height =
            Math.min(messageInputElement.scrollHeight, 200) + "px";
        }
      });
    }

    previousPromptEditorOpen = uiState.promptEditorOpen;
  });

  // Cleanup timeouts on component destroy using $effect
  $effect(() => {
    return () => {
      clearTimeout(draftTimeout);
      fileSearchService.cleanup();
    };
  });
</script>

<section class="relative flex min-w-0 flex-1 flex-col">
  {#if hasCurrentChat}
    <!-- Breadcrumb Header -->
    <header class="bg-background flex h-12 items-center justify-between px-4">
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

    <!-- Prompt Editor Overlay -->
    {#if uiState.promptEditorOpen}
      <PromptEditor />
    {/if}

    <!-- Messages -->
    <div
      bind:this={messagesContainer}
      class="scrollbar-thin flex-1 overflow-y-auto px-8 py-6"
    >
      <div class="mx-auto max-w-3xl space-y-12">
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
    <footer class="bg-background px-6 py-4">
      <div class="mx-auto max-w-3xl">
        <div
          class="bg-surface border-border relative flex items-center gap-2 rounded-2xl border p-2"
        >
          <textarea
            bind:this={messageInputElement}
            bind:value={chatState.messageInput}
            oninput={(e) => handleInputChange(e.currentTarget.value)}
            onkeypress={handleKeyPress}
            onkeydown={handleKeyPress}
            placeholder="How can I help?"
            class="text-foreground placeholder-muted min-h-[72px] w-full resize-none border-none bg-transparent px-2 text-[15px] leading-6 outline-none"
            style="height: auto;"
            disabled={isLoadingSubmitMessage ||
              chatState.currentChat?.sessionStatus !== "idle"}
          ></textarea>

          <!-- File Search Dropdown -->
          {#if !uiState.promptEditorOpen && fileSearchState.showMenu}
            <FileSearchDropdown
              results={fileSearchState.results}
              selectedIndex={fileSearchState.selectedIndex}
              onselect={handleFileSelect}
              oncancel={handleSearchCancel}
              onhover={handleSearchHover}
              class="absolute top-full right-0 left-0 mt-1"
            />
          {/if}
        </div>

        <!-- Controls under input -->
        <div class="mt-2 flex items-center justify-between px-4">
          <div class="flex items-center gap-3">
            <button
              title="Attach"
              class="text-muted hover:text-accent cursor-pointer"
            >
              <Paperclip />
            </button>
            <!-- Model selector dropdown -->
            <div class="relative">
              <button
                onclick={toggleModelDropdown}
                class="text-muted hover:text-accent disabled:hover:text-muted flex cursor-pointer items-center gap-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                title="Select Model"
                disabled={chatState.currentChat &&
                  chatState.currentChat.messages.length > 0}
              >
                <span id="selected-model"
                  >{modelOptions.find(
                    (m) => m.value === chatState.selectedModel,
                  )?.label || "Claude 3.5"}</span
                >
                {#if !(chatState.currentChat && chatState.currentChat.messages.length > 0)}
                  <ChevronDown class="text-xs" />
                {/if}
              </button>

              <!-- Dropdown menu -->
              {#if showModelDropdown}
                <div
                  class="bg-background border-border absolute bottom-full left-0 z-10 mb-1 w-36 rounded-md border"
                >
                  <div class="py-1">
                    {#each modelOptions as option (option.value)}
                      <button
                        onclick={() => selectModel(option.value)}
                        class="text-foreground hover:bg-hover block w-full cursor-pointer px-3 py-1 text-left text-sm"
                        class:bg-hover={option.value ===
                          chatState.selectedModel}
                      >
                        {option.label}
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          </div>
          <div class="flex items-center">
            <button
              onclick={chatService.togglePromptEditor}
              title="Prompt Editor"
              class="text-muted hover:text-accent cursor-pointer"
            >
              <PencilSquare />
            </button>
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
