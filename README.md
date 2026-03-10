# 📦 Inventar Kalkulator — PWA

Bestand erfassen, als CSV/PDF exportieren und KI-Rezeptvorschläge erhalten.

## 🚀 Deployment auf Vercel (empfohlen)

### Schritt 1: GitHub Repository erstellen

1. Gehe auf [github.com/new](https://github.com/new) und erstelle ein neues Repository
2. Lade diesen Ordner hoch (oder nutze git):

```bash
cd inventar-pwa
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/DEIN-USERNAME/inventar-pwa.git
git push -u origin main
```

### Schritt 2: Auf Vercel deployen

1. Gehe auf [vercel.com](https://vercel.com) und logge dich mit GitHub ein
2. Klicke "Add New Project"
3. Wähle dein `inventar-pwa` Repository
4. Framework Preset: **Vite** (wird automatisch erkannt)
5. Klicke "Deploy" — fertig!

### Schritt 3: Auf dem Handy installieren

1. Öffne die Vercel-URL auf deinem Handy (z.B. `inventar-pwa.vercel.app`)
2. **Android**: Tippe auf die drei Punkte → "Zum Startbildschirm hinzufügen"
3. **iPhone**: Tippe auf das Teilen-Symbol → "Zum Home-Bildschirm"
4. Die App erscheint als Icon auf deinem Homescreen!

## ⚙️ Lokal entwickeln

```bash
npm install
npm run dev
```

Öffne dann `http://localhost:5173` im Browser.

## 🔑 API-Key für Rezeptvorschläge

Die Rezeptfunktion nutzt die Anthropic API (Claude). Du brauchst einen API-Key:

1. Erstelle einen auf [console.anthropic.com](https://console.anthropic.com)
2. Klicke in der App auf ⚙️ (neben dem Titel)
3. Gib deinen Key ein — er wird lokal auf deinem Gerät gespeichert

## 📱 Features

- ✅ Produkte mit +/- Zähler verwalten
- ✅ Daten bleiben nach App-Neustart erhalten (localStorage)
- ✅ CSV-Export (Excel-kompatibel)
- ✅ PDF-Export (Druckdialog)
- ✅ KI-Rezeptvorschläge basierend auf Inventar
- ✅ Offline-fähig (Service Worker)
- ✅ Installierbar als PWA auf jedem Gerät
