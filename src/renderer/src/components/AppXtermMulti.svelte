<!-- src/renderer/src/components/AppXtermMulti.svelte -->
<script lang="ts">
  import Xterm from "./Xterm.svelte";

  let selected = $state(0); // 0..3
</script>

<!-- Minimal demo layout rendering multiple independent terminals -->
<div class="flex h-screen w-screen flex-col p-2">
  <div class="mb-2 flex items-center gap-2">
    <div>Show terminal:</div>
    <select
      class="border"
      onchange={(e) =>
        (selected = Number((e.currentTarget as HTMLSelectElement).value))}
    >
      <option value="0">1</option>
      <option value="1">2</option>
      <option value="2">3</option>
      <option value="3">4</option>
    </select>
  </div>

  <div class="min-h-0 flex-1">
    <Xterm hidden={selected !== 0} />
    <Xterm hidden={selected !== 1} />
    <Xterm hidden={selected !== 2} />
    <Xterm hidden={selected !== 3} />
  </div>
  <!-- Tip: change the number of boxes or heights as needed -->
</div>
