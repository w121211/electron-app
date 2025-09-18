// examples/pty-xterm-headless-demo.ts
import * as pty from "node-pty";
import { Terminal } from "@xterm/headless";
import { SerializeAddon } from "@xterm/addon-serialize";
import { platform } from "os";
import { writeFileSync } from "fs";
import { join } from "path";

async function runHeadlessPtyDemo() {
  console.log("🚀 Starting xterm-headless PTY Demo\n");

  // 1. Initialize components
  const shell = platform() === "win32" ? "powershell.exe" : "/bin/bash";
  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 30,
    cwd: process.cwd(),
    env: process.env,
  });

  const terminal = new Terminal({ cols: 80, rows: 30, allowProposedApi: true });
  const serializeAddon = new SerializeAddon();
  terminal.loadAddon(serializeAddon);

  console.log("✅ Initialized pty, headless terminal, and serialize addon.");

  // 2. Pipe PTY data to the headless terminal
  ptyProcess.onData((data) => {
    // process.stdout.write(data); // Also write to real stdout to see what's happening
    terminal.write(data);
  });

  const screenCaptures: string[] = [];
  const screenCapturesHTML: string[] = [];
  const captureScreen = async (delay = 100) => {
    await new Promise((r) => setTimeout(r, delay)); // Give UI time to update
    screenCaptures.push(serializeAddon.serialize());
    screenCapturesHTML.push(serializeAddon.serializeAsHTML());
  };

  ptyProcess.onExit(({ exitCode }) => {
    console.log(`\n🔴 PTY process exited with code ${exitCode}`);

    // Write text screen captures to file
    let output =
      "==================== STEP-BY-STEP SCREEN CAPTURES ====================\n\n";
    screenCaptures.forEach((screen, i) => {
      output += `--- Capture ${i + 1} ---\n\n`;
      output += screen + "\n\n";
    });
    output +=
      "====================================================================\n";

    const outputPath = join(process.cwd(), "screen-captures.txt");
    writeFileSync(outputPath, output, "utf8");
    console.log(`📁 Screen captures saved to: ${outputPath}`);

    // Write HTML screen captures to file
    let htmlOutput =
      "==================== STEP-BY-STEP HTML SCREEN CAPTURES ====================\n\n";
    screenCapturesHTML.forEach((screen, i) => {
      htmlOutput += `--- HTML Capture ${i + 1} ---\n\n`;
      htmlOutput += screen + "\n\n";
    });
    htmlOutput +=
      "====================================================================\n";

    const htmlOutputPath = join(process.cwd(), "screen-captures-html.txt");
    writeFileSync(htmlOutputPath, htmlOutput, "utf8");
    console.log(`📁 HTML screen captures saved to: ${htmlOutputPath}`);

    console.log("\n✅ Demo complete.");
  });

  // 4. Run an interactive application (vim)
  console.log("🎬 Launching vim to demonstrate screen capture...");
  ptyProcess.write("vim -n test-file.txt\n");
  await captureScreen(1000); // Capture after vim starts

  // Enter insert mode and type some text
  console.log('⌨️ Typing "iHello, headless world!\n<esc>" into vim...');
  ptyProcess.write("iHello, headless world!\nThis is a new line.\x1b"); // \x1b is ESC
  await captureScreen(1000); // Capture after typing

  // Quit vim without saving
  console.log('⌨️ Quitting vim with ":q!\n"...');
  ptyProcess.write(":q!\n");
  await captureScreen(1000); // Capture after sending quit command

  // Explicitly exit the shell to terminate the PTY process
  console.log("🚪 Exiting shell...");
  ptyProcess.write("exit\n");

  // The onExit handler will print the captures.
}

// Run the demo
if (require.main === module) {
  runHeadlessPtyDemo().catch(console.error);
}
