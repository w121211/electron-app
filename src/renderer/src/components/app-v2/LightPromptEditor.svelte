<!-- src/renderer/src/components/app-v2/LightPromptEditor.svelte -->
<script lang="ts">
  import path from "node:path";
  import { onMount, onDestroy } from "svelte";
  import {
    Folder,
    Cpu,
    Paperclip,
    Mic,
    Stars,
    Send,
    PlusSquare,
    CheckLg,
    Download,
  } from "svelte-bootstrap-icons";
  import { Logger } from "tslog";

  import { createFileMention } from "../../../../core/utils/message-utils.js";
  import {
    isCliModel,
    isWebModel,
    parseModelId,
    type ModelId,
  } from "../../../../core/utils/model-utils-v2.js";
  import { trpcClient } from "../../lib/trpc-client.js";
  import { projectService } from "../../services/project-service.js";
  import { modelClientService } from "../../services/model-client-service.js";
  import { rendererPromptService } from "../../services/renderer-prompt-service.js";
  import { getEntryId } from "../../services/inbox-service.js";
  import { generatePrompt } from "../../services/quick-prompt-service.js";
  import {
    projectState,
    type ProjectFolder,
  } from "../../stores/project-store.svelte.js";
  import { uiV2State } from "../../stores/ui-v2-store.svelte.js";
  import {
    updateInboxEntry,
    refreshInboxEntries,
  } from "../../stores/inbox-store.svelte.js";
  import FileMentionDropdown from "./FileMentionDropdown.svelte";
  import type { ProjectFileSearchResult } from "../../../../core/services/project-folder-service.js";
  import type { Prompt } from "../../../../core/services/prompt/prompt-types.js";

  const logger = new Logger({ name: "LightPromptEditor" });

  type StatusTone = "info" | "success" | "error" | "warning";

  let {
    promptEntry,
  }: {
    promptEntry: Prompt;
  } = $props();

  let promptValue = $state("");
  let textareaElement = $state<HTMLTextAreaElement | null>(null);
  let selectedProjectPath = $state<string | null>(null);
  let projectMenuOpen = $state(false);
  let modelMenuOpen = $state(false);
  let isSubmitting = $state(false);
  let status = $state<{ message: string; tone: StatusTone } | null>(null);
  let statusTimeout = $state<number | null>(null);
  let lastPersistedContent = $state("");
  let hasFocusedEditor = $state(false);
  let recordingState = $state<"idle" | "recording" | "unavailable">("idle");
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks = $state<Blob[]>([]);
  let autoSaveTimer: number | null = null;
  let activeEntryId: string | null = null;

  // File mention state
  let fileMentionResults = $state<ProjectFileSearchResult[]>([]);
  let fileMentionSelectedIndex = $state(0);
  let fileMentionShowMenu = $state(false);
  let fileMentionCursorPos = $state(-1);
  let fileMentionStartPos = $state(-1);
  let fileMentionDebounceTimer: number | null = null;

  const projects = $derived(projectState.projectFolders);
  const allModels = $derived(uiV2State.availableModels);
  const enabledModels = $derived(
    allModels.filter(
      (model) =>
        model.enabled &&
        (isCliModel(model.modelId) || isWebModel(model.modelId)),
    ),
  );
  const selectedModelId = $derived(uiV2State.selectedModel);
  const selectedProjectName = $derived.by(() => {
    if (!selectedProjectPath) return null;
    const project = projects.find((p) => p.path === selectedProjectPath);
    return project?.name ?? null;
  });
  const selectedModelName = $derived.by(() => {
    if (!selectedModelId) return null;
    const model = allModels.find((m) => m.modelId === selectedModelId);
    if (model?.displayName) return model.displayName;
    try {
      const parsed = parseModelId(selectedModelId);
      return parsed.providerModelId;
    } catch {
      return selectedModelId;
    }
  });

  const projectPreferenceKey = "inboxProjectPath";

  onMount(() => {
    initializeProjectPreference();
    ensureExternalModelSelected();

    const handleGlobalPointer = (event: PointerEvent): void => {
      if (!(event.target instanceof HTMLElement)) {
        closeMenus();
        return;
      }
      if (!event.target.closest("[data-project-menu]")) {
        projectMenuOpen = false;
      }
      if (!event.target.closest("[data-model-menu]")) {
        modelMenuOpen = false;
      }
    };

    const handleVisibility = (): void => {
      if (!document.hidden) {
        queueMicrotask(() => {
          if (textareaElement && promptEntry) {
            textareaElement.focus();
            textareaElement.setSelectionRange(
              promptValue.length,
              promptValue.length,
            );
          }
        });
      }
    };

    window.addEventListener("pointerdown", handleGlobalPointer);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("pointerdown", handleGlobalPointer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  });

  onDestroy(() => {
    // Save content on destroy
    if (
      activeEntryId &&
      promptValue !== lastPersistedContent &&
      promptValue.trim()
    ) {
      // Fire-and-forget the save operation. Because the app isn't closing,
      // the event loop will process this promise.
      void saveContent(promptValue, activeEntryId);
    }

    if (mediaRecorder && recordingState === "recording") {
      mediaRecorder.stop();
    }
    if (statusTimeout) {
      clearTimeout(statusTimeout);
    }
    if (autoSaveTimer !== null) {
      window.clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    if (fileMentionDebounceTimer !== null) {
      clearTimeout(fileMentionDebounceTimer);
    }
  });

  $effect(() => {
    if (enabledModels.length === 0) {
      return;
    }

    const current = enabledModels.find(
      (model) => model.modelId === selectedModelId,
    );

    if (!current) {
      modelClientService.selectModelV2(enabledModels[0]?.modelId);
    }
  });

  $effect(() => {
    const entryId = getEntryId(promptEntry);
    if (entryId === activeEntryId) {
      return;
    }

    const switchEntry = async (): Promise<void> => {
      // Cancel pending autosave timer
      if (autoSaveTimer !== null) {
        window.clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
      }

      // Save current prompt before switching if content has changed
      if (
        activeEntryId &&
        promptValue !== lastPersistedContent &&
        promptValue.trim()
      ) {
        const previousEntryId = activeEntryId;
        const contentToSave = promptValue;

        await saveContent(contentToSave, previousEntryId);
      }

      loadEntryContent();
    };

    void switchEntry();
  });

  $effect(() => {
    const currentContent = promptValue;
    if (currentContent === lastPersistedContent) {
      return;
    }

    if (autoSaveTimer !== null) {
      window.clearTimeout(autoSaveTimer);
    }

    const targetId = promptEntry.id;

    autoSaveTimer = window.setTimeout(() => {
      void saveContent(currentContent, targetId);
    }, 1000);
  });

  const closeMenus = (): void => {
    projectMenuOpen = false;
    modelMenuOpen = false;
  };

  // File mention functions
  async function searchFilesForMention(query: string): Promise<void> {
    if (!selectedProjectPath) {
      applyStatus("Select a project to use file mentions.", "warning");
      fileMentionResults = [];
      return;
    }

    try {
      const results = await trpcClient.projectFolder.searchFiles.query({
        query: query || "",
        projectPath: selectedProjectPath,
        limit: 20,
      });
      fileMentionResults = results;
      fileMentionSelectedIndex = 0;
    } catch (error) {
      logger.error("File mention search failed", error);
      applyStatus(
        error instanceof Error ? error.message : "File search failed.",
        "error",
      );
      fileMentionResults = [];
    }
  }

  function detectFileMention(): void {
    if (!textareaElement) return;

    const cursorPos = textareaElement.selectionStart;
    const beforeCursor = promptValue.substring(0, cursorPos);
    const atMatch = beforeCursor.match(/@([^@\s]*)$/);

    if (fileMentionDebounceTimer !== null) {
      clearTimeout(fileMentionDebounceTimer);
    }

    if (atMatch) {
      const query = atMatch[1] || "";
      fileMentionCursorPos = cursorPos;
      fileMentionStartPos = cursorPos - atMatch[1].length;
      fileMentionShowMenu = true;

      fileMentionDebounceTimer = window.setTimeout(() => {
        void searchFilesForMention(query);
      }, 50);
    } else {
      fileMentionShowMenu = false;
    }
  }

  function handleFileMentionSelect(file: ProjectFileSearchResult): void {
    if (!textareaElement) return;

    const beforeSearch = promptValue.substring(0, fileMentionStartPos - 1); // -1 removes @
    const afterSearch = promptValue.substring(fileMentionCursorPos);
    const mention = `@${file.relativePath} `;

    promptValue = beforeSearch + mention + afterSearch;

    const newCursorPos = beforeSearch.length + mention.length;
    queueMicrotask(() => {
      textareaElement?.setSelectionRange(newCursorPos, newCursorPos);
      textareaElement?.focus();
    });

    fileMentionShowMenu = false;
  }

  function handleFileMentionKeydown(event: KeyboardEvent): boolean {
    if (!fileMentionShowMenu) return false;

    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        fileMentionSelectedIndex = Math.max(0, fileMentionSelectedIndex - 1);
        return true;

      case "ArrowDown":
        event.preventDefault();
        fileMentionSelectedIndex = Math.min(
          fileMentionResults.length - 1,
          fileMentionSelectedIndex + 1,
        );
        return true;

      case "Enter":
      case "Tab": {
        event.preventDefault();
        const selectedFile = fileMentionResults[fileMentionSelectedIndex];
        if (selectedFile) {
          handleFileMentionSelect(selectedFile);
        }
        return true;
      }

      case "Escape":
        event.preventDefault();
        fileMentionShowMenu = false;
        textareaElement?.focus();
        return true;

      default:
        return false;
    }
  }

  const initializeProjectPreference = (): void => {
    const stored = localStorage.getItem(projectPreferenceKey);
    if (
      stored &&
      projects.some((project: ProjectFolder) => project.path === stored)
    ) {
      selectedProjectPath = stored;
      return;
    }
    selectedProjectPath = projects[0]?.path ?? null;
  };

  const getSelectedProject = (): ProjectFolder | null => {
    if (!selectedProjectPath) {
      return null;
    }
    return (
      projects.find((project) => project.path === selectedProjectPath) ?? null
    );
  };

  const selectProject = (projectPath: string | null): void => {
    if (selectedProjectPath !== projectPath) {
      selectedProjectPath = projectPath;
      if (projectPath) {
        localStorage.setItem(projectPreferenceKey, projectPath);
      } else {
        localStorage.removeItem(projectPreferenceKey);
      }
    }
    closeMenus();
  };

  const ensureExternalModelSelected = (): void => {
    if (enabledModels.length === 0) {
      applyStatus(
        "Enable a CLI or Web model in the main app to launch chats.",
        "warning",
        0,
      );
      return;
    }

    const current = enabledModels.find(
      (model) => model.modelId === selectedModelId,
    );

    if (!current) {
      modelClientService.selectModelV2(enabledModels[0]?.modelId);
    }
  };

  const selectModel = (modelId: ModelId): void => {
    modelClientService.selectModelV2(modelId);
    closeMenus();
  };

  const applyStatus = (
    message: string,
    tone: StatusTone,
    duration = 2500,
  ): void => {
    status = { message, tone };
    if (statusTimeout) {
      clearTimeout(statusTimeout);
    }
    if (duration > 0) {
      statusTimeout = window.setTimeout(() => {
        status = null;
        statusTimeout = null;
      }, duration);
    }
  };

  const clearStatus = (): void => {
    if (statusTimeout) {
      clearTimeout(statusTimeout);
      statusTimeout = null;
    }
    status = null;
  };

  const insertTextAtCursor = (text: string): void => {
    if (!textareaElement) return;

    const start = textareaElement.selectionStart;
    const end = textareaElement.selectionEnd;
    const before = promptValue.slice(0, start);
    const after = promptValue.slice(end);

    const needsSpaceBefore =
      before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n");

    const spaceBefore = needsSpaceBefore ? " " : "";
    const spaceAfter = " ";

    promptValue = `${before}${spaceBefore}${text}${spaceAfter}${after}`;

    const newPos = start + spaceBefore.length + text.length + spaceAfter.length;
    queueMicrotask(() => {
      textareaElement?.setSelectionRange(newPos, newPos);
      textareaElement?.focus();
    });
  };

  const handleAttach = async (): Promise<void> => {
    const project = getSelectedProject();

    try {
      const filePaths =
        (await window.api.quickPrompt.selectFiles({
          defaultPath: project?.path,
        })) ?? [];

      if (!filePaths.length) {
        return;
      }

      const mentions: string[] = [];

      for (const filePath of filePaths) {
        const absolutePath = path.resolve(filePath);

        let displayPath: string;
        if (project && absolutePath.startsWith(project.path)) {
          displayPath = path.relative(project.path, absolutePath);
        } else {
          displayPath = absolutePath;
        }

        const normalized = displayPath.replace(/\\/g, "/");
        mentions.push(createFileMention(normalized));
      }

      if (mentions.length > 0) {
        insertTextAtCursor(mentions.join(" "));
      }
    } catch (error) {
      logger.error("Failed to attach files", error);
      applyStatus(
        error instanceof Error ? error.message : "Failed to attach files.",
        "error",
        0,
      );
    }
  };

  const startAudioRecording = async (): Promise<void> => {
    if (recordingState === "recording") {
      mediaRecorder?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];

      mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        recordingState = "recording";
        applyStatus("Recording audio…", "info", 0);
      };

      mediaRecorder.onstop = async () => {
        recordingState = "idle";
        stream.getTracks().forEach((track) => track.stop());

        if (audioChunks.length === 0) {
          applyStatus("No audio recorded.", "warning");
          mediaRecorder = null;
          return;
        }

        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        try {
          const absolutePath =
            await window.api.quickPrompt.saveAudio(uint8Array);

          insertTextAtCursor(createFileMention(absolutePath));
          clearStatus();
        } catch (error) {
          logger.error("Failed to save audio recording", error);
          applyStatus(
            error instanceof Error ? error.message : "Failed to save audio.",
            "error",
            0,
          );
        } finally {
          mediaRecorder = null;
          audioChunks = [];
        }
      };

      mediaRecorder.onerror = (event) => {
        logger.error("MediaRecorder error", event);
        recordingState = "idle";
        mediaRecorder = null;
        audioChunks = [];
        stream.getTracks().forEach((track) => track.stop());
        applyStatus("Audio recording failed.", "error", 0);
      };

      mediaRecorder.start();
    } catch (error) {
      logger.error("Failed to access microphone", error);
      recordingState = "unavailable";
      applyStatus(
        error instanceof Error ? error.message : "Microphone unavailable.",
        "error",
        0,
      );
    }
  };

  const loadEntryContent = (): void => {
    hasFocusedEditor = false;
    clearStatus();

    if (autoSaveTimer !== null) {
      window.clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }

    const entryId = getEntryId(promptEntry);
    activeEntryId = entryId;

    promptValue = promptEntry.content;
    lastPersistedContent = promptEntry.content;
    queueMicrotask(() => focusTextarea());
  };

  const focusTextarea = (): void => {
    if (hasFocusedEditor || !textareaElement) {
      return;
    }
    hasFocusedEditor = true;
    queueMicrotask(() => {
      textareaElement?.focus();
      textareaElement?.setSelectionRange(
        promptValue.length,
        promptValue.length,
      );
    });
  };

  const saveContent = async (
    content: string,
    promptId: string,
  ): Promise<void> => {
    try {
      const updatedPrompt = await rendererPromptService.updatePrompt(promptId, {
        content,
      });
      lastPersistedContent = content;
      updateInboxEntry(promptId, () => updatedPrompt);
    } catch (error) {
      logger.error("Failed to save prompt", error);
      applyStatus(
        error instanceof Error ? error.message : "Auto-save failed.",
        "error",
        0,
      );
    }
  };

  const handleEditorKeydown = (event: KeyboardEvent): void => {
    // Handle file mention menu first
    if (handleFileMentionKeydown(event)) {
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void handleLaunchPrompt();
    }
  };

  const handleAddNewProject = async (): Promise<void> => {
    closeMenus();
    try {
      const folderPath = await window.api.showOpenDialog();
      if (!folderPath) {
        return;
      }

      await projectService.addProjectFolder(folderPath);
      selectedProjectPath = folderPath;
      localStorage.setItem(projectPreferenceKey, folderPath);
      applyStatus(`Added project: ${folderPath}`, "success");
    } catch (error) {
      logger.error("Failed to add new project", error);
      applyStatus(
        error instanceof Error ? error.message : "Failed to add project.",
        "error",
        0,
      );
    }
  };

  const handleLaunchPrompt = async (): Promise<void> => {
    const trimmedPrompt = promptValue.trim();
    if (!trimmedPrompt) {
      applyStatus("Write a prompt first.", "error");
      return;
    }

    if (isSubmitting) {
      return;
    }

    const model = enabledModels.find(
      (item) => item.modelId === selectedModelId,
    );
    if (!model) {
      applyStatus("Select an external model first.", "error");
      return;
    }

    isSubmitting = true;
    applyStatus("Launching chat…", "info", 0);

    try {
      const session = await trpcClient.chat.createSession.mutate({
        modelId: model.modelId,
        title: promptEntry.metadata?.title || "Untitled Chat",
        sourcePromptId: promptEntry.id,
        workingDirectory: selectedProjectPath ?? undefined,
        metadata: {
          projectPath: selectedProjectPath ?? undefined,
        },
      });
      applyStatus("Chat launched.", "success");
      await refreshInboxEntries({ selectId: session.id });
    } catch (error) {
      logger.error("Failed to launch chat", error);
      applyStatus(
        error instanceof Error ? error.message : "Failed to launch chat.",
        "error",
        0,
      );
    } finally {
      isSubmitting = false;
    }
  };

  const handleGeneratePrompt = async (): Promise<void> => {
    const trimmedInput = promptValue.trim();
    if (!trimmedInput) {
      applyStatus("Write a prompt first.", "error");
      return;
    }

    if (isSubmitting) {
      return;
    }

    isSubmitting = true;
    applyStatus("Generating prompt…", "info", 0);

    try {
      const { generatedPrompt } = await generatePrompt(trimmedInput);
      promptValue = generatedPrompt;
      applyStatus("Prompt generated.", "success");
    } catch (error) {
      logger.error("Failed to generate prompt", error);
      applyStatus(
        error instanceof Error ? error.message : "Failed to generate prompt.",
        "error",
        0,
      );
    } finally {
      isSubmitting = false;
    }
  };

  const handleDownloadPrompt = (): void => {
    if (!promptValue.trim()) {
      applyStatus("Nothing to download.", "warning");
      return;
    }

    const filename = `${promptEntry.metadata?.title || "prompt"}.txt`;

    const blob = new Blob([promptValue], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);

    applyStatus("Prompt downloaded.", "success");
  };
</script>

<main class="bg-background flex flex-1 flex-col">
  <div class="flex h-11 shrink-0 items-center justify-between px-4 text-xs">
    <div class="flex items-center gap-3">
      <div class="relative" data-project-menu>
        <button
          class="hover:text-accent flex cursor-pointer items-center gap-1"
          title="Select Project"
          onclick={() => (projectMenuOpen = !projectMenuOpen)}
        >
          <Folder />
          <span>{selectedProjectName ?? "No project"}</span>
        </button>
        {#if projectMenuOpen}
          <div
            class="bg-surface border-border absolute top-full left-0 z-20 mt-1 w-52 rounded-md border p-1 text-xs shadow-lg"
          >
            <button
              type="button"
              class="hover:bg-border flex w-full items-center justify-between rounded px-2 py-1.5 text-left {selectedProjectPath ===
              null
                ? 'text-accent'
                : 'text-foreground'}"
              onclick={() => selectProject(null)}
            >
              <span>No project</span>
              {#if selectedProjectPath === null}
                <CheckLg class="text-[10px]" />
              {/if}
            </button>
            {#each projects as project (project.path)}
              <button
                type="button"
                class="hover:bg-border flex w-full items-center justify-between rounded px-2 py-1.5 text-left {project.path ===
                selectedProjectPath
                  ? 'text-accent'
                  : 'text-foreground'}"
                onclick={() => selectProject(project.path)}
              >
                <span class="truncate">{project.name}</span>
                {#if project.path === selectedProjectPath}
                  <CheckLg class="text-[10px]" />
                {/if}
              </button>
            {/each}
            <button
              class="text-muted hover:text-foreground flex w-full items-center gap-2 rounded px-2 py-1.5"
              onclick={() => void handleAddNewProject()}
            >
              <PlusSquare class="text-sm" />
              <span>Add project…</span>
            </button>
          </div>
        {/if}
      </div>
      <div class="relative" data-model-menu>
        <button
          class="hover:text-accent flex cursor-pointer items-center gap-1"
          title="Select Model"
          onclick={() => (modelMenuOpen = !modelMenuOpen)}
        >
          <Cpu />
          <span>{selectedModelName ?? "Select model"}</span>
        </button>
        {#if modelMenuOpen}
          <div
            class="bg-surface border-border absolute top-full left-0 z-20 mt-1 w-64 rounded-md border p-1 text-xs shadow-lg"
          >
            {#if enabledModels.length === 0}
              <div class="text-muted px-2 py-1.5">
                Enable CLI or Web models in settings.
              </div>
            {:else}
              {#each enabledModels as model (model.modelId)}
                <button
                  type="button"
                  class="hover:bg-border flex w-full items-center justify-between rounded px-2 py-1.5 text-left {model.modelId ===
                  selectedModelId
                    ? 'text-accent'
                    : 'text-foreground'}"
                  onclick={() => selectModel(model.modelId)}
                >
                  <span class="truncate"
                    >{model.displayName ?? model.modelId}</span
                  >
                  {#if model.modelId === selectedModelId}
                    <CheckLg class="text-[10px]" />
                  {/if}
                </button>
              {/each}
            {/if}
          </div>
        {/if}
      </div>
      <button
        title="Attach Files"
        class="hover:text-accent cursor-pointer"
        onclick={handleAttach}
      >
        <Paperclip class="text-sm" />
      </button>
      <button
        class="hover:text-accent cursor-pointer rounded p-1.5"
        title="Download Prompt"
        onclick={handleDownloadPrompt}
      >
        <Download />
      </button>
    </div>
    <div class="flex items-center gap-2">
      <button
        class="hover:text-accent cursor-pointer rounded p-1.5"
        title="Record Audio"
        onclick={startAudioRecording}
      >
        <Mic />
      </button>
      <button
        class="hover:text-accent cursor-pointer rounded p-1.5"
        title="Generate Prompt"
        onclick={handleGeneratePrompt}
      >
        <Stars />
      </button>
      <button
        class="hover:text-accent flex items-center gap-1.5 rounded-md py-1.5 pr-3 pl-1.5"
        title="Send Prompt"
        onclick={handleLaunchPrompt}
      >
        <Send class="text-sm" />
        <span>Send</span>
      </button>
    </div>
  </div>
  <div class="flex flex-1 flex-col p-3">
    <div class="relative flex-1">
      <textarea
        id="edit-textarea"
        bind:this={textareaElement}
        value={promptValue}
        oninput={(e) => {
          promptValue = e.currentTarget.value;
          detectFileMention();
        }}
        onkeydown={handleEditorKeydown}
        placeholder="Enter your prompt here. Use '/' for commands, or '@path/to/file' to reference files."
        class="bg-background text-foreground placeholder-muted h-full w-full resize-none px-3 py-2 text-sm leading-6 outline-none"
      ></textarea>

      {#if fileMentionShowMenu}
        <FileMentionDropdown
          results={fileMentionResults}
          selectedIndex={fileMentionSelectedIndex}
          onselect={handleFileMentionSelect}
          oncancel={() => {
            fileMentionShowMenu = false;
            textareaElement?.focus();
          }}
          onhover={(index) => (fileMentionSelectedIndex = index)}
          class="absolute right-3 bottom-2 left-3"
        />
      {/if}
    </div>
  </div>
</main>
