<!-- src/renderer/src/components/Breadcrumb.svelte -->
<script lang="ts">
  import { ChevronRight } from "svelte-bootstrap-icons";
  import { projectState } from "../stores/project-store.svelte.js";

  interface Props {
    filePath: string;
    modelInfo?: string;
    hasUnsavedChanges?: boolean;
  }

  let { filePath, modelInfo, hasUnsavedChanges }: Props = $props();

  const breadcrumb = $derived.by(() => {
    if (!filePath) return null;

    const pathParts = filePath.split("/").filter((part) => part);
    const fileName = pathParts.pop() || "";

    // Find the project that contains this file
    const containingProject = projectState.projectFolders.find((project) =>
      filePath.startsWith(project.path),
    );

    let segments: string[];

    if (containingProject) {
      // Project mode: ProjectName > subDir > ... > filename
      const projectPathParts = containingProject.path
        .split("/")
        .filter((part) => part);
      const relativeParts = pathParts.slice(projectPathParts.length);
      segments = [containingProject.name, ...relativeParts];
    } else {
      // Full path mode: Users > cw > Documents > ... > filename
      segments = pathParts;
    }

    // Add asterisk to filename if there are unsaved changes
    const displayFileName = hasUnsavedChanges ? `${fileName}*` : fileName;

    return {
      segments,
      displayFileName,
    };
  });
</script>

{#if breadcrumb}
  <div class="flex items-center gap-1">
    {#each breadcrumb.segments as segment, i (i)}
      <span class="text-muted text-xs">{segment}</span>
      <ChevronRight class="text-muted text-xs" />
    {/each}
    <span class="text-muted text-xs">{breadcrumb.displayFileName}</span>
    {#if modelInfo}
      <span class="text-muted text-xs">[{modelInfo}]</span>
    {/if}
  </div>
{/if}
