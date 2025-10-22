// src/renderer/src/windows/quick-prompt/main.ts
import { mount } from "svelte";
import "../../app.css";
import App from "./QuickPromptApp.svelte";

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
