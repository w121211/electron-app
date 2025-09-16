// src/core/services/chat-queue-repository.ts
import { Level } from "level";
import { ILogObj, Logger } from "tslog";
import path from "path";

export interface QueuedChatItem {
  chatId: string;
  absoluteFilePath: string;
  modelId: string;
  createdAt: number; // Using number for timestamp (Date.now())
}

export class ChatQueueRepository {
  private readonly logger: Logger<ILogObj> = new Logger({
    name: "ChatQueueRepository",
  });
  // Key is absoluteFilePath, Value is QueuedChatItem
  private readonly db: Level<string, QueuedChatItem>;

  constructor(dbPath: string) {
    const fullDbPath = path.join(dbPath, "chat-queue");
    this.db = new Level<string, QueuedChatItem>(fullDbPath, {
      valueEncoding: "json",
    });
    this.logger.info(`ChatQueueRepository initialized at ${fullDbPath}`);
  }

  async addItem(item: Omit<QueuedChatItem, "createdAt">): Promise<void> {
    const queuedItem: QueuedChatItem = {
      ...item,
      createdAt: Date.now(),
    };
    // Use absoluteFilePath as the key
    await this.db.put(item.absoluteFilePath, queuedItem);
    this.logger.info(
      `Chat item for ${item.absoluteFilePath} added to the queue db.`,
    );
  }

  async getItem(absoluteFilePath: string): Promise<QueuedChatItem | undefined> {
    try {
      return await this.db.get(absoluteFilePath);
    } catch (error: any) {
      if (error.code === "LEVEL_NOT_FOUND") {
        return undefined;
      }
      throw error;
    }
  }

  async removeItem(absoluteFilePath: string): Promise<void> {
    await this.db.del(absoluteFilePath);
    this.logger.info(
      `Chat item for ${absoluteFilePath} removed from the queue db.`,
    );
  }

  async getAllItems(): Promise<QueuedChatItem[]> {
    const items: QueuedChatItem[] = [];
    for await (const [_, value] of this.db.iterator()) {
      items.push(value);
    }
    return items;
  }

  async getNextInQueue(modelId: string): Promise<QueuedChatItem | null> {
    const items = await this.getAllItems();
    const modelQueue = items
      .filter((item) => item.modelId === modelId)
      .sort((a, b) => a.createdAt - b.createdAt); // FIFO

    return modelQueue.length > 0 ? modelQueue[0] : null;
  }

  async close(): Promise<void> {
    await this.db.close();
    this.logger.info("Chat queue database closed.");
  }
}
