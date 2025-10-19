<!-- src/renderer/src/windows/quick-prompt/PromptApp.svelte -->
<script lang="ts">
  import path from "node:path";
  import { onMount, onDestroy } from "svelte";
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
    ExclamationTriangle,
    XLg,
  } from "svelte-bootstrap-icons";
  import {
    chatSettings,
    getAvailableModelsAsList,
  } from "../../stores/chat.svelte.js";
  import { projectState } from "../../stores/project-store.svelte.js";
  import { projectService } from "../../services/project-service.js";
  import { modelClientService } from "../../services/model-client-service.js";
  import { documentClientService } from "../../services/document-client-service.js";
  import { apiChatService } from "../../services/api-chat-service.js";
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

  interface MinimalRecognitionResultItem {
    transcript: string;
  }

  interface MinimalRecognitionResult {
    isFinal: boolean;
    length: number;
    [index: number]: MinimalRecognitionResultItem;
  }

  interface MinimalRecognitionEvent {
    results: Array<MinimalRecognitionResult>;
  }

  interface MinimalSpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start: () => void;
    stop: () => void;
    abort: () => void;
    onstart: (() => void) | null;
    onend: (() => void) | null;
    onerror: ((event: { error?: string }) => void) | null;
    onresult: ((event: MinimalRecognitionEvent) => void) | null;
  }

  interface SpeechRecognitionConstructor {
    new (): MinimalSpeechRecognition;
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
  let recordingState = $state<"idle" | "listening" | "unavailable">("idle");
  let recognitionInstance: MinimalSpeechRecognition | null = null;
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

  const getSpeechRecognitionConstructor =
    (): SpeechRecognitionConstructor | null => {
      const win = window as typeof window & {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
      };

      if (win.SpeechRecognition) {
        return win.SpeechRecognition;
      }

      if (win.webkitSpeechRecognition) {
        return win.webkitSpeechRecognition;
      }

      return null;
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

  const selectProject = (projectPath: string): void => {
    if (selectedProjectPath !== projectPath) {
      selectedProjectPath = projectPath;
      localStorage.setItem(projectPreferenceKey, projectPath);
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
    if (!project) {
      applyStatus("Select a project before attaching files.", "error");
      return;
    }

    try {
      const filePaths =
        (await window.api.quickPrompt.selectFiles({
          defaultPath: project.path,
        })) ?? [];

      if (!filePaths.length) {
        return;
      }

      const newEntries: AttachmentEntry[] = [];

      for (const filePath of filePaths) {
        const absolutePath = path.resolve(filePath);
        if (!absolutePath.startsWith(project.path)) {
          applyStatus(
            `Skipped ${path.basename(filePath)} because it is outside the selected project.`,
            "warning",
          );
          continue;
        }

        if (
          attachments.some(
            (attachment) => attachment.absolutePath === absolutePath,
          )
        ) {
          continue;
        }

        const relativePath = path.relative(project.path, absolutePath);
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

  const startSpeechRecognition = (): void => {
    if (recordingState === "listening") {
      recognitionInstance?.stop();
      return;
    }

    const ctor = getSpeechRecognitionConstructor();
    if (!ctor) {
      recordingState = "unavailable";
      applyStatus("Voice capture is unavailable on this platform.", "error");
      setTimeout(() => {
        recordingState = "idle";
      }, 1500);
      return;
    }

    recognitionInstance = new ctor();
    recognitionInstance.continuous = false;
    recognitionInstance.interimResults = true;
    recognitionInstance.lang = "en-US";

    recognitionInstance.onstart = () => {
      recordingState = "listening";
      applyStatus("Listening… speak your prompt.", "info");
    };

    recognitionInstance.onresult = (event) => {
      const transcripts: string[] = [];
      for (const result of event.results) {
        for (let i = 0; i < result.length; i += 1) {
          transcripts.push(result[i].transcript);
        }
      }
      promptValue = transcripts.join(" ").trim();
    };

    recognitionInstance.onerror = (event) => {
      logger.warn("Speech recognition error", event);
      recordingState = "idle";
      recognitionInstance = null;
      applyStatus(event.error ?? "Voice capture failed.", "error");
    };

    recognitionInstance.onend = () => {
      recordingState = "idle";
      recognitionInstance = null;
      applyStatus(
        promptValue
          ? "Transcribed voice input ready to send."
          : "Listening ended.",
        promptValue ? "success" : "info",
      );
    };

    try {
      recognitionInstance.start();
    } catch (error) {
      logger.error("Failed to start speech recognition", error);
      recordingState = "idle";
      recognitionInstance = null;
      applyStatus("Unable to start voice capture.", "error");
    }
  };

  const ensureInitialFocus = (): void => {
    if (!hasFocusedEditor && textareaElement) {
      textareaElement.focus();
      textareaElement.setSelectionRange(promptValue.length, promptValue.length);
      hasFocusedEditor = true;
    }
  };

  const applyStatus = (message: string, type: StatusType = "info"): void => {
    status = { message, type };
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
      if (projectFolders.length === 0) {
        applyStatus(
          "Add a project folder in the main app before creating prompts.",
          "error",
        );
      }

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
      applyStatus("Select an enabled model to continue.", "error");
      return;
    }

    isSubmitting = true;
    applyStatus("Creating prompt script and launching chat…", "info");

    try {
      const script =
        await documentClientService.createPromptScriptWithContent(
          selectedProjectPath ?? undefined,
          trimmedPrompt,
        );

      const firstLine =
        trimmedPrompt
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line.length > 0) ?? "New Prompt";

      const session = await apiChatService.createSession({
        sessionType: "chat_engine",
        metadata: {
          title: firstLine.slice(0, 120),
          modelId: selectedModelId,
          mode: "chat",
        },
        script: {
          path: script.absolutePath,
          snapshot: trimmedPrompt,
        },
      });

      await documentClientService.linkPromptScriptToChatSession(
        script.absolutePath,
        session.id,
      );

      await apiChatService.sendMessage({
        sessionId: session.id,
        prompt: trimmedPrompt,
      });

      const payload: LaunchChatPayload = {
        scriptPath: script.absolutePath,
        sessionId: session.id,
        projectPath: selectedProjectPath,
        modelId: selectedModelId,
      };

      await window.api.quickPrompt.launchChat(payload);
      await window.api.mainWindow.focus();
      await window.api.quickPromptWindow.hide();

      promptValue = "";
      applyStatus("Chat launched in the main window.", "success");
    } catch (error) {
      logger.error("Failed to launch chat from quick prompt", error);
      applyStatus(
        error instanceof Error
          ? error.message
          : "Failed to launch chat. Try again.",
        "error",
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
    recognitionInstance?.abort();
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
            {#if projects.length === 0}
              <div class="text-muted px-3 py-2 text-sm">
                No projects. Add one in the main application.
              </div>
            {:else}
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

    <div class="no-drag flex items-center gap-2">
      <button
        type="button"
        class="text-muted hover:text-accent rounded p-1.5 transition-colors"
        class:opacity-60={recordingState === "unavailable"}
        class:animate-pulse={recordingState === "listening"}
        title={recordingState === "listening"
          ? "Stop recording"
          : "Record prompt"}
        onclick={startSpeechRecognition}
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
      <button
        type="button"
        class="text-muted hover:text-accent rounded p-1.5 transition-colors"
        title="Hide window"
        onclick={() => void handleCloseWindow()}
      >
        <XLg class="text-base" />
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

  <main class="flex-1 p-2">
    <textarea
      bind:this={textareaElement}
      placeholder="Prompt editor, use '/' for commands, or @path/to/file"
      class="bg-surface text-foreground scrollbar-thin border-border h-full w-full resize-none rounded-md border px-3 py-2 text-sm leading-6 outline-none"
      value={promptValue}
      oninput={updatePromptFromEvent}
      onkeydown={handleKeyDown}
    ></textarea>
  </main>

  {#if status}
    <footer
      class="border-border flex items-center gap-2 border-t px-4 py-2 text-xs"
      class:text-accent={status.type === "success"}
      class:text-muted={status.type === "info"}
      class:text-red-400={status.type === "error"}
      class:text-yellow-400={status.type === "warning"}
    >
      {#if status.type === "error" || status.type === "warning"}
        <ExclamationTriangle class="text-sm" />
      {/if}
      <span class="truncate">{status.message}</span>
    </footer>
  {/if}
</div>

<!-- <style>
  .window-drag {
    -webkit-app-region: drag;
  }
  .no-drag {
    -webkit-app-region: no-drag;
  }
</style> -->
