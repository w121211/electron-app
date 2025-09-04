# New UI Components (v12.1 Design)

This directory contains the redesigned UI components based on the v12.1 design prototype. The new design features a compact, minimal, aesthetic interface inspired by modern development tools.

## Components Overview

### Core Layout Components

- **`MainLayout.svelte`** - Main application layout wrapper
- **`App.svelte`** - Root application component with UI toggle demo

### Sidebar Components

- **`file-explorer/ExplorerPanel.svelte`** - New compact sidebar with top icons, projects section, and settings
- **`file-explorer/TreeNode.svelte`** - Redesigned tree node with compact mode support
- **`file-explorer/FileIcon.svelte`** - File type icons (copied from original)
- **`file-explorer/ContextMenu.svelte`** - Right-click context menu (copied from original)
- **`file-explorer/RenameDialog.svelte`** - File rename dialog (copied from original)
- **`file-explorer/FileSearchDropdown.svelte`** - File search dropdown (copied from original)

### Chat Interface Components

- **`ChatPanel.svelte`** - Main chat interface with breadcrumb header and redesigned input area
- **`ChatMessage.svelte`** - Individual chat message display (copied from original)
- **`AiGenerationDisplay.svelte`** - AI response generation display (copied from original)
- **`ToolCallConfirmation.svelte`** - Tool execution confirmation (copied from original)

### Right Panel Components

- **`RightPanel.svelte`** - Chat control panel with project context and artifacts sections

### Supporting Components

- **`UserSettings.svelte`** - User settings modal (copied from original)
- **`ToastProvider.svelte`** - Toast notification system (copied from original)
- **`ToolResultDisplay.svelte`** - Tool execution results (copied from original)
- **`Versions.svelte`** - Version display component (copied from original)
- **`KeyboardShortcuts.svelte`** - Keyboard shortcuts help (copied from original)
- **`ProviderApiKeyRow.svelte`** - API key configuration row (copied from original)

## Design Features

### Visual Design System

The new UI implements the design system from the v12.1 prototype:

```css
/* Color Palette */
--color-background: #131314;     /* Main background */
--color-surface: #131314;        /* Panel backgrounds */
--color-panel: #1c1c1e;          /* Elevated panels */
--color-border: #2a2a2a;         /* Border color */
--color-foreground: #e4e4e6;     /* Main text */
--color-muted: #8e8e93;          /* Secondary text */
--color-accent: #60a5fa;         /* Accent/interactive elements */
--color-hover: #2c2c2e;          /* Hover states */
--color-selected: #28282a;       /* Selected states */
--color-input-background: #1d1d1f; /* Input backgrounds */
--color-input-border: #333333;   /* Input borders */

/* Typography */
font-family: "Inter", "Segoe UI", "Arial", sans-serif;
font-size: 14px;
```

### Layout Structure

The new UI follows a compact three-panel layout:

1. **Left Sidebar (264px)** - Project explorer with top icons, collapsible projects, and settings
2. **Main Content (flex-1)** - Chat interface with breadcrumb header and input area
3. **Right Panel (384px)** - Chat control with project context and artifacts

### Key Design Elements

- **Compact Tree View** - 24px minimum height rows with hover actions
- **Status Badges** - Chat status ("running", "paused") and file context indicators
- **Hover Actions** - Context menus, new chat buttons, and controls appear on hover
- **Modern Scrollbars** - Thin 6px scrollbars with rounded thumbs
- **Rounded Input Areas** - 24px border radius on chat input
- **Icon Integration** - Bootstrap Icons throughout with consistent sizing

## Functionality Preservation

All existing functionality has been preserved:

- **Project Management** - Add/create project folders, workspace setup
- **File Explorer** - Tree navigation, context menus, drag & drop
- **Chat Interface** - Message sending, file references (@), model selection
- **Tool Integration** - Tool call confirmation, result display
- **Settings** - User preferences, API keys, keyboard shortcuts
- **Real-time Updates** - File watching, connection status, chat updates

## Development Notes

### Component Architecture

The new components follow the existing architecture:
- **Service Layer** - Business logic and API calls
- **Store Layer** - Reactive state management with Svelte 5 runes
- **Component Layer** - Presentation with event handlers calling services

### Svelte 5 Features Used

- `$state()` - Component-local reactive state
- `$derived()` - Computed values from stores
- `$effect()` - Side effects and lifecycle management
- `$props()` - Component properties
- Event handlers as properties (`onclick={handler}`)

### Import Strategy

Components are organized to minimize dependencies:
- New components reference each other directly
- Shared utilities imported from original services/stores
- Supporting components copied to maintain isolation

## Usage

To use the new UI, import and use the new MainLayout:

```svelte
<script>
  import MainLayout from './components-new-ui/MainLayout.svelte';
  import ToastProvider from './components-new-ui/ToastProvider.svelte';
</script>

<MainLayout />
<ToastProvider />
```

The new UI is fully functional and maintains all existing features while providing a modern, compact, and aesthetic interface.