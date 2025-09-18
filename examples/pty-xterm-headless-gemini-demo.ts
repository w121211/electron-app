// examples/pty-xterm-headless-gemini-demo.ts
import * as pty from "node-pty";
import { Terminal } from "@xterm/headless";
import { SerializeAddon } from "@xterm/addon-serialize";
import { platform } from "os";
import { writeFileSync } from "fs";
import { join } from "path";

async function runGeminiCliDemo() {
  console.log("💎 Starting Gemini CLI Demo\n");

  // 1. Initialize components
  const shell = platform() === "win32" ? "powershell.exe" : "/bin/bash";
  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 120,
    rows: 40,
    cwd: process.cwd(),
    env: process.env,
  });

  const terminal = new Terminal({
    cols: 120,
    rows: 40,
    allowProposedApi: true,
  });
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
  const captureScreen = async (delay = 1000) => {
    await new Promise((r) => setTimeout(r, delay));
    screenCaptures.push(serializeAddon.serialize());
    screenCapturesHTML.push(serializeAddon.serializeAsHTML());
  };

  ptyProcess.onExit(({ exitCode }) => {
    console.log(`\n🔴 PTY process exited with code ${exitCode}`);

    // Write text screen captures to file
    let output =
      "==================== GEMINI CLI DEMO CAPTURES ====================\n\n";
    screenCaptures.forEach((screen, i) => {
      output += `--- Capture ${i + 1} ---\n\n`;
      output += screen + "\n\n";
    });
    output +=
      "====================================================================\n";

    const outputPath = join(process.cwd(), "gemini-cli-captures.txt");
    writeFileSync(outputPath, output, "utf8");
    console.log(`📁 Screen captures saved to: ${outputPath}`);

    // Write HTML screen captures to file
    let htmlOutput =
      "==================== GEMINI CLI HTML CAPTURES ====================\n\n";
    screenCapturesHTML.forEach((screen, i) => {
      htmlOutput += `--- HTML Capture ${i + 1} ---\n\n`;
      htmlOutput += screen + "\n\n";
    });
    htmlOutput +=
      "====================================================================\n";

    const htmlOutputPath = join(process.cwd(), "gemini-cli-captures-html.txt");
    writeFileSync(htmlOutputPath, htmlOutput, "utf8");
    console.log(`📁 HTML screen captures saved to: ${htmlOutputPath}`);

    console.log("\n✅ Gemini CLI demo complete.");
  });

  // 3. Test Gemini CLI functionality
  console.log("🚀 Testing Gemini CLI availability...");
  ptyProcess.write("which gemini || echo 'Gemini CLI not found in PATH'\n");
  await captureScreen(2000);

  console.log("📁 Creating a new project directory...");
  ptyProcess.write("mkdir -p gemini-test-project && cd gemini-test-project\n");
  await captureScreen(1000);

  console.log("📝 Creating FAQ.md file...");
  ptyProcess.write(
    "echo '# FAQ\n\n## What is this bot?\nThis is a Discord bot that answers questions.\n\n## How do I use it?\nJust ask a question and the bot will respond.' > FAQ.md\n",
  );
  await captureScreen(1000);

  console.log("🤖 Starting Gemini CLI interactive session...");
  ptyProcess.write("gemini\n");
  await captureScreen(3000);

  console.log("💬 Sending prompt to Gemini...");
  ptyProcess.write(
    "Write me a Discord bot that answers questions using a FAQ.md file I will provide",
  );
  await captureScreen(1000);

  console.log("⏎ Submitting prompt...");
  ptyProcess.write("\r"); // Press Enter to submit
  await captureScreen(10000);

  console.log("🚪 Exiting Gemini CLI...");
  ptyProcess.write("\x03"); // First Ctrl+C
  await captureScreen(1000);
  ptyProcess.write("\x03"); // Second Ctrl+C to fully exit
  await captureScreen(2000);

  console.log("🧹 Cleaning up test directory...");
  ptyProcess.write("cd .. && rm -rf gemini-test-project\n");
  await captureScreen(1000);

  console.log("📊 Showing current directory contents...");
  ptyProcess.write("ls -la\n");
  await captureScreen(1000);

  // Exit the shell to terminate the PTY process
  console.log("🚪 Exiting shell...");
  ptyProcess.write("exit\n");
}

// Run the demo
if (require.main === module) {
  runGeminiCliDemo().catch(console.error);
}

export { runGeminiCliDemo };
