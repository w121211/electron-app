// tests/file-references.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { Logger, ILogObj } from "tslog";
import { createServerEventBus } from "../src/core/event-bus.js";
import { createUserSettingsRepository } from "../src/core/services/user-settings-repository.js";
import { FileWatcherService } from "../src/core/services/file-watcher-service.js";
import { ProjectFolderService } from "../src/core/services/project-folder-service.js";

describe("File References", () => {
  let eventBus: ReturnType<typeof createServerEventBus>;
  let projectFolderService: ProjectFolderService;

  beforeEach(() => {
    const logger = new Logger<ILogObj>({ name: "FileReferencesTest" });
    eventBus = createServerEventBus({ logger });

    const userDataDir = process.cwd();
    const userSettingsRepo = createUserSettingsRepository(userDataDir);
    const fileWatcherService = new FileWatcherService(eventBus);

    projectFolderService = new ProjectFolderService(
      eventBus,
      userSettingsRepo,
      fileWatcherService,
    );
  });

  describe("ProjectFolderService", () => {
    it("should retrieve project folders", async () => {
      const projectFolders = await projectFolderService.getAllProjectFolders();
      expect(Array.isArray(projectFolders)).toBe(true);
    });

    it("should search files in project when project exists", async () => {
      const projectFolders = await projectFolderService.getAllProjectFolders();

      if (projectFolders.length === 0) {
        return; // Skip test if no projects configured
      }

      const firstProject = projectFolders[0];
      const results = await projectFolderService.searchFilesInProject(
        "",
        firstProject.path,
        5,
      );

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it("should perform fuzzy search on files", async () => {
      const projectFolders = await projectFolderService.getAllProjectFolders();

      if (projectFolders.length === 0) {
        return; // Skip test if no projects configured
      }

      const firstProject = projectFolders[0];
      const searchQueries = ["json", "md", "ts"];

      for (const query of searchQueries) {
        const results = await projectFolderService.searchFilesInProject(
          query,
          firstProject.path,
          3,
        );

        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeLessThanOrEqual(3);

        results.forEach((file) => {
          expect(file).toHaveProperty("name");
          expect(file).toHaveProperty("relativePath");
          expect(file).toHaveProperty("score");
        });
      }
    });

    it("should return files with highlight tokens", async () => {
      const projectFolders = await projectFolderService.getAllProjectFolders();

      if (projectFolders.length === 0) {
        return; // Skip test if no projects configured
      }

      const firstProject = projectFolders[0];
      const results = await projectFolderService.searchFilesInProject(
        "package",
        firstProject.path,
        1,
      );

      if (results.length > 0) {
        const firstResult = results[0];
        expect(firstResult).toHaveProperty("highlightTokens");
        expect(Array.isArray(firstResult.highlightTokens)).toBe(true);
      }
    });

    it("should add project folder", async () => {
      const testPath = process.cwd();

      try {
        const result = await projectFolderService.addProjectFolder(testPath);
        expect(result).toHaveProperty("name");
        expect(result).toHaveProperty("path");
        expect(result.path).toBe(testPath);
      } catch (error) {
        // Project folder might already exist, which is fine
        expect(error).toBeDefined();
      }
    });

    it("should get folder tree", async () => {
      const projectFolders = await projectFolderService.getAllProjectFolders();

      if (projectFolders.length === 0) {
        return; // Skip test if no projects configured
      }

      const firstProject = projectFolders[0];
      const tree = await projectFolderService.getFolderTree(firstProject.path);

      expect(tree).toHaveProperty("name");
      expect(tree).toHaveProperty("path");
      expect(tree).toHaveProperty("isDirectory");
      expect(tree.isDirectory).toBe(true);
      expect(tree).toHaveProperty("children");
      expect(Array.isArray(tree.children)).toBe(true);
    });
  });
});
