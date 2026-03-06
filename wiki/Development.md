# Development

## Stack

- Electron
- `node-pty`
- `xterm.js`
- Plain HTML, CSS, and JavaScript in the renderer

## Important files

- `src/main/main.js`: app bootstrap, window creation, IPC handlers, shell detection, persistence, window controls
- `src/main/preload.js`: safe bridge from renderer to Electron IPC
- `src/renderer/index.html`: application shell and UI structure
- `src/renderer/renderer.js`: workspace, terminal, layout, history, and session logic
- `src/renderer/styles.css`: desktop UI styling

## Local development

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm start
```

## How terminal sessions work

1. The renderer creates an xterm instance for a pane.
2. The renderer asks the preload bridge to create a backend terminal.
3. The main process calls `node-pty.spawn(...)`.
4. PTY output is forwarded back to the renderer over IPC.
5. Renderer input is sent to the backend with `terminal:write`.

## Persistence

Two JSON files are stored in Electron's `userData` directory:

- `command-history.json`
- `session-state.json`

History is saved after command updates. Session state is debounced during runtime and saved synchronously on window unload.

## Security model

- `nodeIntegration` is disabled
- `contextIsolation` is enabled
- Renderer access to backend functionality goes through `preload.js`

## Notes for contributors

- The current app is desktop-first and Windows-first.
- Packaging is configured through `electron-builder` in `package.json`.
- The release workflow builds on GitHub Actions using `windows-latest`.
