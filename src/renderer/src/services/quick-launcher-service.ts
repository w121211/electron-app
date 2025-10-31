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
import { trpcClient } from "../lib/trpc-client.js";
import type { PromptEdit } from "../../../core/services/prompt/prompt-edit-repository.js";

export interface PromptEditSummary {
  id: string;
  title: string;
  preview: string | null;
  scriptPath: string | null;
  relativePath: string | null;
  updatedAt: Date;
  isDraft: boolean;
}

class QuickLauncherService {
  private logger = new Logger({ name: "QuickLauncherService" });
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  async loadRecentPromptScripts(): Promise<void> {
    try {
      this.logger.debug("Loading recent prompt scripts");
      const edits = await trpcClient.promptEdit.getRecentEdits.query({
        limit: 50,
      });

      const scripts = this.toPromptScriptResults(edits);
      setRecentPromptScripts(scripts);
      this.logger.debug(`Loaded ${scripts.length} recent prompt scripts`);
    } catch (error) {
      this.logger.error("Failed to load recent prompt scripts:", error);
      setRecentPromptScripts([]);
    }
  }

  private toPromptScriptResults(edits: PromptEdit[]): PromptScriptSearchResult[] {
    const seen = new Set<string>();
    const results: PromptScriptSearchResult[] = [];

    for (const edit of edits) {
      const scriptPath = edit.promptScriptPath;
      if (!scriptPath || seen.has(scriptPath)) {
        continue;
      }

      const title = this.resolveTitle(scriptPath);
      const relativePath = this.resolveRelativePath(scriptPath);

      results.push({
        id: edit.id,
        title,
        relativePath,
        absolutePath: scriptPath,
        lastModified: new Date(edit.updatedAt),
        highlightTokens: [{ text: relativePath, isHighlighted: false }],
      });

      seen.add(scriptPath);
    }

    results.sort(
      (a, b) => b.lastModified.getTime() - a.lastModified.getTime(),
    );

    return results.slice(0, 10);
  }

  async fetchRecentPromptEdits(limit = 20): Promise<PromptEditSummary[]> {
    try {
      const edits = await trpcClient.promptEdit.getRecentEdits.query({ limit });
      return edits.map((edit) => this.toPromptEditSummary(edit));
    } catch (error) {
      this.logger.error("Failed to fetch recent prompt edits:", error);
      return [];
    }
  }

  private toPromptEditSummary(edit: PromptEdit): PromptEditSummary {
    const scriptPath = edit.promptScriptPath;
    const preview = this.normalizePreview(edit.contentDraft);
    const relativePath = scriptPath ? this.resolveRelativePath(scriptPath) : null;
    const isDraft = !scriptPath;

    const title = scriptPath
      ? this.resolveTitle(scriptPath)
      : preview ?? "Quick Prompt Draft";

    return {
      id: edit.id,
      title,
      preview,
      scriptPath,
      relativePath,
      updatedAt: new Date(edit.updatedAt),
      isDraft,
    };
  }

  private normalizePreview(preview: string | null | undefined): string | null {
    if (!preview) {
      return null;
    }

    const condensed = preview.replace(/\s+/g, " ").trim();
    if (condensed.length === 0) {
      return null;
    }

    const maxLength = 200;
    if (condensed.length > maxLength) {
      return `${condensed.slice(0, maxLength).trimEnd()}...`;
    }

    return condensed;
  }

  private resolveTitle(scriptPath: string): string {
    const filename = path.basename(scriptPath);
    return filename.replace(/\.prompt\.md$/i, "") || filename;
  }

  private resolveRelativePath(scriptPath: string): string {
    for (const projectFolder of projectState.projectFolders) {
      const relative = path.relative(projectFolder.path, scriptPath);
      if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
        return relative;
      }
      if (relative === "") {
        return path.basename(scriptPath);
      }
    }
    return scriptPath;
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
