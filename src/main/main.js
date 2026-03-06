const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const pty = require('node-pty');
const { execSync } = require('node:child_process');

// ─── Admin Elevation Check ──────────────────────────────────
function isAdmin() {
    if (process.platform !== 'win32') return true;
    try {
        execSync('net session', { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
}

// Packaged Windows builds use the EXE manifest to request elevation on launch.
// Keep the manual relaunch only as a fallback for development/unpackaged runs.
if (process.platform === 'win32' && !app.isPackaged && !isAdmin()) {
    const exePath = process.argv[0];
    const args = process.argv.slice(1).join('" "');

    const cp = require('node:child_process');
    cp.exec(
        `powershell -Command "Start-Process '${exePath}' -ArgumentList '${args}' -Verb RunAs"`,
        (err) => { app.quit(); }
    );
    // Prevent the non-elevated instance from continuing
    app.quit();
    return;
}

// Store all terminal processes
const terminals = new Map();
let mainWindow;
const projectRoot = path.resolve(__dirname, '..', '..');

// History file path
const HISTORY_FILE = path.join(app.getPath('userData'), 'command-history.json');
const SESSION_FILE = path.join(app.getPath('userData'), 'session-state.json');

function getDefaultShell() {
    if (process.platform === 'win32') {
        return process.env.COMSPEC || 'powershell.exe';
    }
    return process.env.SHELL || '/bin/bash';
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 500,
        frame: false,
        transparent: false,
        backgroundColor: '#0a0a0f',
        titleBarStyle: 'hidden',
        titleBarOverlay: false,
        icon: path.join(projectRoot, 'assets', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    mainWindow.loadFile(path.join(projectRoot, 'src', 'renderer', 'index.html'));

    // Remove default menu
    Menu.setApplicationMenu(null);

    mainWindow.on('closed', () => {
        // Kill all terminal processes
        terminals.forEach((term) => {
            try { term.kill(); } catch (e) { /* ignore */ }
        });
        terminals.clear();
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// ─── IPC Handlers ───────────────────────────────────────────

// Create a new terminal — renderer sends { id: number, shell?: string }
ipcMain.handle('terminal:create', (event, options = {}) => {
    const id = options.id || Date.now();
    const shell = options.shell || getDefaultShell();
    const cwd = options.cwd || os.homedir();
    const cols = options.cols || 80;
    const rows = options.rows || 24;

    try {
        const ptyProcess = pty.spawn(shell, [], {
            name: 'xterm-256color',
            cols,
            rows,
            cwd,
            env: { ...process.env, TERM: 'xterm-256color' },
        });

        terminals.set(id, ptyProcess);

        // Forward data from pty to renderer
        ptyProcess.onData((data) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('terminal:data', { id, data });
            }
        });

        ptyProcess.onExit(({ exitCode }) => {
            terminals.delete(id);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('terminal:exit', { id, exitCode });
            }
        });

        return { success: true, id, shell, cwd };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Write data to a terminal
ipcMain.on('terminal:write', (event, { id, data }) => {
    const term = terminals.get(id);
    if (term) {
        term.write(data);
    }
});

// Resize a terminal
ipcMain.on('terminal:resize', (event, { id, cols, rows }) => {
    const term = terminals.get(id);
    if (term) {
        try {
            term.resize(cols, rows);
        } catch (e) { /* ignore resize errors */ }
    }
});

// Kill a terminal
ipcMain.handle('terminal:kill', (event, id) => {
    const term = terminals.get(id);
    if (term) {
        try { term.kill(); } catch (e) { /* ignore */ }
        terminals.delete(id);
        return { success: true };
    }
    return { success: false, error: 'Terminal not found' };
});

// Get available shells
ipcMain.handle('terminal:getShells', () => {
    const shells = [];
    if (process.platform === 'win32') {
        shells.push(
            { name: 'PowerShell', path: 'powershell.exe', icon: '⚡' },
            { name: 'CMD', path: 'cmd.exe', icon: '▶' },
        );
        // Check for PowerShell 7
        const pwsh7 = path.join(process.env.ProgramFiles || '', 'PowerShell', '7', 'pwsh.exe');
        try {
            fs.accessSync(pwsh7);
            shells.unshift({ name: 'PowerShell 7', path: pwsh7, icon: '⚡' });
        } catch (e) { /* not installed */ }
        // Check for Git Bash
        const gitBash = path.join(process.env.ProgramFiles || '', 'Git', 'bin', 'bash.exe');
        try {
            fs.accessSync(gitBash);
            shells.push({ name: 'Git Bash', path: gitBash, icon: '🐧' });
        } catch (e) { /* not installed */ }
    }
    return shells;
});

// ─── Command History Persistence ────────────────────────────

ipcMain.handle('history:get', () => {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Failed to read history:', e);
    }
    return [];
});

ipcMain.handle('history:save', (event, history) => {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history), 'utf-8');
        return { success: true };
    } catch (e) {
        console.error('Failed to save history:', e);
        return { success: false, error: e.message };
    }
});

// ─── Session Persistence ──────────────────────────────────────────────

ipcMain.handle('session:get', () => {
    try {
        if (fs.existsSync(SESSION_FILE)) {
            const data = fs.readFileSync(SESSION_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Failed to read session:', e);
    }
    return null;
});

ipcMain.handle('session:save', (event, session) => {
    try {
        fs.writeFileSync(SESSION_FILE, JSON.stringify(session), 'utf-8');
        return { success: true };
    } catch (e) {
        console.error('Failed to save session:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.on('session:saveSync', (event, session) => {
    try {
        fs.writeFileSync(SESSION_FILE, JSON.stringify(session), 'utf-8');
        event.returnValue = { success: true };
    } catch (e) {
        console.error('Failed to save session synchronously:', e);
        event.returnValue = { success: false, error: e.message };
    }
});

// ─── Window Controls ────────────────────────────────────────

ipcMain.on('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.on('window:close', () => {
    if (mainWindow) mainWindow.close();
});

ipcMain.handle('window:isMaximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
});
