// ─── Multi Terminal — Renderer ─────────────────────────────────────────
// xterm.js modules loaded via <script> tags (UMD builds)
const { Terminal } = window;
const { FitAddon } = window.FitAddon;
const { WebLinksAddon } = window.WebLinksAddon;

// ─── State ─────────────────────────────────────────────────────────────
const state = {
    terminals: new Map(),    // id -> { term, fitAddon, paneEl, shell, workspaceId, disposeData, disposeExit }
    workspaces: new Map(),   // id -> { id, name, layout, terminalIds, activeTerminalId }
    activeWorkspaceId: null,
    counter: 0,
    workspaceCounter: 0,
    commandHistory: [],      // persisted command history
    termInputs: new Map(),   // id -> current input string
    termHistoryIdx: new Map(), // id -> history index for up/down nav
    showingSuggestion: false,
    currentSuggestion: null,
    suggestionTermId: null,
    sessionSaveTimer: null,
};

// ─── Constants ─────────────────────────────────────────────────────────
const MAX_HISTORY = 500;
const MAX_SAVED_BUFFER_LINES = 2000;
const MAX_SAVED_BUFFER_CHARS = 200000;
const SESSION_SAVE_DEBOUNCE_MS = 400;
const TERMINAL_LOADING_FALLBACK_MS = 1200;
const DEFAULT_LAYOUT = 'single';
const LAYOUT_TERMINAL_COUNT = { single: 1, hsplit: 2, vsplit: 2, grid: 4 };
const TERM_OPTIONS = {
    fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
    fontSize: 13,
    lineHeight: 1.35,
    letterSpacing: 0.3,
    cursorBlink: true,
    cursorStyle: 'bar',
    cursorWidth: 2,
    allowProposedApi: true,
    scrollback: 5000,
    theme: {
        background: '#121214',
        foreground: '#e4e4e7',
        cursor: '#a1a1aa',
        cursorAccent: '#121214',
        selectionBackground: 'rgba(161, 161, 170, 0.25)',
        selectionForeground: '#ffffff',
        black: '#1f1f22',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e4e4e7',
        brightBlack: '#71717a',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#ffffff',
    }
};

// ─── Load History from Main Process ────────────────────────────────────
async function loadHistory() {
    try {
        const history = await window.terminal.getHistory();
        if (Array.isArray(history)) {
            state.commandHistory = history;
        }
    } catch (e) {
        console.log('No saved history found');
    }
}

function saveHistory() {
    try {
        window.terminal.saveHistory(state.commandHistory);
    } catch (e) {
        console.error('Failed to save history:', e);
    }
}

function setAppLoading(isLoading) {
    document.getElementById('app-loading')?.classList.toggle('hidden', !isLoading);
}

function createTerminalLoader() {
    const loader = document.createElement('div');
    loader.className = 'terminal-loader';
    loader.setAttribute('aria-hidden', 'true');
    loader.innerHTML = `
        <div class="loader-shell">
            <div class="loader-spinner"></div>
            <div class="loader-copy">
                <h2>Starting terminal</h2>
                <p>Waiting for shell prompt.</p>
            </div>
        </div>
    `;
    return loader;
}

function clearTerminalLoader(info) {
    if (!info) return;
    if (info.loaderTimer) {
        clearTimeout(info.loaderTimer);
        info.loaderTimer = null;
    }
    if (info.loaderEl && !info.loaderEl.classList.contains('hidden')) {
        info.loaderEl.classList.add('hidden');
        setTimeout(() => info.loaderEl?.remove(), 180);
    }
}

function getWorkspace(id = state.activeWorkspaceId) {
    return id == null ? null : state.workspaces.get(id) || null;
}

function getActiveWorkspace() {
    return getWorkspace();
}

function getActiveTerminalId() {
    return getActiveWorkspace()?.activeTerminalId ?? null;
}

function syncLayoutButtons() {
    const activeLayout = getActiveWorkspace()?.layout || DEFAULT_LAYOUT;
    document.querySelectorAll('.layout-btn[data-layout]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.layout === activeLayout);
    });
}

function getSessionState() {
    return {
        counter: state.counter,
        workspaceCounter: state.workspaceCounter,
        activeWorkspaceId: state.activeWorkspaceId,
        workspaces: [...state.workspaces.values()].map(workspace => ({
            id: workspace.id,
            name: workspace.name,
            layout: workspace.layout,
            activeTerminalId: workspace.activeTerminalId,
            terminals: workspace.terminalIds.map(id => {
                const info = state.terminals.get(id);
                return {
                    id,
                    shell: info?.shell || null,
                    content: info ? extractTerminalContent(info.term) : '',
                };
            }),
        })),
    };
}

function trimSavedContent(content, maxChars = MAX_SAVED_BUFFER_CHARS) {
    if (!content || content.length <= maxChars) {
        return content || '';
    }

    return content.slice(-maxChars);
}

function sanitizeRestoredContent(content) {
    if (!content) return '';

    const withoutOsc = content.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '');
    const withoutCsi = withoutOsc.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
    const withoutEsc = withoutCsi.replace(/\x1b[@-_]/g, '');
    const normalized = withoutEsc.replace(/\r/g, '');
    return trimSavedContent(normalized, MAX_SAVED_BUFFER_CHARS);
}

function extractTerminalContent(term) {
    if (!term || !term.buffer || !term.buffer.active) {
        return '';
    }

    const buffer = term.buffer.active;
    const startLine = Math.max(0, buffer.length - MAX_SAVED_BUFFER_LINES);
    const lines = [];

    for (let i = startLine; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (!line) continue;
        lines.push(line.translateToString(true));
    }

    const content = lines.join('\n');
    if (content.length <= MAX_SAVED_BUFFER_CHARS) {
        return content;
    }

    return content.slice(-MAX_SAVED_BUFFER_CHARS);
}

function restoreTerminalContent(term, content) {
    if (!content) return;

    const normalizedContent = content.replace(/\r?\n/g, '\r\n');
    term.write(normalizedContent);
    if (!normalizedContent.endsWith('\r\n')) {
        term.write('\r\n');
    }
}

async function startTerminalProcess(id) {
    const info = state.terminals.get(id);
    if (!info) return false;
    if (info.backendReady) return true;
    if (info.backendStartPromise) return info.backendStartPromise;

    const shellToUse = info.shell || document.getElementById('shell-select').value || undefined;
    info.backendStartPromise = window.terminal.create({ id, shell: shellToUse })
        .then((result) => {
            if (!result || result.success === false) {
                throw new Error(result?.error || 'Failed to create terminal process');
            }
            const latest = state.terminals.get(id);
            if (!latest) return false;
            latest.backendReady = true;
            latest.backendStartPromise = null;
            return true;
        })
        .catch((error) => {
            const latest = state.terminals.get(id);
            if (latest) {
                latest.backendStartPromise = null;
                latest.backendReady = false;
            }
            console.error('Failed to start terminal process:', error);
            return false;
        });

    return info.backendStartPromise;
}

function saveSession() {
    try {
        window.terminal.saveSession(getSessionState());
    } catch (e) {
        console.error('Failed to save session:', e);
    }
}

function saveSessionSync() {
    try {
        window.terminal.saveSessionSync(getSessionState());
    } catch (e) {
        console.error('Failed to save session synchronously:', e);
    }
}

function scheduleSessionSave() {
    if (state.sessionSaveTimer) {
        clearTimeout(state.sessionSaveTimer);
    }

    state.sessionSaveTimer = setTimeout(() => {
        state.sessionSaveTimer = null;
        saveSession();
    }, SESSION_SAVE_DEBOUNCE_MS);
}

function normalizeSession(session) {
    if (!session) return null;

    if (Array.isArray(session.workspaces)) {
        return {
            counter: Number.isInteger(session.counter) ? session.counter : 0,
            workspaceCounter: Number.isInteger(session.workspaceCounter)
                ? session.workspaceCounter
                : session.workspaces.reduce((max, workspace) => Math.max(max, workspace?.id || 0), 0),
            activeWorkspaceId: Number.isInteger(session.activeWorkspaceId) ? session.activeWorkspaceId : null,
            workspaces: session.workspaces,
        };
    }

    if (Array.isArray(session.terminals)) {
        return {
            counter: Number.isInteger(session.counter) ? session.counter : 0,
            workspaceCounter: 1,
            activeWorkspaceId: 1,
            workspaces: [{
                id: 1,
                name: 'Workspace 1',
                layout: typeof session.layout === 'string' ? session.layout : DEFAULT_LAYOUT,
                activeTerminalId: Number.isInteger(session.activeId) ? session.activeId : null,
                terminals: session.terminals,
            }],
        };
    }

    return null;
}

async function restoreSession() {
    try {
        const rawSession = await window.terminal.getSession();
        const session = normalizeSession(rawSession);
        if (!session || !Array.isArray(session.workspaces) || session.workspaces.length === 0) {
            return false;
        }

        state.counter = session.counter;
        state.workspaceCounter = session.workspaceCounter;

        for (const workspaceConfig of session.workspaces) {
            if (!workspaceConfig || !Number.isInteger(workspaceConfig.id)) continue;
            createWorkspace(workspaceConfig.name, workspaceConfig.id, workspaceConfig.layout, { activate: false, skipSave: true });

            for (const terminalConfig of workspaceConfig.terminals || []) {
                if (!terminalConfig || !Number.isInteger(terminalConfig.id)) continue;
                createTerminal(terminalConfig.shell, terminalConfig.id, terminalConfig.content, workspaceConfig.id, {
                    activate: false,
                    skipSave: true,
                });
            }

            const workspace = getWorkspace(workspaceConfig.id);
            if (!workspace) continue;
            if (Number.isInteger(workspaceConfig.activeTerminalId) && workspace.terminalIds.includes(workspaceConfig.activeTerminalId)) {
                workspace.activeTerminalId = workspaceConfig.activeTerminalId;
            } else if (workspace.terminalIds.length > 0) {
                workspace.activeTerminalId = workspace.terminalIds[0];
            }
        }

        const preferredWorkspaceId = session.activeWorkspaceId && state.workspaces.has(session.activeWorkspaceId)
            ? session.activeWorkspaceId
            : [...state.workspaces.keys()][0];
        if (preferredWorkspaceId != null) {
            setActiveWorkspace(preferredWorkspaceId, { skipSave: true });
        }

        updateLayoutVisibility();
        updateWelcome();
        return state.workspaces.size > 0;
    } catch (e) {
        console.error('Failed to restore session:', e);
        return false;
    }
}

function addToHistory(cmd) {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    // Remove duplicate if exists
    const idx = state.commandHistory.indexOf(trimmed);
    if (idx !== -1) state.commandHistory.splice(idx, 1);
    state.commandHistory.push(trimmed);
    if (state.commandHistory.length > MAX_HISTORY) {
        state.commandHistory = state.commandHistory.slice(-MAX_HISTORY);
    }
    saveHistory();
}

// ─── Suggestion Engine ─────────────────────────────────────────────────
function findSuggestion(input) {
    if (!input || input.length < 2) return null;
    // Search history from newest to oldest
    for (let i = state.commandHistory.length - 1; i >= 0; i--) {
        const cmd = state.commandHistory[i];
        if (cmd.startsWith(input) && cmd !== input) {
            return cmd;
        }
    }
    return null;
}

function showSuggestion(termId, input) {
    const suggestion = findSuggestion(input);
    const popup = document.getElementById('suggestion-popup');
    const textEl = document.getElementById('suggestion-text');

    if (!suggestion) {
        hideSuggestion();
        return;
    }

    const matchPart = input;
    const completionPart = suggestion.substring(matchPart.length);

    textEl.innerHTML = `<span class="match">${escapeHtml(matchPart)}</span><span class="completion">${escapeHtml(completionPart)}</span>`;

    // Position near the active terminal's cursor
    const termInfo = state.terminals.get(termId);
    if (termInfo) {
        const paneRect = termInfo.paneEl.getBoundingClientRect();
        // Place above terminal bottom
        popup.style.left = `${paneRect.left + 20}px`;
        popup.style.bottom = `${window.innerHeight - paneRect.bottom + 8}px`;
        popup.style.top = 'auto';
    }

    popup.classList.remove('hidden');
    state.showingSuggestion = true;
    state.currentSuggestion = suggestion;
    state.suggestionTermId = termId;
}

function hideSuggestion() {
    const popup = document.getElementById('suggestion-popup');
    popup.classList.add('hidden');
    state.showingSuggestion = false;
    state.currentSuggestion = null;
    state.suggestionTermId = null;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ─── History Panel ─────────────────────────────────────────────────────
function toggleHistoryPanel() {
    const panel = document.getElementById('history-panel');
    if (panel.classList.contains('hidden')) {
        openHistoryPanel();
    } else {
        closeHistoryPanel();
    }
    document.getElementById('btn-history').classList.toggle('active', !panel.classList.contains('hidden'));
}

function openHistoryPanel() {
    const panel = document.getElementById('history-panel');
    panel.classList.remove('hidden');
    document.getElementById('btn-history').classList.add('active');
    const searchEl = document.getElementById('history-search');
    searchEl.value = '';
    renderHistoryList('');
    searchEl.focus();
}

function closeHistoryPanel() {
    document.getElementById('history-panel').classList.add('hidden');
    document.getElementById('btn-history').classList.remove('active');
    const info = state.terminals.get(getActiveTerminalId());
    if (info) info.term.focus();
}

function renderHistoryList(filter) {
    const list = document.getElementById('history-list');
    const q = (filter || '').trim().toLowerCase();
    const entries = state.commandHistory
        .map((cmd, idx) => ({ cmd, idx }))
        .reverse()
        .filter(({ cmd }) => !q || cmd.toLowerCase().includes(q));

    if (entries.length === 0) {
        list.innerHTML = `<div class="history-empty">${q ? 'No matches found' : 'No history yet'}</div>`;
        return;
    }

    list.innerHTML = '';
    entries.forEach(({ cmd, idx }) => {
        const item = document.createElement('div');
        item.className = 'history-item';

        item.innerHTML = `
            <div class="history-cmd" title="${escapeHtml(cmd)}">${escapeHtml(cmd)}</div>
            <div class="history-actions">
                <button class="history-btn history-paste-btn" title="Paste to terminal">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <polyline points="4 17 10 11 4 5"></polyline>
                        <line x1="12" y1="19" x2="20" y2="19"></line>
                    </svg>
                </button>
                <button class="history-btn history-edit-btn" title="Edit entry">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="history-btn history-delete-btn" title="Delete entry">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
                    </svg>
                </button>
            </div>
        `;

        item.querySelector('.history-paste-btn').addEventListener('click', () => pasteToTerminal(cmd));
        item.querySelector('.history-edit-btn').addEventListener('click', () => startEditHistoryEntry(item, idx, cmd));
        item.querySelector('.history-delete-btn').addEventListener('click', () => deleteHistoryEntry(idx));

        list.appendChild(item);
    });
}

function startEditHistoryEntry(itemEl, idx, currentCmd) {
    itemEl.innerHTML = `
        <div class="history-edit-row">
            <input type="text" class="history-edit-input" value="${escapeHtml(currentCmd)}" autocomplete="off" spellcheck="false" />
            <button class="history-save-btn">Save</button>
            <button class="history-cancel-btn">Cancel</button>
        </div>
    `;
    const input = itemEl.querySelector('.history-edit-input');
    input.focus();
    input.select();

    const save = () => {
        const newVal = input.value.trim();
        if (newVal && newVal !== currentCmd) {
            state.commandHistory[idx] = newVal;
            saveHistory();
        }
        renderHistoryList(document.getElementById('history-search').value);
    };

    const cancel = () => renderHistoryList(document.getElementById('history-search').value);

    itemEl.querySelector('.history-save-btn').addEventListener('click', save);
    itemEl.querySelector('.history-cancel-btn').addEventListener('click', cancel);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        e.stopPropagation();
    });
}

function deleteHistoryEntry(idx) {
    state.commandHistory.splice(idx, 1);
    saveHistory();
    renderHistoryList(document.getElementById('history-search').value);
}

function pasteToTerminal(cmd) {
    const activeId = getActiveTerminalId();
    if (!activeId) return;
    // Ctrl+U clears the current line, then write the command without newline
    window.terminal.write(activeId, '\x15' + cmd);
    state.termInputs.set(activeId, cmd);
    state.termHistoryIdx.set(activeId, -1);
    const info = state.terminals.get(activeId);
    if (info) info.term.focus();
    closeHistoryPanel();
}

// ─── Workspace & Terminal Management ───────────────────────────────────
function renderWorkspaceTabs() {
    const container = document.getElementById('workspace-tabs-container');
    container.innerHTML = '';

    [...state.workspaces.values()].forEach(workspace => {
        const tab = document.createElement('button');
        tab.className = 'tab workspace-tab';
        tab.dataset.workspaceId = workspace.id;
        tab.classList.toggle('active', workspace.id === state.activeWorkspaceId);
        tab.innerHTML = `
            <span>${escapeHtml(workspace.name)}</span>
            <div class="tab-close" data-workspace-id="${workspace.id}">
                <svg width="8" height="8" viewBox="0 0 12 12"><path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </div>
        `;

        tab.addEventListener('click', (e) => {
            if (e.target.closest('.tab-close')) {
                closeWorkspace(workspace.id);
            } else {
                setActiveWorkspace(workspace.id);
            }
        });

        container.appendChild(tab);
    });
}

function renderTerminalTabs() {
    const container = document.getElementById('terminal-tabs-container');
    container.innerHTML = '';

    const workspace = getActiveWorkspace();
    if (!workspace) return;

    workspace.terminalIds.forEach(id => {
        const tab = document.createElement('button');
        tab.className = 'tab terminal-tab';
        tab.dataset.id = id;
        tab.classList.toggle('active', id === workspace.activeTerminalId);
        tab.innerHTML = `
            <span>Terminal ${id}</span>
            <div class="tab-close" data-id="${id}">
                <svg width="8" height="8" viewBox="0 0 12 12"><path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </div>
        `;

        tab.addEventListener('click', (e) => {
            if (e.target.closest('.tab-close')) {
                closeTerminal(id);
            } else {
                setActiveTerminal(id);
            }
        });

        container.appendChild(tab);
    });
}

function createWorkspace(name, requestedId, layout = DEFAULT_LAYOUT, options = {}) {
    const id = Number.isInteger(requestedId) ? requestedId : ++state.workspaceCounter;
    if (Number.isInteger(requestedId)) {
        state.workspaceCounter = Math.max(state.workspaceCounter, requestedId);
    }

    state.workspaces.set(id, {
        id,
        name: name || `Workspace ${id}`,
        layout,
        terminalIds: [],
        activeTerminalId: null,
    });

    if (options.activate !== false || state.activeWorkspaceId == null) {
        state.activeWorkspaceId = id;
    }

    renderWorkspaceTabs();
    renderTerminalTabs();
    syncLayoutButtons();
    updateWelcome();

    if (!options.skipSave) {
        scheduleSessionSave();
    }

    return id;
}

function createWorkspaceWithTerminal() {
    const workspaceId = createWorkspace(null, null, DEFAULT_LAYOUT, { activate: true, skipSave: true });
    createTerminal(undefined, null, '', workspaceId, { activate: true, skipSave: true });
    scheduleSessionSave();
    return workspaceId;
}

function setActiveWorkspace(id, options = {}) {
    const workspace = getWorkspace(id);
    if (!workspace) return;

    state.activeWorkspaceId = id;
    if (!workspace.activeTerminalId && workspace.terminalIds.length > 0) {
        workspace.activeTerminalId = workspace.terminalIds[0];
    }

    hideSuggestion();
    renderWorkspaceTabs();
    renderTerminalTabs();
    syncLayoutButtons();
    updateLayoutVisibility();
    updateWelcome();
    fitAllTerminals();

    const info = state.terminals.get(workspace.activeTerminalId);
    if (info) info.term.focus();

    if (!options.skipSave) {
        scheduleSessionSave();
    }
}

function closeWorkspace(id) {
    const workspace = getWorkspace(id);
    if (!workspace) return;

    [...workspace.terminalIds].forEach(termId => closeTerminal(termId, { skipSave: true }));
    state.workspaces.delete(id);

    const nextWorkspaceId = state.activeWorkspaceId === id
        ? ([...state.workspaces.keys()].at(-1) ?? null)
        : state.activeWorkspaceId;

    if (nextWorkspaceId != null) {
        state.activeWorkspaceId = nextWorkspaceId;
        setActiveWorkspace(nextWorkspaceId, { skipSave: true });
        scheduleSessionSave();
        return;
    }

    state.activeWorkspaceId = null;
    renderWorkspaceTabs();
    renderTerminalTabs();
    syncLayoutButtons();
    updateLayoutVisibility();
    updateWelcome();
    fitAllTerminals();
    scheduleSessionSave();
}

// ─── Terminal Management ───────────────────────────────────────────────
function createTerminal(shell, requestedId, restoredContent, workspaceId = state.activeWorkspaceId, options = {}) {
    if (workspaceId == null) {
        workspaceId = createWorkspace(null, null, DEFAULT_LAYOUT, { activate: true, skipSave: true });
    }

    const workspace = getWorkspace(workspaceId);
    if (!workspace) return null;

    const id = Number.isInteger(requestedId) ? requestedId : ++state.counter;
    if (Number.isInteger(requestedId)) {
        state.counter = Math.max(state.counter, requestedId);
    }

    // Create pane element
    const paneEl = document.createElement('div');
    paneEl.className = 'terminal-pane';
    paneEl.dataset.termId = id;
    paneEl.dataset.workspaceId = workspaceId;

    const header = document.createElement('div');
    header.className = 'pane-header';
    header.innerHTML = `
        <div class="pane-title">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="4 17 10 11 4 5"></polyline>
            </svg>
            <span>${escapeHtml(workspace.name)} · Terminal ${id}</span>
        </div>
        <button class="pane-close" data-id="${id}" title="Close">
            <svg width="8" height="8" viewBox="0 0 12 12"><path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
    `;
    paneEl.appendChild(header);

    const wrapper = document.createElement('div');
    wrapper.className = 'terminal-wrapper';
    paneEl.appendChild(wrapper);

    const loaderEl = createTerminalLoader();
    wrapper.appendChild(loaderEl);

    // Close button
    header.querySelector('.pane-close').addEventListener('click', (e) => {
        e.stopPropagation();
        closeTerminal(id);
    });

    // Focus on click
    paneEl.addEventListener('mousedown', () => setActiveTerminal(id));

    document.getElementById('panes-container').appendChild(paneEl);

    // Create xterm instance
    const term = new Terminal(TERM_OPTIONS);
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(wrapper);

    // Store terminal info
    state.terminals.set(id, {
        term,
        fitAddon,
        paneEl,
        loaderEl,
        loaderTimer: null,
        shell: null,
        workspaceId,
        disposeData: null,
        disposeExit: null,
        backendReady: false,
        backendStartPromise: null,
        pendingInput: '',
        restoredSnapshotVisible: Boolean(restoredContent),
    });
    state.termInputs.set(id, '');
    state.termHistoryIdx.set(id, -1);
    state.terminals.get(id).loaderTimer = setTimeout(() => {
        const terminalInfo = state.terminals.get(id);
        clearTerminalLoader(terminalInfo);
    }, TERMINAL_LOADING_FALLBACK_MS);
    workspace.terminalIds.push(id);
    if (!workspace.activeTerminalId) {
        workspace.activeTerminalId = id;
    }
    const shellToUse = shell || document.getElementById('shell-select').value || undefined;
    state.terminals.get(id).shell = shellToUse || null;

    // Handle data from pty
    state.terminals.get(id).disposeData = window.terminal.onData(id, (data) => {
        const terminalInfo = state.terminals.get(id);
        if (terminalInfo) {
            clearTerminalLoader(terminalInfo);
        }
        term.write(data);
        scheduleSessionSave();
    });

    if (restoredContent) {
        const restoredSnapshot = sanitizeRestoredContent(restoredContent);
        clearTerminalLoader(state.terminals.get(id));
        restoreTerminalContent(term, restoredSnapshot);
    } else {
        startTerminalProcess(id);
    }

    // Handle user input — intercept for history & suggestions
    term.onData((data) => {
        const terminalInfo = state.terminals.get(id);
        if (!terminalInfo) return;

        if (!terminalInfo.backendReady) {
            terminalInfo.pendingInput += data;
            clearTerminalLoader(terminalInfo);
            if (terminalInfo.restoredSnapshotVisible) {
                terminalInfo.restoredSnapshotVisible = false;
                term.write('\r\n\r\n--- New session ---\r\n');
            }
            startTerminalProcess(id).then((started) => {
                const latestInfo = state.terminals.get(id);
                if (!started || !latestInfo || !latestInfo.pendingInput) return;
                const pending = latestInfo.pendingInput;
                latestInfo.pendingInput = '';
                window.terminal.write(id, pending);
            });
            return;
        }

        // Tab key — apply suggestion
        if (data === '\t' && state.showingSuggestion && state.suggestionTermId === id) {
            const currentInput = state.termInputs.get(id) || '';
            const completion = state.currentSuggestion.substring(currentInput.length);
            window.terminal.write(id, completion);
            state.termInputs.set(id, state.currentSuggestion);
            hideSuggestion();
            return;
        }

        // Arrow Up — history navigation (local suggestion sync)
        if (data === '\x1b[A') {
            let histIdx = state.termHistoryIdx.get(id);
            if (histIdx === -1) histIdx = state.commandHistory.length;
            if (histIdx > 0) {
                histIdx--;
                state.termHistoryIdx.set(id, histIdx);
                const cmd = state.commandHistory[histIdx];
                state.termInputs.set(id, cmd);
                showSuggestion(id, cmd);
            }
            // Let the shell handle the actual up arrow
            window.terminal.write(id, data);
            return;
        }

        // Arrow Down — history navigation (local suggestion sync)
        if (data === '\x1b[B') {
            let histIdx = state.termHistoryIdx.get(id);
            if (histIdx !== -1 && histIdx < state.commandHistory.length) {
                histIdx++;
                state.termHistoryIdx.set(id, histIdx);
                const cmd = histIdx < state.commandHistory.length ? state.commandHistory[histIdx] : '';
                state.termInputs.set(id, cmd);
                if (cmd) showSuggestion(id, cmd);
                else hideSuggestion();
            }
            // Let the shell handle the actual down arrow
            window.terminal.write(id, data);
            return;
        }

        let currentInput = state.termInputs.get(id) || '';

        let i = 0;
        while (i < data.length) {
            const char = data[i];
            const code = char.charCodeAt(0);

            if (char === '\x1b') {
                i++;
                let seq = '';
                while (i < data.length) {
                    const c = data[i];
                    i++;
                    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '~') {
                        break;
                    }
                }
                continue;
            }

            if (char === '\r') {
                addToHistory(currentInput);
                currentInput = '';
                state.termHistoryIdx.set(id, -1);
                hideSuggestion();
            } else if (char === '\x7f' || char === '\b') {
                currentInput = currentInput.slice(0, -1);
            } else if (code === 3) { // Ctrl+C
                currentInput = '';
                state.termHistoryIdx.set(id, -1);
                hideSuggestion();
            } else if (code === 21) { // Ctrl+U
                currentInput = '';
                hideSuggestion();
            } else if (code === 23) { // Ctrl+W
                currentInput = currentInput.replace(/[^ ]+[ ]*$/, '');
            } else if (code >= 32 && char !== '\t') {
                currentInput += char;
            }
            i++;
        }

        state.termInputs.set(id, currentInput);
        if (currentInput) {
            showSuggestion(id, currentInput);
        } else {
            hideSuggestion();
        }

        // Send input to the backend pty
        window.terminal.write(id, data);
        scheduleSessionSave();
    });

    // Handle pty exit
    state.terminals.get(id).disposeExit = window.terminal.onExit(id, () => closeTerminal(id));

    // Initial fit
    setTimeout(() => {
        fitAddon.fit();
        window.terminal.resize(id, term.cols, term.rows);
    }, 100);

    renderTerminalTabs();
    if (options.activate !== false) {
        setActiveTerminal(id, { skipSave: true });
    } else {
        updateLayoutVisibility();
    }
    updateWelcome();
    if (!options.skipSave) {
        scheduleSessionSave();
    }
    return id;
}

function closeTerminal(id, options = {}) {
    const info = state.terminals.get(id);
    if (!info) return;
    const workspace = getWorkspace(info.workspaceId);

    info.pendingInput = '';
    clearTerminalLoader(info);
    try { info.disposeData?.(); } catch (e) { /* ignore */ }
    try { info.disposeExit?.(); } catch (e) { /* ignore */ }
    info.term.dispose();
    info.paneEl.remove();
    state.terminals.delete(id);
    state.termInputs.delete(id);
    state.termHistoryIdx.delete(id);
    window.terminal.kill(id);

    if (workspace) {
        workspace.terminalIds = workspace.terminalIds.filter(termId => termId !== id);
        if (workspace.activeTerminalId === id) {
            workspace.activeTerminalId = workspace.terminalIds.at(-1) ?? null;
        }
    }

    renderTerminalTabs();

    if (workspace && workspace.id === state.activeWorkspaceId && workspace.activeTerminalId) {
        setActiveTerminal(workspace.activeTerminalId, { skipSave: true });
    }

    hideSuggestion();
    updateWelcome();
    updateLayoutVisibility();
    fitAllTerminals();
    if (!options.skipSave) {
        scheduleSessionSave();
    }
}

function setActiveTerminal(id, options = {}) {
    const info = state.terminals.get(id);
    if (!info) return;

    if (state.activeWorkspaceId !== info.workspaceId) {
        setActiveWorkspace(info.workspaceId, { skipSave: true });
    }

    const workspace = getWorkspace(info.workspaceId);
    if (!workspace) return;
    workspace.activeTerminalId = id;

    // Update pane focus
    document.querySelectorAll('.terminal-pane').forEach(p => p.classList.remove('focused'));
    info.paneEl.classList.add('focused');
    info.term.focus();

    renderTerminalTabs();
    updateLayoutVisibility();
    fitAllTerminals();
    if (!options.skipSave) {
        scheduleSessionSave();
    }
}

// ─── Layout Management ─────────────────────────────────────────────────
function setLayout(layout) {
    let workspace = getActiveWorkspace();
    if (!workspace) {
        createWorkspaceWithTerminal();
        workspace = getActiveWorkspace();
    }
    if (!workspace) return;

    workspace.layout = layout;
    const container = document.getElementById('panes-container');
    container.className = `layout-${layout}`;
    syncLayoutButtons();

    // Auto-create terminals to fill the layout
    const count = LAYOUT_TERMINAL_COUNT[layout] || 1;
    while (workspace.terminalIds.length < count) {
        createTerminal(undefined, null, '', workspace.id, {
            activate: !workspace.activeTerminalId,
            skipSave: true,
        });
    }

    updateLayoutVisibility();
    fitAllTerminals();
    scheduleSessionSave();
}

function updateLayoutVisibility() {
    const panes = Array.from(document.querySelectorAll('.terminal-pane'));
    const workspace = getActiveWorkspace();
    const layout = workspace?.layout || DEFAULT_LAYOUT;
    const max = LAYOUT_TERMINAL_COUNT[layout] || 1;

    document.getElementById('panes-container').className = `layout-${layout}`;

    // First hide everything
    panes.forEach(pane => {
        pane.style.display = 'none';
        pane.style.order = '0';
    });

    let visibleCount = 0;
    const orderedIds = !workspace
        ? []
        : layout === 'single' && workspace.activeTerminalId
            ? [workspace.activeTerminalId, ...workspace.terminalIds.filter(id => id !== workspace.activeTerminalId)]
            : [...workspace.terminalIds];

    // 1. Show the active terminal first
    if (orderedIds.length > 0) {
        const activePane = document.querySelector(`.terminal-pane[data-term-id="${orderedIds[0]}"]`);
        if (activePane) {
            activePane.style.display = '';
            activePane.style.order = '0';
            visibleCount++;
        }
    }

    // 2. Fill remaining slots with other terminals
    for (const id of orderedIds.slice(1)) {
        if (visibleCount >= max) break;
        const pane = document.querySelector(`.terminal-pane[data-term-id="${id}"]`);
        if (pane && pane.style.display === 'none') {
            pane.style.display = '';
            pane.style.order = String(visibleCount);
            visibleCount++;
        }
    }
}

function fitAllTerminals() {
    setTimeout(() => {
        const workspace = getActiveWorkspace();
        (workspace?.terminalIds || []).forEach(id => {
            const info = state.terminals.get(id);
            if (!info || info.paneEl.style.display === 'none') return;
            try {
                info.fitAddon.fit();
                window.terminal.resize(id, info.term.cols, info.term.rows);
            } catch (e) { /* ignore */ }
        });
    }, 50);
}

// ─── Welcome ───────────────────────────────────────────────────────────
function updateWelcome() {
    const welcome = document.getElementById('welcome-screen');
    const title = document.getElementById('welcome-title');
    const subtitle = document.getElementById('welcome-subtitle');
    const workspace = getActiveWorkspace();

    if (state.workspaces.size === 0) {
        title.textContent = 'Create your first workspace';
        subtitle.textContent = 'Group terminals by agent, task, or repo and switch between them faster.';
        welcome.classList.remove('hidden');
        return;
    }

    if (workspace && workspace.terminalIds.length === 0) {
        title.textContent = workspace.name;
        subtitle.textContent = 'This workspace is empty. Add a terminal to start working here.';
        welcome.classList.remove('hidden');
        return;
    }

    welcome.classList.add('hidden');
}

// ─── Shell Population ──────────────────────────────────────────────────
async function populateShells() {
    try {
        const shells = await window.terminal.getShells();
        const select = document.getElementById('shell-select');
        shells.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.path;
            opt.textContent = s.name;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error('Failed to get shells:', e);
    }
}

// ─── Event Bindings ────────────────────────────────────────────────────
function initEvents() {
    // New terminal buttons
    document.getElementById('btn-new-term').addEventListener('click', () => createTerminal());
    document.getElementById('btn-new-workspace').addEventListener('click', () => createWorkspaceWithTerminal());
    document.getElementById('btn-add-workspace').addEventListener('click', () => createWorkspaceWithTerminal());
    document.getElementById('btn-add-terminal-tab').addEventListener('click', () => createTerminal());
    document.getElementById('btn-welcome-workspace').addEventListener('click', () => createWorkspaceWithTerminal());
    document.getElementById('btn-welcome-terminal').addEventListener('click', () => createTerminal());

    // Layout buttons
    document.getElementById('btn-layout-single').addEventListener('click', () => setLayout('single'));
    document.getElementById('btn-layout-hsplit').addEventListener('click', () => setLayout('hsplit'));
    document.getElementById('btn-layout-vsplit').addEventListener('click', () => setLayout('vsplit'));
    document.getElementById('btn-layout-grid').addEventListener('click', () => setLayout('grid'));

    // Window controls
    document.getElementById('btn-minimize').addEventListener('click', () => window.windowControls.minimize());
    document.getElementById('btn-maximize').addEventListener('click', () => window.windowControls.maximize());
    document.getElementById('btn-close').addEventListener('click', () => window.windowControls.close());

    // History panel
    document.getElementById('btn-history').addEventListener('click', () => toggleHistoryPanel());
    document.getElementById('btn-history-close').addEventListener('click', () => closeHistoryPanel());
    document.getElementById('btn-history-clear').addEventListener('click', () => {
        if (confirm('Clear all command history?')) {
            state.commandHistory = [];
            saveHistory();
            renderHistoryList('');
        }
    });
    document.getElementById('history-search').addEventListener('input', (e) => {
        renderHistoryList(e.target.value);
    });
    document.getElementById('history-search').addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); closeHistoryPanel(); }
        e.stopPropagation();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl+H — toggle history panel (works even when an input is focused)
        if (e.ctrlKey && e.key === 'h') {
            e.preventDefault();
            toggleHistoryPanel();
            return;
        }

        // Don't fire terminal shortcuts when focus is inside an input
        if (e.target.tagName === 'INPUT') return;

        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'n') {
            e.preventDefault();
            createWorkspaceWithTerminal();
            return;
        }

        // Ctrl+N — new terminal
        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            createTerminal();
            return;
        }
        // Ctrl+W — close active
        if (e.ctrlKey && e.key === 'w') {
            e.preventDefault();
            const activeId = getActiveTerminalId();
            if (activeId) closeTerminal(activeId);
            return;
        }
        // Ctrl+Shift+Tab — next workspace
        if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
            e.preventDefault();
            const ids = [...state.workspaces.keys()];
            if (ids.length > 1) {
                const idx = ids.indexOf(state.activeWorkspaceId);
                setActiveWorkspace(ids[(idx + 1) % ids.length]);
            }
            return;
        }
        // Ctrl+\ — toggle split
        if (e.ctrlKey && e.key === '\\') {
            e.preventDefault();
            const layouts = ['single', 'hsplit', 'vsplit', 'grid'];
            const current = layouts.indexOf(getActiveWorkspace()?.layout || DEFAULT_LAYOUT);
            setLayout(layouts[(current + 1) % layouts.length]);
            return;
        }
        // Ctrl+G — grid
        if (e.ctrlKey && e.key === 'g') {
            e.preventDefault();
            setLayout('grid');
            return;
        }
        // Ctrl+Tab — next terminal
        if (e.ctrlKey && e.key === 'Tab') {
            e.preventDefault();
            const ids = [...(getActiveWorkspace()?.terminalIds || [])];
            if (ids.length > 1) {
                const idx = ids.indexOf(getActiveTerminalId());
                setActiveTerminal(ids[(idx + 1) % ids.length]);
            }
            return;
        }
        // Ctrl+1-9 — jump to terminal
        if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
            e.preventDefault();
            const ids = [...(getActiveWorkspace()?.terminalIds || [])];
            const idx = parseInt(e.key) - 1;
            if (idx < ids.length) setActiveTerminal(ids[idx]);
        }
    });

    // Resize observer
    const observer = new ResizeObserver(() => fitAllTerminals());
    observer.observe(document.getElementById('panes-container'));
}

// ─── Init ──────────────────────────────────────────────────────────────
async function init() {
    setAppLoading(true);
    try {
        await loadHistory();
        await populateShells();
        initEvents();
        updateWelcome();
        syncLayoutButtons();

        // Set initial layout
        document.getElementById('panes-container').className = `layout-${DEFAULT_LAYOUT}`;

        const restored = await restoreSession();
        if (!restored) {
            saveSession();
        }
    } finally {
        setAppLoading(false);
    }
}

window.addEventListener('beforeunload', () => {
    if (state.sessionSaveTimer) {
        clearTimeout(state.sessionSaveTimer);
        state.sessionSaveTimer = null;
    }
    saveSessionSync();
});

init();
