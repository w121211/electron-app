// examples/pty-session-manager-demo.ts
import {
  createPtySessionManager,
  PtyInstance,
} from "../src/core/services/pty/pty-session-manager.js";
import { createServerEventBus } from "../src/core/event-bus.js";

async function runPtySessionManagerDemo() {
  console.log("🚀 Starting PtySessionManager Demo\n");

  // Create event bus and pty session manager
  const eventBus = createServerEventBus();
  const ptySessionManager = createPtySessionManager(eventBus);

  const lineBuffers = new Map<string, string>();

  // Helper function to set up listeners for a new session
  const setupListeners = (session: PtyInstance) => {
    console.log(`✅ Created session: ${session.id}\n`);

    // Listen for terminal data (with line buffering)
    session.onData((data: string) => {
      let buffer = lineBuffers.get(session.id) || "";
      buffer += data;

      let newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        const cleanLine = line.trim();
        if (cleanLine) {
          console.log(`✅ Line from ${session.id}:`, cleanLine);
        }
      }
      lineBuffers.set(session.id, buffer);
    });

    // Listen for terminal exit
    session.onExit(({ exitCode, signal }) => {
      console.log(
        `🔴 Session ${session.id} exited with code ${exitCode}, signal: ${signal}\n`,
      );
    });
  };

  // Demo 1: Create a terminal session
  console.log("📝 Creating terminal session...");
  const session1 = ptySessionManager.create({
    shell: process.platform === "win32" ? "powershell.exe" : "/bin/bash",
    cwd: process.cwd(),
    cols: 80,
    rows: 24,
  });
  setupListeners(session1);

  // Demo 2: Write commands to terminal
  console.log("📝 Writing commands to terminal...");
  session1.write("echo 'Hello from PtySessionManager!'\n");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  session1.write("pwd\n");
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Demo 3: Test session management
  console.log("📊 Session management demo...");
  const allSessions = ptySessionManager.getAllSessions();
  console.log(`📈 Active sessions: ${allSessions.length}`);
  allSessions.forEach((s) => {
    console.log(`  - ${s.id}: ${s.shell} in ${s.cwd}`);
  });

  // Demo 4: Create multiple sessions
  console.log("\n🔀 Creating multiple sessions...");
  const session2 = ptySessionManager.create({
    shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
  });
  setupListeners(session2);

  const session3 = ptySessionManager.create({ cwd: "/tmp" });
  setupListeners(session3);

  console.log(
    `📈 Total active sessions: ${ptySessionManager.getAllSessions().length}\n`,
  );

  // Demo 5: Test resize functionality
  console.log("📐 Testing resize functionality...");
  session1.resize(100, 40);
  console.log(`✅ Resized ${session1.id}\n`);

  // Demo 6: Test writing to specific sessions
  console.log("✍️  Writing to different sessions...");
  session1.write("echo 'Message from session 1'\n");
  session2.write("echo 'Message from session 2'\n");
  session3.write("echo 'Message from session 3'\n");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Demo 7: Test error handling (by getting a non-existent session)
  console.log("⚠️  Testing error handling...");
  const invalidSession = ptySessionManager.getSession("invalid-id");
  console.log(`❌ Got invalid session: ${invalidSession ? "true" : "false"}\n`);

  // Demo 8: Clean up individual session
  console.log("🧹 Cleaning up one session...");
  session2.kill();
  console.log(`✅ Killed ${session2.id}`);
  // The exit listener will log the exit event
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log(
    `📈 Remaining sessions: ${ptySessionManager.getAllSessions().length}\n`,
  );

  // Demo 9: Interactive session demo (Node.js REPL)
  console.log("\n🎬 Starting interactive session demo...");
  const interactiveSession = ptySessionManager.create({});
  setupListeners(interactiveSession);

  interactiveSession.write("node\n");
  await new Promise((resolve) => setTimeout(resolve, 1000));

  interactiveSession.write("console.log('Hello from Node.js REPL!')\n");
  await new Promise((resolve) => setTimeout(resolve, 500));

  interactiveSession.write("'The answer is ' + (6 * 7)\n");
  await new Promise((resolve) => setTimeout(resolve, 500));

  interactiveSession.write(".exit\n");
  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log("✅ Interactive session demo completed.\n");

  // Demo 10: Cleanup all sessions
  console.log("🧹 Cleaning up all remaining sessions...");
  ptySessionManager.destroyAll();
  await new Promise((resolve) => setTimeout(resolve, 500)); // Allow time for exit events
  console.log(
    `📈 Final session count: ${ptySessionManager.getAllSessions().length}\n`,
  );

  console.log("✅ PtySessionManager Demo completed!");
}

// Run the demo
if (require.main === module) {
  runPtySessionManagerDemo().catch(console.error);
}

export { runPtySessionManagerDemo };
