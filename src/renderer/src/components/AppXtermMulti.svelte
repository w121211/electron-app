<!-- src/renderer/src/components/AppXtermMulti.svelte -->
<script lang="ts">
  import Xterm from "./Xterm.svelte";

  let selected = $state(0); // 0..3
</script>

<!-- Minimal demo layout rendering multiple independent terminals -->
<div class="bg-background flex h-screen w-screen flex-col p-2">
  <div class="mb-2 flex items-center gap-2">
    <div class="text-foreground text-xs">Show terminal:</div>
    <select
      class="bg-surface border-border text-foreground rounded-md border px-2 py-1 text-xs"
      onchange={(e) =>
        (selected = Number((e.currentTarget as HTMLSelectElement).value))}
    >
      <option value="0">1</option>
      <option value="1">2</option>
      <option value="2">3</option>
      <option value="3">4</option>
    </select>
  </div>

  <div class="flex-1">
    <div class="h-full rounded-md p-2" class:hidden={selected !== 0}>
      <Xterm visible={selected === 0} />
    </div>
    <div class="h-full rounded-md p-2" class:hidden={selected !== 1}>
      <Xterm visible={selected === 1} />
    </div>
    <div class="h-full rounded-md p-2" class:hidden={selected !== 2}>
      <Xterm visible={selected === 2} />
    </div>
    <div class="h-full rounded-md p-2" class:hidden={selected !== 3}>
      <Xterm visible={selected === 3} />
    </div>
  </div>
  <!-- Tip: change the number of boxes or heights as needed -->
</div>
