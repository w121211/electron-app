// src/renderer/src/main.ts
import { mount } from "svelte";
import "./app.css";
// import App from "./components/App.svelte";
import App from "./components/prompt-centric/InboxLayout.svelte";

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
