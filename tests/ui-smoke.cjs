// Rzeczywisty Electron i publiczne API. Wymaga ffmpeg, xvfb-run oraz Internetu.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const ID3 = require('node-id3');

const root = path.resolve(__dirname, '..');
const resultsDir = path.join(root, 'test-results');
fs.mkdirSync(resultsDir, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mp3-tagger-ui-'));
const files = [path.join(temp, 'Daft Punk - Get Lucky.mp3'), path.join(temp, 'Second song.mp3')];
const composer = 'Thomas Bangalter, Guy-Manuel de Homem-Christo, Nile Rodgers, Pharrell Williams';
const report = { temp, checks: [], errors: [] };
let child, ws, log = '';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    for (const file of files) {
        const generated = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
            '-i', 'sine=frequency=440:duration=0.3', '-c:a', 'libmp3lame', file], { encoding: 'utf8' });
        assert.equal(generated.status, 0, generated.stderr);
    }
    ID3.write({ title: 'Get Lucky', artist: 'Daft Punk', composer, trackNumber: '8/13',
        publisher: 'Preserved label', bpm: '116', userDefinedText: [{ description: 'custom', value: 'Preserved' }] }, files[0]);
    ID3.write({ title: 'Second song', artist: 'Second artist' }, files[1]);
    const originalAudio = ID3.removeTagsFromBuffer(fs.readFileSync(files[0]));
    const server = net.createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    const appIndex = process.argv.indexOf('--app');
    const binary = appIndex < 0 ? require('electron') : path.resolve(process.argv[appIndex + 1]);
    const appArgs = appIndex < 0 ? [root] : (binary.endsWith('.AppImage') ? ['--appimage-extract-and-run'] : []);
    child = spawn('xvfb-run', ['-a', binary, ...appArgs, '--no-sandbox', '--disable-gpu',
        `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(temp, 'profile')}`],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => { log += chunk; });
    child.stderr.on('data', chunk => { log += chunk; });
    let page;
    for (let attempt = 0; attempt < 100; attempt++) {
        if (child.exitCode !== null) throw new Error('Electron exited: ' + log);
        try {
            const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
            page = pages.find(p => p.type === 'page');
            if (page) break;
        } catch { /* serwer CDP jeszcze startuje */ }
        await sleep(100);
    }
    assert.ok(page, 'Electron did not open a page: ' + log);
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    let next = 0;
    const pending = new Map();
    ws.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.method === 'Runtime.exceptionThrown') report.errors.push(message.params.exceptionDetails);
        if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++next;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 45000);
        pending.set(id, message => { clearTimeout(timer); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result); });
        ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
        const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
    };
    const until = async (expression, timeout = 20000) => {
        const end = Date.now() + timeout;
        while (Date.now() < end) { if (await evaluate(expression)) return; await sleep(100); }
        throw new Error('UI condition timeout: ' + expression + '\n' + log);
    };
    const check = name => { report.checks.push(name); console.log('OK:', name); };
    await send('Runtime.enable');
    await until('document.readyState === "complete" && typeof window.api === "object"');
    assert.equal(await evaluate('$("versionChip").textContent'), 'v1.2.0');
    assert.equal(await evaluate('document.querySelector(".status-version").textContent'), 'MP3 Tagger v1.2.0');
    await evaluate(`addFiles(${JSON.stringify(files)})`);
    await until('currentFiles.length === 2 && currentFileIndex === 0 && !isLoadingData');
    await until('document.querySelectorAll(".file-card").length === 2');

    // Edycja, natychmiastowa zmiana pliku i powrót, bez zapisu i czekania na debounce.
    await evaluate(`els.title.value='Unsaved title'; els.title.dispatchEvent(new Event('input',{bubbles:true}));
        els.comment.value='Unsaved comment'; els.comment.dispatchEvent(new Event('input',{bubbles:true}));
        document.querySelector('.file-card[data-index="1"]').click();`);
    await until('currentFileIndex === 1 && !isLoadingData');
    await evaluate(`document.querySelector('.file-card[data-index="0"]').click()`);
    await until('currentFileIndex === 0 && !isLoadingData');
    assert.deepEqual(await evaluate('({title:els.title.value,comment:els.comment.value,dirty:currentFiles[0].isModified})'),
        { title: 'Unsaved title', comment: 'Unsaved comment', dirty: true });
    assert.equal(ID3.read(files[0]).title, 'Get Lucky');
    check('Switching files preserves immediate unsaved edits and leaves disk unchanged');

    // Używamy faktycznych przycisków programu, a nie bezpośredniego wywołania API.
    await evaluate(`els.searchCoverOnline.click(); els.coverSearchInput.value='Daft Punk Get Lucky';`);
    await until('!coverSearchBusy', 20000);
    await evaluate(`els.coverSearchInput.value='Daft Punk Get Lucky'; els.coverSearchBtn.click()`);
    await until('!coverSearchBusy', 20000);
    report.searchResults = await evaluate('coverSearchResults');
    const selected = report.searchResults.findIndex(r => r.source === 'itunes' && /Get Lucky/i.test(r.title)
        && /Daft Punk/i.test(r.artist) && r.album === 'Random Access Memories' && r.year === '2013');
    assert.ok(selected >= 0, 'Expected catalogue release missing: ' + JSON.stringify(report.searchResults));
    report.selected = report.searchResults[selected];
    await evaluate(`els.csApplyTags.checked=true; els.csApplyTags.dispatchEvent(new Event('change',{bubbles:true}));
        document.querySelector('.cs-card[data-idx="${selected}"]').click();`);
    await until('!coverApplyBusy && !!currentFiles[0].pendingCoverPath', 25000);
    await until('els.coverImage.complete && els.coverImage.naturalWidth > 0');
    const imported = await evaluate(`({title:els.title.value,artist:els.artist.value,album:els.album.value,
        year:els.year.value,composer:els.composer.value,coverWidth:els.coverImage.naturalWidth})`);
    for (const key of ['title', 'artist', 'album', 'year']) assert.equal(imported[key], report.selected[key], key);
    assert.equal(imported.composer, report.selected.composer || composer);
    assert.ok(imported.coverWidth >= 500);
    report.imported = imported;
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(resultsDir, 'online-metadata.png'), Buffer.from(screenshot.data, 'base64'));
    check('Real search button imports catalogue title, artist, album, year and a decoded cover; composer retained when absent');

    // Przełączenie po pobraniu musi zachować także oczekującą okładkę.
    await evaluate('selectFile(1)');
    await evaluate('selectFile(0)');
    assert.equal(await evaluate('els.album.value'), report.selected.album);
    assert.ok(await evaluate('currentFiles[0].pendingCoverPath'));
    check('Imported unsaved metadata and cover survive switching between both songs');

    // Masowa edycja: drugi plik celowo znika, aby sprawdzić częściowy błąd.
    await evaluate(`selectFile(1)`);
    await evaluate(`els.title.value='Unsaved second title'; els.title.dispatchEvent(new Event('input',{bubbles:true}));`);
    await evaluate('selectFile(0)');
    fs.renameSync(files[1], files[1] + '.backup');
    await evaluate(`document.getElementById('batch-year').value='2013'; els.applyBatch.click()`);
    await until('!els.applyBatch.classList.contains("loading")');
    assert.equal(await evaluate('currentFiles[1].editedTags.title'), 'Unsaved second title');
    assert.equal(await evaluate('currentFiles[1].originalTags.year || ""'), '');
    assert.ok(await evaluate('currentFiles[0].pendingCoverPath'));
    assert.equal(await evaluate('currentFiles[0].editedTags.comment'), 'Unsaved comment');
    fs.renameSync(files[1] + '.backup', files[1]);
    check('Partial batch failure preserves failed song state, unsaved fields and pending cover');

    fs.chmodSync(files[0], 0o444);
    await evaluate('els.saveTags.click()');
    await until('!els.saveTags.classList.contains("loading")');
    assert.ok(await evaluate('currentFiles[0].isModified && !!currentFiles[0].pendingCoverPath'));
    assert.equal(ID3.read(files[0]).title, 'Get Lucky');
    assert.equal(ID3.read(files[0]).image, undefined);
    fs.chmodSync(files[0], 0o644);
    check('Failed read-only write retains unsaved edits and the downloaded cover');

    await evaluate('els.saveAllTags.click()');
    await until('!els.saveAllTags.classList.contains("loading") && currentFiles.every(f=>!f.isModified)');
    const saved = ID3.read(files[0]);
    for (const key of ['title', 'artist', 'album', 'year']) assert.equal(saved[key], report.selected[key], key);
    assert.equal(saved.composer, composer);
    assert.equal(saved.comment.text, 'Unsaved comment');
    assert.equal(saved.trackNumber, '8/13');
    assert.equal(saved.publisher, 'Preserved label');
    assert.equal(saved.bpm, '116');
    assert.equal(saved.userDefinedText[0].value, 'Preserved');
    assert.ok(saved.image.imageBuffer.length > 1000);
    assert.deepEqual(ID3.removeTagsFromBuffer(fs.readFileSync(files[0])), originalAudio);
    assert.equal(ID3.read(files[1]).title, 'Unsaved second title');
    report.saved = { title: saved.title, artist: saved.artist, album: saved.album, year: saved.year,
        composer: saved.composer, coverBytes: saved.image.imageBuffer.length, coverMime: saved.image.mime };
    check('Save all persists both songs, imported metadata, embedded image and additional tags without changing audio');

    await evaluate('selectFile(1)');
    await evaluate('selectFile(0)');
    await until('els.coverImage.complete && els.coverImage.naturalWidth > 0');
    // Kolejny zwykły zapis musi zachować okładkę zapisaną przez Save all.
    await evaluate(`els.comment.value='Second save'; els.comment.dispatchEvent(new Event('input',{bubbles:true}));
        markAsModified(); els.saveTags.click();`);
    await until('!els.saveTags.classList.contains("loading") && !currentFiles[0].isModified');
    assert.deepEqual(ID3.read(files[0]).image.imageBuffer, saved.image.imageBuffer);
    check('Cover remains visible and embedded after save all, switching files and another save');
    assert.deepEqual(report.errors, []);
    await evaluate('closingConfirmed=true; window.close()');
    report.passed = true;
}

main().catch(error => { report.passed = false; report.failure = error.stack; console.error(error); process.exitCode = 1; })
    .finally(async () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ id: 99999, method: 'Runtime.evaluate', params: { expression: 'closingConfirmed=true; window.close()' } }));
            ws.close();
        }
        if (child) { await sleep(300); if (child.exitCode === null) child.kill('SIGTERM'); }
        fs.writeFileSync(path.join(resultsDir, 'ui-report.json'), JSON.stringify(report, null, 2) + '\n');
        fs.writeFileSync(path.join(resultsDir, 'electron.log'), log);
        console.log('Report:', path.join(resultsDir, 'ui-report.json'));
    });
