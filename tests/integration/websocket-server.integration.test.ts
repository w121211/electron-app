// /Users/cw/Documents/GitHub/electron-app/tests/integration/websocket-server.integration.test.ts
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { WebSocketServer } from "../../src/core/server/websocket-server";
import WebSocket from "ws";

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

  it("should start, accept a connection, echo messages, and stop", async () => {
    const client = new WebSocket(`ws://127.0.0.1:${port}`);

    await new Promise<void>((resolve, reject) => {
      client.on("open", resolve);
      client.on("error", reject);
    });

    const messagePromise = new Promise<string>((resolve) => {
      client.on("message", (data) => resolve(data.toString()));
    });

    const testMessage = "Hello, WebSocket!";
    client.send(testMessage);

    const receivedMessage = await messagePromise;
    expect(receivedMessage).toBe(`Echo: ${testMessage}`);

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

    const broadcastMessage = "This is a broadcast";
    server.broadcast(broadcastMessage);

    const [received1, received2] = await Promise.all([
      messagePromise1,
      messagePromise2,
    ]);

    expect(received1).toBe(broadcastMessage);
    expect(received2).toBe(broadcastMessage);

    client1.close();
    client2.close();

    await Promise.all([
      new Promise<void>((resolve) => client1.on("close", resolve)),
      new Promise<void>((resolve) => client2.on("close", resolve)),
    ]);
  });
});
