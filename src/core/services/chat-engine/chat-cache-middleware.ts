// src/core/services/chat-engine/chat-cache-middleware.ts
import { Level } from "level";
import path from "path";
import {
  type LanguageModelV2,
  type LanguageModelV2Middleware,
  type LanguageModelV2StreamPart,
} from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";

export function createChatCacheMiddleware(
  cacheDir: string,
): LanguageModelV2Middleware {
  const generateDb = new Level<
    string,
    Awaited<ReturnType<LanguageModelV2["doGenerate"]>>
  >(path.join(cacheDir, "generate"), { valueEncoding: "json" });
  const streamDb = new Level<string, LanguageModelV2StreamPart[]>(
    path.join(cacheDir, "stream"),
    { valueEncoding: "json" },
  );

  const chatCacheMiddleware: LanguageModelV2Middleware = {
    wrapGenerate: async ({ doGenerate, params }) => {
      const cacheKey = JSON.stringify(params);

      try {
        const cached = await generateDb.get(cacheKey);

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
        await generateDb.put(cacheKey, result);
        return result;
      }
    },

    wrapStream: async ({ doStream, params }) => {
      const cacheKey = JSON.stringify(params);

      try {
        // Check if the result is in the cache
        const cached = await streamDb.get(cacheKey);

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
            streamDb.put(cacheKey, fullResponse).catch(() => {});
          },
        });

        return {
          stream: stream.pipeThrough(transformStream),
          ...rest,
        };
      }
    },
  };

  return chatCacheMiddleware;
}
