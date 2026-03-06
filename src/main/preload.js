const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('terminal', {
    // Create a new terminal process (renderer passes numeric id + optional shell)
    create: (optionsOrId, shell) => {
        const options = typeof optionsOrId === 'object'
            ? optionsOrId
            : { id: optionsOrId, shell };
        return ipcRenderer.invoke('terminal:create', options);
    },

    // Write data to a terminal
    write: (id, data) => ipcRenderer.send('terminal:write', { id, data }),

    // Resize a terminal
    resize: (id, cols, rows) => ipcRenderer.send('terminal:resize', { id, cols, rows }),

    // Kill a terminal
    kill: (id) => ipcRenderer.invoke('terminal:kill', id),

    // Get available shells
    getShells: () => ipcRenderer.invoke('terminal:getShells'),

    // Listen for terminal data (filtered by id)
    onData: (id, callback) => {
        const handler = (event, payload) => {
            if (payload.id === id) callback(payload.data);
        };
        ipcRenderer.on('terminal:data', handler);
        return () => ipcRenderer.removeListener('terminal:data', handler);
    },

    // Listen for terminal exit (filtered by id)
    onExit: (id, callback) => {
        const handler = (event, payload) => {
            if (payload.id === id) callback(payload.exitCode);
        };
        ipcRenderer.on('terminal:exit', handler);
        return () => ipcRenderer.removeListener('terminal:exit', handler);
    },

    // Command history persistence
    getHistory: () => ipcRenderer.invoke('history:get'),
    saveHistory: (history) => ipcRenderer.invoke('history:save', history),

    // Session persistence
    getSession: () => ipcRenderer.invoke('session:get'),
    saveSession: (session) => ipcRenderer.invoke('session:save', session),
    saveSessionSync: (session) => ipcRenderer.sendSync('session:saveSync', session),
});

contextBridge.exposeInMainWorld('windowControls', {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
});
