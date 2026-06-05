# Handoff prompt — re-shoot the user-guide screenshots with an ENGLISH UI

> Transient handoff artifact. The `docs/img/*.png` screenshots were captured while the running
> Obsidian was in **German** (the plugin follows Obsidian's locale, F21), so the crop panel reads
> "Zuschneiden", the filter sliders "Helligkeit/Kontrast", etc. Re-capture them with the UI in
> English so they match the English `docs/user-guide.md`. Self-contained; no commit.

```
AUFGABE: Die sechs User-Guide-Screenshots in docs/img/ mit ENGLISCHER Plugin-/Obsidian-UI neu
aufnehmen (Toolbar-Labels, Crop-Panel "Crop"/"Free", Filter-Slider "Brightness"… statt deutsch).
Mechanik + Tooling stehen schon; nur die Locale muss auf Englisch und dann neu schießen + PRÜFEN.
KEIN Commit ohne Freigabe.

LIES ZUERST: CLAUDE.md (Build/CDP/Dev-Bridge), scripts/shoot-docs.mjs (das Screenshot-Skript),
docs/user-guide.md (die Bilder, die ersetzt werden), examples/ (das Demo-Vault, 00–07).

KONTEXT:
- Die Plugin-Strings kommen aus src/i18n (t()), gesetzt per setLocale(detectLocale()) beim Load.
  detectLocale() liest window.localStorage "language": ist sie gesetzt und ≠ "en", wird sie benutzt
  (hier "de" → deutsche UI). Für Englisch: Obsidian auf Englisch stellen (localStorage "language" auf
  "en"/leer) und neu laden — dann rendern Toolbar-Tooltips UND die Panel-Labels (Crop/Filter/Size)
  englisch.
- shoot-docs.mjs nimmt 6 Shots: toolbar, rotate, crop, filter-panel, float-wrap, caption — gegen das
  examples-Vault-Fenster (CDP_TARGET=examples, CDP_PORT default 9223 direkt; Relay 9222 flapt nach
  Reload, s. CLAUDE.md). Es öffnet die Demo-Seiten, erzwingt Hover per Input.dispatchMouseEvent,
  öffnet Crop/Filter über plugin.crop()/toggleFilters(), und clippt aufs Feature.

SCHRITTE:
1. Dev-Build mit den aktuellen Fixes ins examples-Vault schreiben (behält dev-bridge/Relay):
     OBSIDIAN_PLUGIN_DIR=examples/.obsidian/plugins/live-image-editor node esbuild.config.mjs dev
2. Obsidian-Fenster "examples" auf ENGLISCH stellen und neu laden, via CDP:
     CDP_TARGET=examples node scripts/obsidian-debug.mjs --eval 'localStorage.setItem("language","en"); location.reload(); "reloading"'
   ~20–30s warten, dann pollen bis das Plugin wieder da ist (Relay 9222 kann flappen → ggf.
   CDP_PORT=9223 nutzen):
     CDP_TARGET=examples node scripts/obsidian-debug.mjs --eval 'JSON.stringify({vault:app.vault.getName(), ready:!!app.plugins.plugins["live-image-editor"]})'
   FALLS die Plugin-UI trotzdem deutsch bleibt (detectLocale-Eigenheit / navigator.language): in
   Obsidian Settings → About → Language → "English" setzen und neu laden — das ist der sichere Weg.
3. Locale VERIFIZIEREN, bevor geschossen wird (nicht annehmen!). Entweder das Crop-Panel kurz prüfen
   oder einfach den crop-Shot machen und ansehen (Titel muss "Crop", Presets "Free/16:9/4:3/1:1"
   lauten — nicht "Zuschneiden/Frei").
4. Alle Shots neu aufnehmen:
     node scripts/shoot-docs.mjs
   Dann JEDES PNG mit dem Read-Tool ANSEHEN (docs/img/toolbar.png, rotate.png, crop.png,
   filter-panel.png, float-wrap.png, caption.png) und prüfen:
     - englische Labels (Crop/Free, Brightness/Contrast/Saturation/Hue/Blur/Grayscale/Sepia,
       presets B&W/Sepia/Vintage/Warm/Cool),
     - repräsentativer Frame: das Feature sichtbar, nicht leer/abgeschnitten,
     - toolbar.png: alle Icons + Resize-Handle; crop.png: Panel + Handles in-place;
       filter-panel.png: Histogramm + Presets + gruppierte Slider; float-wrap.png: Float + Wrap;
       caption.png: Caption unter dem Bild.
   Ein leerer/falscher Frame (wie früher der rotate-Shot unter der Falz) wird einzeln neu geschossen:
     node scripts/shoot-docs.mjs <name>
   (Das Skript scrollt den rotate-Shot bereits in den View; bei anderen ggf. ergänzen.)
5. Reading-View-Shots sind NICHT nötig (alle Guide-Bilder sind Live Preview, das headless rendert).
   Wenn ein Reading-View-Bild gewünscht ist, braucht es ein FOKUSSIERTES Fenster (Reading View
   rendert nicht im Hintergrund — CLAUDE.md / issues.md "Reading-view focused-window pass").

OPTIONAL (sauber abschließen): die Demo-Window-Locale wieder auf den vorherigen Stand zurücksetzen
(localStorage "language" zurück auf "de" + reload), falls der User weiter deutsch arbeitet.

LIEFERN: die sechs ersetzten docs/img/*.png (englische UI, je visuell bestätigt), eine kurze Liste
welcher Shot was zeigt, und der Hinweis ob die Locale danach zurückgesetzt wurde. KEIN Commit ohne
Freigabe.
```
