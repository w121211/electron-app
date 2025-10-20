# Terminal Launcher Script Testing

Quick way to validate the AppleScript templates under `src/core/services/surface-launcher/scripts` without rebuilding the app.

## 1. Render a script with test values

```bash
node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const templatePath = path.resolve(
  "src/core/services/surface-launcher/scripts/launch-iterm.applescript",
);
const outputPath = "/tmp/launch-iterm-test.applescript";
const template = fs.readFileSync(templatePath, "utf8");

const script = template
  .replaceAll("{{CWD}}", "/Users/cw/Documents/GitHub/electron-app")
  .replaceAll("{{FULL_COMMAND}}", "npm --version");

fs.writeFileSync(outputPath, script);
console.log(`Wrote ${outputPath}`);
NODE
```

Swap `launch-iterm.applescript` for `launch-terminal.applescript` if you want to test the stock Terminal script.

## 2. Execute the rendered script

```bash
osascript /tmp/launch-iterm-test.applescript
```

Edit the template, regenerate, and rerun `osascript` until the behavior matches expectations.

## 3. Optional: exercise through the TypeScript launcher

```bash
node --loader=ts-node/esm <<'NODE'
import { launchTerminal } from "./src/core/services/surface-launcher/terminal-launcher.ts";

await launchTerminal(
  "npm --version",
  [],
  "/Users/cw/Documents/GitHub/electron-app",
  "iterm",
);
NODE
```

This uses the same template-loading path the electron app runs. Replace the command or terminal name as needed. When satisfied, delete the temporary script (`rm /tmp/launch-iterm-test.applescript`) to clean up.
