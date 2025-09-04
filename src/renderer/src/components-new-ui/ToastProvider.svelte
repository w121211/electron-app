<!-- src/renderer/src/components/ToastProvider.svelte -->
<script lang="ts">
  import {
    XLg,
    CheckCircleFill,
    ExclamationTriangleFill,
    InfoCircleFill,
  } from "svelte-bootstrap-icons";
  import {
    uiState,
    removeToast,
    getToastClassName,
  } from "../stores/ui-store.svelte.js";

  // ToastProvider doesn't need children props - it's just an overlay

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  function getIconComponent(type: string) {
    switch (type) {
      case "success":
        return CheckCircleFill;
      case "error":
      case "warning":
        return ExclamationTriangleFill;
      case "info":
      default:
        return InfoCircleFill;
    }
  }

  function handleToastClick(toastId: string): void {
    removeToast(toastId);
  }

  function getToastTitle(type: string): string {
    switch (type) {
      case "success":
        return "Success";
      case "error":
        return "Error";
      case "warning":
        return "Warning";
      case "info":
      default:
        return "Info";
    }
  }
</script>

<!-- Toast container -->
{#if uiState.toasts.length > 0}
  <div class="fixed top-4 right-4 z-50 flex flex-col gap-2">
    {#each uiState.toasts as toast (toast.id)}
      {@const IconComponent = getIconComponent(toast.type)}
      <div
        class="animate-in fade-in slide-in-from-top-2 w-full max-w-sm rounded-lg border p-4 shadow-lg duration-300 {getToastClassName(
          toast.type,
        )}"
        role="alert"
      >
        <div class="flex items-start justify-between">
          <div class="flex flex-1 items-start space-x-3">
            <IconComponent class="mt-0.5 flex-shrink-0 text-base" />
            <div class="min-w-0 flex-1">
              <div class="text-foreground text-sm font-medium">
                {getToastTitle(toast.type)}
              </div>
              <div class="text-muted mt-1 text-sm break-words">
                {toast.message}
              </div>
            </div>
          </div>
          <button
            onclick={() => handleToastClick(toast.id)}
            class="text-muted hover:text-accent ml-2 flex-shrink-0 transition-colors"
            aria-label="Close notification"
          >
            <XLg class="text-base" />
          </button>
        </div>
      </div>
    {/each}
  </div>
{/if}
