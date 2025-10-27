// src/renderer/src/windows/quick-prompt/main.ts
import { mount } from "svelte";
import "../../app.css";
import QuickPromptApp from "./QuickPromptApp.svelte";

const app = mount(QuickPromptApp, {
  target: document.getElementById("app")!,
});

export default app;
