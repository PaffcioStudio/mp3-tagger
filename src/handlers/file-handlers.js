const { shell } = require('electron');
const fsSync = require('fs');

module.exports = function(ipcMain, dialog, mainWindow) {
    
    ipcMain.handle('select-folder', async () => {
        try {
            const win = mainWindow || require('electron').BrowserWindow.getFocusedWindow();
            const result = await dialog.showOpenDialog(win, {
                properties: ['openDirectory', 'multiSelections']
            });
            return result.canceled ? [] : result.filePaths;
        } catch (error) {
            console.error('Błąd wyboru folderu:', error.message);
            return [];
        }
    });

    ipcMain.handle('select-files', async () => {
        try {
            const win = mainWindow || require('electron').BrowserWindow.getFocusedWindow();
            const result = await dialog.showOpenDialog(win, {
                properties: ['openFile', 'multiSelections'],
                filters: [
                    { name: 'Pliki audio', extensions: ['mp3', 'flac', 'ogg', 'aac', 'm4a', 'wav', 'wma'] },
                    { name: 'Wszystkie pliki', extensions: ['*'] }
                ]
            });
            return result.canceled ? [] : result.filePaths;
        } catch (error) {
            console.error('Błąd wyboru plików:', error.message);
            return [];
        }
    });

    ipcMain.handle('select-image', async () => {
        try {
            const win = mainWindow || require('electron').BrowserWindow.getFocusedWindow();
            const result = await dialog.showOpenDialog(win, {
                properties: ['openFile'],
                filters: [
                    { name: 'Obrazy', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'webp'] },
                    { name: 'Wszystkie pliki', extensions: ['*'] }
                ]
            });
            if (result.canceled || !result.filePaths.length) return null;
            const p = result.filePaths[0];
            // Sprawdź czy plik istnieje i ma rozsądny rozmiar (max 10 MB)
            try {
                const stat = fsSync.statSync(p);
                if (stat.size > 10 * 1024 * 1024) {
                    return { error: 'Plik okładki jest za duży (max 10 MB).' };
                }
            } catch {
                return null;
            }
            return p;
        } catch (error) {
            console.error('Błąd wyboru obrazu:', error.message);
            return null;
        }
    });
    
    ipcMain.handle('open-file-location', (event, filePath) => {
        try {
            if (filePath && typeof filePath === 'string' && fsSync.existsSync(filePath)) {
                shell.showItemInFolder(filePath);
            }
        } catch (error) {
            console.error('Błąd otwierania lokalizacji pliku:', error.message);
        }
    });

    ipcMain.handle('save-cover-file', async (event, { base64Data, mimeType, defaultName }) => {
        try {
            const win = require('electron').BrowserWindow.getFocusedWindow();
            const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/gif' ? 'gif' : mimeType === 'image/bmp' ? 'bmp' : 'jpg';
            const result = await dialog.showSaveDialog(win, {
                title: 'Eksportuj okładkę',
                defaultPath: (defaultName || 'cover') + '.' + ext,
                filters: [
                    { name: 'Obraz', extensions: [ext] },
                    { name: 'Wszystkie pliki', extensions: ['*'] }
                ]
            });
            if (result.canceled || !result.filePath) return { success: false, canceled: true };

            const fs = require('fs').promises;
            const buf = Buffer.from(base64Data, 'base64');
            await fs.writeFile(result.filePath, buf);
            return { success: true, filePath: result.filePath };
        } catch (error) {
            console.error('Błąd eksportu okładki:', error.message);
            return { success: false, error: error.message };
        }
    });
};
