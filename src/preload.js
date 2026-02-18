const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
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
