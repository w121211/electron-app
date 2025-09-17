// examples/pty-service-demo.ts
import { PtyService } from "../src/core/services/pty-service.js";

async function runPtyServiceDemo() {
  console.log("🚀 Starting PtyService Demo\n");

  const ptyService = new PtyService();

  // Demo 1: Create a terminal session
  console.log("📝 Creating terminal session...");
  const sessionId = ptyService.create({
    shell: process.platform === "win32" ? "powershell.exe" : "/bin/bash",
    cwd: process.cwd(),
    cols: 80,
    rows: 24,
  });

  console.log(`✅ Created session: ${sessionId}\n`);

  const lineBuffers = new Map<string, string>();

  // Demo 2: Listen for terminal data (with line buffering)
  ptyService.on("data", (id: string, data: string) => {
    // --- Line buffering logic to process raw data into lines ---
    let buffer = lineBuffers.get(id) || "";
    buffer += data;

    let newlineIndex;
    // Process all complete lines in the buffer
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      // .trim() cleans up carriage returns (\r) and any other whitespace
      const cleanLine = line.trim();
      if (cleanLine) {
        console.log(`✅ Line from ${id}:`, cleanLine);
      }
    }

    // Store the remaining partial line back in the buffer
    lineBuffers.set(id, buffer);
  });

  // Demo 3: Listen for terminal exit
  ptyService.on("exit", (id: string, exitCode: number, signal?: number) => {
    console.log(
      `🔴 Session ${id} exited with code ${exitCode}, signal: ${signal}\n`,
    );
  });

  // Demo 4: Write commands to terminal
  console.log("📝 Writing commands to terminal...");

  // Send a simple command
  ptyService.write(sessionId, "echo 'Hello from PtyService!'\n");

  // Wait a bit for output
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Send pwd command
  ptyService.write(sessionId, "pwd\n");

  // Wait a bit for output
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Demo 5: Test session management
  console.log("📊 Session management demo...");

  const allSessions = ptyService.getAllSessions();
  console.log(`📈 Active sessions: ${allSessions.length}`);

  allSessions.forEach((session) => {
    console.log(`  - ${session.id}: ${session.shell} in ${session.cwd}`);
  });

  // Demo 6: Create multiple sessions
  console.log("\n🔀 Creating multiple sessions...");

  const session2 = ptyService.create({
    shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
    cols: 120,
    rows: 30,
  });

  const session3 = ptyService.create({
    cwd: "/tmp",
  });

  console.log(`✅ Created additional sessions: ${session2}, ${session3}`);
  console.log(
    `📈 Total active sessions: ${ptyService.getAllSessions().length}\n`,
  );

  // Demo 7: Test resize functionality
  console.log("📐 Testing resize functionality...");
  const resizeSuccess = ptyService.resize(sessionId, { cols: 100, rows: 40 });
  console.log(
    `✅ Resize ${sessionId}: ${resizeSuccess ? "SUCCESS" : "FAILED"}\n`,
  );

  // Demo 8: Test writing to specific sessions
  console.log("✍️  Writing to different sessions...");

  ptyService.write(sessionId, "echo 'Message from session 1'\n");
  ptyService.write(session2, "echo 'Message from session 2'\n");
  ptyService.write(session3, "echo 'Message from session 3'\n");

  // Wait for outputs
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Demo 9: Test error handling
  console.log("⚠️  Testing error handling...");

  const invalidWrite = ptyService.write("invalid-session", "test\n");
  console.log(
    `❌ Write to invalid session: ${invalidWrite ? "SUCCESS" : "FAILED"}`,
  );

  const invalidResize = ptyService.resize("invalid-session", {
    cols: 80,
    rows: 24,
  });
  console.log(
    `❌ Resize invalid session: ${invalidResize ? "SUCCESS" : "FAILED"}`,
  );

  const invalidDestroy = ptyService.destroy("invalid-session");
  console.log(
    `❌ Destroy invalid session: ${invalidDestroy ? "SUCCESS" : "FAILED"}\n`,
  );

  // Demo 10: Clean up individual session
  console.log("🧹 Cleaning up one session...");
  const destroySuccess = ptyService.destroy(session2);
  console.log(
    `✅ Destroyed ${session2}: ${destroySuccess ? "SUCCESS" : "FAILED"}`,
  );
  console.log(`📈 Remaining sessions: ${ptyService.getAllSessions().length}\n`);

  // Wait a bit more to see all outputs
  console.log("⏳ Waiting for final outputs...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Demo 11: Interactive session demo (Node.js REPL)
  console.log("\n🎬 Starting interactive session demo...");
  console.log(
    "  (Note: The 'data' event will capture both program output and echoed user input)",
  );

  const interactiveSessionId = ptyService.create({
    shell: process.platform === "win32" ? "powershell.exe" : "/bin/bash",
    cols: 80,
    rows: 24,
  });
  console.log(`✅ Created interactive session: ${interactiveSessionId}\n`);

  // Start node REPL - an easy way to test an interactive process
  ptyService.write(interactiveSessionId, "node\n");
  await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for REPL to start

  // Send a command to the REPL. The output will include the command echo and the result.
  ptyService.write(
    interactiveSessionId,
    "console.log('Hello from Node.js REPL!')\n",
  );
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Send another command that produces a result
  ptyService.write(interactiveSessionId, "'The answer is ' + (6 * 7)\n");
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Exit the REPL
  ptyService.write(interactiveSessionId, ".exit\n");
  // The 'exit' event for this session will be captured by the global listener.
  await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for exit to be processed

  console.log("✅ Interactive session demo completed.\n");

  // Demo 12: Cleanup all sessions

  console.log("🧹 Cleaning up all remaining sessions...");
  ptyService.destroyAll();
  console.log(
    `📈 Final session count: ${ptyService.getAllSessions().length}\n`,
  );

  console.log("✅ PtyService Demo completed!");
}

// Run the demo
if (require.main === module) {
  runPtyServiceDemo().catch(console.error);
}

export { runPtyServiceDemo };
