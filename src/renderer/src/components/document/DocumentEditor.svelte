<!-- src/renderer/src/components/DocumentEditor.svelte -->
<script lang="ts">
  let {
    value = "",
    onInput,
  }: {
    value?: string;
    onInput: (newValue: string) => void;
  } = $props();

  let textareaElement = $state<HTMLTextAreaElement>();

  const handleInput = (event: Event): void => {
    const target = event.target as HTMLTextAreaElement;
    onInput(target.value);
  };

  $effect(() => {
    if (textareaElement) {
      textareaElement.focus();
    }
  });
</script>

<div class="flex h-full flex-1 flex-col">
  <textarea
    bind:this={textareaElement}
    class="h-full w-full flex-1 resize-none border-none bg-transparent p-4 text-[13px] leading-6 outline-none placeholder:text-sm"
    placeholder="Start typing..."
    {value}
    oninput={handleInput}
  ></textarea>
</div>
