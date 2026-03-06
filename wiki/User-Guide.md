# User Guide

## Main concepts

### Workspace

A workspace is a group of terminals with its own active tab and layout.

### Terminal

A terminal is a single shell session backed by `node-pty`.

### Layout

Each workspace can be shown in one of four layouts:

- `Single`
- `Split Horizontal`
- `Split Vertical`
- `Grid 2x2`

When you switch to a layout that needs more panes than the workspace currently has, the app automatically creates extra terminals to fill the layout.

## Common actions

### Create a workspace

- Click `New Workspace`
- Or press `Ctrl+Shift+N`

This creates a workspace and immediately adds its first terminal.

### Add a terminal

- Click `New Terminal`
- Or press `Ctrl+N`

### Switch workspaces

- Click a workspace tab
- Or press `Ctrl+Shift+Tab`

### Switch terminals

- Click a terminal tab or pane
- Or press `Ctrl+Tab`
- Or press `Ctrl+1` through `Ctrl+9`

### Close a terminal

- Click the close icon on the terminal tab or pane
- Or press `Ctrl+W`

### Change layout

- Use the layout buttons in the title bar
- Or press `Ctrl+\` to cycle layouts
- Or press `Ctrl+G` for the 2x2 grid

## Shell selection

Use the shell dropdown in the title bar before creating a terminal. The app asks the main process for available shells and populates the selector at startup.

On Windows, the detected shells are:

- PowerShell
- CMD
- PowerShell 7 if installed in `Program Files\PowerShell\7\pwsh.exe`
- Git Bash if installed in `Program Files\Git\bin\bash.exe`

## Command history

Open the history panel with:

- The history button in the title bar
- `Ctrl+H`

What you can do there:

- Search saved commands
- Paste a previous command back into the active terminal
- Edit a saved command
- Delete a single entry
- Clear all history

The app keeps up to 500 history entries and stores them locally.

## Suggestions while typing

The renderer tracks the current input line and suggests matching commands from local history.

- Start typing a command
- If a newer matching command exists, a suggestion popup appears
- Press `Tab` to apply the suggestion

## Session restore

The app saves and restores:

- Workspaces
- Workspace layouts
- Open terminal ids
- Active workspace and active terminal
- A snapshot of visible terminal content

Saved terminal content is trimmed before persistence to avoid storing unbounded output.

## Welcome screen behavior

The welcome screen appears when:

- There are no workspaces yet
- The active workspace exists but has no terminals

## Limits and behavior notes

- Session restore restores terminal content snapshots, not the original live shell process.
- A restored terminal starts a new backend shell the first time the user interacts with it.
- The renderer keeps terminal scrollback in memory and separately stores a trimmed snapshot for restore.
