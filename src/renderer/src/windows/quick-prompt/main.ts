// src/renderer/src/windows/quick-prompt/main.ts
import { mount } from "svelte";
import "../../app.css";
import PromptApp from "./PromptApp.svelte";

const app = mount(PromptApp, {
  target: document.getElementById("prompt-root")!,
});

export default app;
