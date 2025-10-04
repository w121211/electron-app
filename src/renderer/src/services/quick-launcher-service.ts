// src/renderer/src/services/quick-launcher-service.ts
import path from "node:path";
import { Logger } from "tslog";
import { projectState } from "../stores/project-store.svelte.js";
import {
  quickLauncherState,
  setResults,
  setRecentPromptScripts,
  setLoading,
  type PromptScriptSearchResult,
  type QuickLauncherResult,
} from "../stores/quick-launcher-store.svelte.js";
import {
  selectFile,
  expandParentDirectories,
} from "../stores/tree-store.svelte.js";
import { fileSearchService } from "./file-search-service.js";
import type { ProjectFileSearchResult } from "../../../core/services/project-folder-service.js";
import { documentClientService } from "./document-client-service.js";

class QuickLauncherService {
  private logger = new Logger({ name: "QuickLauncherService" });
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  async loadRecentPromptScripts(): Promise<void> {
    try {
      this.logger.debug("Loading recent prompt scripts");
      const scripts: PromptScriptSearchResult[] = [];

      // Scan project folders for .prompt.md files
      for (const projectFolder of projectState.projectFolders) {
        const folderTree = projectState.folderTrees[projectFolder.path];
        if (folderTree) {
          const items = await this.findPromptScripts(folderTree, projectFolder.path);
          scripts.push(...items);
        }
      }

      scripts.sort(
        (a, b) => b.lastModified.getTime() - a.lastModified.getTime(),
      );

      const limited = scripts.slice(0, 10);

      setRecentPromptScripts(limited);
      this.logger.debug(`Loaded ${limited.length} recent prompt scripts`);
    } catch (error) {
      this.logger.error("Failed to load recent prompt scripts:", error);
      setRecentPromptScripts([]);
    }
  }

  private async findPromptScripts(
    node: any,
    projectRoot: string,
    results: PromptScriptSearchResult[] = [],
  ): Promise<PromptScriptSearchResult[]> {
    if (!node) return results;

    if (!node.isDirectory && node.name?.endsWith(".prompt.md")) {
      const relativePath = path.relative(projectRoot, node.path);
      const title = node.name.replace(/\.prompt\.md$/, "");

      results.push({
        id: node.path,
        title,
        relativePath,
        absolutePath: node.path,
        lastModified: new Date(node.lastModified || Date.now()),
        highlightTokens: [{ text: relativePath, isHighlighted: false }],
      });
    }

    // Recursively search children
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        await this.findPromptScripts(child, projectRoot, results);
      }
    }

    return results;
  }

  async performSearch(query: string): Promise<void> {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    this.searchDebounceTimer = setTimeout(async () => {
      await this.executeSearch(query);
    }, 150); // 150ms debounce
  }

  private async executeSearch(query: string): Promise<void> {
    if (query.trim() === "") {
      setResults([]);
      return;
    }

    setLoading(true);

    try {
      this.logger.debug("Performing search:", query);
      const results: QuickLauncherResult[] = [];

      // Search files using existing file search service
      const fileResults = await fileSearchService.searchFiles(
        query,
        undefined,
        15,
      );

      // Add file results
      fileResults.forEach((fileResult) => {
        results.push({
          type: "file",
          data: fileResult,
        });
      });

      // Search through recent chats
      const chatResults = quickLauncherState.recentPromptScripts.filter((script) => {
        const searchText = `${script.title} ${script.relativePath}`.toLowerCase();
        return searchText.includes(query.toLowerCase());
      });

      // Add highlighted chat results
      chatResults.forEach((script) => {
        const highlighted: PromptScriptSearchResult = {
          ...script,
          highlightTokens: this.highlightText(script.relativePath, query),
        };

        results.push({
          type: "promptScript",
          data: highlighted,
        });
      });

      // Sort results: chats first, then files
      results.sort((a, b) => {
        if (a.type === "promptScript" && b.type === "file") return -1;
        if (a.type === "file" && b.type === "promptScript") return 1;
        return 0;
      });

      setResults(results);
      this.logger.debug(`Search completed: ${results.length} results`);
    } catch (error) {
      this.logger.error("Search failed:", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  private highlightText(
    text: string,
    query: string,
  ): Array<{ text: string; isHighlighted: boolean }> {
    if (!query || query.trim() === "") {
      return [{ text, isHighlighted: false }];
    }

    const tokens: Array<{ text: string; isHighlighted: boolean }> = [];
    const regex = new RegExp(
      `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi",
    );
    const parts = text.split(regex);

    for (let i = 0; i < parts.length; i++) {
      if (parts[i]) {
        const isHighlighted = i % 2 === 1; // Odd indices are matches
        tokens.push({
          text: parts[i],
          isHighlighted,
        });
      }
    }

    return tokens.length > 0 ? tokens : [{ text, isHighlighted: false }];
  }

  async selectResult(result: QuickLauncherResult): Promise<void> {
    try {
      if (result.type === "promptScript") {
        const script = result.data as PromptScriptSearchResult;
        this.logger.info("Opening prompt script:", script.absolutePath);
        expandParentDirectories(script.absolutePath);
        await documentClientService.openDocument(script.absolutePath, { focus: true });
      } else {
        const fileData = result.data as ProjectFileSearchResult;
        this.logger.info("Opening file:", fileData.absolutePath);

        // Use tree store to select the file
        expandParentDirectories(fileData.absolutePath);
        selectFile(fileData.absolutePath);
      }
    } catch (error) {
      this.logger.error("Failed to select result:", error);
      throw error;
    }
  }

  cleanup(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
  }
}

export const quickLauncherService = new QuickLauncherService();
