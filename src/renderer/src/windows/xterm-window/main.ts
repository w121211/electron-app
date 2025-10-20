// src/renderer/src/windows/xterm-window/main.ts
import { mount } from "svelte";
import "../../app.css";
import XtermApp from "./XtermApp.svelte";

const app = mount(XtermApp, {
  target: document.getElementById("xterm-root")!,
});

export default app;
