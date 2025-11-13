# CLI Chat Session Integration: Summary and Plan

This document provides a summary of the discussion regarding the integration of external CLI-based chat models and outlines a concrete implementation plan for the chosen MVP approach. It also archives alternative ideas for future consideration.

---

### Part 1: Summary of Discussion

Our goal is to integrate external CLI chat workflows with the Electron application. The discussion evolved through several proposed designs, from complex automation to a simple, robust MVP.

1.  **Initial Idea: Full Automation & I/O Streaming**
    *   **Concept:** The app would manage a pseudo-terminal (pty) and stream a terminal's input/output to/from the app over a WebSocket.
    *   **Verdict:** Rejected for MVP. Deemed too complex and potentially brittle.

2.  **Second Idea: External Window Management**
    *   **Concept:** A simpler goal to just open and focus the correct external terminal window using OS-specific scripts.
    *   **Verdict:** Feasible, but still involved complexity in reliably identifying and tracking windows (the "tag and claim" problem).

3.  **Third Idea: External Monitoring Approaches**
    We explored ways to "watch" an external terminal from the outside to know when a task is complete.
    *   **Screenshot + OCR:** Periodically take screenshots of the terminal window and use Optical Character Recognition (OCR) to read its content.
        *   **Verdict:** Rejected. While creative, this is highly inefficient (CPU/battery intensive) and extremely brittle, as its success depends on the user's font, color theme, and the reliability of OCR.
    *   **Accessibility API ("VoiceOver" method):** Use the OS's accessibility APIs to programmatically read the text content of the terminal window, even if it's in the background.
        *   **Verdict:** A better approach than screenshots as it deals with clean text. However, it is still complex, requiring native OS-level integrations and permissions. It also only provides the currently visible text and depends on the specific terminal application's support for accessibility features.

4.  **Final MVP Design: "Assistive Copy" with "File System Sync"**
    *   **Concept:** The app assists the user by copying the prompt. The user runs the CLI tool independently. The app then "magically" syncs the session by watching the file system for new chat files created by the CLI tool.
    *   **Verdict:** **Chosen for the MVP.** This design is simple, robust, decoupled, and provides a seamless user experience without the brittleness of automation or screen-scraping.

---

### Part 2: MVP Implementation Plan (File-System Sync)

This plan outlines the steps to build the chosen "Assistive Copy" with "File System Sync" feature.

**Step 1: Define the File System "Contract"**

The app and the external CLI tool need to agree on a file format and location.

*   **Monitored Directory:** A designated directory where CLI tools will save chat session files (e.g., `~/YourAppName/chats/`). This should be configurable.
*   **File Naming Convention:** `session-[uuid].json`.
*   **JSON Schema:**
    ```json
    {
      "id": "string",
      "model": "string",
      "status": "string", // "running" | "completed" | "error"
      "createdAt": "string", // ISO 8601 timestamp
      "messages": [
        {
          "role": "string", // "user" | "assistant"
          "content": "string",
          "timestamp": "string" // ISO 8601 timestamp
        }
      ]
    }
    ```

**Step 2: Implement UI Changes in the Renderer**

*   **Location:** The relevant Svelte component for prompt submission.
*   **Actions:**
    1.  When a "CLI model" is selected, change the primary action button to **"Copy Prompt"**.
    2.  The button's `onclick` handler will use the `electron.clipboard.writeText()` API.
    3.  Add a secondary **"Open Terminal"** button that sends a request to the main process.

**Step 3: Implement Main Process Helpers**

*   **Location:** `src/main/` (e.g., in an IPC or tRPC handler).
*   **Actions:**
    1.  Create a handler for the "open-terminal" request.
    2.  The handler will use `child_process.exec` to run a simple command to open a new terminal window (e.g., `open -a Terminal` on macOS).

**Step 4: Configure the File Watcher Service**

*   **Location:** `src/core/services/file-watcher-service.ts`.
*   **Actions:**
    1.  Configure the service to watch the designated chat directory for `add` and `change` events on `.json` files.
    2.  On an event, emit a message on the central `EventBus` (e.g., `external-chat-file-updated`) with the file path.

**Step 5: Implement Session Syncing Logic**

*   **Location:** `src/core/services/ChatSessionRepository.ts` or a similar service.
*   **Actions:**
    1.  Subscribe to the `external-chat-file-updated` event.
    2.  The handler will read and parse the file.
    3.  It will then create or update the session in the application's state. The UI should update automatically via its existing reactive data flow.

---

### Part 3: Alternative Approaches Considered (Future Exploration)

These ideas were discussed but deferred in favor of the simpler file-system approach for the MVP. They are archived here for future reference.

**1. Screenshot + OCR Monitoring**

*   **Concept:** Periodically take screenshots of the terminal window and use OCR to read the text to determine the CLI tool's state.
*   **Pros:** Does not require the CLI tool to be modified in any way.
*   **Cons:** Highly brittle (sensitive to themes, fonts), inefficient (high CPU/battery usage), provides incomplete data (only visible text), and relies on error-prone OCR.
*   **Verdict:** Deferred due to high complexity and low reliability.

**2. Accessibility API Monitoring**

*   **Concept:** Use OS accessibility APIs (like VoiceOver) to programmatically read the text content of the terminal window.
*   **Pros:** More reliable than OCR as it deals with clean text, not pixels.
*   **Cons:** Dependent on the specific terminal app's accessibility support, provides incomplete data (only visible text), and requires complex native dependencies and OS permissions.
*   **Verdict:** Deferred. While better than screenshots, it is still more complex and less reliable for the stated goal than the file-system approach.