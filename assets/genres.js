// ============================================================
//  MP3 Tagger — baza danych podpowiedzi
//  Plik ładowany przed renderer.js
// ============================================================

// -----------------------------------------------------------
//  GATUNKI — ~300 pozycji
// -----------------------------------------------------------
const ALL_GENRES = [
    // === Pop ===
    "Pop", "Synth-Pop", "Dream Pop", "Indie Pop", "Art Pop", "Baroque Pop",
    "Bubblegum Pop", "Chamber Pop", "Dance Pop", "Electropop", "Jangle Pop",
    "K-Pop", "J-Pop", "C-Pop", "Citypoп", "Power Pop", "Sophisti-Pop",
    "Teen Pop", "Twee Pop", "Hyperpop",

    // === Rock ===
    "Rock", "Classic Rock", "Alternative Rock", "Indie Rock", "Hard Rock",
    "Soft Rock", "Progressive Rock", "Psychedelic Rock", "Glam Rock",
    "Punk Rock", "Post-Punk", "New Wave", "Noise Rock", "Math Rock",
    "Shoegaze", "Grunge", "Garage Rock", "Desert Rock", "Stoner Rock",
    "Space Rock", "Post-Rock", "Emo", "Emo Pop", "Ska Punk",

    // === Metal ===
    "Metal", "Heavy Metal", "Thrash Metal", "Death Metal", "Black Metal",
    "Doom Metal", "Power Metal", "Symphonic Metal", "Folk Metal",
    "Melodic Death Metal", "Progressive Metal", "Nu-Metal", "Groove Metal",
    "Speed Metal", "Sludge Metal", "Post-Metal", "Metalcore", "Deathcore",
    "Gothic Metal", "Viking Metal", "Pagan Metal",

    // === Electronic ===
    "Electronic", "Techno", "House", "Deep House", "Tech House", "Minimal Techno",
    "Trance", "Progressive Trance", "Psytrance", "Goa Trance", "Vocal Trance",
    "Ambient", "Dark Ambient", "Drone", "IDM", "Glitch", "Downtempo",
    "Chillout", "Lo-fi", "Synthwave", "Retrowave", "Vaporwave", "Darkwave",
    "EBM", "Industrial", "Future Bass", "Future Garage", "Trap EDM",
    "Dubstep", "Brostep", "Riddim", "Liquid DnB", "Drum and Bass",
    "Jungle", "Breakbeat", "Breakcore", "Footwork", "Jersey Club",
    "Hardstyle", "Hardcore", "Gabber", "Happy Hardcore", "UK Hardcore",
    "Electro", "Nu-Disco", "Italo Disco", "French House", "Microhouse",
    "Ambient House", "Dub Techno", "Acid Techno", "Acid House",
    "UK Garage", "2-Step", "Speed Garage", "Bassline",

    // === Dance / Club ===
    "Dance", "EDM", "Club", "Hi-NRG", "Eurodance", "Europop",
    "80s Euro-Disco", "Disco", "Boogie", "Funk",
    "G-Funk", "Bounce",

    // === Hip-Hop / R&B ===
    "Hip Hop", "Rap", "Trap", "Drill", "UK Drill", "Boom Bap",
    "East Coast Hip Hop", "West Coast Hip Hop", "Southern Hip Hop",
    "Conscious Hip Hop", "Crunk", "Mumble Rap", "Cloud Rap",
    "R&B", "Neo Soul", "Contemporary R&B", "New Jack Swing",
    "Soul", "Motown", "Funk Soul", "Gospel", "Gospel Pop",

    // === Jazz ===
    "Jazz", "Bebop", "Cool Jazz", "Hard Bop", "Free Jazz", "Fusion",
    "Smooth Jazz", "Acid Jazz", "Nu Jazz", "Modal Jazz", "Swing",
    "Big Band", "Dixieland", "Gypsy Jazz", "Latin Jazz", "Bossa Nova",
    "Afrobeat", "Afro Jazz",

    // === Classical ===
    "Classical", "Baroque", "Renaissance", "Romantic", "Contemporary Classical",
    "Minimalism", "Orchestral", "Chamber Music", "Opera", "Choral",
    "Symphony", "Concerto", "Sonata", "Suite", "Requiem",

    // === Folk / Acoustic ===
    "Folk", "Indie Folk", "Folk Pop", "Contemporary Folk", "Freak Folk",
    "Anti-Folk", "Neofolk", "Folk Rock", "Electric Folk", "Acoustic",
    "Singer-Songwriter", "Americana", "Bluegrass", "Old-Time", "Celtic",
    "Irish Folk", "Scottish Folk", "Nordic Folk", "Scandinavian Folk",

    // === Blues ===
    "Blues", "Delta Blues", "Chicago Blues", "Electric Blues", "Texas Blues",
    "Piedmont Blues", "Jump Blues", "Rhythm and Blues", "Soul Blues",

    // === Country ===
    "Country", "Country Pop", "Country Rock", "Alt-Country", "Outlaw Country",
    "Honky Tonk", "Nashville Sound", "Western",
    "Country Blues",

    // === Reggae / Ska ===
    "Reggae", "Dancehall", "Dub", "Ska", "Rocksteady", "Roots Reggae",
    "Lovers Rock", "Raggamuffin", "Reggaeton",

    // === Latin ===
    "Latin", "Salsa", "Cumbia", "Bachata", "Merengue", "Samba",
    "Flamenco", "Tango", "Bolero", "Son Cubano",
    "Tropicália", "Latin Pop", "Latin Rock",
    "Vallenato", "Norteño", "Mariachi",

    // === World ===
    "World", "World Music", "Afropop", "Highlife",
    "Soukous", "Mbalax", "Gnawa", "Raï", "Bhangra", "Bollywood",
    "Arabic Pop", "Turkish Pop", "Balkan", "Klezmer", "Fado",
    "Chanson", "Schlager",

    // === Indie / Alternative ===
    "Indie", "Alternative", "Indie Electronic", "Art Rock",
    "Lo-fi Indie", "Slowcore", "Sadcore",

    // === Seasonal / Thematic ===
    "Christmas", "Christmas Pop", "Christmas Jazz", "Christmas Classical",
    "Halloween", "Ambient Seasonal",

    // === Instrumental / Cinematic ===
    "Instrumental", "Cinematic", "Soundtrack", "Film Score", "Video Game Music",
    "Ambient Soundtrack", "Epic Orchestral", "Dark Cinematic",

    // === New Age / Meditation ===
    "New Age", "Meditation", "Relaxation", "Healing", "Spa", "Nature Sounds",
    "Binaural Beats", "432Hz",

    // === Punk ===
    "Punk", "Hardcore Punk", "Pop Punk", "Anarcho-Punk",
    "Crust Punk", "D-beat", "Street Punk", "Glam Punk",

    // === Inne ===
    "20th Century", "Experimental", "Noise", "Avant-Garde", "Spoken Word",
    "Comedy", "Children", "Podcast", "Audiobook", "ASMR"
];

// Krótka lista do przycisków quickGenres (najczęściej używane)
const QUICK_GENRES = [
    "Pop", "Rock", "Jazz", "Classical", "Hip Hop", "Electronic", "Metal", "Blues",
    "Country", "Reggae", "Funk", "Soul", "R&B", "Dance", "EDM", "Techno",
    "House", "Trance", "Ambient", "Synthwave", "Lo-fi", "Indie", "Alternative",
    "Folk", "Disco", "Punk", "Trap", "Drum and Bass", "Dubstep", "New Age",
    "Christmas", "Gospel", "Instrumental", "Cinematic", "Soundtrack",
    "80s Euro-Disco", "Eurodance", "Hi-NRG", "Acoustic", "Singer-Songwriter"
];

// -----------------------------------------------------------
//  ŹRÓDŁA AUDIO — popularne platformy do autouzupełniania
// -----------------------------------------------------------
const AUDIO_SOURCES = [
    "suno.com", "udio.com", "soundcloud.com", "bandcamp.com",
    "youtube.com", "spotify.com", "beatport.com", "junodownload.com",
    "freemusicarchive.org", "ccmixter.org", "looperman.com",
    "musicbed.com", "artlist.io", "epidemicsound.com", "pond5.com",
    "premiumbeat.com", "audiojungle.net", "jamendo.com",
    "splice.com", "landr.com", "distrokid.com", "tunecore.com",
    "cdbaby.com", "amuse.io", "reverbnation.com"
];

// -----------------------------------------------------------
//  AUTOCOMPLETE — przewijalny dropdown zastępujący <datalist>
// -----------------------------------------------------------

/**
 * Tworzy autocomplete dla danego pola input.
 * @param {string} inputId     - id pola <input>
 * @param {string[]} items     - lista podpowiedzi
 * @param {object} opts
 *   onSelect(value)           - callback po wyborze (opcjonalny)
 *   maxVisible                - max widocznych pozycji bez scrollowania (def. 8)
 */
function createAutocomplete(inputId, items, opts = {}) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const maxVisible = opts.maxVisible || 8;
    const itemH = 34; // przybliżona wysokość jednego wiersza px

    let dropdown = null;
    let activeIndex = -1;
    let currentItems = [];

    // Opakuj input w wrapper tylko jeśli jeszcze nie ma
    if (!input.parentElement.classList.contains('autocomplete-wrapper')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'autocomplete-wrapper';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);
    }

    function getFilteredItems(query) {
        if (!query) return items.slice(0, 60);
        const q = query.toLowerCase();
        const exact = items.filter(i => i.toLowerCase().startsWith(q));
        const rest  = items.filter(i => !i.toLowerCase().startsWith(q) && i.toLowerCase().includes(q));
        return [...exact, ...rest];
    }

    function highlight(text, query) {
        if (!query) return escapeForHtml(text);
        const idx = text.toLowerCase().indexOf(query.toLowerCase());
        if (idx === -1) return escapeForHtml(text);
        return (
            escapeForHtml(text.slice(0, idx)) +
            '<mark>' + escapeForHtml(text.slice(idx, idx + query.length)) + '</mark>' +
            escapeForHtml(text.slice(idx + query.length))
        );
    }

    function escapeForHtml(s) {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function positionDropdown() {
        if (!dropdown) return;
        const rect = input.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom - 8;
        const spaceAbove = rect.top - 8;
        const dropH = Math.min(currentItems.length * itemH + 28, maxVisible * itemH + 28);

        if (spaceBelow >= dropH || spaceBelow >= spaceAbove) {
            dropdown.style.top  = (rect.bottom + 2) + 'px';
            dropdown.style.maxHeight = Math.min(dropH, spaceBelow) + 'px';
        } else {
            dropdown.style.top  = (rect.top - Math.min(dropH, spaceAbove) - 2) + 'px';
            dropdown.style.maxHeight = Math.min(dropH, spaceAbove) + 'px';
        }
        dropdown.style.left  = rect.left + 'px';
        dropdown.style.width = rect.width + 'px';
    }

    function renderDropdown(query) {
        currentItems = getFilteredItems(query);
        if (currentItems.length === 0) { closeDropdown(); return; }

        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.className = 'autocomplete-dropdown';
            document.body.appendChild(dropdown);
        }

        dropdown.innerHTML = currentItems.map((item, i) =>
            `<div class="autocomplete-item" data-index="${i}">${highlight(item, query)}</div>`
        ).join('') +
        `<div class="autocomplete-count">${currentItems.length} wyników</div>`;

        activeIndex = -1;
        positionDropdown();
        dropdown.style.display = 'block';

        dropdown.querySelectorAll('.autocomplete-item').forEach(el => {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                selectItem(currentItems[parseInt(el.dataset.index)]);
            });
        });
    }

    function selectItem(value) {
        input.value = value;
        closeDropdown();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('blur',  { bubbles: true }));
        if (opts.onSelect) opts.onSelect(value);
    }

    function closeDropdown() {
        if (dropdown) { dropdown.style.display = 'none'; }
        activeIndex = -1;
    }

    function setActive(idx) {
        if (!dropdown) return;
        const els = dropdown.querySelectorAll('.autocomplete-item');
        els.forEach(el => el.classList.remove('active'));
        if (idx >= 0 && idx < els.length) {
            els[idx].classList.add('active');
            els[idx].scrollIntoView({ block: 'nearest' });
        }
        activeIndex = idx;
    }

    // ---- Eventy ----
    input.addEventListener('input', () => {
        renderDropdown(input.value.trim());
    });

    input.addEventListener('focus', () => {
        renderDropdown(input.value.trim());
    });

    input.addEventListener('blur', () => {
        // Opóźnienie żeby mousedown na itemu zdążył zadziałać
        setTimeout(closeDropdown, 150);
    });

    input.addEventListener('keydown', (e) => {
        if (!dropdown || dropdown.style.display === 'none') return;
        const total = currentItems.length;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(Math.min(activeIndex + 1, total - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(Math.max(activeIndex - 1, 0));
        } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            selectItem(currentItems[activeIndex]);
        } else if (e.key === 'Escape') {
            closeDropdown();
        }
    });

    // Zamknij jeśli okno jest scrollowane lub resize
    window.addEventListener('scroll', positionDropdown, true);
    window.addEventListener('resize', positionDropdown);
}

// Inicjalizacja po załadowaniu DOM
document.addEventListener('DOMContentLoaded', () => {
    // Pole "Główny gatunek" (zakładka Podstawowe)
    createAutocomplete('genre', ALL_GENRES);

    // Pole "Gatunek" w masowej edycji
    createAutocomplete('batch-genre', ALL_GENRES);

    // Pola źródła audio
    createAutocomplete('audioSourceUrl', AUDIO_SOURCES);
    createAutocomplete('batch-audioSourceUrl', AUDIO_SOURCES);
});
