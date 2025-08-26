// src/core/services/chat-engine/chat-cache-middleware.ts
import { Level } from "level";
import path from "path";
import { app } from "electron";
import {
  type LanguageModelV2,
  type LanguageModelV2Middleware,
  type LanguageModelV2StreamPart,
  simulateReadableStream,
} from "ai";

const cacheDir = path.join(app.getPath("userData"), "chat-cache");
const db = new Level(cacheDir, { valueEncoding: "json" });

export const chatCacheMiddleware: LanguageModelMiddleware = {
  wrapGenerate: async ({ doGenerate, params }) => {
    const cacheKey = JSON.stringify(params);

    try {
      const cached = (await db.get(cacheKey)) as Awaited<
        ReturnType<LanguageModel["doGenerate"]>
      >;

      return {
        ...cached,
        response: {
          ...cached.response,
          timestamp: cached?.response?.timestamp
            ? new Date(cached?.response?.timestamp)
            : undefined,
        },
      };
    } catch {
      // Cache miss - proceed with generation
      const result = await doGenerate();
      await db.put(cacheKey, result);
      return result;
    }
  },

  wrapStream: async ({ doStream, params }) => {
    const cacheKey = JSON.stringify(params);

    try {
      // Check if the result is in the cache
      const cached = (await db.get(cacheKey)) as LanguageModelV2StreamPart[];

      // Format the timestamps in the cached response
      const formattedChunks = cached.map((p) => {
        if (p.type === "response-metadata" && p.timestamp) {
          return { ...p, timestamp: new Date(p.timestamp) };
        }
        return p;
      });

      return {
        stream: simulateReadableStream({
          initialDelayInMs: 0,
          chunkDelayInMs: 10,
          chunks: formattedChunks,
        }),
      };
    } catch {
      // Cache miss - proceed with streaming
      const { stream, ...rest } = await doStream();

      const fullResponse: LanguageModelV2StreamPart[] = [];

      const transformStream = new TransformStream<
        LanguageModelV2StreamPart,
        LanguageModelV2StreamPart
      >({
        transform(chunk, controller) {
          fullResponse.push(chunk);
          controller.enqueue(chunk);
        },
        flush() {
          // Store the full response in the cache after streaming is complete
          db.put(cacheKey, fullResponse);
        },
      });

      return {
        stream: stream.pipeThrough(transformStream),
        ...rest,
      };
    }
  },
};
