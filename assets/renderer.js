/* ============================================================
   MP3 Tagger v1.2.0 - logika interfejsu
   IPC: selectFiles / readTags / writeTags / batchUpdate /
   selectImage / saveCoverFile / openFileLocation / open-files /
   searchOnlineCovers / downloadOnlineCover / filePathOf
   ============================================================ */

'use strict';

// ===== STAN =====
let currentFiles = [];
let currentFileIndex = -1;
let hasUnsavedChanges = false;
let searchFilter = '';
let isLoadingData = false;
let formChangeDebounceTimer = null;
let lastFormSnapshot = null;
let fileLoadRequest = 0;

// Chipy gatunków bieżącego pliku (forma = źródło prawdy dla tags.genre)
let genreChips = [];

// Dropdown chipów
let chipDdActiveIndex = -1;
let chipDdItems = [];

// Ochrona przed utratą zmian przy zamykaniu
let closingConfirmed = false;

// Cache elementów
const $ = (id) => document.getElementById(id);
const els = {};

const AUDIO_EXTENSIONS = new Set(['mp3']);

// Gatunki i źródła z genres.js: ALL_GENRES, QUICK_GENRES, AUDIO_SOURCES, createAutocomplete()

// ===== MODEL PLIKU =====
class FileData {
    constructor(path, name) {
        this.path = path;
        this.name = name;
        this.originalTags = null;
        this.editedTags = null;
        this.isModified = false;
        this.pendingCoverPath = null;
        // jawna flaga - użytkownik kliknął „Usuń okładkę"
        this.coverRemoved = false;
        // w trakcie odczytu tagów w tle - wspólne, aby nie czytać pliku dwukrotnie
        this.tagsPromise = null;
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

    mergeWrittenTags(tags) {
        this.originalTags = { ...this.originalTags, ...tags };
        if (this.editedTags) {
            this.editedTags = { ...this.editedTags, ...tags };
            const changed = Object.keys(this.editedTags).some(key => key !== 'coverData'
                && (this.editedTags[key] || '') !== (this.originalTags[key] || ''));
            this.isModified = changed || this.pendingCoverPath !== null || this.coverRemoved;
            if (!this.isModified) this.editedTags = null;
        }
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

// ===== POMOCNICZE =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

function setStatus(message, tone) {
    if (els.statusMessage) els.statusMessage.textContent = message;
    if (els.statusDot) {
        els.statusDot.classList.toggle('busy', tone === 'busy');
        els.statusDot.classList.toggle('error', tone === 'error');
    }
}

// ===== TOASTY =====
const TOAST_ICONS = {
    success: 'i-check-circle',
    error: 'i-x-circle',
    info: 'i-info',
    warning: 'i-alert'
};

function showToast(message, type = 'info', duration = 3200) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<svg class="icon"><use href="#${TOAST_ICONS[type] || TOAST_ICONS.info}"/></svg><span>${escapeHtml(message)}</span>`;
    els.toastContainer.appendChild(toast);

    const remove = () => {
        if (!toast.isConnected) return;
        toast.classList.add('toast-out');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    };
    const timer = setTimeout(remove, duration);
    toast.addEventListener('click', () => { clearTimeout(timer); remove(); });
}

// ===== MODALE =====
function openModal(modal) { modal.classList.add('active'); }
function closeModal(modal) { modal.classList.remove('active'); }

function showNotification(title, message) {
    $('modalTitle').textContent = title;
    $('modalMessage').textContent = message;
    openModal($('notificationModal'));
}

// Modal potwierdzenia (Promise)
let confirmResolve = null;

function confirmDialog(title, message, okLabel = 'Zatwierdź') {
    $('confirmTitle').textContent = title;
    $('confirmMessage').textContent = message;
    $('confirmOkLabel').textContent = okLabel;
    openModal($('confirmModal'));
    return new Promise(resolve => { confirmResolve = resolve; });
}

function settleConfirm(result) {
    closeModal($('confirmModal'));
    if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
}

// ===== INICJALIZACJA =====
document.addEventListener('DOMContentLoaded', () => {
    cacheElements();
    if (window.api?.version) {
        $('versionChip').textContent = 'v' + window.api.version;
        document.querySelector('.status-version').textContent = 'MP3 Tagger v' + window.api.version;
    }
    initUI();
    initGenreLibrary();
    initChipInput();
    initTheme();
    updateActionButtons();
    updateBatchState();
    updateFileCount();
    updateFileList();

    // Pliki przekazane z systemu („Otwórz za pomocą…")
    if (window.api && typeof window.api.on === 'function') {
        window.api.on('open-files', async (event, filePaths) => {
            if (Array.isArray(filePaths) && filePaths.length > 0) {
                await addFiles(filePaths);
            }
        });
    }
});

window.addEventListener('focus', () => {
    if (currentFileIndex !== -1 && !isLoadingData) checkForFormChanges();
});

window.addEventListener('blur', () => {
    if (currentFileIndex !== -1 && !isLoadingData) saveCurrentFileEdits();
});

function cacheElements() {
    [
        'selectFiles', 'saveTags', 'saveAllTags', 'saveAllBadge', 'discardChanges',
        'clearList', 'searchInput', 'clearSearch', 'fileList', 'fileCount', 'fileCountStatus',
        'emptyEditor', 'emptySelectFiles', 'editorInner', 'statusMessage', 'statusDot',
        'heroTitle', 'heroMeta', 'heroFile', 'heroChips', 'heroCover', 'modifiedPill',
        'coverPlaceholder', 'coverImage', 'fullCoverImage', 'selectCover', 'removeCover',
        'exportCover', 'openLocation', 'searchCoverOnline', 'coverSearchModal',
        'coverSearchInput', 'coverSearchBtn', 'coverSearchStatus', 'coverSearchGrid', 'csApplyTags',
        'themeToggle', 'shortcutsBtn', 'toastContainer',
        'chipInput', 'chipsContainer', 'genreChipInput', 'chipDropdown',
        'genreSearch', 'genreGrid', 'genreCount', 'quickGenres', 'genresCurrent', 'genresCurrentEmpty',
        'batchSummary', 'batchSummaryChips', 'batchClear', 'applyBatch', 'dropOverlay',
        'modalClose', 'coverModalClose', 'confirmOk', 'confirmCancel', 'notificationModal',
        'coverModal', 'confirmModal', 'shortcutsModal', 'title', 'artist', 'album', 'year',
        'trackNumber', 'composer', 'performerInfo', 'audioSourceUrl', 'partOfSet', 'lyrics', 'comment'
    ].forEach(id => { els[id] = $(id); });
}

function initUI() {
    // Topbar
    els.selectFiles.addEventListener('click', selectFiles);
    els.emptySelectFiles.addEventListener('click', selectFiles);
    els.saveTags.addEventListener('click', saveTags);
    els.saveAllTags.addEventListener('click', saveAllTags);
    els.discardChanges.addEventListener('click', discardChanges);
    els.themeToggle.addEventListener('click', toggleTheme);
    els.shortcutsBtn.addEventListener('click', () => openModal(els.shortcutsModal));

    // Lista plików
    els.clearList.addEventListener('click', clearFileList);
    els.searchInput.addEventListener('input', (e) => {
        searchFilter = e.target.value.toLowerCase();
        els.clearSearch.hidden = !searchFilter;
        updateFileList();
    });
    els.clearSearch.addEventListener('click', () => {
        els.searchInput.value = '';
        searchFilter = '';
        els.clearSearch.hidden = true;
        updateFileList();
        els.searchInput.focus();
    });

    // Delegacja: zaznaczenie pliku / usunięcie karty
    els.fileList.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.fc-remove');
        if (removeBtn) {
            e.stopPropagation();
            removeFileAt(parseInt(removeBtn.dataset.remove, 10));
            return;
        }
        const card = e.target.closest('.file-card');
        if (card) selectFile(parseInt(card.dataset.index, 10));
    });

    // Uszkodzone miniatury (zdarzenie error nie bulgocze - przechwytujemy w fazie capture)
    els.fileList.addEventListener('error', (e) => {
        if (e.target.tagName === 'IMG') {
            e.target.style.display = 'none';
            e.target.closest('.fc-art')?.classList.add('has-fallback');
        }
    }, true);
    els.coverImage.addEventListener('error', () => updateCoverDisplay(null));

    // Zakładki
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Hero - okładka
    els.heroCover.addEventListener('click', viewCover);
    els.heroCover.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); viewCover(); }
    });
    els.selectCover.addEventListener('click', selectCover);
    els.removeCover.addEventListener('click', removeCover);
    els.exportCover.addEventListener('click', exportCover);
    els.openLocation.addEventListener('click', openFileLocation);

    // Wyszukiwanie okładek online
    els.searchCoverOnline.addEventListener('click', openCoverSearch);
    els.coverSearchBtn.addEventListener('click', runCoverSearch);
    els.coverSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); runCoverSearch(); }
    });
    els.coverSearchGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.cs-card');
        if (card) applyOnlineCover(parseInt(card.dataset.idx, 10));
    });
    // Uszkodzone miniaturki w siatce wyników
    els.coverSearchGrid.addEventListener('error', (e) => {
        if (e.target.tagName === 'IMG') {
            e.target.style.display = 'none';
            e.target.closest('.cs-card')?.classList.add('cs-noart');
        }
    }, true);

    // Modale
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.closest('.modal')));
    });
    document.querySelectorAll('.modal [data-close]').forEach(el => {
        el.addEventListener('click', () => closeModal(el.closest('.modal')));
    });
    els.modalClose.addEventListener('click', () => closeModal(els.notificationModal));
    els.coverModalClose.addEventListener('click', () => closeModal(els.coverModal));
    $('confirmModal').querySelector('[data-close-cancel]').addEventListener('click', () => settleConfirm(false));
    els.confirmOk.addEventListener('click', () => settleConfirm(true));
    els.confirmCancel.addEventListener('click', () => settleConfirm(false));

    // Pole numeru utworu - dopełnienie zerem
    els.trackNumber.addEventListener('blur', () => {
        const v = els.trackNumber.value;
        if (v && /^\d+$/.test(v.trim())) {
            const num = parseInt(v, 10);
            if (!isNaN(num) && num > 0) els.trackNumber.value = String(num).padStart(2, '0');
        }
    });

    // Live-podgląd hero przy wpisywaniu
    [els.title, els.artist, els.album, els.year, els.trackNumber].forEach(input => {
        input.addEventListener('input', updateHeroFromForm);
    });

    // Zmiany formularza (bez pola tekstowego chipów - to obsługuje osobny mechanizm)
    const formElements = document.querySelectorAll(
        '#basic-tab input:not(.chip-text), #basic-tab textarea, ' +
        '#advanced-tab input, #advanced-tab textarea'
    );
    formElements.forEach(element => {
        element.addEventListener('input', markAsModifiedWithDebounce);
        element.addEventListener('blur', () => {
            if (!isLoadingData && currentFileIndex !== -1) checkForFormChanges();
        });
    });

    // Masowa edycja
    els.applyBatch.addEventListener('click', applyBatchChanges);
    els.batchClear.addEventListener('click', clearBatchFields);
    document.querySelectorAll('#batch-tab input').forEach(el => {
        el.addEventListener('input', updateBatchState);
    });

    // Biblioteka gatunków - filtr
    els.genreSearch.addEventListener('input', () => renderGenreLibrary(els.genreSearch.value));

    // Skróty klawiszowe
    window.addEventListener('keydown', handleShortcuts);

    // Ochrona przed utratą zmian przy zamykaniu okna
    window.addEventListener('beforeunload', guardClose);

    setupDragAndDrop();

    // Okresowe wykrywanie zmian (nść na wypadek utraty zdarzeń)
    setInterval(() => {
        if (!isLoadingData && currentFileIndex !== -1) checkForFormChanges();
    }, 2000);

    // Przywróć ostatnią zakładkę
    try {
        const saved = localStorage.getItem('mp3tagger:tab');
        if (saved && ['basic', 'advanced', 'genres', 'batch'].includes(saved)) switchTab(saved, false);
    } catch (e) { /* ignore */ }
}

// ===== SKRÓTY KLAWISZOWE =====
function handleShortcuts(e) {
    const mod = e.ctrlKey || e.metaKey;

    if (e.key === 'Escape') {
        if (!els.chipDropdown.hidden) { closeChipDropdown(); return; }
        const open = document.querySelector('.modal.active');
        if (open) { closeModal(open); return; }
        if (document.activeElement === els.searchInput) {
            els.searchInput.value = '';
            searchFilter = '';
            els.clearSearch.hidden = true;
            updateFileList();
            els.searchInput.blur();
        }
        return;
    }

    if (!mod) return;

    if (e.key === 'o' || e.key === 'O') { e.preventDefault(); selectFiles(); }
    else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (e.shiftKey) saveAllTags(); else saveTags();
    }
    else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        els.searchInput.focus();
        els.searchInput.select();
    }
}

// ===== MOTYW =====
function initTheme() {
    // Motyw podstawiony przed renderem przez skrypt w <head>
    syncThemeTooltip();
}

function toggleTheme() {
    const html = document.documentElement;
    const next = html.dataset.theme === 'light' ? 'dark' : 'light';
    html.dataset.theme = next;
    try { localStorage.setItem('mp3tagger:theme', next); } catch (e) { /* ignore */ }
    syncThemeTooltip();
}

function syncThemeTooltip() {
    const light = document.documentElement.dataset.theme === 'light';
    els.themeToggle.dataset.tip = light ? 'Włącz motyw ciemny' : 'Włącz motyw jasny';
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
    let rejectedCount = 0;
    for (const p of filePaths) {
        if (!p || typeof p !== 'string') continue;
        if (!AUDIO_EXTENSIONS.has(p.split('.').pop().toLowerCase())) {
            rejectedCount++;
            continue;
        }
        if (!currentFiles.some(f => f.path === p)) {
            const name = p.split('\\').pop().split('/').pop();
            const fileData = new FileData(p, name);
            currentFiles.push(fileData);
            addedCount++;
            loadFileTagsInBackground(fileData);
        }
    }
    if (rejectedCount) showToast('Pominięto nieobsługiwane pliki. Edytor obsługuje wyłącznie MP3.', 'warning');
    if (addedCount > 0) {
        updateFileList();
        updateFileCount();
        updateActionButtons();
        updateBatchState();
        if (currentFileIndex === -1 && currentFiles.length > 0) await selectFile(0);
        showToast(`Dodano ${addedCount} ${addedCount === 1 ? 'plik' : addedCount < 5 ? 'pliki' : 'plików'}`, 'success');
    }
}

function loadFileTagsInBackground(fileData) {
    // Już wczytane albo wczytywanie w toku - nie dubluj odczytu (poprzednio
    // addFiles + natychmiastowe selectFile(0) czytały ten sam plik dwa razy)
    if (fileData.originalTags || fileData.tagsPromise) return fileData.tagsPromise;

    fileData.tagsPromise = (async () => {
        try {
            const result = await window.api.readTags(fileData.path);
            if (result.success) {
                fileData.originalTags = result.tags;
            } else {
                fileData.originalTags = {};
                console.error('Błąd wczytywania tagów (tło):', result.error);
                showToast(`Nie udało się odczytać tagów: ${fileData.name}`, 'error', 5000);
            }
        } catch (error) {
            fileData.originalTags = {};
            console.error('Błąd ładowania tagów w tle:', error);
            showToast(`Nie udało się odczytać tagów: ${fileData.name}`, 'error', 5000);
        } finally {
            fileData.tagsPromise = null;
        }
        updateFileList();
        updateFileCount();
        updateActionButtons();
        // Odśwież hero, jeśli to bieżący plik i tagi przyszły po raz pierwszy.
        // Guard na snapshot: jeśli użytkownik już coś wpisuje - nie ruszaj formularza.
        if (currentFileIndex !== -1 && currentFiles[currentFileIndex] === fileData) {
            if (!isLoadingData && lastFormSnapshot === createFormSnapshot()) {
                populateForm(fileData.getCurrentTags());
                updateCoverDisplay(fileData.getCoverUrl());
                lastFormSnapshot = createFormSnapshot();
                updateHero();
            }
        }
    })();
    return fileData.tagsPromise;
}

async function removeFileAt(index) {
    const file = currentFiles[index];
    if (!file) return;

    if (file.isModified) {
        const ok = await confirmDialog(
            'Usuń plik z listy?',
            `„${file.name}" ma niezapisane zmiany - zostaną one odrzucone.`,
            'Usuń plik'
        );
        if (!ok) return;
    }

    currentFiles.splice(index, 1);

    if (currentFileIndex === index) {
        currentFileIndex = -1;
        if (currentFiles.length > 0) {
            const next = Math.min(index, currentFiles.length - 1);
            currentFileIndex = next;
            await loadFile(next);
        } else {
            clearEditorState();
        }
    } else if (index < currentFileIndex) {
        currentFileIndex--;
    }

    updateFileList();
    updateFileCount();
    updateActionButtons();
    updateBatchState();
    showToast(`Usunięto z listy: ${file.name}`, 'info');
}
// ===== LISTA PLIKÓW =====
let listRefreshScheduled = false;

function updateFileList() {
    // Konsolidacja przez rAF - lawina aktualizacji po wczytaniu tagów w tle
    if (listRefreshScheduled) return;
    listRefreshScheduled = true;
    requestAnimationFrame(() => { listRefreshScheduled = false; renderFileList(); });
}

function renderFileList() {
    const listEl = els.fileList;
    const filteredFiles = getFilteredFiles();

    if (filteredFiles.length === 0) {
        const message = currentFiles.length === 0
            ? 'Wybierz pliki audio,<br>aby rozpocząć'
            : 'Brak wyników wyszukiwania';
        listEl.innerHTML = `<div class="list-empty"><svg class="icon"><use href="#i-music"/></svg><p>${message}</p></div>`;
        return;
    }

    const frag = document.createDocumentFragment();
    filteredFiles.forEach(file => {
        const originalIndex = currentFiles.indexOf(file);
        const tags = file.getCurrentTags();
        const artist = tags.artist || 'Nieznany wykonawca';
        const title = tags.title || file.name;
        const trackNum = tags.trackNumber ? `${tags.trackNumber}. ` : '';

        const coverUrl = file.getCoverUrl();
        const isLoading = file.originalTags === null;
        const artHtml = coverUrl
            ? `<img src="${coverUrl}" alt="">`
            : `<svg class="icon"><use href="#i-music"/></svg>`;

        const card = document.createElement('div');
        card.className = `file-card${originalIndex === currentFileIndex ? ' active' : ''}${file.isModified ? ' modified' : ''}`;
        card.dataset.index = originalIndex;
        card.setAttribute('role', 'option');
        card.title = file.path;
        card.innerHTML = `
            <div class="fc-art${isLoading ? ' is-loading' : ''}">${artHtml}</div>
            <div class="fc-info">
                <div class="fc-title">${escapeHtml(trackNum + title)}</div>
                <div class="fc-artist">${escapeHtml(artist)}</div>
            </div>
            ${file.isModified ? '<span class="fc-mod" title="Niezapisane zmiany"></span>' : ''}
            <button class="fc-remove" data-remove="${originalIndex}" title="Usuń z listy" aria-label="Usuń z listy">
                <svg class="icon"><use href="#i-x"/></svg>
            </button>
        `;
        frag.appendChild(card);
    });
    listEl.innerHTML = '';
    listEl.appendChild(frag);
}

function getFilteredFiles() {
    if (!searchFilter) return currentFiles;
    return currentFiles.filter(file => {
        const tags = file.getCurrentTags();
        const searchText = ((tags.title || '') + ' ' + (tags.artist || '') + ' ' +
            (tags.album || '') + ' ' + file.name).toLowerCase();
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
    const request = ++fileLoadRequest;
    isLoadingData = true;
    els.editorInner.inert = true;
    setStatus(`Ładowanie: ${file.name}`, 'busy');

    if (!file.originalTags) {
        // Jeśli odczyt w tle właśnie trwa - dołącz do niego zamiast czytać drugi raz
        if (file.tagsPromise) {
            await file.tagsPromise;
        }
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
    }

    if (request !== fileLoadRequest || currentFiles[currentFileIndex] !== file) return;
    const tags = file.getCurrentTags();
    populateForm(tags);
    updateCoverDisplay(file.getCoverUrl());
    lastFormSnapshot = createFormSnapshot();
    isLoadingData = false;
    els.editorInner.inert = false;

    // Anuluj „zawieszony” debounce z poprzedniego pliku / sprzed zapisu
    if (formChangeDebounceTimer) {
        clearTimeout(formChangeDebounceTimer);
        formChangeDebounceTimer = null;
    }

    hasUnsavedChanges = file.isModified;
    updateFileList();
    updateActionButtons();
    updateHero();
    updateGenreSelectionState();
    setStatus(`Wybrany: ${file.name}`);
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
    if (currentFileIndex === -1 || isLoadingData) return;
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
    } else {
        file.editedTags = null;
        file.isModified = false;
        hasUnsavedChanges = false;
    }
}

function populateForm(tags) {
    if (!tags) tags = {};
    els.title.value = tags.title || '';
    els.artist.value = tags.artist || '';
    els.album.value = tags.album || '';
    els.year.value = tags.year || '';
    els.trackNumber.value = tags.trackNumber || '';
    els.composer.value = tags.composer || '';
    setGenreChips(tags.genre || '');
    els.lyrics.value = tags.lyrics || '';
    els.comment.value = tags.comment || '';
    els.performerInfo.value = tags.performerInfo || '';
    els.audioSourceUrl.value = tags.audioSourceUrl || '';
    els.partOfSet.value = tags.partOfSet || '';
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
        title: els.title.value.trim(),
        artist: els.artist.value.trim(),
        album: els.album.value.trim(),
        year: els.year.value.trim(),
        trackNumber: els.trackNumber.value.trim(),
        composer: els.composer.value.trim(),
        genre: genreChips.join(', '),
        lyrics: els.lyrics.value.trim(),
        comment: els.comment.value.trim(),
        performerInfo: els.performerInfo.value.trim(),
        audioSourceUrl: els.audioSourceUrl.value.trim(),
        partOfSet: els.partOfSet.value.trim(),
        coverData: coverDataToSave
    };
}

function markAsModifiedWithDebounce() {
    if (isLoadingData) return;
    if (formChangeDebounceTimer) clearTimeout(formChangeDebounceTimer);
    formChangeDebounceTimer = setTimeout(markAsModified, 300);
}

function markAsModified() {
    if (isLoadingData) return;
    if (currentFileIndex !== -1) {
        saveCurrentFileEdits();
        const file = currentFiles[currentFileIndex];
        // Flaga tylko gdy coś realnie się różni od stanu załadowanego:
        // formularz, oczekująca nowa okładka albo jawne usunięcie okładki
        // (zmiany samej okładki nie zawsze zmieniają snapshot formularza)
        const coverChanged = file.pendingCoverPath !== null || file.coverRemoved;
        if (file.isModified || coverChanged || lastFormSnapshot !== createFormSnapshot()) {
            hasUnsavedChanges = true;
            updateActionButtons();
        }
        lastFormSnapshot = createFormSnapshot();
    }
}

// ===== CHIPY GATUNKÓW =====
function setGenreChips(genreString) {
    genreChips = String(genreString || '')
        .split(',')
        .map(g => g.trim())
        .filter(g => g.length > 0);
    renderChips();
}

function renderChips() {
    const container = els.chipsContainer;
    container.innerHTML = '';
    genreChips.forEach((genre, i) => {
        const chip = document.createElement('span');
        chip.className = 'chip' + (i === 0 ? ' chip-main' : '');
        chip.title = i === 0 ? `${genre} - gatunek główny` : genre;
        chip.innerHTML = `<span class="chip-name">${escapeHtml(genre)}</span>
            <button class="chip-x" type="button" aria-label="Usuń gatunek ${escapeHtml(genre)}">
                <svg class="icon"><use href="#i-x"/></svg>
            </button>`;
        chip.querySelector('.chip-x').addEventListener('click', () => removeGenreChip(i));
        container.appendChild(chip);
    });
    updateHeroChips();
    updateGenreSelectionState();
}

function addGenreChip(genre) {
    const g = String(genre || '').trim();
    if (!g) return false;
    if (genreChips.some(c => c.toLowerCase() === g.toLowerCase())) return false;
    genreChips.push(g);
    renderChips();
    markAsModified();
    return true;
}

function removeGenreChip(index) {
    genreChips.splice(index, 1);
    renderChips();
    markAsModified();
}

function toggleGenreChip(genre) {
    const g = String(genre || '').trim();
    const idx = genreChips.findIndex(c => c.toLowerCase() === g.toLowerCase());
    if (idx === -1) {
        genreChips.push(g);
    } else {
        genreChips.splice(idx, 1);
    }
    renderChips();
    markAsModified();
}

// --- Input chipów + dropdown podpowiedzi ---
function initChipInput() {
    const input = els.genreChipInput;

    els.chipInput.addEventListener('click', (e) => {
        if (e.target === els.chipInput || e.target === els.chipsContainer) input.focus();
    });

    input.addEventListener('input', () => renderChipDropdown(input.value.trim()));
    input.addEventListener('focus', () => renderChipDropdown(input.value.trim()));

    input.addEventListener('blur', () => {
        // Opóźnienie, aby klik w podpowiedź zdążył zadziałać
        setTimeout(() => { closeChipDropdown(); commitChipInput(); }, 140);
    });

    input.addEventListener('keydown', (e) => {
        const ddOpen = !els.chipDropdown.hidden;
        if (e.key === 'Enter') {
            e.preventDefault();
            if (ddOpen && chipDdActiveIndex >= 0 && chipDdItems[chipDdActiveIndex]) {
                selectChipSuggestion(chipDdItems[chipDdActiveIndex]);
            } else {
                commitChipInput();
            }
        } else if (e.key === ',') {
            e.preventDefault();
            commitChipInput();
        } else if (e.key === 'Backspace' && input.value === '' && genreChips.length > 0) {
            removeGenreChip(genreChips.length - 1);
        } else if (ddOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            const dir = e.key === 'ArrowDown' ? 1 : -1;
            setChipDdActive(chipDdActiveIndex + dir);
        }
    });
}

function commitChipInput() {
    const input = els.genreChipInput;
    const value = input.value.trim().replace(/,+$/, '');
    if (value) {
        addGenreChip(value);
        input.value = '';
        renderChipDropdown('');
    }
}

function getFilteredGenreSuggestions(query) {
    if (!query) return ALL_GENRES.slice(0, 60);
    const q = query.toLowerCase();
    const exact = ALL_GENRES.filter(g => g.toLowerCase().startsWith(q));
    const rest = ALL_GENRES.filter(g => !g.toLowerCase().startsWith(q) && g.toLowerCase().includes(q));
    return [...exact, ...rest].slice(0, 60);
}

function renderChipDropdown(query) {
    chipDdItems = getFilteredGenreSuggestions(query);
    const dd = els.chipDropdown;

    if (chipDdItems.length === 0) {
        dd.innerHTML = `<div class="chip-dd-empty">Brak podpowiedzi - dodaj „${escapeHtml(query)}" klawiszem Enter</div>`;
    } else {
        dd.innerHTML = chipDdItems.map((g, i) => {
            const label = query ? highlightMatch(g, query) : escapeHtml(g);
            const already = genreChips.some(c => c.toLowerCase() === g.toLowerCase());
            return `<div class="chip-dd-item" data-idx="${i}">
                <svg class="icon"><use href="#${already ? 'i-check-circle' : 'i-tag'}"/></svg>${label}
            </div>`;
        }).join('') + `<div class="chip-dd-count">${chipDdItems.length} z ${ALL_GENRES.length} gatunków</div>`;

        dd.querySelectorAll('.chip-dd-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                selectChipSuggestion(chipDdItems[parseInt(item.dataset.idx, 10)]);
            });
        });
    }

    chipDdActiveIndex = -1;
    positionChipDropdown();
    dd.hidden = false;
}

function highlightMatch(text, query) {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return escapeHtml(text);
    return escapeHtml(text.slice(0, idx)) +
        '<mark>' + escapeHtml(text.slice(idx, idx + query.length)) + '</mark>' +
        escapeHtml(text.slice(idx + query.length));
}

function selectChipSuggestion(genre) {
    addGenreChip(genre);
    els.genreChipInput.value = '';
    closeChipDropdown();
    renderChipDropdown('');
    els.genreChipInput.focus();
}

function setChipDdActive(idx) {
    const items = els.chipDropdown.querySelectorAll('.chip-dd-item');
    if (!items.length) return;
    chipDdActiveIndex = Math.max(0, Math.min(idx, items.length - 1));
    items.forEach(el => el.classList.remove('active'));
    if (items[chipDdActiveIndex]) {
        items[chipDdActiveIndex].classList.add('active');
        items[chipDdActiveIndex].scrollIntoView({ block: 'nearest' });
    }
}

function positionChipDropdown() {
    const rect = els.genreChipInput.getBoundingClientRect();
    const dd = els.chipDropdown;
    const spaceBelow = window.innerHeight - rect.bottom - 10;
    const height = Math.min(264, spaceBelow);
    dd.style.top = (rect.bottom + 6) + 'px';
    dd.style.left = Math.max(10, rect.left) + 'px';
    dd.style.width = rect.width + 'px';
    dd.style.maxHeight = height + 'px';
}

function closeChipDropdown() {
    els.chipDropdown.hidden = true;
    chipDdActiveIndex = -1;
}

window.addEventListener('resize', () => {
    if (!els.chipDropdown || els.chipDropdown.hidden) return;
    positionChipDropdown();
});
// ===== BIBLIOTEKA GATUNKÓW =====
function initGenreLibrary() {
    // Szybkie gatunki (przełączane)
    els.quickGenres.innerHTML = '';
    QUICK_GENRES.forEach(genre => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'genre-pill';
        btn.dataset.genre = genre;
        btn.innerHTML = `<svg class="icon"><use href="#i-plus"/></svg>${escapeHtml(genre)}`;
        btn.addEventListener('click', () => toggleGenreChip(genre));
        els.quickGenres.appendChild(btn);
    });

    renderGenreLibrary('');
}

function renderGenreLibrary(filterText) {
    const q = (filterText || '').trim().toLowerCase();
    const grid = els.genreGrid;
    grid.innerHTML = '';

    const hasFile = currentFileIndex !== -1;
    const genres = q
        ? ALL_GENRES.filter(g => g.toLowerCase().includes(q))
        : ALL_GENRES;

    if (!hasFile) {
        grid.innerHTML = `<div class="genre-disabled-note">Najpierw wybierz plik z listy po lewej - potem kliknij gatunek, aby go dodać lub usunąć.</div>`;
        els.genreCount.textContent = `${genres.length} gatunków`;
        return;
    }

    const frag = document.createDocumentFragment();
    genres.forEach(genre => {
        const selected = genreChips.some(c => c.toLowerCase() === genre.toLowerCase());
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'genre-pill' + (selected ? ' selected' : '');
        btn.dataset.genre = genre;
        btn.innerHTML = selected
            ? `<svg class="icon"><use href="#i-check-circle"/></svg>${escapeHtml(genre)}`
            : `<svg class="icon"><use href="#i-plus"/></svg>${escapeHtml(genre)}`;
        btn.addEventListener('click', () => toggleGenreChip(genre));
        frag.appendChild(btn);
    });
    grid.appendChild(frag);
    els.genreCount.textContent = `${genres.length} z ${ALL_GENRES.length} gatunków`;
}

function updateGenreSelectionState() {
    // Szybkie gatunki - stan zaznaczenia
    els.quickGenres.querySelectorAll('.genre-pill').forEach(btn => {
        const selected = genreChips.some(c => c.toLowerCase() === btn.dataset.genre.toLowerCase());
        btn.classList.toggle('selected', selected);
        btn.querySelector('use').setAttribute('href', selected ? '#i-check-circle' : '#i-plus');
    });

    // Pełna lista - tylko gdy zakładka aktywna
    if (document.getElementById('genres-tab').classList.contains('active')) {
        renderGenreLibrary(els.genreSearch.value);
    }

    // Podsumowanie „Gatunki tego utworu"
    const current = els.genresCurrent;
    current.innerHTML = '';
    genreChips.forEach((genre, i) => {
        const chip = document.createElement('span');
        chip.className = 'chip' + (i === 0 ? ' chip-main' : '');
        chip.innerHTML = `<span class="chip-name">${escapeHtml(genre)}</span>
            <button class="chip-x" type="button" aria-label="Usuń gatunek">
                <svg class="icon"><use href="#i-x"/></svg>
            </button>`;
        chip.querySelector('.chip-x').addEventListener('click', () => removeGenreChip(i));
        current.appendChild(chip);
    });
    els.genresCurrentEmpty.style.display = genreChips.length ? 'none' : 'inline';
}

// ===== HERO =====
function updateHero() {
    const hasFile = currentFileIndex !== -1;
    els.emptyEditor.hidden = hasFile;
    els.editorInner.hidden = !hasFile;
    if (!hasFile) return;

    const file = currentFiles[currentFileIndex];
    els.heroFile.textContent = file.path;
    els.heroFile.title = file.path;
    updateHeroFromForm();
    updateModifiedPill();
}

function updateHeroFromForm() {
    const file = currentFileIndex !== -1 ? currentFiles[currentFileIndex] : null;

    const title = els.title.value.trim();
    els.heroTitle.textContent = title || (file ? file.name : '-');

    const parts = [];
    const artist = els.artist.value.trim();
    const album = els.album.value.trim();
    const year = els.year.value.trim();
    const track = els.trackNumber.value.trim();
    if (artist) parts.push(`<b>${escapeHtml(artist)}</b>`);
    if (album) parts.push(escapeHtml(album));
    if (year) parts.push(escapeHtml(year));
    if (track) parts.push(`#${escapeHtml(track)}`);
    els.heroMeta.innerHTML = parts.length ? parts.join(' <span class="status-sep">·</span> ') : '-';

    updateHeroChips();
}

function updateHeroChips() {
    const container = els.heroChips;
    if (!container) return;
    container.innerHTML = '';
    genreChips.slice(0, 6).forEach((genre, i) => {
        const chip = document.createElement('span');
        chip.className = 'mini-chip';
        if (i === 0) chip.style.fontWeight = '750';
        chip.textContent = genre;
        container.appendChild(chip);
    });
    if (genreChips.length > 6) {
        const more = document.createElement('span');
        more.className = 'mini-chip';
        more.textContent = `+${genreChips.length - 6}`;
        container.appendChild(more);
    }
}

function updateModifiedPill() {
    const file = currentFileIndex !== -1 ? currentFiles[currentFileIndex] : null;
    const modified = !!(file && (file.isModified || hasUnsavedChanges));
    els.modifiedPill.hidden = !modified;
}

// ===== OKŁADKA =====
function updateCoverDisplay(coverUrl) {
    if (coverUrl) {
        els.coverPlaceholder.hidden = true;
        els.coverImage.hidden = false;
        els.coverImage.src = coverUrl;
        els.fullCoverImage.src = coverUrl;
        els.exportCover.disabled = false;
    } else {
        els.coverPlaceholder.hidden = false;
        els.coverImage.hidden = true;
        els.coverImage.src = '';
        els.fullCoverImage.src = '';
        els.exportCover.disabled = true;
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
            updateModifiedPill();
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

    // Nic do usunięcia - plik nie ma okładki ani oczekującej nowej
    if (!file.hasCover() && !file.pendingCoverPath) {
        showToast('Ten plik nie ma okładki', 'info');
        return;
    }

    // Jawna flaga - tylko świadome kliknięcie usuwa okładkę
    file.coverRemoved = true;
    file.pendingCoverPath = null;
    if (file.editedTags) file.editedTags.coverData = null;
    updateCoverDisplay(null);
    updateFileList();
    markAsModified();
    updateModifiedPill();
    showToast('Okładka zostanie usunięta przy zapisie', 'warning');
}

function viewCover() {
    if (!els.coverImage.hidden && els.coverImage.src) {
        openModal(els.coverModal);
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
        const t = tags;
        const baseName = [t.artist, t.album].filter(Boolean).join('_')
            .replace(/[/\\:*?"<>|]/g, '_') ||
            file.name.replace(/\.[^.]+$/, '') + '_cover';

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

function openFileLocation() {
    if (currentFileIndex === -1) return;
    try {
        window.api.openFileLocation(currentFiles[currentFileIndex].path);
    } catch (error) {
        console.error('Błąd otwierania lokalizacji:', error);
    }
}

// ===== WYSZUKIWANIE OKŁADEK ONLINE =====
// Darmowe API bez kluczy: Apple iTunes Search + Deezer (zapytania idą
// przez proces główny - renderer nie kontaktuje się z siecią bezpośrednio).
let coverSearchResults = [];
let coverSearchBusy = false;   // trwa wyszukiwanie
let coverApplyBusy = false;    // trwa pobieranie wybranej okładki

function openCoverSearch() {
    if (currentFileIndex === -1) {
        showToast('Najpierw wybierz plik z listy', 'warning');
        return;
    }
    if (typeof window.api.searchOnlineCovers !== 'function') {
        showToast('Brak obsługi wyszukiwania online w tej wersji aplikacji', 'error');
        return;
    }

    // Podpowiedź z formularza: wykonawca + tytuł, w ostateczności nazwa pliku
    const file = currentFiles[currentFileIndex];
    const prefill = [els.artist.value.trim(), els.title.value.trim()]
        .filter(Boolean).join(' ').trim() ||
        file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();

    els.coverSearchInput.value = prefill;
    els.coverSearchGrid.innerHTML = '';
    setCoverSearchStatus('', null, true);
    openModal(els.coverSearchModal);
    els.coverSearchInput.focus();
    els.coverSearchInput.select();

    // Automatyczne wyszukiwanie, jeśli mamy sensowną podpowiedź
    if (prefill) runCoverSearch();
}

function setCoverSearchStatus(message, tone, hide) {
    const box = els.coverSearchStatus;
    if (hide || !message) {
        box.hidden = true;
        box.innerHTML = '';
        return;
    }
    const icons = { busy: 'i-loader', error: 'i-x-circle', info: 'i-info', ok: 'i-check-circle' };
    box.hidden = false;
    box.className = 'cs-status' + (tone ? ` cs-status-${tone}` : '');
    box.innerHTML = `<svg class="icon${tone === 'busy' ? ' cs-spin' : ''}"><use href="#${icons[tone] || 'i-info'}"/></svg><span>${escapeHtml(message)}</span>`;
}

async function runCoverSearch() {
    if (coverSearchBusy) return;
    const query = els.coverSearchInput.value.trim();
    if (!query) {
        setCoverSearchStatus('Wpisz wykonawcę lub tytuł utworu.', 'info');
        els.coverSearchInput.focus();
        return;
    }

    coverSearchBusy = true;
    coverSearchResults = [];
    els.coverSearchBtn.classList.add('loading');
    els.coverSearchGrid.innerHTML = '';
    setCoverSearchStatus(`Wyszukiwanie: „${query}"…`, 'busy');

    try {
        const file = currentFiles[currentFileIndex];
        const result = await window.api.searchOnlineCovers({
            query: query,
            artist: els.artist.value.trim(),
            title: els.title.value.trim(),
            album: els.album.value.trim(),
            fileName: file ? file.name : ''
        });

        if (!result || !result.success) {
            setCoverSearchStatus((result && result.error) || 'Wyszukiwanie nie powiodło się.', 'error');
            return;
        }

        coverSearchResults = Array.isArray(result.results) ? result.results : [];
        if (coverSearchResults.length === 0) {
            setCoverSearchStatus(`Brak wyników dla „${query}". Spróbuj innego zapytania.`, 'info');
            return;
        }

        const src = result.sources || {};
        const srcParts = [];
        if (src.itunes) srcParts.push(`iTunes: ${src.itunes}`);
        if (src.deezer) srcParts.push(`Deezer: ${src.deezer}`);
        setCoverSearchStatus(
            `Znaleziono ${coverSearchResults.length} ${coverSearchResults.length === 1 ? 'okładkę' : 'okładek'}` +
            (srcParts.length ? ` (${srcParts.join(' · ')})` : ''),
            'ok'
        );
        renderCoverSearchResults();
    } catch (error) {
        console.error('Błąd wyszukiwania okładek:', error);
        setCoverSearchStatus('Nie udało się wyszukać okładek. Sprawdź połączenie z Internetem.', 'error');
    } finally {
        coverSearchBusy = false;
        els.coverSearchBtn.classList.remove('loading');
    }
}

function renderCoverSearchResults() {
    const grid = els.coverSearchGrid;
    const frag = document.createDocumentFragment();

    coverSearchResults.forEach((r, i) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'cs-card';
        card.dataset.idx = String(i);
        card.title = `${r.title || ''} - ${r.artist || ''}${r.album ? ' (' + r.album + ')' : ''}`;

        const meta = [r.artist, r.album].filter(Boolean).join(' · ');
        card.innerHTML = `
            <span class="cs-art">
                <img src="${escapeHtml(r.thumbUrl || '')}" alt="" loading="lazy">
                <span class="cs-fallback"><svg class="icon"><use href="#i-music"/></svg></span>
                <span class="cs-apply-hint"><svg class="icon"><use href="#i-download"/></svg> Ustaw</span>
                <span class="cs-spinner"><svg class="icon"><use href="#i-loader"/></svg></span>
            </span>
            <span class="cs-title">${escapeHtml(r.title || '-')}</span>
            <span class="cs-meta">${escapeHtml(meta || '-')}</span>
            <span class="cs-source cs-source-${escapeHtml(r.source || '')}">${escapeHtml(r.source === 'deezer' ? 'Deezer' : 'iTunes')}</span>
        `;
        frag.appendChild(card);
    });

    grid.innerHTML = '';
    grid.appendChild(frag);
}

async function applyOnlineCover(index) {
    if (coverApplyBusy || coverSearchBusy) return;
    const result = coverSearchResults[index];
    if (!result || !result.fullUrl) return;
    if (currentFileIndex === -1) return;

    const file = currentFiles[currentFileIndex];
    const applyTags = els.csApplyTags.checked;
    saveCurrentFileEdits();
    const card = els.coverSearchGrid.querySelector(`.cs-card[data-idx="${index}"]`);

    coverApplyBusy = true;
    if (card) card.classList.add('applying');

    try {
        const dl = await window.api.downloadOnlineCover(result.fullUrl);
        if (!dl || !dl.success) {
            showToast((dl && dl.error) || 'Nie udało się pobrać okładki.', 'error', 5000);
            return;
        }

        // Okładka - dokładnie ta sama ścieżka co wybór pliku z dysku
        file.pendingCoverPath = dl.filePath;
        file.coverRemoved = false;
        const isCurrent = currentFiles[currentFileIndex] === file;
        if (isCurrent) saveCurrentFileEdits();
        const tags = { ...file.getCurrentTags(), coverData: 'NEW_COVER' };

        // Opcjonalnie tagi z wyniku (tylko niepuste pola)
        if (applyTags) {
            for (const key of ['title', 'artist', 'album', 'year', 'composer']) {
                if (result[key]) tags[key] = result[key];
            }
        }
        file.setEditedTags(tags);

        // Utrwal formularz + oznacz zmiany (jak przy ręcznej edycji)
        if (isCurrent) {
            populateForm(tags);
            updateCoverDisplay(file.getCoverUrl());
            hasUnsavedChanges = true;
            lastFormSnapshot = createFormSnapshot();
            updateHero();
        }
        updateFileList();
        updateFileCount();
        updateActionButtons();
        updateModifiedPill();

        closeModal(els.coverSearchModal);
        const tagsNote = applyTags ? ' (+ tagi z wyniku)' : '';
        showToast(`Okładka z Internetu ustawiona${tagsNote} - zapisz plik, aby utrwalić`, 'success', 4200);
        setStatus('Okładka pobrana z Internetu - oczekuje na zapis');
    } catch (error) {
        console.error('Błąd pobierania okładki:', error);
        showToast('Nie udało się pobrać okładki.', 'error', 5000);
    } finally {
        coverApplyBusy = false;
        if (card) card.classList.remove('applying');
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

    const btn = els.saveTags;
    btn.classList.add('loading');
    btn.disabled = true;
    btn.querySelector('.btn-label').textContent = 'Zapisywanie…';

    await saveFile(file);

    btn.classList.remove('loading');
    btn.disabled = false;
    btn.querySelector('.btn-label').textContent = 'Zapisz';

    if (!file.isModified) {
        // Odśwież podgląd z dysku
        file.originalTags = null;
        await loadFile(currentFileIndex);
        setStatus(`Zapisano: ${file.name}`);
    }
    updateBatchState();
}

async function saveAllTags() {
    // Najpierw utrwal bieżący formularz - może mieć niezatwierdzone zmiany
    if (currentFileIndex !== -1) saveCurrentFileEdits();

    const modifiedFiles = currentFiles.filter(f => f.isModified);
    if (modifiedFiles.length === 0) {
        showToast('Brak plików z niezapisanymi zmianami', 'info');
        return;
    }

    const saveAllBtn = els.saveAllTags;
    if (saveAllBtn) {
        saveAllBtn.disabled = true;
        saveAllBtn.classList.add('loading');
        saveAllBtn.querySelector('.btn-label').textContent = 'Zapisywanie…';
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const file of modifiedFiles) {
        setStatus(`Zapisywanie ${successCount + errorCount + 1}/${modifiedFiles.length}: ${file.name}`, 'busy');
        const ok = await saveFile(file, false);
        if (ok) {
            successCount++;
        } else {
            errorCount++;
            errors.push(file.name);
        }
    }

    // Wyczyść globalny stan niezapisanych zmian, jeśli bieżący plik został zapisany
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
    updateBatchState();

    if (saveAllBtn) {
        saveAllBtn.classList.remove('loading');
        saveAllBtn.querySelector('.btn-label').textContent = 'Zapisz wszystko';
    }

    if (errorCount === 0) {
        setStatus(`Zapisano ${successCount} ${successCount === 1 ? 'plik' : successCount < 5 ? 'pliki' : 'plików'}`);
        showToast(`Zapisano ${successCount} ${successCount === 1 ? 'plik' : successCount < 5 ? 'pliki' : 'plików'}`, 'success');
    } else {
        setStatus('Zapis zakończony z błędami', 'error');
        showToast(`Zapisano ${successCount}, błędy (${errorCount}): ${errors.slice(0, 3).join(', ')}`, 'error', 6000);
    }
}

// Wewnętrzna funkcja zapisu jednego pliku; zwraca true/false
async function saveFile(file, showIndividualToast = true) {
    try {
        const tags = file.editedTags || file.originalTags || {};
        const imagePath = file.pendingCoverPath;

        // Ochrona okładki: jeśli coverRemoved=false i brak pendingCoverPath,
        // a oryginalna okładka istnieje - zawsze ją przekaż, nawet jeśli editedTags.coverData to null
        let tagsToSave = { ...tags };
        if (!file.coverRemoved && !imagePath) {
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
            // Odczytaj również nowo osadzoną okładkę zamiast zostawiać NEW_COVER w cache.
            const saved = await window.api.readTags(file.path);
            file.originalTags = saved.success ? saved.tags : null;
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
    updateHero();
    showToast('Cofnięto zmiany', 'info');
}
// ===== MASOWA EDYCJA =====
const BATCH_FIELDS = [
    { id: 'batch-artist', key: 'artist', label: 'Wykonawca' },
    { id: 'batch-album', key: 'album', label: 'Album' },
    { id: 'batch-genre', key: 'genre', label: 'Gatunek' },
    { id: 'batch-year', key: 'year', label: 'Rok' },
    { id: 'batch-composer', key: 'composer', label: 'Kompozytor' },
    { id: 'batch-performerInfo', key: 'performerInfo', label: 'Dodatkowy wykonawca' },
    { id: 'batch-audioSourceUrl', key: 'audioSourceUrl', label: 'Źródło audio' }
];

function collectBatchTags() {
    const batchTags = {};
    BATCH_FIELDS.forEach(f => {
        const v = $(f.id).value.trim();
        if (v) batchTags[f.key] = v;
    });
    return batchTags;
}

function updateBatchState() {
    const batchTags = collectBatchTags();
    const fileCount = currentFiles.length;
    const keys = Object.keys(batchTags);

    // Podsumowanie pól do nadpisania
    els.batchSummary.hidden = keys.length === 0;
    const chipsBox = els.batchSummaryChips;
    chipsBox.innerHTML = '';
    keys.forEach(key => {
        const f = BATCH_FIELDS.find(x => x.key === key);
        const chip = document.createElement('span');
        chip.className = 'bs-chip';
        chip.innerHTML = `<svg class="icon"><use href="#i-pen"/></svg>${escapeHtml(f.label)}: <b>${escapeHtml(batchTags[key])}</b>`;
        chipsBox.appendChild(chip);
    });

    // Przycisk zastosuj
    const applyBtn = els.applyBatch;
    applyBtn.disabled = keys.length === 0 || fileCount === 0;
    applyBtn.querySelector('.btn-label').textContent =
        `Zastosuj do ${fileCount} ${fileCount === 1 ? 'pliku' : fileCount < 5 ? 'plików' : 'plików'}`;
}

function clearBatchFields() {
    BATCH_FIELDS.forEach(f => { $(f.id).value = ''; });
    updateBatchState();
    showToast('Wyczyszczono pola masowej edycji', 'info');
}

async function applyBatchChanges() {
    if (currentFiles.length === 0) {
        showToast('Brak plików na liście', 'warning');
        return;
    }

    const batchTags = collectBatchTags();
    if (Object.keys(batchTags).length === 0) {
        showToast('Żadne pole nie zostało wypełnione', 'warning');
        return;
    }

    saveCurrentFileEdits();

    const applyBtn = els.applyBatch;
    applyBtn.classList.add('loading');
    applyBtn.disabled = true;

    try {
        const filePaths = currentFiles.map(f => f.path);
        const results = await window.api.batchUpdate({ files: filePaths, tags: batchTags });

        if (currentFileIndex !== -1) saveCurrentFileEdits();
        const successCount = results.filter(r => r.success).length;
        const errorCount = results.filter(r => !r.success).length;

        const writtenPaths = new Set(results.filter(r => r.success).map(r => r.path));
        for (const f of currentFiles) {
            if (!writtenPaths.has(f.path)) continue;
            if (f.tagsPromise) await f.tagsPromise;
            if (!f.originalTags) await loadFileTagsInBackground(f);
            f.mergeWrittenTags(batchTags);
        }

        if (currentFileIndex !== -1) await loadFile(currentFileIndex);
        updateFileList();
        updateFileCount();
        updateActionButtons();

        if (errorCount === 0) {
            setStatus(`Masowa edycja: zaktualizowano ${successCount} plików`);
            showToast(`Masowa edycja: zaktualizowano ${successCount} plików`, 'success');
        } else {
            setStatus('Masowa edycja zakończona z błędami', 'error');
            showToast(`Zaktualizowano ${successCount}, błędy: ${errorCount}`, 'warning', 5000);
        }
    } catch (error) {
        console.error('Błąd masowej edycji:', error);
        showToast('Błąd podczas masowej edycji', 'error');
    } finally {
        applyBtn.classList.remove('loading');
        updateBatchState();
    }
}

// ===== LISTA: CZYSZCZENIE =====
async function clearFileList() {
    const hasModified = currentFiles.some(f => f.isModified);
    if (hasModified) {
        const ok = await confirmDialog(
            'Wyczyścić listę plików?',
            'Masz niezapisane zmiany. Jeśli wyczysz listę, zostaną one utracone.',
            'Wyczyść listę'
        );
        if (!ok) return;
    }
    currentFiles = [];
    currentFileIndex = -1;
    hasUnsavedChanges = false;
    searchFilter = '';
    lastFormSnapshot = null;
    els.searchInput.value = '';
    els.clearSearch.hidden = true;
    clearEditorState();
    updateFileList();
    updateFileCount();
    updateActionButtons();
    updateBatchState();
    showToast('Lista wyczyszczona', 'info');
}

function clearEditorState() {
    fileLoadRequest++;
    isLoadingData = true;
    populateForm({});
    isLoadingData = false;
    els.editorInner.inert = false;
    updateCoverDisplay(null);
    hasUnsavedChanges = false;
    lastFormSnapshot = null;
    closeChipDropdown();
    updateHero();
    setStatus('Gotowy do pracy');
}

// ===== LICZNIKI / PRZYCISKI =====
function updateFileCount() {
    const count = currentFiles.length;
    const modifiedCount = currentFiles.filter(f => f.isModified).length;
    let text = `${count} ${count === 1 ? 'plik' : count < 5 ? 'pliki' : 'plików'}`;
    if (modifiedCount > 0) text += ` • ${modifiedCount} niezapisanych`;
    els.fileCount.textContent = text;
    els.fileCountStatus.textContent = text;
}

function updateActionButtons() {
    const saveBtn = els.saveTags;
    const saveAllBtn = els.saveAllTags;
    const discardBtn = els.discardChanges;
    const badge = els.saveAllBadge;

    // Guard: DOM może nie być gotowy przy bardzo wczesnych wywołaniach
    if (!saveBtn || !saveAllBtn || !discardBtn || !badge) return;

    const hasFile = currentFileIndex !== -1;
    const currentFileHasChanges = hasFile && currentFiles[currentFileIndex]
        && (currentFiles[currentFileIndex].isModified || hasUnsavedChanges);

    const totalModified = currentFiles.filter(f => f.isModified).length;
    const pendingCount = (currentFileHasChanges && !currentFiles[currentFileIndex]?.isModified)
        ? totalModified + 1
        : totalModified;

    saveBtn.disabled = !hasFile || !currentFileHasChanges;
    discardBtn.disabled = !hasFile || !currentFileHasChanges;
    saveAllBtn.disabled = pendingCount === 0;

    if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.hidden = false;
    } else {
        badge.hidden = true;
    }

    saveBtn.classList.toggle('btn-pulse', !!(currentFileHasChanges && hasFile));
    updateModifiedPill();
}

// ===== ZAKŁADKI =====
function switchTab(tabId, persist = true) {
    document.querySelectorAll('.tab-content, .tab-pane').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
    });
    const pane = document.getElementById(`${tabId}-tab`);
    const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (pane) pane.classList.add('active');
    if (tab) {
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
    }
    if (persist) {
        try { localStorage.setItem('mp3tagger:tab', tabId); } catch (e) { /* ignore */ }
    }
    if (tabId === 'genres') renderGenreLibrary(els.genreSearch.value);
}

// ===== DRAG & DROP =====
function setupDragAndDrop() {
    const body = document.body;
    let dragDepth = 0;

    body.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    body.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth++;
        els.dropOverlay.hidden = false;
        body.classList.add('dragging');
    });

    body.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) {
            els.dropOverlay.hidden = true;
            body.classList.remove('dragging');
        }
    });

    body.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth = 0;
        els.dropOverlay.hidden = true;
        body.classList.remove('dragging');

        const files = [];
        for (const item of e.dataTransfer.items) {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) {
                    // Electron >= 32: brak File.path - ścieżka przez webUtils w preload
                    let filePath = null;
                    if (window.api && typeof window.api.filePathOf === 'function') {
                        try { filePath = window.api.filePathOf(file); } catch { filePath = null; }
                    }
                    if (!filePath && file.path) filePath = file.path; // Electron <= 31
                    if (filePath) {
                        const ext = filePath.split('.').pop().toLowerCase();
                        // Akceptuj pliki audio po rozszerzeniu lub mime type
                        if (AUDIO_EXTENSIONS.has(ext)) {
                            files.push(filePath);
                        }
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

// ===== OCHRONA PRZED UTRATĄ ZMIAN =====
function guardClose(e) {
    if (closingConfirmed) return;
    saveCurrentFileEdits();
    const modified = currentFiles.filter(f => f.isModified).length;
    if (modified === 0) return;

    // Zatrzymaj zamykanie i pokaż modal
    e.preventDefault();
    e.returnValue = '';

    confirmDialog(
        'Zamknąć aplikację?',
        `Masz niezapisane zmiany w ${modified} ${modified === 1 ? 'pliku' : 'plikach'}. Jeśli zamkniesz aplikację teraz, zostaną one utracone.`,
        'Zamknij mimo to'
    ).then(ok => {
        if (ok) {
            closingConfirmed = true;
            window.close();
        }
    });
}

// ===== DEBUG =====
window.debugMP3Tagger = {
    getCurrentFile: () => {
        if (currentFileIndex === -1) { console.log('Brak wybranego pliku'); return null; }
        const file = currentFiles[currentFileIndex];
        console.log('Plik:', file.name, '| Zmodyfikowany:', file.isModified,
            '| coverRemoved:', file.coverRemoved, '| pendingCover:', file.pendingCoverPath);
        console.log('Tagi:', file.getCurrentTags());
        console.log('Chipy gatunków:', genreChips);
        return file;
    },
    getAllFiles: () => {
        currentFiles.forEach((f, i) =>
            console.log(`[${i}]`, f.name, '- mod:', f.isModified, '- coverRemoved:', f.coverRemoved));
        return currentFiles;
    },
    reloadCurrentFile: async () => {
        if (currentFileIndex === -1) return;
        const file = currentFiles[currentFileIndex];
        file.originalTags = null;
        file.resetEdits();
        await loadFile(currentFileIndex);
        console.log('Plik przeładowany');
    },
    checkState: () => {
        console.log('isLoadingData:', isLoadingData,
            '| hasUnsavedChanges:', hasUnsavedChanges,
            '| currentFileIndex:', currentFileIndex,
            '| genreChips:', genreChips);
    }
};

console.log('MP3 Tagger v1.2.0 - debug: window.debugMP3Tagger');
