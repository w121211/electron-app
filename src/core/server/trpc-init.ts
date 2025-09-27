// src/core/server/server.ts
// Run with: `AI_GATEWAY_API_KEY="your_api_key" pnpm tsx --watch src/server/trpc-server.ts`
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { Logger } from "tslog";
import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";

// @ts-expect-error - Intentionally unused for future use
const _logger = new Logger({ name: "Server" });
// @ts-expect-error - Intentionally unused for future use
const _PORT = process.env.PORT ? parseInt(process.env.PORT) : 3333;

// Create context type
export function createContext(_opts: CreateHTTPContextOptions) {
  return {};
}
type Context = Awaited<ReturnType<typeof createContext>>;

// Initialize tRPC with context
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
  sse: {
    maxDurationMs: 5 * 60 * 1_000, // 5 minutes
    ping: {
      enabled: true,
      intervalMs: 3_000,
    },
    client: {
      reconnectAfterInactivityMs: 5_000,
    },
  },
});

// Export base tRPC elements
export const router = t.router;
export const mergeRouters = t.mergeRouters;
export const createCallerFactory = t.createCallerFactory;

/**
 * Create an unprotected procedure
 * @see https://trpc.io/docs/v11/procedures
 **/
// export const publicProcedure = t.procedure.use(
//   async function artificialDelayInDevelopment(opts) {
//     const res = opts.next(opts);

//     if (process.env.NODE_ENV === "development") {
//       const randomNumber = (min: number, max: number) =>
//         Math.floor(Math.random() * (max - min + 1)) + min;

//       const delay = randomNumber(300, 1_000);
//       logger.debug(
//         `ℹ️ doing artificial delay of ${delay} ms before returning ${opts.path}`,
//       );

//       await new Promise((resolve) => setTimeout(resolve, delay));
//     }

//     return res;
//   },
// );
export const publicProcedure = t.procedure;
