// apps/my-app-svelte/src/lib/trpc-client.ts
import {
  createTRPCClient,
  httpBatchStreamLink,
  httpSubscriptionLink,
  loggerLink,
  splitLink,
} from "@trpc/client";
import superjson from "superjson";
import { Logger } from "tslog";
import type { AppRouter } from "../../../core/server/root-router.js";

const logger = new Logger({ name: "TrpcClient" });

const getUrl = () => "http://localhost:3333/api/trpc";

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    loggerLink({
      enabled: (opts) =>
        import.meta.env.DEV ||
        (opts.direction === "down" && opts.result instanceof Error),
      console: {
        log: (...args) => logger.info(...args),
        error: (...args) => logger.error(...args),
      },
    }),
    splitLink({
      condition: (op) => op.type === "subscription",
      true: httpSubscriptionLink({
        url: getUrl(),
        transformer: superjson,
      }),
      false: httpBatchStreamLink({
        url: getUrl(),
        transformer: superjson,
      }),
    }),
  ],
});

export type TrpcClient = typeof trpcClient;
