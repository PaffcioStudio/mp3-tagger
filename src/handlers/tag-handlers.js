const fsSync = require('fs');

module.exports = function(ipcMain, ID3, fs, path) {

    // Pomocnik: sprawdź czy plik jest dostępny i ma sensowny rozmiar
    function validateFilePath(filePath) {
        if (!filePath || typeof filePath !== 'string') return 'Nieprawidłowa ścieżka pliku.';
        if (!fsSync.existsSync(filePath)) return `Plik nie istnieje: ${filePath}`;
        const stat = fsSync.statSync(filePath);
        if (!stat.isFile()) return 'Ścieżka nie wskazuje na plik.';
        if (stat.size === 0) return 'Plik jest pusty.';
        return null; // ok
    }
    
    ipcMain.handle('read-tags', async (event, filePath) => {
        try {
            const validationError = validateFilePath(filePath);
            if (validationError) {
                return { success: false, error: validationError };
            }

            console.log('=== Odczyt tagów ===');
            console.log('Plik:', path.basename(filePath));
            
            const tags = ID3.read(filePath);
            
            if (!tags) {
                return { success: true, tags: {} };
            }
            
            // Parsowanie numeru ścieżki
            let trackNumber = '';
            if (tags.trackNumber) {
                trackNumber = String(tags.trackNumber).split('/')[0].trim();
            }
            
            // Parsowanie roku
            let year = '';
            if (tags.year) {
                year = String(tags.year);
            } else if (tags.recordingTime) {
                year = String(tags.recordingTime).substring(0, 4);
            }
            
            // Parsowanie gatunku
            let genre = '';
            if (tags.genre) {
                genre = Array.isArray(tags.genre) ? tags.genre.join(', ') : String(tags.genre);
            }
            
            // Parsowanie okładki
            let coverData = null;
            if (tags.image) {
                try {
                    let imageBuffer = null;
                    let mime = 'image/jpeg';
                    let imageType = { id: 3, name: 'front cover' };
                    let imageDesc = 'Cover';
                    
                    if (tags.image.imageBuffer && Buffer.isBuffer(tags.image.imageBuffer)) {
                        imageBuffer = tags.image.imageBuffer;
                        mime = tags.image.mime || 'image/jpeg';
                        imageType = tags.image.type || imageType;
                        imageDesc = tags.image.description || 'Cover';
                    } else if (Buffer.isBuffer(tags.image)) {
                        imageBuffer = tags.image;
                    } else if (typeof tags.image === 'object') {
                        for (const key of Object.keys(tags.image)) {
                            if (Buffer.isBuffer(tags.image[key])) {
                                imageBuffer = tags.image[key];
                                break;
                            }
                        }
                    }
                    
                    if (imageBuffer && imageBuffer.length > 0) {
                        coverData = {
                            mime,
                            type: imageType,
                            description: imageDesc,
                            imageBuffer: imageBuffer.toString('base64')
                        };
                        console.log('✓ Okładka załadowana, rozmiar:', imageBuffer.length, 'bajtów');
                    }
                } catch (e) {
                    console.error('Błąd parsowania okładki (pominięto):', e.message);
                }
            }
            
            // Parsowanie tekstów
            let lyrics = '';
            if (tags.unsynchronisedLyrics) {
                lyrics = typeof tags.unsynchronisedLyrics === 'object'
                    ? (tags.unsynchronisedLyrics.text || '')
                    : String(tags.unsynchronisedLyrics);
            }
            
            // Parsowanie komentarza
            let comment = '';
            if (tags.comment) {
                comment = typeof tags.comment === 'object'
                    ? (tags.comment.text || '')
                    : String(tags.comment);
            }
            
            const parsedTags = {
                title: tags.title || '',
                artist: tags.artist || '',
                album: tags.album || '',
                year,
                trackNumber,
                composer: tags.composer || '',
                genre,
                lyrics,
                comment,
                performerInfo: tags.performerInfo || '',
                audioSourceUrl: tags.audioSourceUrl || '',
                partOfSet: tags.partOfSet || '',
                coverData
            };
            
            return { success: true, tags: parsedTags };
        } catch (error) {
            console.error('✗ BŁĄD odczytu tagów:', error.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('write-tags', async (event, { filePath, tags, imagePath }) => {
        try {
            const validationError = validateFilePath(filePath);
            if (validationError) {
                return { success: false, error: validationError };
            }

            // Sprawdź czy plik nie jest tylko do odczytu
            try {
                fsSync.accessSync(filePath, fsSync.constants.W_OK);
            } catch {
                return { success: false, error: 'Brak uprawnień do zapisu pliku. Sprawdź czy plik nie jest tylko do odczytu.' };
            }

            console.log('=== Zapisywanie tagów ===');
            console.log('Plik:', path.basename(filePath));
            
            let imageData = undefined;
            
            if (imagePath) {
                if (!fsSync.existsSync(imagePath)) {
                    return { success: false, error: 'Plik okładki nie istnieje.' };
                }
                const imageBuffer = await fs.readFile(imagePath);
                if (imageBuffer.length > 10 * 1024 * 1024) {
                    return { success: false, error: 'Plik okładki jest za duży (max 10 MB).' };
                }
                const ext = path.extname(imagePath).toLowerCase();
                const mimeMap = { '.png': 'image/png', '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp' };
                imageData = {
                    mime: mimeMap[ext] || 'image/jpeg',
                    type: { id: 3, name: 'front cover' },
                    description: 'Cover',
                    imageBuffer
                };
            } else if (tags.coverData && tags.coverData !== 'NEW_COVER' && typeof tags.coverData === 'object' && tags.coverData.imageBuffer) {
                const buf = Buffer.from(tags.coverData.imageBuffer, 'base64');
                if (buf.length > 0) {
                    imageData = {
                        mime: tags.coverData.mime || 'image/jpeg',
                        type: tags.coverData.type || { id: 3, name: 'front cover' },
                        description: tags.coverData.description || 'Cover',
                        imageBuffer: buf
                    };
                }
            }
            
            const tagData = {
                title: tags.title || '',
                artist: tags.artist || '',
                album: tags.album || '',
                year: tags.year || '',
                trackNumber: tags.trackNumber ? String(tags.trackNumber) : '',
                composer: tags.composer || '',
                genre: tags.genre || '',
                performerInfo: tags.performerInfo || '',
                audioSourceUrl: tags.audioSourceUrl || '',
                partOfSet: tags.partOfSet || ''
            };
            
            if (imageData !== undefined) {
                tagData.image = imageData;
            }
            
            if (tags.lyrics && tags.lyrics.trim()) {
                tagData.unsynchronisedLyrics = { language: 'pol', text: tags.lyrics };
            }
            
            if (tags.comment && tags.comment.trim()) {
                tagData.comment = { language: 'pol', text: tags.comment };
            }
            
            const success = ID3.write(tagData, filePath);
            
            if (success) {
                console.log('✓ Tagi zapisane pomyślnie:', path.basename(filePath));
                return { success: true };
            } else {
                return { success: false, error: 'Biblioteka ID3 zwróciła błąd zapisu.' };
            }
        } catch (error) {
            console.error('✗ BŁĄD zapisu tagów:', error.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('batch-update', async (event, { files, tags }) => {
        if (!Array.isArray(files) || files.length === 0) {
            return [];
        }

        const results = [];
        console.log('Masowa aktualizacja', files.length, 'plików');
        
        for (const filePath of files) {
            if (!filePath || typeof filePath !== 'string') {
                results.push({ file: '?', success: false, error: 'Nieprawidłowa ścieżka' });
                continue;
            }
            try {
                const validationError = validateFilePath(filePath);
                if (validationError) {
                    results.push({ file: path.basename(filePath), success: false, error: validationError, path: filePath });
                    continue;
                }

                try {
                    fsSync.accessSync(filePath, fsSync.constants.W_OK);
                } catch {
                    results.push({ file: path.basename(filePath), success: false, error: 'Brak uprawnień zapisu', path: filePath });
                    continue;
                }

                const existingTags = ID3.read(filePath) || {};
                const updatedTags = { ...existingTags, ...tags };
                const success = ID3.write(updatedTags, filePath);
                
                results.push({
                    file: path.basename(filePath),
                    success: !!success,
                    error: success ? undefined : 'Błąd zapisu biblioteki ID3',
                    path: filePath
                });
                
                console.log(success ? '✓' : '✗', path.basename(filePath));
            } catch (error) {
                console.error('Błąd dla', path.basename(filePath), ':', error.message);
                results.push({
                    file: path.basename(filePath),
                    success: false,
                    error: error.message,
                    path: filePath
                });
            }
        }
        
        const successCount = results.filter(r => r.success).length;
        console.log(`Masowa aktualizacja: ${successCount}/${files.length} sukces`);
        
        return results;
    });

    ipcMain.handle('debug-raw-tags', async (event, filePath) => {
        try {
            const validationError = validateFilePath(filePath);
            if (validationError) return { success: false, error: validationError };

            const tags = ID3.read(filePath);
            if (!tags) return { success: false, error: 'Brak tagów' };
            
            return {
                success: true,
                keys: Object.keys(tags),
                hasImage: !!tags.image,
                imageType: tags.image ? typeof tags.image : null,
                imageKeys: tags.image && typeof tags.image === 'object' && !Buffer.isBuffer(tags.image)
                    ? Object.keys(tags.image)
                    : null
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
};
