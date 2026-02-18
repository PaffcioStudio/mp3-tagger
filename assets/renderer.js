let currentFiles = [];
let currentFileIndex = -1;
let hasUnsavedChanges = false;
let searchFilter = '';
let isLoadingData = false;
let formChangeDebounceTimer = null;
let lastFormSnapshot = null;

const AUDIO_EXTENSIONS = new Set([
    'mp3','flac','ogg','oga','aac','m4a','mp4','wav','wave','wma','aiff','aif','opus','mka'
]);

// Gatunki i źródła załadowane z genres.js (ALL_GENRES, QUICK_GENRES, AUDIO_SOURCES)

class FileData {
    constructor(path, name) {
        this.path = path;
        this.name = name;
        this.originalTags = null;
        this.editedTags = null;
        this.isModified = false;
        this.pendingCoverPath = null;
        // coverRemoved: jawna flaga — użytkownik kliknął "Usuń okładkę"
        this.coverRemoved = false;
    }
    
    getCurrentTags() {
        return this.editedTags || this.originalTags || {};
    }
    
    setEditedTags(tags) {
        this.editedTags = tags;
        this.isModified = true;
    }
    
    resetEdits() {
        this.editedTags = null;
        this.isModified = false;
        this.pendingCoverPath = null;
        this.coverRemoved = false;
    }
    
    commitChanges() {
        if (this.editedTags) {
            this.originalTags = this.editedTags;
            this.editedTags = null;
        }
        this.isModified = false;
        this.pendingCoverPath = null;
        this.coverRemoved = false;
    }
    
    getCoverUrl() {
        if (this.coverRemoved) return null;
        if (this.pendingCoverPath) return `file://${this.pendingCoverPath}`;
        const tags = this.getCurrentTags();
        if (tags.coverData && typeof tags.coverData === 'object' && tags.coverData.imageBuffer) {
            return `data:${tags.coverData.mime || 'image/jpeg'};base64,${tags.coverData.imageBuffer}`;
        }
        return null;
    }

    hasCover() {
        return this.getCoverUrl() !== null;
    }
}

// ===== TOAST SYSTEM =====
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    const remove = () => {
        toast.classList.add('toast-out');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    };
    const timer = setTimeout(remove, duration);
    toast.addEventListener('click', () => { clearTimeout(timer); remove(); });
}

// Zachowaj stary showNotification dla błędów wymagających potwierdzenia
function showNotification(title, message) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    document.getElementById('notificationModal').classList.add('active');
}

function hideModal() {
    document.getElementById('notificationModal').classList.remove('active');
}

function hideCoverModal() {
    document.getElementById('coverModal').classList.remove('active');
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    initUI();
    initQuickGenres();
    updateActionButtons();

    if (window.api && typeof window.api.on === 'function') {
        window.api.on('open-files', async (event, filePaths) => {
            if (Array.isArray(filePaths) && filePaths.length > 0) {
                console.log('Otrzymano pliki z systemu:', filePaths);
                await addFiles(filePaths);
            }
        });
    }
});

window.addEventListener('focus', () => {
    if (currentFileIndex !== -1 && !isLoadingData) {
        checkForFormChanges();
    }
});

window.addEventListener('blur', () => {
    if (currentFileIndex !== -1 && !isLoadingData) {
        saveCurrentFileEdits();
    }
});

function initUI() {
    document.getElementById('selectFiles').addEventListener('click', selectFiles);
    document.getElementById('saveTags').addEventListener('click', saveTags);
    document.getElementById('saveAllTags').addEventListener('click', saveAllTags);
    document.getElementById('discardChanges').addEventListener('click', discardChanges);
    document.getElementById('clearList').addEventListener('click', clearFileList);
    document.getElementById('applyBatch').addEventListener('click', applyBatchChanges);
    
    document.getElementById('selectCover').addEventListener('click', selectCover);
    document.getElementById('removeCover').addEventListener('click', removeCover);
    document.getElementById('viewCover').addEventListener('click', viewCover);
    document.getElementById('exportCover').addEventListener('click', exportCover);
    
    document.getElementById('searchInput').addEventListener('input', (e) => {
        searchFilter = e.target.value.toLowerCase();
        document.getElementById('clearSearch').style.display = searchFilter ? 'flex' : 'none';
        updateFileList();
    });
    
    document.getElementById('clearSearch').addEventListener('click', () => {
        document.getElementById('searchInput').value = '';
        searchFilter = '';
        document.getElementById('clearSearch').style.display = 'none';
        updateFileList();
    });
    
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    document.getElementById('fileList').addEventListener('click', (e) => {
        const fileItem = e.target.closest('.file-item');
        if (fileItem) selectFile(parseInt(fileItem.dataset.index));
    });
    
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => btn.closest('.modal').classList.remove('active'));
    });
    
    document.getElementById('modalClose').addEventListener('click', hideModal);
    document.getElementById('coverModalClose').addEventListener('click', hideCoverModal);
    
    document.getElementById('trackNumber').addEventListener('blur', (e) => {
        if (e.target.value) {
            const num = parseInt(e.target.value);
            if (!isNaN(num) && num > 0) e.target.value = num.toString().padStart(2, '0');
        }
    });
    
    document.getElementById('fullGenres').addEventListener('input', () => {
        updateMainGenreFromFull();
        markAsModified();
    });

    // Synchronizuj główny gatunek → fullGenres dopiero po zakończeniu wpisywania (blur),
    // NIE przy każdym keystroke — inaczej każda litera trafia osobno do listy
    document.getElementById('genre').addEventListener('input', () => {
        markAsModified();
    });

    document.getElementById('genre').addEventListener('blur', () => {
        updateFullGenresFromMain();
    });
    
    const formElements = document.querySelectorAll(
        '#basic-tab input, #basic-tab select, #basic-tab textarea, ' +
        '#advanced-tab input, #advanced-tab textarea, ' +
        '#genres-tab textarea'
    );
    formElements.forEach(element => {
        element.addEventListener('input', () => markAsModifiedWithDebounce());
        element.addEventListener('blur', () => {
            if (!isLoadingData && currentFileIndex !== -1) checkForFormChanges();
        });
    });
    
    setupDragAndDrop();
    
    setInterval(() => {
        if (!isLoadingData && currentFileIndex !== -1) checkForFormChanges();
    }, 2000);
}

function initQuickGenres() {
    // Przyciski szybkich gatunków
    const container = document.getElementById('quickGenres');
    container.innerHTML = '';
    QUICK_GENRES.forEach(genre => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-small genre-tag';
        btn.textContent = genre;
        btn.addEventListener('click', () => addGenreToFullList(genre));
        container.appendChild(btn);
    });

    // Datalisty zastąpione własnym autocomplete z genres.js
}

// ===== PLIKI =====
async function selectFiles() {
    try {
        const filePaths = await window.api.selectFiles();
        if (filePaths && filePaths.length > 0) await addFiles(filePaths);
    } catch (error) {
        console.error('Błąd wyboru plików:', error);
        showToast('Nie udało się wybrać plików: ' + error.message, 'error');
    }
}

async function addFiles(filePaths) {
    let addedCount = 0;
    for (const p of filePaths) {
        if (!currentFiles.some(f => f.path === p)) {
            const name = p.split('\\').pop().split('/').pop();
            const fileData = new FileData(p, name);
            currentFiles.push(fileData);
            addedCount++;
            loadFileTagsInBackground(fileData);
        }
    }
    if (addedCount > 0) {
        updateFileList();
        updateFileCount();
        updateActionButtons();
        if (currentFileIndex === -1 && currentFiles.length > 0) await loadFile(0);
    }
}

async function loadFileTagsInBackground(fileData) {
    try {
        const result = await window.api.readTags(fileData.path);
        if (result.success) {
            fileData.originalTags = result.tags;
            updateFileList();
            updateFileCount();
            updateActionButtons();
        }
    } catch (error) {
        console.error('Błąd ładowania tagów w tle:', error);
    }
}

// ===== LISTA PLIKÓW =====
function updateFileList() {
    const fileList = document.getElementById('fileList');
    const filteredFiles = getFilteredFiles();
    
    if (filteredFiles.length === 0) {
        const message = currentFiles.length === 0 
            ? 'Wybierz pliki audio aby rozpocząć' 
            : 'Brak wyników wyszukiwania';
        fileList.innerHTML = `<div class="empty-state"><i class="fas fa-music"></i><p>${message}</p></div>`;
        return;
    }
    
    fileList.innerHTML = '';
    filteredFiles.forEach(file => {
        const originalIndex = currentFiles.indexOf(file);
        const fileItem = document.createElement('div');
        fileItem.className = `file-item ${originalIndex === currentFileIndex ? 'active' : ''}`;
        fileItem.dataset.index = originalIndex;
        
        const tags = file.getCurrentTags();
        const artist = tags.artist || 'Nieznany wykonawca';
        const title = tags.title || file.name;
        const trackNum = tags.trackNumber ? `${tags.trackNumber}. ` : '';
        
        const coverUrl = file.getCoverUrl();
        const iconHtml = coverUrl
            ? `<div class="file-icon-wrapper file-cover-thumb"><img src="${coverUrl}" alt="Cover" class="file-cover-img"></div>`
            : `<div class="file-icon-wrapper"><i class="fas fa-music file-icon"></i></div>`;
        
        fileItem.innerHTML = `
            ${iconHtml}
            <div class="file-info">
                <h4>${escapeHtml(trackNum + title)}</h4>
                <p>${escapeHtml(artist)}</p>
            </div>
            ${file.isModified ? '<span class="modified-badge" title="Niezapisane zmiany"><i class="fas fa-circle" style="font-size:8px;color:#f59e0b"></i></span>' : ''}
        `;
        fileList.appendChild(fileItem);
    });
}

function getFilteredFiles() {
    if (!searchFilter) return currentFiles;
    return currentFiles.filter(file => {
        const tags = file.getCurrentTags();
        const searchText = ((tags.title || '') + ' ' + (tags.artist || '') + ' ' + (tags.album || '') + ' ' + file.name).toLowerCase();
        return searchText.includes(searchFilter);
    });
}

async function selectFile(index) {
    if (index < 0 || index >= currentFiles.length || index === currentFileIndex) return;
    if (currentFileIndex !== -1 && !isLoadingData) saveCurrentFileEdits();
    currentFileIndex = index;
    await loadFile(index);
}

async function loadFile(index) {
    if (index < 0 || index >= currentFiles.length) return;
    const file = currentFiles[index];
    document.getElementById('statusMessage').textContent = `Ładowanie: ${file.name}`;
    
    if (!file.originalTags) {
        try {
            const result = await window.api.readTags(file.path);
            if (result.success) {
                file.originalTags = result.tags;
            } else {
                console.error('Błąd wczytywania tagów:', result.error);
                showToast(`Błąd odczytu tagów: ${result.error}`, 'error', 5000);
                file.originalTags = {};
            }
        } catch (error) {
            console.error('Wyjątek podczas wczytywania tagów:', error);
            showToast('Nieoczekiwany błąd podczas wczytywania', 'error', 5000);
            file.originalTags = {};
        }
    }
    
    isLoadingData = true;
    const tags = file.getCurrentTags();
    populateForm(tags);
    updateCoverDisplay(file.getCoverUrl());
    lastFormSnapshot = createFormSnapshot();
    isLoadingData = false;
    
    hasUnsavedChanges = file.isModified;
    updateFileList();
    updateActionButtons();
    document.getElementById('statusMessage').textContent = `Wybrany: ${file.name}`;
}

// ===== FORMULARZ =====
function createFormSnapshot() {
    return JSON.stringify(getFormData());
}

function checkForFormChanges() {
    if (isLoadingData || currentFileIndex === -1) return;
    const currentSnapshot = createFormSnapshot();
    if (lastFormSnapshot !== currentSnapshot) {
        const file = currentFiles[currentFileIndex];
        const formData = getFormData();
        file.setEditedTags(formData);
        hasUnsavedChanges = true;
        lastFormSnapshot = currentSnapshot;
        updateFileList();
        updateFileCount();
        updateActionButtons();
    }
}

function saveCurrentFileEdits() {
    if (currentFileIndex === -1) return;
    const file = currentFiles[currentFileIndex];
    const formData = getFormData();
    const original = file.originalTags || {};
    
    const hasNewCover = file.pendingCoverPath !== null;
    const coverWasRemoved = file.coverRemoved;
    const hasChanges = hasNewCover || coverWasRemoved || Object.keys(formData).some(key => {
        if (key === 'coverData') return false; // okładka zarządzana osobno
        return (formData[key] || '') !== (original[key] || '');
    });
    
    if (hasChanges) {
        file.setEditedTags(formData);
        hasUnsavedChanges = true;
        updateFileList();
        updateFileCount();
        updateActionButtons();
    }
}

function populateForm(tags) {
    if (!tags) tags = {};
    document.getElementById('title').value = tags.title || '';
    document.getElementById('artist').value = tags.artist || '';
    document.getElementById('album').value = tags.album || '';
    document.getElementById('year').value = tags.year || '';
    document.getElementById('trackNumber').value = tags.trackNumber || '';
    document.getElementById('composer').value = tags.composer || '';
    document.getElementById('fullGenres').value = tags.genre || '';
    document.getElementById('genre').value = extractMainGenre(tags.genre) || '';
    document.getElementById('lyrics').value = tags.lyrics || '';
    document.getElementById('comment').value = tags.comment || '';
    document.getElementById('performerInfo').value = tags.performerInfo || '';
    document.getElementById('audioSourceUrl').value = tags.audioSourceUrl || '';
    document.getElementById('partOfSet').value = tags.partOfSet || '';
}

function getFormData() {
    let coverDataToSave = null;
    if (currentFileIndex !== -1) {
        const file = currentFiles[currentFileIndex];
        if (file.coverRemoved) {
            coverDataToSave = null; // jawnie usunięta
        } else if (file.pendingCoverPath) {
            coverDataToSave = 'NEW_COVER';
        } else {
            const currentTags = file.getCurrentTags();
            coverDataToSave = currentTags.coverData || null;
        }
    }
    
    return {
        title: document.getElementById('title').value.trim(),
        artist: document.getElementById('artist').value.trim(),
        album: document.getElementById('album').value.trim(),
        year: document.getElementById('year').value.trim(),
        trackNumber: document.getElementById('trackNumber').value.trim(),
        composer: document.getElementById('composer').value.trim(),
        genre: document.getElementById('fullGenres').value.trim(),
        lyrics: document.getElementById('lyrics').value.trim(),
        comment: document.getElementById('comment').value.trim(),
        performerInfo: document.getElementById('performerInfo').value.trim(),
        audioSourceUrl: document.getElementById('audioSourceUrl').value.trim(),
        partOfSet: document.getElementById('partOfSet').value.trim(),
        coverData: coverDataToSave
    };
}

function extractMainGenre(genreString) {
    if (!genreString) return '';
    return genreString.split(',').map(g => g.trim())[0] || '';
}

function updateMainGenreFromFull() {
    document.getElementById('genre').value = extractMainGenre(document.getElementById('fullGenres').value);
}

function updateFullGenresFromMain() {
    const mainGenre = document.getElementById('genre').value.trim();
    if (!mainGenre) return;
    const fullGenresTextarea = document.getElementById('fullGenres');
    let currentGenres = fullGenresTextarea.value.split(',').map(g => g.trim()).filter(g => g);
    if (!currentGenres.includes(mainGenre)) {
        currentGenres = [mainGenre, ...currentGenres];
    } else if (currentGenres[0] !== mainGenre) {
        currentGenres = [mainGenre, ...currentGenres.filter(g => g !== mainGenre)];
    }
    fullGenresTextarea.value = currentGenres.join(', ');
}

function addGenreToFullList(genre) {
    const fullGenresTextarea = document.getElementById('fullGenres');
    let currentGenres = fullGenresTextarea.value.split(',').map(g => g.trim()).filter(g => g);
    if (!currentGenres.includes(genre)) {
        currentGenres.push(genre);
        fullGenresTextarea.value = currentGenres.join(', ');
        updateMainGenreFromFull();
        markAsModified();
    }
}

function markAsModifiedWithDebounce() {
    if (isLoadingData) return;
    if (formChangeDebounceTimer) clearTimeout(formChangeDebounceTimer);
    formChangeDebounceTimer = setTimeout(() => markAsModified(), 300);
}

function markAsModified() {
    if (isLoadingData) return;
    if (currentFileIndex !== -1) {
        hasUnsavedChanges = true;
        lastFormSnapshot = createFormSnapshot();
        updateActionButtons();
    }
}

// ===== OKŁADKA =====
function updateCoverDisplay(coverUrl) {
    const placeholder = document.getElementById('coverPlaceholder');
    const coverImage = document.getElementById('coverImage');
    const fullCoverImage = document.getElementById('fullCoverImage');
    const exportBtn = document.getElementById('exportCover');
    
    if (coverUrl) {
        placeholder.classList.add('hidden');
        coverImage.classList.remove('hidden');
        coverImage.src = coverUrl;
        fullCoverImage.src = coverUrl;
        exportBtn.disabled = false;
    } else {
        placeholder.classList.remove('hidden');
        coverImage.classList.add('hidden');
        coverImage.src = '';
        fullCoverImage.src = '';
        exportBtn.disabled = true;
    }
}

async function selectCover() {
    try {
        const result = await window.api.selectImage();
        if (!result) return;
        if (result && result.error) {
            showToast(result.error, 'error');
            return;
        }
        const imagePath = result;
        if (currentFileIndex !== -1) {
            const file = currentFiles[currentFileIndex];
            file.pendingCoverPath = imagePath;
            file.coverRemoved = false;
            updateCoverDisplay(`file://${imagePath}`);
            updateFileList();
            markAsModified();
            showToast('Nowa okładka zostanie zapisana', 'success');
        }
    } catch (error) {
        console.error('Błąd wyboru obrazu:', error);
        showToast('Nie udało się wybrać obrazu', 'error');
    }
}

function removeCover() {
    if (currentFileIndex === -1) return;
    const file = currentFiles[currentFileIndex];
    // Jawna flaga — tylko świadome kliknięcie usuwa okładkę
    file.coverRemoved = true;
    file.pendingCoverPath = null;
    if (file.editedTags) file.editedTags.coverData = null;
    updateCoverDisplay(null);
    updateFileList();
    markAsModified();
    showToast('Okładka zostanie usunięta przy zapisie', 'warning');
}

function viewCover() {
    const coverImage = document.getElementById('coverImage');
    if (coverImage.src && !coverImage.classList.contains('hidden')) {
        document.getElementById('coverModal').classList.add('active');
    }
}

async function exportCover() {
    if (currentFileIndex === -1) return;
    const file = currentFiles[currentFileIndex];
    const tags = file.getCurrentTags();
    
    let base64Data = null;
    let mimeType = 'image/jpeg';

    if (file.pendingCoverPath) {
        showToast('Najpierw zapisz plik, aby wyeksportować nową okładkę', 'info');
        return;
    }

    if (tags.coverData && tags.coverData.imageBuffer) {
        base64Data = tags.coverData.imageBuffer;
        mimeType = tags.coverData.mime || 'image/jpeg';
    }
    
    if (!base64Data) {
        showToast('Brak okładki do eksportu', 'warning');
        return;
    }

    try {
        // Sugerowana nazwa pliku: artysta_album_cover lub nazwa_pliku_cover
        const t = tags;
        const baseName = [t.artist, t.album].filter(Boolean).join('_').replace(/[/\\:*?"<>|]/g, '_') || file.name.replace(/\.[^.]+$/, '') + '_cover';
        
        const result = await window.api.saveCoverFile({ base64Data, mimeType, defaultName: baseName });
        if (result.success) {
            showToast('Okładka wyeksportowana pomyślnie', 'success');
        } else if (!result.canceled) {
            showToast('Błąd eksportu: ' + (result.error || 'nieznany'), 'error');
        }
    } catch (error) {
        console.error('Błąd eksportu okładki:', error);
        showToast('Błąd eksportu okładki', 'error');
    }
}

// ===== ZAPIS =====
async function saveTags() {
    if (currentFileIndex === -1) {
        showToast('Nie wybrano pliku', 'warning');
        return;
    }
    saveCurrentFileEdits();
    const file = currentFiles[currentFileIndex];
    if (!file.isModified) {
        showToast('Brak zmian do zapisania', 'info');
        return;
    }
    await saveFile(file);
    if (!file.isModified) {
        // po udanym zapisie odśwież podgląd
        file.originalTags = null;
        await loadFile(currentFileIndex);
    }
}

async function saveAllTags() {
    // Najpierw utrwal bieżący formularz — może mieć niezatwierdzone zmiany
    if (currentFileIndex !== -1) saveCurrentFileEdits();

    const modifiedFiles = currentFiles.filter(f => f.isModified);
    if (modifiedFiles.length === 0) {
        showToast('Brak plików z niezapisanymi zmianami', 'info');
        return;
    }

    const saveAllBtn = document.getElementById('saveAllTags');
    const badge = document.getElementById('saveAllBadge');
    if (saveAllBtn) {
        saveAllBtn.disabled = true;
        saveAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Zapisywanie...';
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const file of modifiedFiles) {
        const ok = await saveFile(file, false);
        if (ok) {
            successCount++;
        } else {
            errorCount++;
            errors.push(file.name);
        }
    }

    // Wyczyść globalny stan niezapisanych zmian jeśli bieżący plik został zapisany
    if (currentFileIndex !== -1 && !currentFiles[currentFileIndex].isModified) {
        hasUnsavedChanges = false;
    }

    // Odśwież aktualnie wybrany plik (przeładuj z dysku)
    if (currentFileIndex !== -1) {
        const file = currentFiles[currentFileIndex];
        file.originalTags = null;
        await loadFile(currentFileIndex);
    }

    updateFileList();
    updateFileCount();
    updateActionButtons();

    if (saveAllBtn) {
        saveAllBtn.innerHTML = '<i class="fas fa-save"></i> Zapisz wszystko';
    }

    if (errorCount === 0) {
        showToast(`Zapisano ${successCount} ${successCount === 1 ? 'plik' : successCount < 5 ? 'pliki' : 'plików'}`, 'success');
    } else {
        showToast(`Zapisano ${successCount}, błędy (${errorCount}): ${errors.slice(0, 3).join(', ')}`, 'error', 6000);
    }
}

// Wewnętrzna funkcja zapisu jednego pliku; zwraca true/false
async function saveFile(file, showIndividualToast = true) {
    try {
        const tags = file.editedTags || file.originalTags || {};
        const imagePath = file.pendingCoverPath;
        
        // Ochrona okładki: jeśli coverRemoved=false i brak pendingCoverPath,
        // a oryginalna okładka istnieje — zawsze ją przekaż, nawet jeśli editedTags.coverData to null
        let tagsToSave = { ...tags };
        if (!file.coverRemoved && !imagePath) {
            // Upewnij się że okładka z originalTags jest zachowana
            if (!tagsToSave.coverData && file.originalTags && file.originalTags.coverData) {
                tagsToSave.coverData = file.originalTags.coverData;
            }
        }
        
        const result = await window.api.writeTags({
            filePath: file.path,
            tags: tagsToSave,
            imagePath: imagePath
        });
        
        if (result.success) {
            file.commitChanges();
            if (showIndividualToast) showToast(`Zapisano: ${file.name}`, 'success');
            return true;
        } else {
            if (showIndividualToast) showToast(`Błąd zapisu "${file.name}": ${result.error}`, 'error', 6000);
            else console.error('Błąd zapisu', file.name, result.error);
            return false;
        }
    } catch (error) {
        console.error('Wyjątek przy zapisie:', file.name, error);
        if (showIndividualToast) showToast(`Błąd zapisu "${file.name}"`, 'error', 6000);
        return false;
    }
}

function discardChanges() {
    if (currentFileIndex === -1) return;
    const file = currentFiles[currentFileIndex];
    file.resetEdits();
    isLoadingData = true;
    populateForm(file.getCurrentTags());
    updateCoverDisplay(file.getCoverUrl());
    lastFormSnapshot = createFormSnapshot();
    isLoadingData = false;
    hasUnsavedChanges = false;
    updateFileList();
    updateFileCount();
    updateActionButtons();
    showToast('Cofnięto zmiany', 'info');
}

// ===== MASOWA EDYCJA =====
async function applyBatchChanges() {
    if (currentFiles.length === 0) {
        showToast('Brak plików na liście', 'warning');
        return;
    }
    
    const batchTags = {};
    const batchArtist = document.getElementById('batch-artist').value.trim();
    const batchAlbum = document.getElementById('batch-album').value.trim();
    const batchGenre = document.getElementById('batch-genre').value.trim();
    const batchYear = document.getElementById('batch-year').value.trim();
    const batchComposer = document.getElementById('batch-composer').value.trim();
    const batchPerformerInfo = document.getElementById('batch-performerInfo').value.trim();
    const batchAudioSourceUrl = document.getElementById('batch-audioSourceUrl').value.trim();
    
    if (batchArtist) batchTags.artist = batchArtist;
    if (batchAlbum) batchTags.album = batchAlbum;
    if (batchGenre) batchTags.genre = batchGenre;
    if (batchYear) batchTags.year = batchYear;
    if (batchComposer) batchTags.composer = batchComposer;
    if (batchPerformerInfo) batchTags.performerInfo = batchPerformerInfo;
    if (batchAudioSourceUrl) batchTags.audioSourceUrl = batchAudioSourceUrl;
    
    if (Object.keys(batchTags).length === 0) {
        showToast('Żadne pole nie zostało wypełnione', 'warning');
        return;
    }
    
    const applyBtn = document.getElementById('applyBatch');
    applyBtn.disabled = true;
    applyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Zapisywanie...';
    
    try {
        const filePaths = currentFiles.map(f => f.path);
        const results = await window.api.batchUpdate({ files: filePaths, tags: batchTags });
        
        const successCount = results.filter(r => r.success).length;
        const errorCount = results.filter(r => !r.success).length;
        
        // Po masowej edycji — zaktualizuj tagi w pamięci.
        // Okładki NIE są dotykane przez batchUpdate — zachowujemy je z originalTags.
        // Tylko zmienione przez batch pola są nadpisywane.
        currentFiles.forEach(f => {
            f.resetEdits();
            if (f.originalTags) {
                f.originalTags = { ...f.originalTags, ...batchTags };
            } else {
                // Tagi jeszcze nie załadowane — wczytaj w tle (okładka pojawi się jak przyjdzie)
                loadFileTagsInBackground(f);
            }
        });

        if (currentFileIndex !== -1) await loadFile(currentFileIndex);
        updateFileList();
        updateFileCount();
        updateActionButtons();
        
        if (errorCount === 0) {
            showToast(`Masowa edycja: zaktualizowano ${successCount} plików`, 'success');
        } else {
            showToast(`Zaktualizowano ${successCount}, błędy: ${errorCount}`, 'warning', 5000);
        }
    } catch (error) {
        console.error('Błąd masowej edycji:', error);
        showToast('Błąd podczas masowej edycji', 'error');
    } finally {
        applyBtn.disabled = false;
        applyBtn.innerHTML = '<i class="fas fa-bolt"></i> Zastosuj zmiany do wszystkich plików';
    }
}

// ===== LISTA =====
function clearFileList() {
    const hasModified = currentFiles.some(f => f.isModified);
    if (hasModified && !confirm('Masz niezapisane zmiany. Czy na pewno chcesz wyczyścić listę?')) return;
    currentFiles = [];
    currentFileIndex = -1;
    hasUnsavedChanges = false;
    searchFilter = '';
    lastFormSnapshot = null;
    document.getElementById('searchInput').value = '';
    document.getElementById('clearSearch').style.display = 'none';
    updateFileList();
    clearForm();
    updateFileCount();
    updateActionButtons();
    showToast('Lista wyczyszczona', 'info');
}

function clearForm() {
    document.querySelectorAll('input:not([type="button"]), textarea, select').forEach(el => {
        if (!el.id.startsWith('batch-') && !el.id.startsWith('search')) el.value = '';
    });
    updateCoverDisplay(null);
    hasUnsavedChanges = false;
}

function updateFileCount() {
    const count = currentFiles.length;
    const modifiedCount = currentFiles.filter(f => f.isModified).length;
    let text = `${count} ${count === 1 ? 'plik' : count < 5 ? 'pliki' : 'plików'}`;
    if (modifiedCount > 0) text += ` • ${modifiedCount} niezapisanych`;
    document.getElementById('fileCount').textContent = text;
}

function updateActionButtons() {
    const saveBtn = document.getElementById('saveTags');
    const saveAllBtn = document.getElementById('saveAllTags');
    const discardBtn = document.getElementById('discardChanges');
    const badge = document.getElementById('saveAllBadge');

    // Guard: DOM może nie być gotowy przy bardzo wczesnych wywołaniach
    if (!saveBtn || !saveAllBtn || !discardBtn || !badge) return;

    const hasFile = currentFileIndex !== -1;
    const currentFileHasChanges = hasFile && currentFiles[currentFileIndex] 
        && (currentFiles[currentFileIndex].isModified || hasUnsavedChanges);
    
    const totalModified = currentFiles.filter(f => f.isModified).length;
    // Jeśli bieżący plik ma niezapisane zmiany w formularzu (hasUnsavedChanges) ale isModified jeszcze false
    const pendingCount = (currentFileHasChanges && !currentFiles[currentFileIndex]?.isModified)
        ? totalModified + 1 
        : totalModified;
    
    saveBtn.disabled = !hasFile || !currentFileHasChanges;
    discardBtn.disabled = !hasFile || !currentFileHasChanges;
    saveAllBtn.disabled = pendingCount === 0;
    
    if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
    
    if (currentFileHasChanges && hasFile) saveBtn.classList.add('btn-pulse');
    else saveBtn.classList.remove('btn-pulse');
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`${tabId}-tab`).classList.add('active');
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
}

// ===== DRAG & DROP =====
function setupDragAndDrop() {
    const body = document.body;
    
    body.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        body.classList.add('dragging');
    });

    body.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target === body) body.classList.remove('dragging');
    });

    body.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        body.classList.remove('dragging');
        
        const files = [];
        for (const item of e.dataTransfer.items) {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) {
                    const ext = file.name.split('.').pop().toLowerCase();
                    // Akceptuj pliki audio po rozszerzeniu lub mime type
                    if (AUDIO_EXTENSIONS.has(ext) || file.type.startsWith('audio/')) {
                        files.push(file.path);
                    }
                }
            }
        }
        if (files.length > 0) {
            await addFiles(files);
        } else {
            showToast('Brak obsługiwanych plików audio w upuszczonym zaznaczeniu', 'warning');
        }
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== DEBUG =====
window.debugMP3Tagger = {
    getCurrentFile: () => {
        if (currentFileIndex === -1) { console.log('Brak wybranego pliku'); return null; }
        const file = currentFiles[currentFileIndex];
        console.log('Plik:', file.name, '| Zmodyfikowany:', file.isModified, '| coverRemoved:', file.coverRemoved, '| pendingCover:', file.pendingCoverPath);
        console.log('Tagi:', file.getCurrentTags());
        return file;
    },
    getAllFiles: () => {
        currentFiles.forEach((f, i) => console.log(`[${i}]`, f.name, '- mod:', f.isModified, '- coverRemoved:', f.coverRemoved));
        return currentFiles;
    },
    reloadCurrentFile: async () => {
        if (currentFileIndex === -1) return;
        const file = currentFiles[currentFileIndex];
        file.originalTags = null; file.resetEdits();
        await loadFile(currentFileIndex);
        console.log('Plik przeładowany');
    },
    checkState: () => {
        console.log('isLoadingData:', isLoadingData, '| hasUnsavedChanges:', hasUnsavedChanges, '| currentFileIndex:', currentFileIndex);
    }
};

console.log('💡 Debug: window.debugMP3Tagger');
