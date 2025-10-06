# PTY Chat Recording Architecture

This document outlines the architecture for reliably recording interactive CLI agent sessions within the application.

## 1. Overview & Goal

The primary goal is to create a robust system that can accurately capture the entire lifecycle of an interaction with a CLI-based agent (like Gemini, Claude, etc.) running in a PTY (pseudo-terminal) session.

The system must handle a variety of real-world complexities, including:
-   Multiple, distinct agent sessions within a single terminal instance.
-   Standard shell commands being used between agent sessions.
-   Terminal events like screen clearing.
-   Real-time streaming of agent responses.
-   Support for different types of agents with unique output styles.

## 2. Core Architecture

The design is centered around a few key components that separate real-time event detection from static content parsing, with the PTY's output stream being the single source of truth.

### Components

1.  **`PtyChatClient`**: The main public-facing service. It coordinates the creation of PTY instances and their associated chat sessions. It is the entry point for all PTY-related operations.

2.  **`PtyDataProcessor`**: The real-time "event detector". An instance of this class is created for each active PTY. Its sole responsibility is to listen to the live `onData` stream from the PTY, detect high-level events in real-time (e.g., a new agent starting, the screen clearing), and manage the state of the agent interaction (e.g., `isGenerating`).

3.  **`PtyChatSession`**: The data model, which acts as a "Terminal Log". There is one `PtyChatSession` per PTY instance, and it lives for the entire duration of the terminal. It stores a single, continuous list of messages and events. It contains the robust "anchor and merge" logic to safely update its message list from snapshots.

4.  **`PtyChatSnapshotExtractor`**: The static "content parser". Its job is to take a complete snapshot of the terminal buffer (as a string) and extract structured `ChatMessage` objects from it. It must be able to distinguish agent messages from other text like shell commands.

### Data Flow

The data flow is split into two parts:

**A) User Input (Client → Server)**
1.  User types in the frontend `xterm.js` terminal.
2.  The frontend captures this input via `xterm.onData()` and sends it to the backend via a tRPC call (e.g., `ptyRouter.write`).
3.  The `PtyChatClient` receives the data and writes it to the appropriate `node-pty` process.

**B) PTY Output & Recording (Server → Client & Internal)**
1.  The `node-pty` process executes the command and writes to its output stream. **This includes echoing the user's input**.
2.  The backend `PtyInstance` captures this output and emits an `onData` event.
3.  This event is processed **in parallel** by two listeners:
    -   **`PtyDataProcessor` (for Recording):** It appends the data to its buffer, detects real-time events (`newSession`, `screenRefresh`), manages `isGenerating` state, and triggers debounced or immediate calls to `PtyChatSession.updateFromSnapshot()`.
    -   **tRPC Subscription (for Display):** It immediately forwards the raw data chunk to the frontend.
4.  The frontend `xterm.js` instance receives the data from the subscription and writes it to the screen for the user to see.

## 3. Key Design Decisions & Rationale

#### Why rely on the PTY Output Stream? (Single Source of Truth)
Simply capturing raw user input is unreliable. Users use arrow keys, backspace, and other control characters, which produce complex ANSI escape codes (e.g., `\x1b[D` for left arrow). Interpreting this raw input would require building a full terminal emulator.

Instead, we let the shell (`bash`, etc.) do the hard work. The shell interprets all escape codes and, when the user hits Enter, echoes the final, clean command to the output. By parsing this output stream, we get the definitive, corrected user prompt. This stream also provides the perfect interleaving of user input and model output, exactly as it appears on screen.

#### Why a "Terminal Log" Model? (One Session Per PTY)
Instead of creating a new `PtyChatSession` object for each agent interaction, we create only one per PTY instance. This session lives as long as the terminal and acts as a continuous log.
-   **Rationale:** This vastly simplifies backend session management. We don't need complex logic to start, stop, and track multiple session objects.
-   **Trade-off:** This pushes complexity to the frontend, which must now parse the single message list and visually divide it into separate conversations based on special event messages (e.g., `cli:newSession`). This was a deliberate choice to favor backend simplicity.

#### Why a Robust "Anchor and Merge" Strategy?
A simple strategy of replacing the message list with the content of a new snapshot is flawed. If the screen is cleared, the new snapshot is smaller, and this would lead to data loss.
-   **Solution:** The `PtyChatSession.updateFromSnapshot` method implements a more resilient "anchor and merge" logic. It searches for the last known common message between its current state and the new snapshot.
    -   If an anchor is found, it appends the new data.
    -   If no anchor is found (the case after a screen clear), it treats the new content as a new block to be appended, preserving the old history.

#### Why Separate the `Processor` and `Extractor`?
-   **`PtyDataProcessor`** handles **real-time events**. It needs to react *immediately* to a signal in the live stream (e.g., an agent starting).
-   **`PtyChatSnapshotExtractor`** handles **static content parsing**. Its job is to make sense of a complete, static buffer at a single point in time.
-   **Rationale:** This separation of concerns is cleaner. The processor manages the "when," and the extractor manages the "what."

## 4. Extractor Specification

The `PtyChatSnapshotExtractor` is a critical component that requires further development. Its specification is documented in its source file.

#### Core Responsibilities
The extractor must be able to parse a snapshot and identify:
1.  **Welcome Message:** The initial output from the agent.
2.  **User Messages:** Prompts submitted by the user.
3.  **Model Messages:** Responses generated by the agent.
4.  **In-Agent Commands:** Special commands like `/clear`.
5.  **Exit Signals:** Output indicating the agent session has ended.
6.  **Tool Calls & Results:** Structured blocks for tool execution.

#### Future Enhancement Cases
The extractor must be robust enough to handle:
-   Interleaved non-agent shell commands.
-   Multiple distinct agent sessions in one snapshot.
-   Corrupted or partial markers.

## 5. Future Improvements

-   **Implement the full Extractor:** Build out the `PtyChatSnapshotExtractor` to meet the full specification documented in its comments, using real-world terminal data for testing.
-   **Support Multiple Extractor Types:** Implement the `IExtractor` interface and `ExtractorFactory` to allow for different parsing strategies for different agent types (Claude, Codex, etc.).
-   **Refine Start/Stop Signals:** While the current `PtyDataProcessor` uses prompt markers for start/stop signals, this could be further improved, perhaps by having agents emit explicit (invisible) end-of-turn characters.
