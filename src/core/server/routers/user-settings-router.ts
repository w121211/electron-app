// src/core/server/routers/user-settings-router.ts
import path from "node:path";
import { z } from "zod";
import { UserSettingsService } from "../../services/user-settings-service.js";
import { router, publicProcedure } from "../trpc-init.js";

export function createUserSettingsRouter(
  userSettingsService: UserSettingsService,
) {
  return router({
    // Get current user settings
    getSettings: publicProcedure.query(async () => {
      return userSettingsService.getUserSettings();
    }),

    // Update general settings
    updateSettings: publicProcedure
      .input(
        z.object({
          settings: z.record(z.string(), z.unknown()),
        }),
      )
      .mutation(async ({ input }) => {
        return userSettingsService.updateUserSettings(input.settings);
      }),

    // Set workspace directory
    setWorkspaceDirectory: publicProcedure
      .input(
        z.object({
          workspaceDirectory: z
            .string()
            .refine((value) => path.isAbsolute(value), {
              message: "Workspace directory must be absolute",
            }),
        }),
      )
      .mutation(async ({ input }) => {
        return userSettingsService.setWorkspaceDirectory(
          input.workspaceDirectory,
        );
      }),

    // Get workspace directory
    getWorkspaceDirectory: publicProcedure.query(async () => {
      return userSettingsService.getWorkspaceDirectory();
    }),

    // Set provider API key
    setProviderApiKey: publicProcedure
      .input(
        z.object({
          provider: z.string(),
          apiKey: z.string(),
          enabled: z.boolean().optional().default(true),
        }),
      )
      .mutation(async ({ input }) => {
        return userSettingsService.setProviderApiKey(
          input.provider,
          input.apiKey,
          input.enabled,
        );
      }),

    // Get provider API key
    getProviderApiKey: publicProcedure
      .input(
        z.object({
          provider: z.string(),
        }),
      )
      .query(async ({ input }) => {
        return userSettingsService.getProviderApiKey(input.provider);
      }),

    // Clear provider API key
    clearProviderApiKey: publicProcedure
      .input(
        z.object({
          provider: z.string(),
        }),
      )
      .mutation(async ({ input }) => {
        return userSettingsService.clearProviderApiKey(input.provider);
      }),
  });
}
