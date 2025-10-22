<!-- src/renderer/src/windows/quick-prompt/QuickPromptApp.svelte -->
<script lang="ts">
  import path from "node:path";
  import { onMount, onDestroy } from "svelte";
  import { fade } from "svelte/transition";
  import { Logger } from "tslog";
  import {
    Folder,
    Cpu,
    Paperclip,
    Mic,
    Stars,
    Send,
    ChevronDown,
    CheckCircle,
    XLg,
  } from "svelte-bootstrap-icons";
  import {
    chatSettings,
    getAvailableModelsAsList,
    setChatSession,
  } from "../../stores/chat.svelte.js";
  import { projectState } from "../../stores/project-store.svelte.js";
  import { projectService } from "../../services/project-service.js";
  import { modelClientService } from "../../services/model-client-service.js";
  import { documentClientService } from "../../services/document-client-service.js";
  import { apiChatService } from "../../services/api-chat-service.js";
  import { trpcClient } from "../../lib/trpc-client.js";
  import {
    getModelSurface,
    type ModelSurface,
  } from "../../../../shared/utils/model-utils.js";
  import type { ProjectFolder } from "../../stores/project-store.svelte.js";

  const logger = new Logger({ name: "QuickPromptApp" });

  const promptTemplates: PromptTemplate[] = [
    {
      id: "bug-investigation",
      label: "Bug Investigation",
      description:
        "Document symptoms, reproduction steps, and expected behaviour.",
      build: ({ projectName, attachments }) => {
        const header = projectName
          ? `Project: ${projectName}\n`
          : "Project context: (fill in project name)\n";
        const attachmentLines =
          attachments.length > 0
            ? attachments.map((entry) => `- @${entry.relativePath}`).join("\n")
            : "- Attach relevant stack traces or source files.";

        return `${header}
Issue Summary:
- What is the unexpected behaviour?

Reproduction Steps:
1. 
2. 

Observed Behaviour:
- Describe what currently happens.

Expected Behaviour:
- Describe what should happen instead.

Relevant Files:
${attachmentLines}

Request:
- Investigate the root cause and outline the fix.`;
      },
    },
    {
      id: "feature-implementation",
      label: "Feature Implementation",
      description: "Outline user story, acceptance criteria, and constraints.",
      build: ({ projectName, attachments }) => {
        const header = projectName
          ? `Implement a feature for ${projectName}.\n`
          : "Implement a new feature for this project.\n";
        const attachmentLines =
          attachments.length > 0
            ? attachments.map((entry) => `- @${entry.relativePath}`).join("\n")
            : "- Attach design docs or related files.";

        return `${header}
User Story:
- As a ..., I want ...

Acceptance Criteria:
- [ ] Criterion 1
- [ ] Criterion 2

Constraints:
- Note any technical or product constraints.

Reference Material:
${attachmentLines}

Deliverables:
- Provide implementation details.
- Include tests and update documentation as needed.`;
      },
    },
    {
      id: "refactor-plan",
      label: "Refactor Plan",
      description: "Summarise current state, risks, and desired improvements.",
      build: ({ projectName, attachments }) => {
        const header = projectName
          ? `Refactor plan for ${projectName} component.\n`
          : "Refactor plan for the current component.\n";
        const attachmentLines =
          attachments.length > 0
            ? attachments.map((entry) => `- @${entry.relativePath}`).join("\n")
            : "- Attach files that need restructuring.";

        return `${header}
Current State:
- Summarise the existing implementation and pain points.

Goals:
- List the improvements the refactor should deliver.

Risks:
- Identify potential regressions or dependency impacts.

Key Files:
${attachmentLines}

Plan:
- Outline the sequence of changes.
- Highlight testing strategy.`;
      },
    },
  ];

  interface LaunchChatPayload {
    scriptPath: string;
    sessionId: string;
    projectPath: string | null;
    modelId: `${string}/${string}`;
    closeQuickPromptWindow?: boolean;
    focusMainWindow?: boolean;
  }

  interface AttachmentEntry {
    absolutePath: string;
    relativePath: string;
  }

  interface TemplateContext {
    projectName: string | null;
    attachments: AttachmentEntry[];
  }

  interface PromptTemplate {
    id: string;
    label: string;
    description: string;
    build: (context: TemplateContext) => string;
  }

  type StatusType = "info" | "success" | "error" | "warning";

  let promptValue = $state("");
  let textareaElement = $state<HTMLTextAreaElement | null>(null);
  let selectedProjectPath = $state<string | null>(null);
  let projectMenuOpen = $state(false);
  let modelMenuOpen = $state(false);
  let generatorMenuOpen = $state(false);
  let isSubmitting = $state(false);
  let hasFocusedEditor = $state(false);
  let status = $state<{ message: string; type: StatusType } | null>(null);
  let statusTimeout = $state<number | null>(null);
  let recordingState = $state<"idle" | "recording" | "unavailable">("idle");
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks = $state<Blob[]>([]);
  let attachments = $state<AttachmentEntry[]>([]);

  const projects = $derived(projectState.projectFolders);
  const allModels = $derived.by(getAvailableModelsAsList);
  const enabledModels = $derived(allModels.filter((model) => model.enabled));
  const selectedModelId = $derived(chatSettings.selectedModel);

  const projectPreferenceKey = "quickPromptProjectPath";

  const closeMenus = (): void => {
    projectMenuOpen = false;
    modelMenuOpen = false;
    generatorMenuOpen = false;
  };

  const updatePromptFromEvent = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) {
      return;
    }
    promptValue = target.value;
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void launchChat();
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
      if (attachments.length > 0) {
        // Remove any attachment references from the prompt when switching projects
        for (const attachment of attachments) {
          removeAttachmentReference(attachment.relativePath);
        }
        attachments = [];
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

  const ensureAttachmentReference = (relativePath: string): void => {
    const marker = `@${relativePath}`;
    if (promptValue.includes(marker)) {
      return;
    }

    const needsLeadingNewline =
      promptValue.length > 0 && !promptValue.endsWith("\n");
    promptValue = `${promptValue}${needsLeadingNewline ? "\n" : ""}${marker}\n`;

    queueMicrotask(() => {
      const cursor = promptValue.length;
      textareaElement?.setSelectionRange(cursor, cursor);
    });
  };

  const removeAttachmentReference = (relativePath: string): void => {
    const marker = `@${relativePath}`;
    const index = promptValue.indexOf(marker);
    if (index === -1) {
      return;
    }

    const lineStart = promptValue.lastIndexOf("\n", index - 1);
    const sliceStart = lineStart === -1 ? 0 : lineStart + 1;

    let lineEnd = promptValue.indexOf("\n", index + marker.length);
    if (lineEnd === -1) {
      lineEnd = promptValue.length;
    } else {
      lineEnd += 1;
    }

    promptValue = `${promptValue.slice(0, sliceStart)}${promptValue.slice(lineEnd)}`;
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

      const newEntries: AttachmentEntry[] = [];

      for (const filePath of filePaths) {
        const absolutePath = path.resolve(filePath);

        if (
          attachments.some(
            (attachment) => attachment.absolutePath === absolutePath,
          )
        ) {
          continue;
        }

        let relativePath: string;
        if (project && absolutePath.startsWith(project.path)) {
          relativePath = path.relative(project.path, absolutePath);
        } else {
          relativePath = absolutePath;
        }
        const normalized = relativePath.replace(/\\/g, "/");

        newEntries.push({
          absolutePath,
          relativePath: normalized,
        });
      }

      if (!newEntries.length) {
        return;
      }

      attachments = [...attachments, ...newEntries];
      for (const entry of newEntries) {
        ensureAttachmentReference(entry.relativePath);
      }

      applyStatus(
        newEntries.length === 1
          ? `Attached @${newEntries[0].relativePath}.`
          : `Attached ${newEntries.length} files.`,
        "success",
      );
    } catch (error) {
      logger.error("Failed to attach files", error);
      applyStatus(
        error instanceof Error ? error.message : "Failed to attach files.",
        "error",
        0,
      );
    }
  };

  const handleRemoveAttachment = (attachment: AttachmentEntry): void => {
    attachments = attachments.filter(
      (item) => item.absolutePath !== attachment.absolutePath,
    );
    removeAttachmentReference(attachment.relativePath);
    applyStatus(`Removed @${attachment.relativePath} from the prompt.`, "info");
  };

  const toggleTemplateMenu = (event: MouseEvent): void => {
    event.stopPropagation();
    const nextState = !generatorMenuOpen;
    closeMenus();
    generatorMenuOpen = nextState;
  };

  const applyTemplate = (template: PromptTemplate): void => {
    const project = getSelectedProject();
    promptValue = `${template
      .build({
        projectName: project?.name ?? null,
        attachments,
      })
      .trim()}\n`;
    generatorMenuOpen = false;
    applyStatus(`Applied "${template.label}" template.`, "success");
    queueMicrotask(ensureInitialFocus);
  };

  const handleCloseWindow = async (): Promise<void> => {
    await window.api.quickPromptWindow.hide();
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

          const audioEntry: AttachmentEntry = {
            absolutePath,
            relativePath: absolutePath,
          };

          attachments = [...attachments, audioEntry];
          ensureAttachmentReference(absolutePath);
          applyStatus(`Audio saved: @${absolutePath}`, "success");
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

  const launchChat = async (): Promise<void> => {
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

    const initialSurface: ModelSurface = getModelSurface(selectedModelId);
    const requiresWorkingDirectory = initialSurface === "terminal";
    if (requiresWorkingDirectory && !selectedProjectPath) {
      applyStatus(
        "Select a project folder before launching a terminal model.",
        "error",
        0,
      );
      return;
    }

    isSubmitting = true;
    applyStatus("Creating prompt script and launching chat…", "info", 0);

    try {
      const script = await documentClientService.createPromptScriptWithContent(
        selectedProjectPath ?? undefined,
        trimmedPrompt,
      );

      const firstLine =
        trimmedPrompt
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line.length > 0) ?? "New Prompt";

      const session = await trpcClient.chat.createSession.mutate({
        modelId: selectedModelId,
        title: firstLine.slice(0, 120),
        workingDirectory: requiresWorkingDirectory
          ? (selectedProjectPath ?? undefined)
          : undefined,
        script: {
          path: script.absolutePath,
          snapshot: trimmedPrompt,
        },
      });

      setChatSession(session);

      await documentClientService.linkPromptScriptToChatSession(
        script.absolutePath,
        session.id,
      );

      if (session.sessionType === "chat_engine") {
        await apiChatService.sendMessage({
          sessionId: session.id,
          prompt: trimmedPrompt,
        });
      }

      const payload: LaunchChatPayload = {
        scriptPath: script.absolutePath,
        sessionId: session.id,
        projectPath: selectedProjectPath,
        modelId: selectedModelId,
      };

      const sessionSurface: ModelSurface =
        session.metadata?.modelSurface ?? initialSurface;

      let shouldCloseQuickPromptWindow = sessionSurface === "api";
      let shouldFocusMainWindow = shouldCloseQuickPromptWindow;
      let finalStatus: { message: string; type: StatusType } | null = null;

      if (sessionSurface !== "api") {
        try {
          const result = await window.api.surface.launch({
            sessionId: session.id,
            modelId: selectedModelId,
            modelSurface: sessionSurface,
            projectPath: selectedProjectPath,
          });

          if (result.success) {
            shouldCloseQuickPromptWindow = true;
            shouldFocusMainWindow = true;
          } else {
            finalStatus = {
              message:
                result.error ??
                "Failed to launch the selected surface. Try again.",
              type: "error",
            };
          }
        } catch (surfaceError) {
          logger.error("Surface launch failed", surfaceError);
          finalStatus = {
            message:
              surfaceError instanceof Error
                ? surfaceError.message
                : "Surface launch failed.",
            type: "error",
          };
        }
      }

      const notifiedMainWindow = await window.api.quickPrompt.launchChat({
        ...payload,
        closeQuickPromptWindow: shouldCloseQuickPromptWindow,
        focusMainWindow: shouldFocusMainWindow,
      });

      if (!notifiedMainWindow && (!finalStatus || finalStatus.type !== "error")) {
        finalStatus = {
          message: "Main window is unavailable. Review the chat from the chat list.",
          type: "warning",
        };
      }

      if (shouldCloseQuickPromptWindow) {
        promptValue = "";
        if (!finalStatus || finalStatus.type !== "error") {
          finalStatus = {
            message:
              session.sessionType === "chat_engine"
                ? "Chat launched in the main window."
                : "External chat launched in the main window.",
            type: "success",
          };
        }
      } else if (!finalStatus) {
        finalStatus = {
          message: "Chat session created. Launch the surface when you're ready.",
          type: "info",
        };
      }

      if (finalStatus) {
        applyStatus(finalStatus.message, finalStatus.type, 0);
      }
    } catch (error) {
      logger.error("Failed to launch chat from quick prompt", error);
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

      if (!event.target.closest("[data-generator-menu]")) {
        generatorMenuOpen = false;
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

<div class="bg-surface text-foreground flex h-full flex-col">
  <header
    class="window-drag flex h-12 flex-shrink-0 items-center justify-between px-4"
  >
    <div class="no-drag flex items-center gap-3">
      <div class="relative" data-project-menu>
        <button
          type="button"
          class="text-muted hover:text-accent flex items-center gap-1 rounded px-2 py-1 text-sm transition-colors"
          onclick={(event) => {
            event.stopPropagation();
            projectMenuOpen = !projectMenuOpen;
            if (projectMenuOpen) {
              modelMenuOpen = false;
              generatorMenuOpen = false;
            }
          }}
        >
          <Folder class="text-base" />
          <span class="max-w-[160px] truncate">
            {selectedProjectPath
              ? (projects.find(
                  (project) => project.path === selectedProjectPath,
                )?.name ?? selectedProjectPath)
              : "Select project"}
          </span>
          <ChevronDown class="text-xs opacity-70" />
        </button>

        {#if projectMenuOpen}
          <div
            class="bg-background text-foreground border-border absolute top-full left-0 z-20 mt-2 min-w-[220px] overflow-hidden rounded-md border shadow-lg"
          >
            <button
              type="button"
              class="hover:bg-hover text-accent flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm font-medium transition-colors"
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
              <div class="border-border border-t"></div>
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
          class="text-muted hover:text-accent flex items-center gap-1 rounded px-2 py-1 text-sm transition-colors"
          onclick={(event) => {
            event.stopPropagation();
            modelMenuOpen = !modelMenuOpen;
            if (modelMenuOpen) {
              projectMenuOpen = false;
              generatorMenuOpen = false;
            }
          }}
        >
          <Cpu class="text-base" />
          <span class="max-w-[160px] truncate">
            {selectedModelId ?? "Select model"}
          </span>
          <ChevronDown class="text-xs opacity-70" />
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
        class="text-muted hover:text-accent rounded p-1.5 transition-colors"
        title="Attach files"
        onclick={handleAttach}
      >
        <Paperclip class="text-base" />
      </button>
    </div>

    {#if status}
      <div
        transition:fade={{ duration: 200 }}
        class="absolute left-1/2 top-2 -translate-x-1/2 rounded-md px-3 py-1 text-xs"
        class:bg-accent={status.type === "success"}
        class:text-background={status.type === "success"}
        class:bg-foreground={status.type === "error"}
        class:text-background={status.type === "error"}
        class:bg-hover={status.type === "warning" || status.type === "info"}
        class:text-foreground={
          status.type === "warning" || status.type === "info"
        }
      >
        {status.message}
      </div>
    {/if}

    <div class="no-drag flex items-center gap-2">
      <button
        type="button"
        class="text-muted hover:text-accent rounded p-1.5 transition-colors"
        class:opacity-60={recordingState === "unavailable"}
        class:animate-pulse={recordingState === "recording"}
        title={recordingState === "recording"
          ? "Stop recording"
          : "Record audio"}
        onclick={() => void startAudioRecording()}
      >
        <Mic class="text-base" />
      </button>
      <div class="relative" data-generator-menu>
        <button
          type="button"
          class="text-muted hover:text-accent rounded p-1.5 transition-colors"
          title="Prompt templates"
          onclick={toggleTemplateMenu}
        >
          <Stars class="text-base" />
        </button>

        {#if generatorMenuOpen}
          <div
            class="bg-background text-foreground border-border absolute top-full right-0 z-20 mt-2 w-64 overflow-hidden rounded-md border shadow-lg"
          >
            {#each promptTemplates as template (template.label)}
              <button
                type="button"
                class="hover:bg-hover w-full px-3 py-2 text-left transition-colors"
                onclick={() => applyTemplate(template)}
              >
                <div class="flex flex-col gap-1">
                  <span class="text-foreground text-sm font-medium">
                    {template.label}
                  </span>
                  <span class="text-muted text-xs leading-snug">
                    {template.description}
                  </span>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
      <button
        type="button"
        class="bg-accent text-background flex items-center gap-1 rounded px-3 py-1.5 text-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        title="Launch chat"
        disabled={isSubmitting}
        onclick={() => void launchChat()}
      >
        <Send class="text-sm" />
        <span>{isSubmitting ? "Launching…" : "Send"}</span>
      </button>
    </div>
  </header>

  {#if attachments.length > 0}
    <div class="flex flex-wrap gap-2 px-4 pb-2 text-xs">
      {#each attachments as attachment (attachment.absolutePath)}
        <span
          class="bg-hover text-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5"
        >
          @{attachment.relativePath}
          <button
            type="button"
            title="Remove attachment"
            class="hover:text-accent text-muted transition-colors"
            onclick={() => handleRemoveAttachment(attachment)}
          >
            <XLg class="text-[10px]" />
          </button>
        </span>
      {/each}
    </div>
  {/if}

  <main class="flex-1">
    <textarea
      bind:this={textareaElement}
      placeholder="Prompt editor, use '/' for commands, or @path/to/file"
      class="h-full w-full resize-none border-none bg-surface p-4 text-sm leading-6 text-foreground outline-none scrollbar-thin placeholder:text-sm placeholder:text-muted"
      value={promptValue}
      oninput={updatePromptFromEvent}
      onkeydown={handleKeyDown}
    ></textarea>
  </main>
</div>

<!-- <style>
  .window-drag {
    -webkit-app-region: drag;
  }
  .no-drag {
    -webkit-app-region: no-drag;
  }
</style> -->
