<!-- src/renderer/src/components/prompt-centric/PromptComposerV2.svelte -->
<script lang="ts">
  import path from "node:path";
  import { onMount, onDestroy } from "svelte";
  import {
    Folder,
    Cpu,
    Paperclip,
    MicFill,
    Stars,
    Send,
    BoxArrowUpRight,
    PlusSquare,
    CheckLg,
  } from "svelte-bootstrap-icons";
  import { Logger } from "tslog";
  import { projectService } from "../../services/project-service.js";
  import { modelClientService } from "../../services/model-client-service.js";
  import {
    projectState,
    type ProjectFolder,
  } from "../../stores/project-store.svelte.js";
  import {
    chatSettings,
    getAvailableModelsAsList,
  } from "../../stores/chat.svelte.js";
  import { rendererPromptService } from "../../services/renderer-prompt-service.js";
  import {
    type InboxEntry,
    isChatSession,
    isPrompt,
    getEntryId,
  } from "../../services/inbox-service.js";
  import {
    updateInboxEntry,
    refreshInboxEntries,
  } from "../../stores/inbox-store.svelte.js";
  import { createFileMention } from "../../../../core/utils/message-utils.js";
  import { getModelSurface } from "../../core/utils/model-utils-v2.js";
  import { trpcClient } from "../../lib/trpc-client.js";
  import { generatePrompt } from "../../services/quick-prompt-service.js";

  const logger = new Logger({ name: "PromptComposerV2" });

  type StatusTone = "info" | "success" | "error" | "warning";

  let {
    entry,
  }: {
    entry: InboxEntry | null;
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

  const projects = $derived(projectState.projectFolders);
  const allModels = $derived.by(getAvailableModelsAsList);
  const enabledModels = $derived(
    allModels.filter(
      (model) =>
        model.enabled &&
        (getModelSurface(model.modelId) === "terminal" ||
          getModelSurface(model.modelId) === "web"),
    ),
  );
  const selectedModelId = $derived(chatSettings.selectedModel);

  const projectPreferenceKey = "inboxProjectPath";

  $effect(() => {
    if (enabledModels.length === 0) {
      return;
    }

    const current = enabledModels.find(
      (model) => model.modelId === selectedModelId,
    );

    if (!current) {
      modelClientService.selectModel(enabledModels[0]?.modelId);
    }
  });

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
          if (textareaElement && entry) {
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
  });

  $effect(() => {
    if (!entry) {
      resetEditorState();
      return;
    }

    const entryId = getEntryId(entry);
    if (entryId === activeEntryId) {
      return;
    }

    loadEntryContent(entry);
  });

  $effect(() => {
    if (!entry || !isPrompt(entry)) {
      return;
    }

    const currentContent = promptValue;
    if (currentContent === lastPersistedContent) {
      return;
    }

    if (autoSaveTimer !== null) {
      window.clearTimeout(autoSaveTimer);
    }

    const targetId = entry.id;

    autoSaveTimer = window.setTimeout(() => {
      void enqueueAutoSave(currentContent, targetId);
    }, 1000);
  });

  const closeMenus = (): void => {
    projectMenuOpen = false;
    modelMenuOpen = false;
  };

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
      modelClientService.selectModel(enabledModels[0]?.modelId);
    }
  };

  const selectModel = (modelId: `${string}/${string}`): void => {
    modelClientService.selectModel(modelId);
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

  const resetEditorState = (): void => {
    promptValue = "";
    lastPersistedContent = "";
    activeEntryId = null;
  };

  const loadEntryContent = (target: InboxEntry): void => {
    hasFocusedEditor = false;
    clearStatus();

    if (autoSaveTimer !== null) {
      window.clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }

    const entryId = getEntryId(target);
    activeEntryId = entryId;

    if (isPrompt(target)) {
      promptValue = target.content;
      lastPersistedContent = target.content;
      queueMicrotask(() => focusTextarea());
      return;
    }

    if (isChatSession(target)) {
      promptValue = "";
      lastPersistedContent = "";
      if (target.metadata?.projectPath) {
        selectedProjectPath = target.metadata.projectPath;
      }
    }
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

  const enqueueAutoSave = async (
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
    if (!entry) {
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void handlePrimaryAction();
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

  const handlePrimaryAction = async (): Promise<void> => {
    if (!entry) {
      return;
    }

    if (isChatSession(entry)) {
      await handleOpenSurface(entry);
      return;
    }

    await handleLaunchPrompt();
  };

  const handleLaunchPrompt = async (): Promise<void> => {
    if (!entry || !isPrompt(entry)) {
      return;
    }

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
        title: entry.metadata?.title || "Untitled Chat",
        sourcePromptId: entry.id,
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

  const handleOpenSurface = async (session: InboxEntry): Promise<void> => {
    if (!isChatSession(session)) {
      return;
    }

    if (!session.metadata?.modelId) {
      applyStatus("Session is missing model information.", "error");
      return;
    }

    try {
      const result = await window.api.surface.launch({
        sessionId: session.id,
        modelId: session.metadata.modelId,
        modelSurface: session.modelSurface,
        projectPath: session.metadata.projectPath ?? undefined,
      });

      if (!result.success) {
        throw new Error(result.error ?? "Failed to open chat surface");
      }
      applyStatus("Chat surface opened.", "success");
    } catch (error) {
      logger.error("Failed to open surface", error);
      applyStatus(
        error instanceof Error ? error.message : "Failed to open surface.",
        "error",
        0,
      );
    }
  };

  const handleGeneratePrompt = async (): Promise<void> => {
    if (!entry || !isPrompt(entry)) {
      return;
    }

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
</script>

<div class="flex h-full flex-col">
  <div class="flex h-11 shrink-0 items-center justify-between px-4 text-xs">
    <div class="flex items-center gap-3">
      <div class="relative" data-project-menu>
        <button
          class="hover:text-accent disabled:text-muted disabled:hover:text-muted flex cursor-pointer items-center gap-1 rounded px-1.5 py-1.5"
          title="Select Project"
          onclick={() => {
            if (!entry) return;
            projectMenuOpen = !projectMenuOpen;
          }}
          disabled={!entry}
        >
          <Folder class="text-sm" />
          <span>
            {#if selectedProjectPath}
              {projects.find((project) => project.path === selectedProjectPath)
                ?.name ?? "Custom Project"}
            {:else}
              Select project
            {/if}
          </span>
        </button>
        {#if projectMenuOpen}
          <div
            class="bg-surface border-border absolute top-full left-0 z-20 mt-1 w-52 rounded-md border p-1 text-xs shadow-lg"
          >
            {#if projects.length === 0}
              <div class="text-muted px-2 py-1.5">
                No projects yet. Add one first.
              </div>
            {:else}
              {#each projects as project (project.path)}
                <button
                  type="button"
                  class={`hover:bg-border flex w-full items-center justify-between rounded px-2 py-1.5 text-left ${
                    project.path === selectedProjectPath
                      ? "text-accent"
                      : "text-foreground"
                  }`}
                  onclick={() => selectProject(project.path)}
                >
                  <span class="truncate">{project.name}</span>
                  {#if project.path === selectedProjectPath}
                    <CheckLg class="text-[10px]" />
                  {/if}
                </button>
              {/each}
            {/if}
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
          class="hover:text-accent disabled:text-muted disabled:hover:text-muted flex cursor-pointer items-center gap-1 rounded px-1.5 py-1.5"
          title="Select Model"
          onclick={() => {
            if (!entry) return;
            modelMenuOpen = !modelMenuOpen;
          }}
          disabled={!entry}
        >
          <Cpu class="text-sm" />
          <span>
            {enabledModels.find((item) => item.modelId === selectedModelId)
              ?.modelId ?? "Select model"}
          </span>
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
                  class={`hover:bg-border flex w-full items-center justify-between rounded px-2 py-1.5 text-left ${
                    model.modelId === selectedModelId
                      ? "text-accent"
                      : "text-foreground"
                  }`}
                  onclick={() => selectModel(model.modelId)}
                >
                  <span class="truncate">{model.modelId}</span>
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
        class="hover:text-accent disabled:text-muted disabled:hover:text-muted cursor-pointer rounded p-1.5"
        onclick={() => void handleAttach()}
        disabled={!entry || isChatSession(entry)}
      >
        <Paperclip class="text-sm" />
      </button>
    </div>

    <div class="flex items-center gap-3">
      {#if status}
        <div
          class={`text-xs ${
            status.tone === "success"
              ? "text-accent"
              : status.tone === "error"
                ? "text-red-400"
                : status.tone === "warning"
                  ? "text-yellow-400"
                  : "text-muted"
          }`}
        >
          {status.message}
        </div>
      {/if}
      <div class="flex items-center gap-2">
        <button
          class={`cursor-pointer rounded p-1.5 ${
            recordingState === "recording" ? "text-accent" : "hover:text-accent"
          } disabled:text-muted disabled:hover:text-muted`}
          title="Record Audio"
          onclick={() => void startAudioRecording()}
          disabled={!entry || isChatSession(entry)}
        >
          <MicFill class="text-sm" />
        </button>
        <button
          class="hover:text-accent disabled:text-muted disabled:hover:text-muted cursor-pointer rounded p-1.5"
          title="Generate Prompt"
          onclick={() => void handleGeneratePrompt()}
          disabled={!entry || isChatSession(entry) || isSubmitting}
        >
          <Stars class="text-sm" />
        </button>
        <button
          class={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${
            entry && isChatSession(entry)
              ? "hover:text-accent"
              : "hover:text-accent"
          } disabled:text-muted disabled:hover:text-muted`}
          title={entry
            ? isChatSession(entry)
              ? "Open Chat Surface"
              : "Send Prompt"
            : ""}
          onclick={() => void handlePrimaryAction()}
          disabled={!entry || isSubmitting}
        >
          {#if entry && isChatSession(entry)}
            <BoxArrowUpRight class="text-sm" />
            <span>Open</span>
          {:else}
            <Send class="text-sm" />
            <span>Send</span>
          {/if}
        </button>
      </div>
    </div>
  </div>

  <div class="flex flex-1 flex-col p-3">
    {#if !entry}
      <div class="text-muted flex h-full items-center justify-center text-sm">
        Select a prompt to start editing.
      </div>
    {:else if isChatSession(entry)}
      <div
        class="text-muted flex h-full flex-col items-center justify-center gap-2 text-sm"
      >
        <div>Chat Session</div>
        <div class="text-xs">Click "Open" to view in the chat surface</div>
      </div>
    {:else}
      <textarea
        id="prompt-editor"
        placeholder="Enter your prompt here. Use '/' for commands, or @path/to/file to reference files."
        class="bg-background text-foreground placeholder:text-muted h-full w-full resize-none px-3 py-2 text-sm leading-6 outline-none"
        bind:this={textareaElement}
        value={promptValue}
        oninput={(event) => {
          promptValue = event.currentTarget.value;
        }}
        onkeydown={handleEditorKeydown}
      ></textarea>
    {/if}
  </div>
</div>
