# Multi Terminal Wiki

Multi Terminal is an Electron desktop app for Windows that lets you run and organize multiple terminal sessions inside one window.

## What it does

- Organizes terminals into workspaces
- Supports single, horizontal split, vertical split, and 2x2 grid layouts
- Saves command history locally
- Restores workspaces, tabs, and visible terminal content between launches
- Lets users choose from detected local shells

## Quick links

- [[Getting Started]]
- [[User Guide]]
- [[Development]]
- [[Architecture]]
- [[Releases]]
- [[Publishing This Wiki]]

## Platform notes

- The current app is built for Windows packaging and launch flows.
- On Windows, the app attempts to relaunch itself with administrator privileges if it is not already elevated.
- Shell detection currently includes PowerShell, CMD, PowerShell 7 when installed, and Git Bash when installed in the default location.

## Repository layout

```text
src/main/        Electron main process and IPC
src/renderer/    App UI, terminal management, styling
assets/          App icon and packaged assets
scripts/         Windows helper launch scripts
.github/workflows/ Release automation
wiki/            GitHub Wiki-ready Markdown pages
```
