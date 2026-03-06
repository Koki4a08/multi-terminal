# Multi Terminal

Multi Terminal is an Electron desktop app for running and organizing multiple terminal sessions in a single Windows interface.

## Features

- Multiple terminal panes with single, split, and grid layouts
- Workspace-based organization for terminal groups
- Command history with search and quick reuse
- Session persistence between launches
- Shell selection for available local shells

## Install

### Option 1: Run from source

1. Install [Node.js](https://nodejs.org/) 18 or newer.
2. Clone this repository.
3. Install dependencies:

```bash
npm install
```

4. Start the app:

```bash
npm start
```

### Option 2: Build a Windows installer

Use Electron Builder to generate a Windows installer:

```bash
npm run dist
```

The packaged output is created in `dist/`.

### Option 3: Publish installer through GitHub Releases

This repository includes a GitHub Actions workflow at `.github/workflows/release.yml`.

Push a version tag such as `v1.0.1` to trigger a Windows build and upload the generated installer to the matching GitHub Release.

## How To Use

When the app opens, create a workspace or launch a quick terminal from the welcome screen.

### Main workflow

1. Choose a shell from the shell dropdown if you do not want the default shell.
2. Click `New Workspace` to create a grouped set of terminals for one project or task.
3. Click `New Terminal` to add another terminal to the active workspace.
4. Switch layouts with the layout buttons:
   - `Single`
   - `Split Horizontal`
   - `Split Vertical`
   - `Grid 2x2`
5. Use the workspace tabs and terminal tabs to switch context quickly.

### Command history

- Press `Ctrl+H` to open command history.
- Search previous commands and paste them back into the active terminal.
- Clear saved history from the history panel if needed.

### Keyboard shortcuts

- `Ctrl+Shift+N`: new workspace
- `Ctrl+N`: new terminal
- `Ctrl+W`: close active terminal
- `Ctrl+Tab`: next terminal
- `Ctrl+Shift+Tab`: next workspace
- `Ctrl+\`: cycle layouts
- `Ctrl+G`: switch to grid layout
- `Ctrl+1` to `Ctrl+9`: jump to a terminal in the active workspace

### Session behavior

- The app saves workspaces, open terminals, and terminal buffer content between launches.
- Command history is stored locally on your machine.

## Development Notes

- `npm start`: run the Electron app locally
- `npm run dist`: build the Windows installer with Electron Builder
