# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Run**: `npm start`
- **Run (dev mode)**: `npm run dev` (passes `--dev` flag to Electron)
- **Build installer**: `npm run dist` (produces Windows NSIS installer via Electron Builder)

No test runner or linter is configured.

## Architecture

**Multi Terminal** is an Electron app for managing multiple terminal sessions on Windows. It uses `node-pty` to spawn real shell processes and `xterm.js` for terminal emulation in the renderer.

### Process Split

**Main process** (`src/main/main.js`):
- Spawns and manages PTY processes (stored in a `Map<id, ptyProcess>`)
- Handles IPC for terminal create/write/resize/kill, shell enumeration, and session/history persistence
- Checks for admin elevation on startup and re-launches elevated if needed
- Detects available shells (PowerShell 7, PowerShell, CMD, Git Bash) by checking known paths

**Preload** (`src/main/preload.js`):
- Exposes `window.terminal` and `window.windowControls` to the renderer via `contextBridge`

**Renderer** (`src/renderer/renderer.js`, ~1300 lines):
- All UI state lives in module-level `Map`s: `terminals`, `workspaces`, `termInputs`, `termHistoryIdx`
- `createTerminal()` initializes an xterm.js instance and calls `startTerminalProcess()` to wire up IPC data/exit listeners
- Layouts are CSS classes on `.panes-container` (`.layout-single`, `.layout-hsplit`, `.layout-vsplit`, `.layout-grid`); `setLayout()` switches them and calls `fitAllTerminals()`
- Session state is serialized to JSON and persisted via IPC with a 400ms debounce (`saveSession`) and a synchronous variant (`saveSessionSync`) used on window close
- Command history supports inline ghost-text suggestions (`findSuggestion`) and a searchable modal panel

### Persistence

Stored in `app.getPath('userData')` (typically `%APPDATA%\Multi Terminal\`):
- `command-history.json` — command history array
- `session-state.json` — workspaces, terminals, layout, and trimmed buffer content

### xterm.js Setup

Each terminal uses `xterm.js` with the `FitAddon`, `WebLinksAddon`, and `WebglAddon`. The WebGL addon is loaded with a fallback to canvas if WebGL fails. Terminal content is trimmed before saving to avoid storing huge buffers.

### Build & Release

Electron Builder targets Windows x64 NSIS. The GitHub Actions workflow (`.github/workflows/release.yml`) builds on `windows-latest`, uploads artifacts, and publishes a GitHub Release when a version tag (`v*`) is pushed.
