<!-- src/renderer/src/components/XtermPanel.svelte -->
<script lang="ts">
  import Xterm from "./Xterm.svelte";
</script>

<section class="bg-background relative flex min-w-0 flex-1 flex-col">
  <!-- Terminal Content -->
  <div class="flex-1 overflow-y-auto p-5">
    <Xterm />
  </div>
</section>
