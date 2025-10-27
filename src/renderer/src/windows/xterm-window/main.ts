// src/renderer/src/windows/xterm-window/main.ts
import { mount } from "svelte";
import "../../app.css";
import XtermWindowApp from "./XtermWindowApp.svelte";

const app = mount(XtermWindowApp, {
  target: document.getElementById("app")!,
});

export default app;
