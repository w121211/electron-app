// /Users/cw/Documents/GitHub/electron-app/tests/integration/websocket-server.integration.test.ts
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { WebSocketServer } from "../../src/core/server/websocket-server";
import WebSocket from "ws";
import type { ServerMessage } from "../../src/core/services/external-chat/websocket-protocol";

describe("WebSocketServer Integration Test", () => {
  let server: WebSocketServer;
  let port: number;

  beforeEach(async () => {
    server = new WebSocketServer({});
    port = await server.start(0); // Start on a random available port
    expect(port).toBeGreaterThan(0);
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  it("should accept a connection and emit parsed messages", async () => {
    const client = new WebSocket(`ws://127.0.0.1:${port}`);

    await new Promise<void>((resolve, reject) => {
      client.on("open", resolve);
      client.on("error", reject);
    });

    const messagePromise = new Promise<void>((resolve) => {
      server.onMessage((message) => {
        if (message.type === "connection:status") {
          expect(message.payload.status).toBe("open");
          resolve();
        }
      });
    });

    client.send(
      JSON.stringify({
        type: "connection:status",
        payload: { status: "open" },
      }),
    );

    await messagePromise;

    client.close();
    await new Promise<void>((resolve) => client.on("close", resolve));
  });

  it("should broadcast messages to all connected clients", async () => {
    const client1 = new WebSocket(`ws://127.0.0.1:${port}`);
    const client2 = new WebSocket(`ws://127.0.0.1:${port}`);

    await Promise.all([
      new Promise<void>((resolve) => client1.on("open", resolve)),
      new Promise<void>((resolve) => client2.on("open", resolve)),
    ]);

    const messagePromise1 = new Promise<string>((resolve) =>
      client1.on("message", (data) => resolve(data.toString())),
    );
    const messagePromise2 = new Promise<string>((resolve) =>
      client2.on("message", (data) => resolve(data.toString())),
    );

    const outgoing: ServerMessage = {
      type: "connection:hello",
      assistant: "chatgpt",
      client: "test",
    };
    server.broadcast(JSON.stringify(outgoing));

    const [received1, received2] = await Promise.all([
      messagePromise1,
      messagePromise2,
    ]);

    expect(JSON.parse(received1)).toEqual(outgoing);
    expect(JSON.parse(received2)).toEqual(outgoing);

    client1.close();
    client2.close();

    await Promise.all([
      new Promise<void>((resolve) => client1.on("close", resolve)),
      new Promise<void>((resolve) => client2.on("close", resolve)),
    ]);
  });
});
