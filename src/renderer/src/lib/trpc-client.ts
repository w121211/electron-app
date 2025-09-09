// src/renderer/src/lib/trpc-client.ts
import {
  createTRPCClient,
  httpBatchStreamLink,
  httpSubscriptionLink,
  loggerLink,
  splitLink,
} from "@trpc/client";
import superjson from "superjson";
// import { Logger } from "tslog";
import type { TrpcRouter } from "../../../core/server/root-router.js";

// const logger = new Logger({
//   name: "TrpcClient",
//   prettyInspectOptions: { depth: 10 },
// });

// Create client asynchronously
async function createClient() {
  const url = await window.api.getTrpcUrl();
  if (!url) {
    throw new Error("tRPC server URL not available");
  }

  return createTRPCClient<TrpcRouter>({
    links: [
      loggerLink({
        enabled: (opts) =>
          import.meta.env.DEV ||
          (opts.direction === "down" && opts.result instanceof Error),
        console: {
          // log: (...args) => logger.info(...args),
          log: (...args) => console.info(...args),
          error: (...args) => console.error(...args),
        },
      }),
      splitLink({
        condition: (op) => op.type === "subscription",
        true: httpSubscriptionLink({
          transformer: superjson,
          url,
        }),
        false: httpBatchStreamLink({
          transformer: superjson,
          url,
        }),
      }),
    ],
  });
}

export const trpcClient = await createClient();

export type TrpcClient = typeof trpcClient;
