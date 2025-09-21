# AGENTS.md

This file provides guidance to code agent when working with code in this repository.

## Project Structure

This is an Electron desktop application with integrated core business logic:

- **src/core/**: Central business logic with tRPC server, services, and event system (moved from packages/events-core)
- **src/main/**: Electron main process
- **src/preload/**: Electron preload scripts
- **src/renderer/**: Svelte 5 frontend with Vite and TailwindCSS (moved from apps/my-app-svelte)

## Essential Commands

### Development

```bash
# Electron app development
npm dev        # Start development server (includes tRPC server and renderer)
npm run build      # Build for production
npm run test       # Run tests
npm run typecheck  # Type checking (includes both node and svelte)
npm run format     # Format code with Prettier
npm run lint       # ESLint code checking
```

### Build Commands

```bash
npm run build:unpack  # Build without packaging
npm run build:win     # Build for Windows
npm run build:mac     # Build for macOS
npm run build:linux   # Build for Linux
```

## Architecture Overview

### Core Design Patterns

**Event-Driven Architecture**: All system communication flows through a central EventBus using pub/sub patterns with strongly typed events for both client and server sides.

**tRPC API Layer**: Type-safe end-to-end API with modular routers (chatClient, task, file, projectFolder, event, userSettings) and real-time capabilities via subscriptions.

**Repository Pattern**: Consistent data access layer with file-based persistence using human-readable JSON files for chats, tasks, and settings.

### Key Services

- **ChatSessionRepository**: Manages chat session lifecycle and message persistence
- **ChatClient**: Handles AI chat sessions with streaming responses and tool execution
- **ExternalChatClient**: Manages terminal-based chat sessions for external models
- **TaskService**: Handles task creation, status tracking, and directory management with repository pattern
- **FileService**: Manages file operations and artifact creation with watch capabilities
- **ProjectFolderService**: Workspace management and project registration with real-time folder watching
- **FileWatcherService**: Real-time file system monitoring using chokidar
- **ToolRegistry**: Manages tool registration and execution with AI SDK v5 integration
- **UserSettingsService**: Handles user configuration and preferences
- **PtyService**: Terminal emulation service for external chat integration

### Chat Engine Architecture

The system uses AI SDK v5 for chat functionality:

- **ChatClient Router**: Handles both AI and external chat session management, message processing, and tool call coordination
- **AI SDK Integration**: Native support for multiple providers (Anthropic, OpenAI, Google) with tool calling
- **External Chat System**: Terminal-based execution for external models like Claude Code
- **Content Generator**: Enhanced chat features with streaming and tool execution in `src/core/services/chat-engine/`
- **Tool Call System**: Integrated tool execution with approval workflows and real-time progress tracking
- **Queue Management**: Model-based scheduling system for managing chat requests

### Frontend Integration

**Electron App**: Desktop application using Electron with Svelte 5 renderer. Uses direct tRPC client with Svelte 5 runes-based reactive stores (`*.svelte.ts`) for state management. Includes comprehensive UI components:

- **Chat Interface**: Message display with tool call execution and approval workflows
- **File Explorer**: Tree-based file browser with context menu and search capabilities
- **Tool Call UI**: Real-time progress tracking, permission confirmations, and result display
- **Project Management**: Workspace folder management and file watching

The frontend directly imports TypeScript types from the integrated `src/core/` modules.

## Architecture Details

### Package Management

Uses npm with Node.js >=18 requirement. All dependencies are managed at the root level. The project uses electron-vite as the build system.

### Type Safety

All inter-service communication is strongly typed through tRPC with SuperJSON for complex data serialization. Event system uses discriminated unions for type-safe event handling with correlation IDs for request tracing.

### File System Integration

Services interact directly with the file system for persistence, with structured JSON formats and real-time file watching capabilities.

### Event System Usage

Central EventBus with strongly-typed events (`ClientEventUnion` | `ServerEventUnion`) including:

- Task lifecycle events (creation, updates, completion)
- File system events (watching, changes, artifacts)
- Tool call events (registration, execution, approval)
- Real-time subscriptions via tRPC with async iterators and proper cleanup

### Server Architecture

The embedded tRPC server (`HttpTrpcServer`) runs on localhost and handles:

- Dynamic port allocation (prefers 3333, falls back to available port)
- Modular router structure with dedicated routers for different domains
- CORS enabled for cross-origin requests
- Graceful startup/shutdown with resource cleanup

## Development Guidelines

### General

- **No backward compatibility required** - Always write the best, most modern code without considering legacy support
- **MVP approach:**
  - Keep development lean and simple, avoid over-engineering
  - **Don't reinvent the wheel** - Use installed libraries and packages when available
  - If a library provides a ready-made class, use it directly instead of creating wrapper classes
  - Leverage existing solutions rather than building custom implementations
- **Core principles:**
  - **Explicit is better than implicit** - Always favor explicit declarations, clear function signatures, and obvious code intent over clever shortcuts
- **TypeScript best practices:**
  - Ensure full type safety
  - Avoid using `as` type assertions
  - Follow strict TypeScript conventions
  - Explicitly type function parameters and return values
  - Use explicit imports/exports instead of wildcards
  - **Prefer native library types** - When using external libraries, import and use their native types instead of creating custom definitions
- **Native types principle:**
  - **Always use library's native types when available** - Avoid creating custom types that duplicate or wrap existing library types
  - **Import types directly from the source** - Use the exact types that library functions expect and return
  - **Examples:**
    - ✅ **Good**: Using AI SDK's native `ModelMessage` type for chat messages

      ```typescript
      import { streamText, type ModelMessage } from "ai";

      const messages: ModelMessage[] = [{ role: "user", content: "Hello" }];

      const result = await streamText({
        model: openai("gpt-4"),
        messages, // Native ModelMessage[] type
      });
      ```

    - ❌ **Bad**: Creating custom message type that duplicates library functionality

      ```typescript
      // Don't do this
      interface CustomMessage {
        role: string;
        content: string;
      }

      const messages: CustomMessage[] = [...];
      // Then converting to library format later
      ```

- **Code organization:**
  - No centralized type/schema/event definition files
  - Define types, schemas, and events directly in their responsible files (services, repositories, routes)
  - **No index.ts files** - Use direct imports instead of barrel exports
- **Error handling:**
  - Minimal error handling approach
  - Avoid try/catch blocks - let errors bubble up naturally
  - Throw errors directly when needed
- **Documentation:**
  - Add comments only when necessary
  - Keep comments clear, concise, and lean
  - Include file relative path as comment on first line: `// path/to/file.ts`
- **Output language:** English only

### Backend

- **Technology stack:**
  - Node.js with TypeScript
  - tRPC for API layer
  - Logger: tslog

### UI Design

- **Design Philosophy:** Minimal, compact, aesthetic - inspired mostly by Grok, partially by Notion and VS Code
- **Layout Structure:** Three-panel layout
  - **Left Sidebar:** File explorer/projects with collapsible tree structure
  - **Center Panel:** Chat conversation with message display, input area, file preview/edit overlay
  - **Right Panel:** Chat control and artifacts
- **Color Palette:** Dark theme with minimal contrast using consistent background colors
  - `--color-background: #181818` (universal background for panels, sidebars, content areas)
  - `--color-surface: #1f1f1f` (text input and elevated surfaces)
  - `--color-border: #2b2b2b` (subtle borders and separators)
  - `--color-muted: #9d9d9d` (secondary text and icons)
  - `--color-hover: #2b2b2b` (interactive hover states)
  - `--color-selected: #2b2b2b` (active/selected items)
  - `--color-accent: #4a90e2` (primary interactive elements)
  - `--color-foreground: #cccccc` (primary text)
- **Typography:** System default sans-serif fonts for native appearance, 14px base font size
- **Spacing:** Compact design with consistent padding/margins, 12px header heights, minimal gaps
- **Icons:** Bootstrap Icons for consistent iconography throughout the interface
- **Interactive Elements:**
  - Hover states with subtle opacity changes and color transitions
  - Context-aware buttons that appear on hover using group-hover patterns
  - Rounded corners (rounded-md, rounded-2xl) for modern appearance
  - Smooth transitions for state changes and interactions
- **Component Patterns:**
  - Collapsible sections with chevron indicators
  - Status badges for chat states (running, paused)
  - Contextual menus with three-dots icons
  - File references with @-syntax and clickable links
  - Overlay panels for file preview and prompt editing in center panel
- **Reference Design Files:**
  - Main UI: `notes/ui_design/design-ui-v12_1_base_optimized.html`
  - Prompt Editor: `notes/ui_design/design-ui-v12_1_prompt_editor.html`
  - Screenshot: `screenshots/screencapture-file-Users-cw-Documents-GitHub-electron-app-notes-ui-design-design-ui-v12-1-base-optimized-html-2025-09-07-10_54_57.png`

### Frontend

- **Technology stack:**
  - Svelte v5 with TypeScript
  - Vanilla tRPC (client-side)
  - Logger: tslog
- **UI Framework:**
  - Tailwind CSS v4
  - Shadcn-svelte (for Svelte v5 & Tailwind v4)
  - Bootstrap icons (svelte-bootstrap-icons)
- **Frontend Architecture:**
  - The frontend employs a decoupled architecture to separate logic, state, and presentation.
  - **Service Layer (`/services`):** This layer contains all business logic. Services are responsible for orchestrating API calls, handling complex operations, and acting as the primary interface for any action that modifies the application.
  - **State Layer (`/stores`):** All application state is managed here using reactive Svelte stores. Stores are the single source of truth for UI data and should ideally only be mutated by the service layer to ensure predictable state management.
  - **Component Layer (`/components`):** Svelte components are dedicated to presentation. Their role is to subscribe to stores for data and render the UI accordingly. User interactions within components trigger calls to the service layer to perform actions, rather than directly manipulating state.
- **Svelte v5 best practices:**
  - **Use runes for reactivity** - Prefer `$state()`, `$derived()`, `$effect()`, and `$props()` over legacy syntax
  - **Event handlers as properties** - Use `onclick={handler}` instead of `on:click={handler}`
  - **Snippets over slots** - Use `{#snippet name()}{/snippet}` and `{@render name()}` instead of `<slot>`
  - **Component instantiation** - Use `mount(Component, options)` instead of `new Component(options)`
  - **Modern component types** - Use `Component<Props>` type instead of `SvelteComponent<Props>`
  - **Explicit bindable props** - Mark bindable props with `$bindable()` in runes mode
  - **Component callbacks** - Use callback props instead of `createEventDispatcher()`
  - **Strict HTML structure** - Ensure valid HTML structure (browser won't auto-repair in SSR)
  - **Scoped CSS awareness** - CSS now uses `:where(.svelte-hash)` for scoping

# Important Instruction Reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (\*.md) or README files. Only create documentation files if explicitly requested by the User.
