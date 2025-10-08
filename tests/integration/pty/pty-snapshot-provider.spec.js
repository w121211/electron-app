// tests/integration/pty/pty-snapshot-provider.spec.js
// const { test, expect, _electron: electron } = require("@playwright/test");
import { test, expect, _electron as electron } from "@playwright/test";

test("renderer snapshot provider resolves with renderer response", async () => {
  const electronApp = await electron.launch({
    args: ["."],
    env: {
      ...process.env,
      PTY_EXPOSE_SNAPSHOT_PROVIDER: "1",
    },
  });

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    await window.evaluate(() => {
      const api = window.api;
      if (!api?.pty) {
        throw new Error("Renderer PTY API is unavailable");
      }

      if (window.__unsubscribeSnapshot) {
        window.__unsubscribeSnapshot();
      }

      window.__snapshotRequests = [];
      window.__unsubscribeSnapshot = api.pty.onSnapshotRequest((payload) => {
        window.__snapshotRequests.push(payload);
        api.pty.sendSnapshotResponse({
          requestId: payload.requestId,
          snapshot: "renderer-snapshot",
        });
      });
    });

    const snapshot = await window.evaluate(() =>
      window.api.pty.requestSnapshotForTests({
        session: { id: "session-test", ptyInstanceId: "pty-test" },
        processor: null,
        event: { kind: "enterPressed" },
      }),
    );

    expect(snapshot).toBe("renderer-snapshot");

    const receivedRequest = await window.evaluate(() => {
      const [request] = window.__snapshotRequests || [];
      window.__unsubscribeSnapshot?.();
      delete window.__unsubscribeSnapshot;
      return request || null;
    });

    expect(receivedRequest).not.toBeNull();
    expect(receivedRequest.sessionId).toBe("session-test");
    expect(receivedRequest.ptyInstanceId).toBe("pty-test");
  } finally {
    await electronApp.close();
  }
});
