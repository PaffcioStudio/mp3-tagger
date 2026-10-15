const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function renderer() {
    const context = vm.createContext({ document: { addEventListener() {} },
        window: { addEventListener() {} } });
    vm.runInContext(fs.readFileSync(require.resolve('../assets/renderer.js'), 'utf8'), context);
    return context;
}

function fileModel() {
    return vm.runInContext('new FileData("song.mp3", "song.mp3")', renderer());
}

test('batch merge retains unsaved fields, cover path and removal flag', () => {
    for (const removed of [false, true]) {
        const file = fileModel();
        file.originalTags = { artist: 'Old', album: 'Old album' };
        file.setEditedTags({ artist: 'Unsaved', album: 'Old album', title: 'Unsaved title' });
        file.pendingCoverPath = removed ? null : '/tmp/cover.png';
        file.coverRemoved = removed;
        file.mergeWrittenTags({ album: 'Written album' });
        assert.equal(file.originalTags.album, 'Written album');
        assert.equal(file.originalTags.artist, 'Old');
        assert.equal(file.editedTags.artist, 'Unsaved');
        assert.equal(file.editedTags.title, 'Unsaved title');
        assert.equal(file.editedTags.album, 'Written album');
        assert.equal(file.pendingCoverPath, removed ? null : '/tmp/cover.png');
        assert.equal(file.coverRemoved, removed);
        assert.equal(file.isModified, true);
    }
});

test('batch can resolve the only pending field without leaving a false dirty state', () => {
    const file = fileModel();
    file.originalTags = { album: 'Old' };
    file.setEditedTags({ album: 'New' });
    file.mergeWrittenTags({ album: 'New' });
    assert.equal(file.isModified, false);
    assert.equal(file.editedTags, null);
});

test('form snapshot and pending edits include composer', () => {
    const context = renderer();
    vm.runInContext(`
        for (const key of ['title','artist','album','year','trackNumber','composer','lyrics',
            'comment','performerInfo','audioSourceUrl','partOfSet']) els[key] = {value:''};
        currentFiles = [new FileData('song.mp3','song.mp3')]; currentFileIndex=0;
        currentFiles[0].originalTags={composer:'Original'};
        els.composer.value='Changed composer';
        updateFileList=updateFileCount=updateActionButtons=()=>{};
        saveCurrentFileEdits();
    `, context);
    assert.equal(vm.runInContext('getFormData().composer', context), 'Changed composer');
    assert.equal(vm.runInContext('currentFiles[0].editedTags.composer', context), 'Changed composer');
});

test('late read from previous selection cannot overwrite the current song', async () => {
    const context = renderer();
    vm.runInContext(`
        let resolveFirst, resolveSecond, shown;
        window.api={readTags:p=>new Promise(resolve=>{
            if(p==='first.mp3') resolveFirst=resolve; else resolveSecond=resolve;
        })};
        els.editorInner={inert:false};
        setStatus=updateCoverDisplay=updateFileList=updateActionButtons=updateHero=updateGenreSelectionState=()=>{};
        createFormSnapshot=()=>''; populateForm=tags=>{shown=tags.title};
        currentFiles=[new FileData('first.mp3','first'),new FileData('second.mp3','second')];
        currentFileIndex=0; const firstLoad=loadFile(0);
        currentFileIndex=1; const secondLoad=loadFile(1);
        resolveSecond({success:true,tags:{title:'Second'}});
    `, context);
    await vm.runInContext('secondLoad', context);
    vm.runInContext("resolveFirst({success:true,tags:{title:'First'}})", context);
    await vm.runInContext('firstLoad', context);
    assert.equal(vm.runInContext('shown', context), 'Second');
    assert.equal(vm.runInContext('isLoadingData', context), false);
    assert.equal(vm.runInContext('els.editorInner.inert', context), false);
});
