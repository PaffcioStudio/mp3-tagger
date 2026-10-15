// ===== WYSZUKIWANIE OKŁADEK ONLINE =====
// Darmowe, publiczne API bez kluczy i logowania:
//  - Apple iTunes Search API  (https://performance-partners.apple.com/search-api)
//  - Deezer API               (https://developers.deezer.com/api)
// Zapytania wykonuje proces główny (Electron net) - renderer pozostaje
// odizolowany (CSP connect-src 'self'), brak problemów CORS.
// Źródła odpytywane równolegle (Promise.allSettled) - awaria jednego
// (np. Deezer odrzuca niektóre sieci firmowe/datacenter) nie psuje wyszukiwania.

const { net } = require('electron');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const USER_AGENT = 'MP3Tagger/1.2.0 (https://github.com/PaffcioStudio/mp3-tagger)';

// Tylko te hosty mogą być pobierane (ochrona przed nadużyciem kanału IPC)
const ALLOWED_HOST_SUFFIXES = [
    '.mzstatic.com',    // CDN grafik Apple/iTunes (is1-ssl.mzstatic.com itd.)
    '.apple.com',       // itunes.apple.com
    '.dzcdn.net'        // CDN grafik Deezer (e-cdns-images.dzcdn.net itd.)
];

const MAX_RESULTS = 24;
const MAX_PER_SOURCE = 12;
const SEARCH_TIMEOUT_MS = 9000;
const DOWNLOAD_TIMEOUT_MS = 15000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB - spójnie z limitem okładek lokalnych

// Katalog tymczasowy na pobrane okładki
const COVERS_TMP_DIR = path.join(os.tmpdir(), 'mp3-tagger-covers');

function isAllowedUrl(rawUrl) {
    try {
        const u = new URL(rawUrl);
        if (u.protocol !== 'https:') return false;
        const host = u.hostname.toLowerCase();
        return ALLOWED_HOST_SUFFIXES.some(suffix => host === suffix.slice(1) || host.endsWith(suffix));
    } catch {
        return false;
    }
}

async function fetchJson(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await net.fetch(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
            signal: controller.signal,
            redirect: 'follow'
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

// --- Źródło 1: Apple iTunes Search API ---
async function searchItunes(query) {
    const url = 'https://itunes.apple.com/search?term=' + encodeURIComponent(query) +
        '&entity=song&limit=' + MAX_PER_SOURCE;
    const data = await fetchJson(url, SEARCH_TIMEOUT_MS);
    const out = [];
    for (const r of (Array.isArray(data && data.results) ? data.results : [])) {
        if (!r || typeof r.artworkUrl100 !== 'string') continue;
        const base = r.artworkUrl100;
        out.push({
            source: 'itunes',
            title: String(r.trackName || r.collectionName || ''),
            artist: String(r.artistName || ''),
            album: String(r.collectionName || ''),
            year: String(r.releaseDate || '').slice(0, 4),
            genre: String(r.primaryGenreName || ''),
            composer: String(r.composerName || r.composer || ''),
            // Podmiana rozmiaru w URL grafik Apple: /100x100bb.jpg -> większe
            thumbUrl: base.replace('100x100bb', '200x200bb'),
            fullUrl: base.replace('100x100bb', '600x600bb')
        });
    }
    return out;
}

// --- Źródło 2: Deezer API ---
// Uwaga: Deezer odrzuca ruch z IP datacenter (HTTP 403) - z domowego łącza
// działa poprawnie. Traktowane jako źródło pomocnicze (best-effort).
async function searchDeezer(query) {
    const url = 'https://api.deezer.com/search?q=' + encodeURIComponent(query) +
        '&limit=' + MAX_PER_SOURCE;
    const data = await fetchJson(url, SEARCH_TIMEOUT_MS);
    const out = [];
    for (const r of (Array.isArray(data && data.data) ? data.data : [])) {
        const album = (r && r.album) || {};
        const full = album.cover_xl || album.cover_big || album.cover_medium;
        const thumb = album.cover_medium || album.cover_small || full;
        if (!thumb || !full) continue;
        out.push({
            source: 'deezer',
            title: String(r.title || ''),
            artist: String((r.artist && r.artist.name) || ''),
            album: String(album.title || ''),
            year: '',
            genre: '',
            thumbUrl: thumb,
            fullUrl: full
        });
    }
    return out;
}

function dedupeKey(r) {
    return [r.artist, r.album, r.title]
        .map(s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim())
        .join('||');
}

// Sprzątanie starych plików okładek z tmp (wywoływane raz przy starcie)
async function cleanupOldCoverFiles() {
    try {
        await fsp.mkdir(COVERS_TMP_DIR, { recursive: true });
        const entries = await fsp.readdir(COVERS_TMP_DIR);
        const cutoff = Date.now() - 48 * 60 * 60 * 1000; // 48 h
        for (const name of entries) {
            const p = path.join(COVERS_TMP_DIR, name);
            try {
                const st = await fsp.stat(p);
                if (st.isFile() && st.mtimeMs < cutoff) await fsp.unlink(p);
            } catch { /* ignoruj pojedyncze błędy */ }
        }
    } catch { /* katalog może nie istnieć - to normalne */ }
}

module.exports = function (ipcMain) {

    // Sprzątanie w tle przy starcie modułu
    cleanupOldCoverFiles();

    // Wyszukiwanie okładek: { query } -> lista wyników
    // `query` to dokładnie to, co wpisano w polu wyszukiwania; jeśli puste,
    // składa frazę z tagów formularza (artist + title, ewentualnie album).
    ipcMain.handle('covers:search', async (event, query) => {
        const explicit = String((query && query.query) || '').trim();
        const artist = String((query && query.artist) || '').trim();
        const title = String((query && query.title) || '').trim();
        const album = String((query && query.album) || '').trim();

        const searchTerm = explicit || [artist, title].filter(Boolean).join(' ').trim() || album.trim();
        if (!searchTerm) {
            return { success: false, error: 'Podaj wykonawcę lub tytuł utworu.' };
        }

        const settled = await Promise.allSettled([
            searchItunes(searchTerm),
            searchDeezer(searchTerm)
        ]);

        const perSource = settled.map(s => s.status === 'fulfilled' ? s.value : []);
        const succeededCount = settled.filter(s => s.status === 'fulfilled').length;

        // Scal + deduplikuj (klucz: wykonawca + album + tytuł, bez rozmiaru liter)
        const seen = new Set();
        const results = [];
        for (const list of perSource) {
            for (const r of list) {
                const key = dedupeKey(r);
                if (seen.has(key)) continue;
                seen.add(key);
                results.push(r);
                if (results.length >= MAX_RESULTS) break;
            }
            if (results.length >= MAX_RESULTS) break;
        }

        if (results.length === 0) {
            if (succeededCount === 0) {
                // Żadne źródło nie odpowiedziało - najpewniej brak internetu
                return { success: false, error: 'Brak połączenia z Internetem. Sprawdź sieć i spróbuj ponownie.' };
            }
            return { success: true, results: [], searchTerm, sources: {} };
        }

        const sources = {};
        results.forEach(r => { sources[r.source] = (sources[r.source] || 0) + 1; });
        return { success: true, results, searchTerm, sources };
    });

    // Pobranie wybranej okładki do pliku tymczasowego -> { filePath }
    ipcMain.handle('covers:download', async (event, payload) => {
        const url = String((payload && payload.url) || '');
        if (!isAllowedUrl(url)) {
            return { success: false, error: 'Nieprawidłowy adres okładki.' };
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
        try {
            const res = await net.fetch(url, {
                headers: { 'User-Agent': USER_AGENT },
                signal: controller.signal,
                redirect: 'follow'
            });
            if (!res.ok) {
                return { success: false, error: `Serwer zwrócił błąd (HTTP ${res.status}).` };
            }

            const mime = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
            const extByMime = { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/bmp': '.bmp', 'image/webp': '.webp' };
            const ext = extByMime[mime] || '.jpg';

            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length === 0) {
                return { success: false, error: 'Pobrany plik jest pusty.' };
            }
            if (buf.length > MAX_IMAGE_BYTES) {
                return { success: false, error: 'Okładka jest za duża (max 10 MB).' };
            }

            await fsp.mkdir(COVERS_TMP_DIR, { recursive: true });
            const fileName = 'cover-' + Date.now().toString(36) + '-' +
                crypto.randomBytes(4).toString('hex') + ext;
            const filePath = path.join(COVERS_TMP_DIR, fileName);
            await fsp.writeFile(filePath, buf);

            return { success: true, filePath, bytes: buf.length, mime };
        } catch (error) {
            const aborted = error && (error.name === 'AbortError' || /abort/i.test(String(error.message)));
            return {
                success: false,
                error: aborted
                    ? 'Pobieranie okładki przekroczyło czas oczekiwania.'
                    : 'Nie udało się pobrać okładki. Sprawdź połączenie z Internetem.'
            };
        } finally {
            clearTimeout(timer);
        }
    });
};
