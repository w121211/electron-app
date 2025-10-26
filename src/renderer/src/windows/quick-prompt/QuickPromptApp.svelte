<!-- src/renderer/src/windows/quick-prompt/QuickPromptdApp.svelte -->
<script lang="ts">
  import path from "node:path";
  import { onMount, onDestroy } from "svelte";
  import { fade } from "svelte/transition";
  import { Logger } from "tslog";
  import {
    Folder,
    Paperclip,
    Mic,
    Stars,
    Send,
    CheckCircle,
    Clipboard,
    LightningChargeFill,
    Cone,
    MicFill,
  } from "svelte-bootstrap-icons";
  import {
    chatSettings,
    getAvailableModelsAsList,
  } from "../../stores/chat.svelte.js";
  import { projectState } from "../../stores/project-store.svelte.js";
  import { projectService } from "../../services/project-service.js";
  import { modelClientService } from "../../services/model-client-service.js";
  import {
    launchChat,
    generatePrompt,
  } from "../../services/quick-prompt-service.js";
  import type { ProjectFolder } from "../../stores/project-store.svelte.js";
  import { createFileMention } from "../../../../core/utils/message-utils.js";

  const logger = new Logger({ name: "QuickPromptdApp" });

  type StatusType = "info" | "success" | "error" | "warning";

  let promptValue = $state("");
  let textareaElement = $state<HTMLTextAreaElement | null>(null);
  let selectedProjectPath = $state<string | null>(null);
  let projectMenuOpen = $state(false);
  let modelMenuOpen = $state(false);
  let isSubmitting = $state(false);
  let hasFocusedEditor = $state(false);
  let status = $state<{ message: string; type: StatusType } | null>(null);
  let statusTimeout = $state<number | null>(null);
  let recordingState = $state<"idle" | "recording" | "unavailable">("idle");
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks = $state<Blob[]>([]);

  const projects = $derived(projectState.projectFolders);
  const allModels = $derived.by(getAvailableModelsAsList);
  const enabledModels = $derived(allModels.filter((model) => model.enabled));
  const selectedModelId = $derived(chatSettings.selectedModel);

  const projectPreferenceKey = "quickPromptProjectPath";

  const closeMenus = (): void => {
    projectMenuOpen = false;
    modelMenuOpen = false;
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void handleLaunchChat();
    }
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

  const selectModel = (modelId: `${string}/${string}`): void => {
    modelClientService.selectModel(modelId);
    closeMenus();
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

  const handleGeneratePlaceholder = async (): Promise<void> => {
    const trimmedInput = promptValue.trim();
    if (!trimmedInput) {
      applyStatus("Enter a description to generate a prompt.", "error");
      return;
    }

    if (isSubmitting) {
      return;
    }

    isSubmitting = true;
    applyStatus("Generating prompt…", "info", 0);

    try {
      const { generatedPrompt } = await generatePrompt(trimmedInput);

      // Format the prompt with raw input as comment + generated content
      promptValue = `<!-- raw prompt\n${trimmedInput}\n-->\n\n${generatedPrompt}`;

      applyStatus("Prompt generated successfully.", "success");
      textareaElement?.focus();
    } catch (error) {
      logger.error("Failed to generate prompt", error);
      applyStatus(
        error instanceof Error
          ? error.message
          : "Failed to generate prompt. Try again.",
        "error",
        0,
      );
    } finally {
      isSubmitting = false;
    }
  };

  const handleCopyPrompt = async (): Promise<void> => {
    const trimmed = promptValue.trim();
    if (!trimmed) {
      applyStatus("Nothing to copy yet.", "info");
      return;
    }

    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      applyStatus("Clipboard unavailable.", "error", 0);
      return;
    }

    try {
      await navigator.clipboard.writeText(trimmed);
      applyStatus("Prompt copied to clipboard.", "success", 2000);
    } catch (error) {
      logger.error("Failed to copy prompt", error);
      applyStatus(
        error instanceof Error ? error.message : "Clipboard unavailable.",
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
        error instanceof Error
          ? error.message
          : "Microphone access denied or unavailable.",
        "error",
        0,
      );
      setTimeout(() => {
        recordingState = "idle";
      }, 2000);
    }
  };

  const ensureInitialFocus = (): void => {
    if (!hasFocusedEditor && textareaElement) {
      textareaElement.focus();
      textareaElement.setSelectionRange(promptValue.length, promptValue.length);
      hasFocusedEditor = true;
    }
  };

  const applyStatus = (
    message: string,
    type: StatusType = "info",
    duration = 4000,
  ): void => {
    status = { message, type };
    if (statusTimeout) {
      clearTimeout(statusTimeout);
    }
    if (duration > 0) {
      statusTimeout = window.setTimeout(() => {
        status = null;
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

  const loadInitialData = async (): Promise<void> => {
    try {
      const shouldLoadProjects = projectState.projectFolders.length === 0;
      const shouldLoadModels = allModels.length === 0;

      await Promise.all([
        shouldLoadProjects
          ? projectService.loadProjectFolders()
          : Promise.resolve(),
        shouldLoadModels
          ? modelClientService.hydrateAvailableModels()
          : Promise.resolve(),
      ]);

      const projectFolders = projectState.projectFolders;

      const storedProject = localStorage.getItem(projectPreferenceKey);
      if (
        storedProject &&
        projectFolders.some((folder) => folder.path === storedProject)
      ) {
        selectedProjectPath = storedProject;
      } else {
        selectedProjectPath = projectFolders[0]?.path ?? null;
      }

      const availableOptions = getAvailableModelsAsList().filter(
        (option) => option.enabled,
      );

      if (availableOptions.length === 0) {
        applyStatus(
          "No enabled models found. Configure providers in the main app.",
          "error",
          0,
        );
        return;
      }

      if (
        !availableOptions.some((option) => option.modelId === selectedModelId)
      ) {
        const fallback = availableOptions[0]?.modelId;
        if (fallback) {
          modelClientService.selectModel(fallback);
        }
      }
    } catch (error) {
      logger.error("Failed to load quick prompt metadata", error);
      applyStatus(
        error instanceof Error
          ? error.message
          : "Failed to load quick prompt metadata.",
        "error",
        0,
      );
    }
  };

  const handleLaunchChat = async (): Promise<void> => {
    if (isSubmitting) {
      return;
    }

    const trimmedPrompt = promptValue.trim();
    if (!trimmedPrompt) {
      applyStatus(
        "Enter a prompt or use voice input before launching.",
        "error",
      );
      return;
    }

    if (!selectedModelId) {
      applyStatus("Select an enabled model to continue.", "error", 0);
      return;
    }

    isSubmitting = true;
    applyStatus("Creating chat session…", "info", 0);

    try {
      await launchChat({
        prompt: trimmedPrompt,
        modelId: selectedModelId,
        projectPath: selectedProjectPath,
      });

      promptValue = "";
      applyStatus("Chat launched in the main window.", "success", 0);

      await window.api.mainWindow.focus();
      await window.api.quickPromptWindow.hide();
    } catch (error) {
      logger.error("Failed to launch chat", error);
      applyStatus(
        error instanceof Error
          ? error.message
          : "Failed to launch chat. Try again.",
        "error",
        0,
      );
    } finally {
      isSubmitting = false;
    }
  };

  onMount(() => {
    loadInitialData().catch((error) => {
      logger.error("Quick prompt initialization failed", error);
      applyStatus(
        error instanceof Error
          ? error.message
          : "Quick prompt initialization failed.",
        "error",
        0,
      );
    });

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

    const handleVisibilityChange = (): void => {
      if (document.hidden) {
        closeMenus();
      }
    };

    window.addEventListener("pointerdown", handleGlobalPointer);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pointerdown", handleGlobalPointer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  });

  onDestroy(() => {
    if (mediaRecorder && recordingState === "recording") {
      mediaRecorder.stop();
    }
    if (statusTimeout) {
      clearTimeout(statusTimeout);
    }
  });

  $effect(() => {
    ensureInitialFocus();
  });
</script>

<div class="bg-surface text-foreground flex h-screen flex-col">
  <header
    class="window-drag flex h-12 shrink-0 items-center justify-between px-4"
  >
    <div class="no-drag flex items-center">
      <div class="relative" data-project-menu>
        <button
          type="button"
          class="text-muted hover:text-accent flex items-center gap-1 rounded-md p-1.5 text-sm transition-colors"
          onclick={(event) => {
            event.stopPropagation();
            projectMenuOpen = !projectMenuOpen;
            if (projectMenuOpen) {
              modelMenuOpen = false;
            }
          }}
        >
          <Folder class="text-base" />
          <span
            class="max-w-[160px] truncate"
            class:italic={!selectedProjectPath}
          >
            {selectedProjectPath
              ? (projects.find(
                  (project) => project.path === selectedProjectPath,
                )?.name ?? selectedProjectPath)
              : "none"}
          </span>
        </button>

        {#if projectMenuOpen}
          <div
            class="bg-background text-foreground border-border absolute top-full left-0 z-20 mt-2 min-w-[220px] overflow-hidden rounded-md border shadow-lg"
          >
            <button
              type="button"
              class="hover:bg-hover text-accent flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium transition-colors"
              onclick={handleAddNewProject}
            >
              <span>+ Add New Project</span>
            </button>
            <button
              type="button"
              class="hover:bg-hover flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors"
              onclick={() => selectProject(null)}
            >
              <span class="text-muted italic">None</span>
              {#if selectedProjectPath === null}
                <CheckCircle class="text-accent text-sm" />
              {/if}
            </button>
            {#if projects.length > 0}
              <div class=""></div>
              {#each projects as project (project.path)}
                <button
                  type="button"
                  class="hover:bg-hover flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors"
                  onclick={() => selectProject(project.path)}
                >
                  <span class="truncate">{project.name}</span>
                  {#if selectedProjectPath === project.path}
                    <CheckCircle class="text-accent text-sm" />
                  {/if}
                </button>
              {/each}
            {/if}
          </div>
        {/if}
      </div>

      <div class="relative" data-model-menu>
        <button
          type="button"
          class="text-muted hover:text-accent flex items-center gap-1 rounded-md p-1.5 text-sm transition-colors"
          onclick={(event) => {
            event.stopPropagation();
            modelMenuOpen = !modelMenuOpen;
            if (modelMenuOpen) {
              projectMenuOpen = false;
            }
          }}
        >
          <LightningChargeFill class="text-base" />
          <span class="max-w-[160px] truncate">
            {selectedModelId ?? "Select model"}
          </span>
        </button>

        {#if modelMenuOpen}
          <div
            class="bg-background text-foreground border-border absolute top-full left-0 z-20 mt-2 min-w-[220px] overflow-hidden rounded-md border shadow-lg"
          >
            {#if enabledModels.length === 0}
              <div class="text-muted px-3 py-2 text-sm">
                Enable a model in the main application.
              </div>
            {:else}
              {#each enabledModels as model (model.modelId)}
                <button
                  type="button"
                  class="hover:bg-hover flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors"
                  onclick={() => selectModel(model.modelId)}
                >
                  <span class="truncate">{model.modelId}</span>
                  {#if selectedModelId === model.modelId}
                    <CheckCircle class="text-accent text-sm" />
                  {/if}
                </button>
              {/each}
            {/if}
          </div>
        {/if}
      </div>

      <button
        type="button"
        class="text-muted hover:text-accent rounded-md p-1.5 transition-colors"
        title="Attach files"
        onclick={handleAttach}
      >
        <Paperclip class="text-base" />
      </button>
    </div>

    <div class="no-drag flex items-center gap-2">
      <button
        type="button"
        class="text-muted hover:text-accent rounded-md p-1.5 transition-colors"
        class:opacity-60={recordingState === "unavailable"}
        title={recordingState === "recording"
          ? "Stop recording"
          : "Record audio"}
        onclick={startAudioRecording}
      >
        {#if recordingState === "recording"}
          <MicFill class="text-accent animate-pulse text-base " />
        {:else}
          <Mic class="text-base" />
        {/if}
      </button>
      <button
        type="button"
        class="text-muted hover:text-accent rounded-md p-1.5 transition-colors"
        title="Generate prompt"
        onclick={handleGeneratePlaceholder}
      >
        <Stars class="text-base" />
      </button>
      <button
        type="button"
        class="text-muted hover:text-accent rounded-md p-1.5 transition-colors"
        title="Copy prompt"
        onclick={() => void handleCopyPrompt()}
      >
        <Clipboard class="text-base" />
      </button>
      <button
        type="button"
        class="text-muted hover:text-accent flex items-center gap-1 rounded-md p-1.5 text-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        title="Launch chat"
        disabled={isSubmitting}
        onclick={() => void handleLaunchChat()}
      >
        <Send class="text-sm" />
        <span>{isSubmitting ? "Launching…" : "Send"}</span>
      </button>
    </div>
  </header>

  {#if status}
    <div
      transition:fade={{ duration: 200 }}
      class="text-foreground mx-4 mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs"
    >
      <Cone class="shrink-0 text-sm" />
      <span>{status.message}</span>
    </div>
  {/if}

  <main class="flex flex-1 px-4 pt-3 pb-4">
    <textarea
      bind:this={textareaElement}
      bind:value={promptValue}
      placeholder="Prompt editor, use '/' for commands, or @path/to/file"
      class="text-foreground scrollbar-thin placeholder:text-muted h-full w-full flex-1 resize-none border-none bg-transparent text-sm leading-6 outline-none"
      onkeydown={handleKeyDown}
    ></textarea>
  </main>
</div>

<style>
  .window-drag {
    -webkit-app-region: drag;
  }
  .no-drag {
    -webkit-app-region: no-drag;
  }
</style>
