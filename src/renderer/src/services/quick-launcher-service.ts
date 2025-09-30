// src/renderer/src/services/quick-launcher-service.ts
import path from "node:path";
import { Logger } from "tslog";
import { projectState } from "../stores/project-store.svelte.js";
import {
  quickLauncherState,
  setResults,
  setRecentChats,
  setLoading,
  type ChatSearchResult,
  type QuickLauncherResult,
} from "../stores/quick-launcher-store.svelte.js";
import {
  selectFile,
  expandParentDirectories,
} from "../stores/tree-store.svelte.js";
import { chatService } from "./chat-service.js";
import { fileSearchService } from "./file-search-service.js";
import type { ProjectFileSearchResult } from "../../../core/services/project-folder-service.js";

class QuickLauncherService {
  private logger = new Logger({ name: "QuickLauncherService" });
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  async loadRecentChats(): Promise<void> {
    try {
      this.logger.debug("Loading recent chats");
      const recentChats: ChatSearchResult[] = [];

      // Scan project folders for .chat.json files
      for (const projectFolder of projectState.projectFolders) {
        const folderTree = projectState.folderTrees[projectFolder.path];
        if (folderTree) {
          const chatFiles = await this.findChatFiles(folderTree);
          recentChats.push(...chatFiles);
        }
      }

      // Sort by last modified date (most recent first)
      recentChats.sort(
        (a, b) => b.lastModified.getTime() - a.lastModified.getTime(),
      );

      // Limit to 10 most recent chats
      const limitedChats = recentChats.slice(0, 10);

      setRecentChats(limitedChats);
      this.logger.debug(`Loaded ${limitedChats.length} recent chats`);
    } catch (error) {
      this.logger.error("Failed to load recent chats:", error);
      setRecentChats([]);
    }
  }

  private async findChatFiles(
    node: any,
    results: ChatSearchResult[] = [],
  ): Promise<ChatSearchResult[]> {
    if (!node) return results;

    // Check if this is a chat file
    if (!node.isDirectory && node.name?.endsWith(".chat.json")) {
      const relativePath = path.relative(
        projectState.projectFolders[0]?.path || "",
        node.path,
      );

      // Extract title from filename (remove .chat.json extension)
      const title = node.name
        .replace(".chat.json", "")
        .replace(/^chat\d+$/, "Untitled Chat");

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
        await this.findChatFiles(child, results);
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
      const chatResults = quickLauncherState.recentChats.filter((chat) => {
        const searchText = `${chat.title} ${chat.relativePath}`.toLowerCase();
        return searchText.includes(query.toLowerCase());
      });

      // Add highlighted chat results
      chatResults.forEach((chat) => {
        const highlightedChat: ChatSearchResult = {
          ...chat,
          highlightTokens: this.highlightText(chat.relativePath, query),
        };

        results.push({
          type: "chat",
          data: highlightedChat,
        });
      });

      // Sort results: chats first, then files
      results.sort((a, b) => {
        if (a.type === "chat" && b.type === "file") return -1;
        if (a.type === "file" && b.type === "chat") return 1;
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
      if (result.type === "chat") {
        const chatData = result.data as ChatSearchResult;
        this.logger.info("Opening chat:", chatData.absolutePath);

        // Use chat service to open the chat file
        await chatService.openChatFile(chatData.absolutePath);
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
