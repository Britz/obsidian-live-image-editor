# Handoff prompt — clean-room gaps + cleanup (F2, filter, F24, F11-strike, dead code)

> Transient handoff artifact (not a canonical doc). Hand to a fresh implement session.
> A collection of bounded, mostly autonomously-verifiable fixes + doc alignments from the
> clean-room audit. Touches main.ts / render-core.ts / transforms.ts / size-submenu.ts /
> filter-panel.ts / image-resolver.ts → run on a SETTLED tree (after the Bug-32 + reveal sessions).

```
AUFGABE: Die begrenzten Clean-room-Gaps + Cleanup abarbeiten (Liste unten). Meist klar; wo
"diagnose" steht: erst Ursache, dann Fix am Ursprung. Jeder Punkt mit Regression. Decisions sind
alle getroffen (siehe je Punkt).

LIES ZUERST:
- requirements.md → F2, F24/F17, F11, T3/F25, T2.3.
- architecture.md → AD2, AB3 (Source↔DOM-Map), AB7a (CLAIM_SELECTOR), AB13 (Filter).
- issues.md → die offenen Gaps + die SOLVED-Einträge (Bug 33 Basename-Fix als Vorlage für F2).
- src: main.ts (reconcileFromSource/findImageInText, postProcessor), image-resolver.ts,
  render-core.ts (CLAIM_SELECTOR ~:316), transforms.ts (temperatureAdjust, MARKER_CLASS,
  getPreset/setPresetWidth), size-submenu.ts (icon-Preset), filter-panel.ts (temperature-
  Kommentare), i18n. CLAUDE.md (Build/CDP, read-source-back-Regel).

TASKS:

1. F2 — Reading-View-Render bei Duplikaten (diagnose-first). Der Reconcile
   (`reconcileFromSource` → `findImageInText`, erster Basename-Treffer) rendert bei mehrfach
   gleichem Basename ggf. das FALSCHE Transform. Der Edit-Pfad ist via `posAtDOM` (Bug-33-Fix)
   zeilengenau; der Render-Pfad nicht. Fix: die Render-Auflösung POSITIONS-/reihenfolgegenau
   machen (n-tes Bild des Basenames = n-tes Vorkommnis in der Quelle), statt erster Treffer — in
   der Reading View gibt es kein CM/posAtDOM, also über die Vorkommnis-Reihenfolge. (Der
   per-Block-postProcessor ist via Geschwister-Textknoten schon korrekt; es geht um den Scan-
   Reconcile.) → AB3 auch im Render-Pfad realisieren. (F2.)

2. Filter — Entscheidung A (bare `filter=` ist der Weg). (a) CODE: `[filter]` in den
   `CLAIM_SELECTOR` aufnehmen (+ `[data-filter]`-Variante), damit die Runtime ein NUR-Filter-Bild
   hydratisiert und den Filter anwendet (`readTransform` liest `filter` ohnehin). (b) DOKU
   angleichen: AD2/T3/F25 — Filter (bare key) ist **runtime-only** (ohne Plugin/Runtime =
   ungefiltertes Original, F25-Baseline ok); `style="filter:…"` ist der optionale **treue**
   Escape. T2.3 bleibt (bare key korrekt). Auflösen des Doc-Widerspruchs AD2/T3/F25 ↔ T2.3.

3. F24 icon → inline. Das icon-Preset setzt nur `height` (size-submenu.ts), koppelt aber nicht an
   die Inline-Größe. `inline=true` (bzw. die Inline-Klasse) mitsetzen, sodass „icon" die Inline-
   Darstellung (F17) ergibt. (F24/F17.)

4. F11 Temperatur STREICHEN (entschieden: nicht anbinden, entfernen). DOKU: Temperatur aus F11
   + AB13 raus. CODE: toten `temperatureAdjust` (transforms.ts), den i18n-Key `temperature`, und
   die „temperature slider (Bug 8)"-Kommentare in filter-panel.ts entfernen. (Der Rest von F11 —
   die übrigen Filter — ist umgesetzt.)

5. Dead-Code-Cleanup:
   - `MARKER_CLASS = "lie-img"`: wird nur abgestreift/übersprungen, nie gesetzt → den toten
     Setz-/Definitionspfad entfernen, ABER den Parser-SKIP für alte `{.lie-img …}`-Notizen
     BEHALTEN (Back-Compat).
   - `getPreset` / `setPresetWidth` (transforms.ts): keine Aufrufer (applyPreset nutzt
     `setWidthPx`) → entfernen (ungenutztes `var(--lie-size-*)`-Schreibmodell).
   - `parseLocationTransform` (image-resolver.ts): keine Aufrufer → entfernen.

6. (Notiz, nicht zwingend) Zwei Reading-View-Pfade (postProcessor + reconcile) über denselben
   Bildern (idempotent, aber zwei Auflösungsstrategien) — milde T6-Spannung. Nur dokumentieren /
   erwägen; nicht erzwingen, falls kein klarer Gewinn.

SCOPE / GRENZE: meist autonom verifizierbar (Units + CDP read-source/DOM-back, nie annehmen —
test-plan §1-Regel). Pro Fix eine Regression. npm run build + lint + test grün; ein History-
Schritt pro Edit; KEIN Commit ohne Freigabe.

LIEFERN: die Fixes + Doc-Angleichungen (AD2/T3/F25, F11/AB13, F24, AB7a-CLAIM_SELECTOR-Notiz);
nach Landung die betroffenen issues.md-Items auf SOLVED; Tests grün.
```
