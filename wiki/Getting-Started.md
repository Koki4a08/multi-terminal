# Getting Started

## Requirements

- Windows
- Node.js 18 or newer
- npm

## Run from source

```bash
npm install
npm start
```

Available npm scripts:

- `npm start`: launch the Electron app
- `npm run dev`: launch Electron with `--dev`
- `npm run dist`: build a Windows installer with Electron Builder

## First launch

When the app opens:

1. Pick a shell from the shell dropdown if needed.
2. Create a workspace.
3. Add one or more terminal tabs.
4. Choose a layout for that workspace.

If the process is not already elevated on Windows, the app will try to relaunch as administrator and show the normal Windows UAC prompt.

## Windows helper scripts

The repository includes launch helpers:

- `launch.bat`: starts Electron from the repo root
- `start-hidden.vbs`: launches the app without showing a console window
- `create-shortcut.vbs`: runs the shortcut creation helper
- `scripts/create-shortcut.vbs`: creates a desktop shortcut that points to the hidden launcher

## Build an installer

```bash
npm run dist
```

Packaged output is written to `dist/`.
