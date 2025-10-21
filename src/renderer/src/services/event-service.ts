// src/renderer/src/services/event-service.ts
import { Logger } from "tslog";
import { trpcClient } from "../lib/trpc-client.js";
import { setConnectionState } from "../stores/ui-store.svelte.js";
import { setChatSession } from "../stores/chat.svelte.js";
import { projectService } from "./project-service.js";

interface Subscription {
  unsubscribe: () => void;
}

class EventService {
  private logger = new Logger({ name: "EventService" });
  private subscriptions = new Map<string, Subscription>();
  private isStarted = false;

  start() {
    if (this.isStarted) {
      this.logger.warn("EventService already started");
      return;
    }

    this.logger.info("Starting event subscriptions...");
    this.isStarted = true;

    this.startFileWatcherSubscription();
    this.startChatEventSubscription();
  }

  stop() {
    if (!this.isStarted) return;

    this.logger.info("Stopping event subscriptions...");

    this.subscriptions.forEach((subscription, name) => {
      this.logger.debug(`Unsubscribing from ${name}`);
      subscription.unsubscribe();
    });

    this.subscriptions.clear();
    this.isStarted = false;

    // Reset all connection states to idle
    setConnectionState("fileWatcher", "idle");
    setConnectionState("chatEvents", "idle");
  }

  private startFileWatcherSubscription() {
    setConnectionState("fileWatcher", "connecting");

    const subscription = trpcClient.event.fileWatcherEvents.subscribe(
      { lastEventId: null },
      {
        onStarted: () => {
          this.logger.info("File watcher subscription started");
          setConnectionState("fileWatcher", "connected");
        },
        onData: (event) => {
          this.logger.debug(
            "File watcher event:",
            event.data.eventType,
            event.data.absoluteFilePath,
          );
          projectService.handleFileEvent(event.data);
        },
        onError: (error) => {
          this.logger.error("File watcher subscription error:", error);
          setConnectionState("fileWatcher", "error");
        },
      },
    );

    this.subscriptions.set("fileWatcher", {
      unsubscribe: subscription.unsubscribe,
    });
  }

  private startChatEventSubscription() {
    setConnectionState("chatEvents", "connecting");

    const subscription = trpcClient.event.chatEvents.subscribe(
      { lastEventId: null },
      {
        onStarted: () => {
          this.logger.info("Chat event subscription started");
          setConnectionState("chatEvents", "connected");
        },
        onData: (event) => {
          this.logger.debug(
            "Chat event:",
            event.data.updateType,
            event.data.chatId,
          );
          if (event.data.chat) {
            setChatSession(event.data.chat);
          }
        },
        onError: (error) => {
          this.logger.error("Chat event subscription error:", error);
          setConnectionState("chatEvents", "error");
        },
      },
    );

    this.subscriptions.set("chatEvents", {
      unsubscribe: subscription.unsubscribe,
    });
  }
}

export const eventService = new EventService();
