# Build Assets

Ten folder zawiera ikony i zasoby potrzebne do budowania aplikacji.

## Struktura

```
build/
├── icon.png           # Główna ikona (512x512) - używana w Linuxie
├── icon.ico           # Ikona Windows (wiele rozmiarów)
├── icon.icns          # Ikona macOS (wiele rozmiarów)
├── source-icon.png    # Źródłowa ikona do generowania
└── icons/             # Różne rozmiary PNG
    ├── 16x16.png
    ├── 32x32.png
    ├── 48x48.png
    ├── 64x64.png
    ├── 128x128.png
    ├── 256x256.png
    └── 512x512.png
```

## Generowanie ikon

Jeśli chcesz użyć własnej ikony:

1. Utwórz plik `source-icon.png` (512x512 pikseli, preferowany format PNG z przezroczystością)
2. Umieść go w tym katalogu
3. Uruchom skrypt generujący:

```bash
cd ..  # Wróć do głównego katalogu projektu
chmod +x generate-icons.sh
./generate-icons.sh build/source-icon.png
```

Skrypt automatycznie wygeneruje wszystkie potrzebne formaty i rozmiary.

## Wymagania

Do generowania ikon potrzebujesz:
- **ImageMagick** (dla konwersji PNG → ICO)
- **iconutil** (dla konwersji PNG → ICNS, tylko macOS)

### Instalacja ImageMagick

**Linux (Ubuntu/Debian):**
```bash
sudo apt install imagemagick
```

**macOS:**
```bash
brew install imagemagick
```

**Windows:**
Pobierz z https://imagemagick.org/script/download.php

## Zalecenia dotyczące ikony

- Rozmiar źródłowy: 512x512 pikseli
- Format: PNG z kanałem alpha (przezroczystość)
- Prosty design bez drobnych detali (musi być czytelny w małych rozmiarach)
- Kontrastujące kolory
- Zaokrąglone rogi opcjonalne (będą dodane automatycznie na niektórych platformach)
