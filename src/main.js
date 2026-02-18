const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const ID3 = require('node-id3');

let mainWindow;

// Pliki przekazane przez argumenty CLI (np. "Otwórz za pomocą...")
function getFilesFromArgs(argv) {
    // W trybie spakowanym argv[0] to executable, w dev argv[0] to electron, argv[1] to skrypt
    const args = process.defaultApp
        ? argv.slice(2)
        : argv.slice(1);

    return args.filter(arg => {
        if (!arg || arg.startsWith('-') || arg.startsWith('--')) return false;
        try {
            return fsSync.existsSync(arg) && fsSync.statSync(arg).isFile();
        } catch {
            return false;
        }
    });
}

async function createWindow() {
    let appIcon = null;
    
    try {
        const iconPath = path.join(__dirname, '../build/icon.png');
        if (fsSync.existsSync(iconPath)) {
            appIcon = nativeImage.createFromPath(iconPath);
            if (appIcon.isEmpty()) appIcon = null;
        }
    } catch (e) {
        console.log('Błąd ładowania ikony:', e.message);
    }

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        icon: appIcon,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false
        },
        frame: true,
        titleBarStyle: 'default',
        backgroundColor: '#f8fafc',
        show: false,
        title: 'MP3 Tagger'
    });

    Menu.setApplicationMenu(null);
    
    mainWindow.loadFile(path.join(__dirname, '../assets/index.html'))
        .then(() => {
            if (appIcon && !appIcon.isEmpty()) {
                mainWindow.setIcon(appIcon);
            }
            setTimeout(() => {
                mainWindow.show();
                mainWindow.focus();

                // Wyślij pliki z argumentów CLI po załadowaniu okna
                const initialFiles = getFilesFromArgs(process.argv);
                if (initialFiles.length > 0) {
                    mainWindow.webContents.send('open-files', initialFiles);
                }
            }, 150);
        })
        .catch(err => {
            console.error('Błąd ładowania interfejsu:', err);
            mainWindow.show();
        });
    
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }
    
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

if (process.platform === 'linux') {
    app.commandLine.appendSwitch('disable-gpu-sandbox');
    app.commandLine.appendSwitch('no-sandbox');
}

// Single instance lock — gdy aplikacja już działa i użytkownik otwiera kolejny plik
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, argv) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();

            // Wyślij nowe pliki z argumentów do już działającej instancji
            const newFiles = getFilesFromArgs(argv);
            if (newFiles.length > 0 && mainWindow.webContents) {
                mainWindow.webContents.send('open-files', newFiles);
            }
        }
    });
}

const startApp = async () => {
    try {
        await app.whenReady();
        await createWindow();
        
        globalShortcut.register('CommandOrControl+Shift+I', () => {
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.openDevTools({ mode: 'detach' });
            }
        });
    } catch (error) {
        console.error('Błąd uruchamiania aplikacji:', error);
        app.quit();
    }
};

startApp();

app.on('window-all-closed', () => {
    globalShortcut.unregisterAll();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

// ===== IPC HANDLERS =====
require('./handlers/file-handlers')(ipcMain, dialog, mainWindow);
require('./handlers/tag-handlers')(ipcMain, ID3, fs, path);
