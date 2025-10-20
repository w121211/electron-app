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

test("pty data processor emits snapshot triggers end-to-end", async () => {
  const electronApp = await electron.launch({
    args: ["."],
    env: {
      ...process.env,
      PTY_EXPOSE_SNAPSHOT_PROVIDER: "1",
    },
  });

  const waitForTrigger = async (page, trigger) => {
    await expect
      .poll(
        async () =>
          page.evaluate((target) => {
            const events = window.__snapshotEvents || [];
            return events.some((event) => event.trigger === target);
          }, trigger),
        { timeout: 5000 },
      )
      .toBe(true);
  };

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    await window.evaluate(() => {
      const api = window.api;
      if (!api?.pty) {
        throw new Error("Renderer PTY API is unavailable");
      }

      window.__snapshotEvents = [];
      window.__unsubscribeSnapshot?.();

      window.__unsubscribeSnapshot = api.pty.onSnapshotRequest((payload) => {
        window.__snapshotEvents.push(payload);
        api.pty.sendSnapshotResponse({
          requestId: payload.requestId,
          snapshot: null,
        });
      });
    });

    const trpcUrl = await window.evaluate(() => window.api.getTrpcUrl());
    if (!trpcUrl) {
      throw new Error("Failed to resolve tRPC URL from renderer");
    }

    const createResponse = await fetch(
      `${trpcUrl}/ptyChat.createSession?batch=1`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          0: {
            json: {
              workingDirectory: process.cwd(),
              modelId: "anthropic/claude-code",
            },
          },
        }),
      },
    );

    expect(createResponse.ok).toBeTruthy();
    const createPayload = await createResponse.json();
    const sessionData =
      createPayload?.["0"]?.result?.data?.json ?? createPayload?.["0"]?.result;
    if (!sessionData) {
      throw new Error("tRPC createSession response missing payload");
    }

    const chatSessionId = sessionData.id;
    const ptyInstanceId =
      sessionData.metadata?.external?.ptyInstanceId ?? null;

    expect(chatSessionId).toBeTruthy();
    expect(ptyInstanceId).toBeTruthy();

    await window.evaluate(
      async (sessionId) => window.api.pty.attach(sessionId),
      ptyInstanceId,
    );

    await window.evaluate(
      async (sessionId) =>
        window.api.pty.write(sessionId, 'printf "Claude Code v2.0.8\\n"'),
      ptyInstanceId,
    );
    await window.evaluate(
      async (sessionId) => window.api.pty.write(sessionId, "\r"),
      ptyInstanceId,
    );

    await window.evaluate(
      async (sessionId) =>
        window.api.pty.write(sessionId, 'printf "> /clear\\n"'),
      ptyInstanceId,
    );
    await window.evaluate(
      async (sessionId) => window.api.pty.write(sessionId, "\r"),
      ptyInstanceId,
    );

    await window.waitForTimeout(600);

    await waitForTrigger(window, "enterPressed");
    await waitForTrigger(window, "sessionBanner");
    await waitForTrigger(window, "screenCleared");
    await waitForTrigger(window, "outputIdle");

    const terminateResponse = await fetch(
      `${trpcUrl}/ptyChat.terminateSession?batch=1`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          0: {
            json: {
              chatSessionId,
            },
          },
        }),
      },
    );

    expect(terminateResponse.ok).toBeTruthy();
  } finally {
    await electronApp.close();
  }
});
