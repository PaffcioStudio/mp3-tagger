const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ID3 = require('node-id3');
const register = require('../src/handlers/tag-handlers');

function fixture(t, initial = {}, implementation = ID3) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp3-tagger-test-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'track.mp3');
    const audio = Buffer.from([0xff, 0xfb, 0x90, 0x00, ...Array(413).fill(0)]);
    fs.writeFileSync(file, Buffer.concat([ID3.create(initial), audio]));
    const handlers = {};
    register({ handle: (name, fn) => { handlers[name] = fn; } }, implementation, fs.promises, path);
    return { file, dir, audio, invoke: (name, data) => handlers[name](null, data) };
}

test('single edit preserves publisher, BPM, custom text, composer, full track and audio', async t => {
    const f = fixture(t, { title: 'Before', publisher: 'Label', bpm: '120',
        composer: 'Original composer', trackNumber: '3/12',
        userDefinedText: [{ description: 'custom', value: 'Keep me' }] });
    const read = await f.invoke('read-tags', f.file);
    assert.equal(read.tags.trackNumber, '3/12');
    assert.equal((await f.invoke('write-tags', { filePath: f.file, tags: { ...read.tags, title: 'After' } })).success, true);
    const actual = ID3.read(f.file);
    assert.equal(actual.title, 'After');
    assert.equal(actual.publisher, 'Label');
    assert.equal(actual.bpm, '120');
    assert.equal(actual.composer, 'Original composer');
    assert.equal(actual.trackNumber, '3/12');
    assert.equal(actual.userDefinedText[0].value, 'Keep me');
    assert.deepEqual(ID3.removeTagsFromBuffer(fs.readFileSync(f.file)), f.audio);
});

test('partial write preserves existing image, lyrics and comment; explicit removal deletes them', async t => {
    const image = Buffer.from('sample image');
    const f = fixture(t, { title: 'Before', image: { mime: 'image/jpeg', type: { id: 3 }, imageBuffer: image },
        comment: { language: 'eng', text: 'Comment' }, unsynchronisedLyrics: { language: 'eng', text: 'Lyrics' } });
    assert.equal((await f.invoke('write-tags', { filePath: f.file, tags: { title: 'After' } })).success, true);
    let actual = ID3.read(f.file);
    assert.deepEqual(actual.image.imageBuffer, image);
    assert.equal(actual.comment.text, 'Comment');
    assert.equal(actual.unsynchronisedLyrics.text, 'Lyrics');
    assert.equal((await f.invoke('write-tags', { filePath: f.file, tags: { coverData: null, comment: '', lyrics: '' } })).success, true);
    actual = ID3.read(f.file);
    assert.equal(actual.image, undefined);
    assert.equal(actual.comment, undefined);
    assert.equal(actual.unsynchronisedLyrics, undefined);
});

test('new cover and base64 cover survive subsequent text edits', async t => {
    const f = fixture(t);
    const imagePath = path.join(f.dir, 'cover.png');
    const image = Buffer.from('test png');
    fs.writeFileSync(imagePath, image);
    assert.equal((await f.invoke('write-tags', { filePath: f.file, tags: { title: 'Cover' }, imagePath })).success, true);
    const read = await f.invoke('read-tags', f.file);
    assert.equal(read.tags.coverData.mime, 'image/png');
    assert.equal((await f.invoke('write-tags', { filePath: f.file, tags: { ...read.tags, album: 'New album' } })).success, true);
    assert.deepEqual(ID3.read(f.file).image.imageBuffer, image);
});

test('Error returned by library is a failure for individual and batch writes', async t => {
    const f = fixture(t, {}, { ...ID3, write: () => new Error('Disk full') });
    const one = await f.invoke('write-tags', { filePath: f.file, tags: { title: 'Unsaved' } });
    assert.equal(one.success, false);
    assert.equal(one.error, 'Disk full');
    const batch = await f.invoke('batch-update', { files: [f.file], tags: { artist: 'Unsaved' } });
    assert.equal(batch[0].success, false);
    assert.equal(batch[0].error, 'Disk full');
});

test('unsupported formats are rejected without changing any bytes', async t => {
    const f = fixture(t);
    for (const extension of ['flac', 'ogg', 'm4a', 'wav', 'wma', 'aac']) {
        const file = path.join(f.dir, 'track.' + extension);
        const data = Buffer.from('Original native metadata and audio');
        fs.writeFileSync(file, data);
        assert.equal((await f.invoke('read-tags', file)).success, false);
        assert.equal((await f.invoke('write-tags', { filePath: file, tags: { title: 'Rejected' } })).success, false);
        assert.equal((await f.invoke('batch-update', { files: [file], tags: { album: 'Rejected' } }))[0].success, false);
        assert.deepEqual(fs.readFileSync(file), data);
    }
});

test('batch only updates specified fields and reports missing files individually', async t => {
    const f = fixture(t, { title: 'Title', publisher: 'Label', trackNumber: '7/10', composer: 'Composer' });
    const results = await f.invoke('batch-update', { files: [f.file, path.join(f.dir, 'missing.mp3')], tags: { album: 'Album' } });
    assert.deepEqual(results.map(r => r.success), [true, false]);
    const tags = ID3.read(f.file);
    assert.equal(tags.title, 'Title');
    assert.equal(tags.album, 'Album');
    assert.equal(tags.publisher, 'Label');
    assert.equal(tags.composer, 'Composer');
    assert.equal(tags.trackNumber, '7/10');
});
