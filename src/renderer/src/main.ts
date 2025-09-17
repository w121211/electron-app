// src/renderer/src/main.ts
import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
// import App from "./components-new-ui/App.svelte";

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
