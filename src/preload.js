const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
    version: require('../package.json').version,
    // Wybór folderów/plików
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    selectFiles: () => ipcRenderer.invoke('select-files'),
    selectImage: () => ipcRenderer.invoke('select-image'),
    
    // Operacje na tagach
    readTags: (filePath) => ipcRenderer.invoke('read-tags', filePath),
    writeTags: (data) => ipcRenderer.invoke('write-tags', data),
    batchUpdate: (data) => ipcRenderer.invoke('batch-update', data),
    
    // Systemowe operacje
    openFileLocation: (filePath) => ipcRenderer.invoke('open-file-location', filePath),
    saveCoverFile: (data) => ipcRenderer.invoke('save-cover-file', data),

    // Wyszukiwanie okładek online (iTunes Search + Deezer, darmowe, bez kluczy)
    searchOnlineCovers: (query) => ipcRenderer.invoke('covers:search', query),
    downloadOnlineCover: (url) => ipcRenderer.invoke('covers:download', { url }),

    // Ścieżka pliku z drag&drop - Electron >= 32 usunął File.path,
    // oficjalny sposób to webUtils.getPathForFile (zwraca null na starszych)
    filePathOf: (file) => {
        try { return webUtils.getPathForFile(file); } catch { return null; }
    },
    
    // Debugowanie
    debugRawTags: (filePath) => ipcRenderer.invoke('debug-raw-tags', filePath),
    
    // Event listeners (IPC → renderer)
    on: (channel, callback) => {
        const allowed = ['open-files'];
        if (allowed.includes(channel)) {
            ipcRenderer.on(channel, callback);
        }
    },
    off: (channel, callback) => {
        ipcRenderer.removeListener(channel, callback);
    }
});
