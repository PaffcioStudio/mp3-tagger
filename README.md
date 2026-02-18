# MP3 Tagger — Edytor tagów audio

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows%20%7C%20macOS-lightgrey)](https://github.com/PaffcioStudio/mp3-tagger)
[![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron)](https://www.electronjs.org/)

Nowoczesna aplikacja desktopowa (Electron) do zarządzania tagami ID3 w plikach audio. Polski interfejs, wsparcie dla wielu formatów, masowa edycja i pełna integracja z systemem Linux.

> Autor: **Paweł Potrykus (Paffcio)** — [github.com/PaffcioStudio](https://github.com/PaffcioStudio/mp3-tagger)

---

## ✨ Funkcje

- **Edycja tagów ID3** — tytuł, wykonawca, album, rok, numer ścieżki, gatunek, kompozytor, teksty, komentarze, dodatkowy wykonawca, źródło audio, numer dysku
- **Okładki albumu** — dodawanie, usuwanie i podgląd (JPG, PNG, GIF, BMP, WebP)
- **Masowa edycja** — zastosuj wybrane tagi do wszystkich załadowanych plików jednocześnie
- **Wyszukiwanie** — filtrowanie listy po tytule, wykonawcy, albumie lub nazwie pliku
- **Drag & Drop** — przeciągnij pliki bezpośrednio do okna aplikacji
- **Otwórz za pomocą...** — kliknij prawym przyciskiem na plik audio w menedżerze plików i wskaż MP3 Tagger
- **Wiele formatów** — MP3, FLAC, OGG, AAC, M4A, WAV, WMA i inne
- **Single instance** — jeśli aplikacja jest już otwarta, nowe pliki trafiają do tej samej instancji

---

## 📁 Struktura projektu

```
mp3-tagger/
├── src/
│   ├── main.js                 # Główny proces Electron, obsługa CLI i IPC
│   ├── preload.js              # Bridge między main a renderer (contextBridge)
│   └── handlers/
│       ├── file-handlers.js    # Dialogi wyboru plików i folderów
│       └── tag-handlers.js     # Odczyt i zapis tagów ID3
├── assets/
│   ├── index.html              # Struktura UI
│   ├── renderer.js             # Logika interfejsu
│   └── style.css               # Style
├── build/
│   ├── icons/                  # Ikony w wymaganych rozmiarach
│   │   ├── 16x16.png
│   │   ├── 32x32.png
│   │   ├── 48x48.png
│   │   ├── 64x64.png
│   │   ├── 128x128.png
│   │   ├── 256x256.png
│   │   └── 512x512.png
│   ├── icon.png                # Ikona główna (512×512)
│   └── icon.ico                # Ikona Windows
├── dist/                       # Zbudowane paczki (generowane, nie wersjonowane)
├── mp3-tagger.desktop          # Plik .desktop dla Linux (opcjonalny, ręczna instalacja)
├── package.json
└── README.md
```

---

## 📋 Wymagania

| Środowisko | Minimalna wersja |
|---|---|
| Node.js | 18 LTS lub nowszy |
| npm | 9 lub nowszy |
| Electron (dev dep) | 28 |

System operacyjny: **Linux** (główny target), Windows 10+, macOS 11+.

---

## 🚀 Instalacja i uruchamianie

### 1. Instalacja zależności

```bash
npm install
```

### 2. Tryb deweloperski

```bash
npm start
```

### 3. Budowanie paczek

```bash
# Linux — AppImage, .deb, snap, tar.gz
npm run build:linux

# Windows — instalator NSIS + wersja portable
npm run build:win

# macOS — DMG + ZIP
npm run build:mac
```

Gotowe pliki znajdziesz w katalogu `dist/`.

---

## 📦 Instalacja paczki .deb (Linux)

```bash
sudo dpkg -i dist/mp3-tagger_*.deb
```

Po instalacji aplikacja pojawi się w menu systemu oraz jako opcja **„Otwórz za pomocą..."** dla plików audio (MP3, FLAC, OGG, AAC, M4A, WAV, WMA).

---

## 📖 Instrukcja użycia

### Dodawanie plików

- **Przycisk „Wybierz pliki"** — dialog wyboru jednego lub wielu plików audio
- **Drag & Drop** — przeciągnij pliki lub foldery na okno aplikacji
- **Otwórz za pomocą...** — kliknij prawym przyciskiem na plik w menedżerze plików → „Otwórz za pomocą" → MP3 Tagger. Plik zostanie załadowany automatycznie

### Edycja tagów

1. Wybierz plik z listy po lewej stronie
2. Edytuj pola w zakładkach:
   - **Podstawowe** — tytuł, wykonawca, album, rok, numer utworu, gatunek
   - **Zaawansowane** — kompozytor, teksty, komentarze, dodatkowy wykonawca, źródło audio, numer dysku
   - **Okładka** — podgląd, dodawanie i usuwanie okładki
   - **Masowa edycja** — zastosuj zmiany do wszystkich plików na liście
3. Kliknij **„Zapisz tagi"**

### Masowa edycja

1. Załaduj pliki, które chcesz edytować
2. Przejdź do zakładki **„Masowa edycja"**
3. Wypełnij tylko te pola, które chcesz nadpisać (puste pola są pomijane):
   - Wykonawca, Album, Gatunek, Rok, Kompozytor, Dodatkowy wykonawca, Źródło audio
4. Kliknij **„Zastosuj do wszystkich plików"**

### Okładki

- Obsługiwane formaty: JPG, JPEG, PNG, GIF, BMP, WebP (max 10 MB)
- Kliknij **„Wybierz obraz"** aby ustawić nową okładkę
- Kliknij **„Usuń okładkę"** aby usunąć istniejącą
- Kliknij **„Powiększ"** aby zobaczyć okładkę w pełnym rozmiarze

---

## 🔧 Rozwiązywanie problemów

**Aplikacja nie uruchamia się (AppImage):**
```bash
chmod +x ./dist/MP3-Tagger-*.AppImage
./dist/MP3-Tagger-*.AppImage --no-sandbox
```

**Błąd zapisu tagów:**
- Sprawdź czy plik nie jest tylko do odczytu: `ls -l plik.mp3`
- Aplikacja informuje o braku uprawnień komunikatem w UI

**Plik audio nie pojawia się w „Otwórz za pomocą...":**
- Upewnij się że .deb jest poprawnie zainstalowany: `dpkg -l | grep mp3-tagger`
- Odśwież bazę MIME: `update-desktop-database ~/.local/share/applications/`

---

## 🛠️ Technologie

| Biblioteka | Rola |
|---|---|
| [Electron 28](https://www.electronjs.org/) | Framework desktopowy |
| [node-id3](https://github.com/Zazama/node-id3) | Odczyt i zapis tagów ID3 |
| [Font Awesome](https://fontawesome.com/) | Ikony UI |
| Vanilla JS / HTML / CSS | Frontend bez dodatkowych frameworków |

---

## 📝 Licencja

MIT License — szczegóły w pliku [`LICENSE`](LICENSE).

Copyright © 2025 **Paweł Potrykus (Paffcio)**

Możesz swobodnie używać, modyfikować i dystrybuować ten projekt pod warunkiem zachowania informacji o autorze i treści licencji we wszystkich kopiach.

---

> **Wskazówka:** Przed masową edycją zawsze warto zrobić kopię zapasową plików audio, szczególnie przy pracy na dużych kolekcjach.
