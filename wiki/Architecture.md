# Architecture

## Overview

The app uses a standard Electron split:

- Main process for native windowing, shell processes, and persistence
- Preload bridge for a minimal renderer API surface
- Renderer for UI state, terminal panes, layouts, and keyboard handling

## Main process responsibilities

File: `src/main/main.js`

Responsibilities:

- Create the BrowserWindow
- Remove the default application menu
- Relaunch with elevation on Windows when needed
- Spawn shell processes with `node-pty`
- Forward terminal output to the renderer
- Handle terminal resize and termination
- Detect available shells
- Save and load command history
- Save and load session state
- Handle custom window controls

## Preload responsibilities

File: `src/main/preload.js`

Responsibilities:

- Expose a `window.terminal` API for terminal, history, and session calls
- Expose a `windowControls` API for minimize, maximize, and close

## Renderer responsibilities

File: `src/renderer/renderer.js`

Responsibilities:

- Maintain workspace and terminal state in memory
- Render workspace tabs, terminal tabs, and panes
- Create and fit xterm instances
- Track command input for history suggestions
- Restore saved session snapshots
- Manage layout visibility
- Bind application keyboard shortcuts

## State model

Top-level renderer state includes:

- `terminals`: terminal metadata keyed by terminal id
- `workspaces`: workspace metadata keyed by workspace id
- `activeWorkspaceId`
- counters for workspace and terminal ids
- command history
- per-terminal input tracking for suggestions

## Session restore design

The renderer can restore previous visible terminal content without immediately launching all backend shell processes. If a terminal was restored from saved content, the new PTY is started on first interaction and the UI inserts a `--- New session ---` separator before forwarding pending input.

This keeps restore fast while still making it clear that a restored buffer snapshot is not the original process.

## Layout behavior

Each workspace stores its own layout. Visible pane count is determined by:

- `single`: 1
- `hsplit`: 2
- `vsplit`: 2
- `grid`: 4

The renderer hides or shows panes based on the active workspace and layout instead of destroying unused terminals.
