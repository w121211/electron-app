<!-- // src/renderer/src/components/chat/ModelSelectorDropdown.svelte -->
<script lang="ts">
  import { ChevronDown } from "svelte-bootstrap-icons";
  import { chatState } from "../../stores/chat-store.svelte.js";
  import { chatService } from "../../services/chat-service.js";

  interface Props {
    position?: "below" | "above";
  }

  let { position = "below" }: Props = $props();

  let showDropdown = $state(false);
  let dropdownContainer = $state<HTMLDivElement>();

  // Derive disabled state from chat state
  const disabled = $derived(
    !!(chatState.currentChat && chatState.currentChat.messages.length > 0),
  );

  // Load models when component mounts
  $effect(() => {
    if (chatState.availableModels.length === 0) {
      chatService.getAvailableModels();
    }
  });

  function toggleDropdown(): void {
    if (!disabled) {
      showDropdown = !showDropdown;
    }
  }

  function selectModel(modelValue: `${string}/${string}`): void {
    chatState.selectedModel = modelValue;
    showDropdown = false;
  }

  // Close dropdown when clicking outside
  $effect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (
        showDropdown &&
        dropdownContainer &&
        !dropdownContainer.contains(event.target as Node)
      ) {
        showDropdown = false;
      }
    }

    if (showDropdown) {
      document.addEventListener("click", handleClickOutside, true);
      return () =>
        document.removeEventListener("click", handleClickOutside, true);
    }
    return undefined;
  });
</script>

<div bind:this={dropdownContainer} class="relative">
  <button
    onclick={toggleDropdown}
    class="text-muted flex cursor-pointer items-center gap-1"
    class:hover:text-accent={!disabled}
    class:cursor-pointer={!disabled}
    class:cursor-not-allowed={disabled}
    title="Select Model"
    {disabled}
  >
    <span class="text-sm">{chatState.selectedModel}</span>
    {#if !disabled}
      <ChevronDown />
    {/if}
  </button>
  <!-- Dropdown menu -->
  {#if showDropdown}
    <div
      class="bg-background border-border absolute left-0 z-10 w-max rounded-md border"
      class:mt-1={position === "below"}
      class:top-full={position === "below"}
      class:mb-1={position === "above"}
      class:bottom-full={position === "above"}
    >
      <div class="py-1">
        {#each chatState.availableModels as option (option.modelId)}
          <button
            onclick={() => selectModel(option.modelId)}
            class="text-foreground hover:bg-hover block w-full cursor-pointer px-3 py-1 text-left text-sm"
            class:bg-hover={option.modelId === chatState.selectedModel}
          >
            {option.modelId}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>
