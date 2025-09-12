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

  // Demo 2: Listen for terminal data
  ptyService.on("data", (id: string, data: string) => {
    console.log(`📤 Data from ${id}:`, JSON.stringify(data));
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

  // Demo 11: Cleanup all sessions
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
