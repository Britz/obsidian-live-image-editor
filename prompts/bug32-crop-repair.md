# Handoff prompt — Bug 32: crop/rotate editor repair + in-place (+ auto-persist)

> Transient handoff artifact (not a canonical doc). Hand this to a fresh implement session.
> Runtime-confirmed broken: rotate + crop "wie dokumentiert". (Bug 33 / flip / persist are resolved.)

```
AUFGABE: Den Crop-Editor REPARIEREN — er wurde beim Crop-Geometrie-Rework nicht mit-migriert,
läuft auf ALTEN Annahmen, während Renderer + Format auf 3-Layer + Center-Origin + transform=/
aspect-ratio= umgestellt sind. Diagnose-first, aus AD3 NEU ABLEITEN (kein Band-Aid). Im selben
Zug auf echtes In-Place umstellen (Body-Clone-Overlay ablösen) UND den Accept/Haken entfernen
(Auto-Persist). Bis MANUELL-TESTBAR bauen; die Drag-Interaktion + Sensitivität verifiziert der
User. = Bug 32 (issues.md), runtime-bestätigt.

LIES ZUERST:
- requirements.md → D8 (in-place: KEIN Jump/Reflow; außen abgedunkelt, innen voll; Handles am
  ORIGINAL: corner aspect-locked + edge single-axis + rotate), F12 (live ganzzahlige px + feste
  Winkelschritte), F14 (shared sub-menu host — siehe Auto-Persist unten), F24/D6.1 (Resize-Menü),
  D4 (nativer Resize-Handle im Crop AUSGEBLENDET).
- architecture.md → AD3 (3-Layer), AB12 (Crop editor), AD2, AD8 (shared host).
- issues.md → Bug 32 (dieser Cluster) + DEFER "Crop-in-place" (Klippungsproblem) + Bug 25
  (SOLVED im Renderer — die Center-Origin-Korrektur fehlt im Editor).
- src/crop-editor.ts, src/crop-editor-logic.ts, src/render-core.ts (buildLayers, .lie-image-
  area/.lie-frame, RENDER_CSS, readTransform), src/main.ts (crop()/modifyTransform/width-Resize),
  src/anchored-submenu.ts (host). CLAUDE.md.

MODELL (so sollen die Controls wirken — revidiert F12/D8, mit nachziehen):
- Crop-Mode: weißer Resize-Rahmen (Handles ringsum: corner aspect-locked / edge single-axis +
  Dreh-Knopf, + scroll/pinch) sitzt am INNEREN BILD → bewegt/skaliert/dreht das Original
  (transform=). Quantisiert live (ganzzahlige px + feste Winkel, F12).
- Der Bild-Rahmen (Box / .lie-frame-Clip) ist im Crop FIX — Größe UND Position unveränderlich.
- Schnittform ändert man nur über die eigenen Aspect-Presets (kein Frame-Resize per Bild-Geste).
  Box-Größe ändert man AUSSERHALB des Crops: nativer Resize-Handle (D4) / Resize-Menü (F24).
- AUTO-PERSIST statt Accept: KEIN Haken/confirm UND KEIN Cancel/X. Während das Menü OFFEN ist:
  reine Live-DOM-Preview, KEIN Source-Write. Beim VERLASSEN des Menüs (close / Esc / wegklicken /
  Panel-Dismiss) wird EINMAL persistiert = EIN Undo-Schritt für die GANZE Editing-Session (über
  den shared isolateHistory-Writer). Es gibt keinen Abbrechen-Weg außer cmd-z (Undo) + Reset —
  genau deshalb ist "Menü verlassen" = akzeptieren. Gilt für den shared host generell
  (crop/filter/size) — F14/AD8/D6 entsprechend nachziehen ("reset + close/dismiss-das-persistiert",
  kein accept, kein cancel).

SYMPTOME (= Bug 32, runtime-bestätigt; flip + "nichts persistiert" sind bereits GELÖST):
  A. Rotate dreht um die LINKE OBERE ECKE statt mittig, bricht beim Loslassen ab. → Editor nutzt
     noch top-left-Origin (Center-Fix erreichte nur den Renderer); Vorschau ≠ committetes
     toCropResult → Round-Trip-Drift.
  B. Rotate per MAUS-Geste tot. → Dreh-Knopf-Pointer-Logik nach Umbau kaputt.
  C. Beim Drehen dreht das OVERLAY-BILD nicht mit. → Overlay wendet den Rotate nicht aufs Bild an.
  D./E. Der weiße Resize-Rahmen ist VISUELL am Rahmen verankert — gehört ans INNERE BILD. Sein
     Effekt ändert zwar schon das Bild, aber dabei wird die Box mit-resized (darf NICHT). →
     Handles ans innere Bild verankern, Bild-Effekt behalten, von der Box ENTKOPPELN (Box fix).
  F. KEINE Edge-Handles (D8 fordert corner aspect-locked + edge single-axis). → Edge-Handles
     ergänzen.
  G. Nativer Resize-Handle leakt in den Crop; ein äußerer/width-Resize SETZT DEN CROP ZURÜCK. →
     nativen Handle im Crop ausblenden (D4); width-Write muss transform=/aspect-ratio= BEWAHREN.
  H. Pinch-Move/Zoom geht, nur zu SENSITIV. → Sensitivität tunen (User bestätigt das Gefühl).

URSPRUNG (Bug-Protokoll): Crop-Editor + width-Write-Pfad wurden nicht fürs neue 3-Layer-Modell +
die neue Serialisierung neu abgeleitet. Fix am Ursprung: Editor aus AD3 neu ableiten — Center-
Origin (wie Renderer), Handles am inneren Bild, Box im Crop fix, Overlay wendet DASSELBE
Transform-Modell an, Vorschau == committetes Ergebnis (eine Geometrie-Quelle), width-Write
bewahrt den Crop, Auto-Persist beim Menü-Verlassen.

IN-PLACE-KERN (löst zugleich das DEFER-Klippungsproblem):
Während Crop-Mode das Bild IN-PLACE un-clippen — ganzes Bild über den Rahmen hinaus (außen
abgedunkelt, innen voll), Handles in-place — OHNE Reflow (D8): reservierte Footprint-Box bleibt,
übergelaufenes Vollbild wird darüber gezeichnet (z-index), Nachbarn rücken nicht. overflow:hidden
(.lie-frame + .lie-image-area) und im LP contain:paint am Embed-Wrapper für die Crop-Dauer
aufheben/umgehen (wofür heute das position:fixed-Body-Clone nötig war). Beide Views.

WIEDERVERWENDEN: crop-editor-logic.ts (snapTranslate/snapAngle/snapScale, pure), toCropResult
(serialisiert schon transform= + aspect-ratio= ≠ Original, kein px-height), shared sub-menu host.

SCOPE / GRENZE:
- AUTONOM (CDP, nicht-interaktiv) diagnostizier-/fixbar: öffnet der Editor; Konsolenfehler; was
  am Gesten-Ende SERIALISIERT wird; Vorschau == Ergebnis; Center-Origin; Box im Crop fix;
  Overlay-Bild rotiert mit; nativer Handle im Crop versteckt; Crop überlebt einen width-Resize;
  Crop-Mode ohne Reflow; während offen KEIN Source-Write, beim Verlassen genau EIN Undo-Schritt
  für die Session; LP + Reading.
- STRUKTURELL verifizieren — das ist die HAUPTverifikation und sie ist autonom, KEIN Optik-/
  Live-Test nötig: die meisten Symptome sind CODE-/DOM-Fakten, nicht Optik. Per Code-Lesen +
  Unit + CDP-DOM-Inspektion asserten:
  - an welches Element die Handles gebunden sind → das innere `<img>`, NICHT der Frame (D/E);
  - der Rotation-/`transform-origin` ist CENTER, nicht top-left (A) — der gesetzte Wert / die
    Pivot-Mathe (unit-testbar);
  - der Dreh-Handle ist verdrahtet und dreht das Overlay-Bild mit (B/C) — Listener-Target + die
    auf das Bild angewandte Transform;
  - der Editor arbeitet auf der LIVE-3-Layer-Struktur, KEIN `position:fixed`-Body-Clone
    (`document.body`-Overlay weg);
  - Edge-Handle-Elemente existieren (F); der native Handle ist im Crop versteckt (G) — DOM/CSS;
  - der Commit serialisiert das korrekte `transform=`/`aspect-ratio=`, ein width-Write BEWAHRT den
    Crop (H) — serialize-Assert / Unit; Auto-Persist erst beim Menü-Verlassen (ein Undo-Schritt).
  Eine "fertig"-Meldung ist nur gültig, wenn diese strukturellen Checks belegt sind.
- VISUELL nur als ERGÄNZUNG: CDP-Screenshot (`Page.captureScreenshot`) fürs komponierte Bild
  (kein Jump beim Enter/Exit, gerendertes Crop-Ergebnis) + eine Gesten-Probe via
  `Input.dispatchMouseEvent`. (Helfer ggf. um Screenshot/synthetic-input ergänzen.)
- LIVE/User nur fürs Rest-"Gefühl" (Pinch-Sensitivität).
- Tests: pro gefixtem Symptom eine Regression (Units in *-logic / transforms; CDP-Checks lesen
  den ECHTEN Source zurück, nie annehmen — test-plan §1-Regel, §2.8, §3 AD1-Matrix).
- npm run build + lint + test grün; ein History-Schritt pro Editing-Session; KEIN Commit ohne
  Freigabe.

LIEFERN:
- Crop-Fixture in der examples-Vault (dauerhaft).
- präzise Test-Checkliste für den User: A–H als Regression (rotate mittig+persistent+per Maus;
  Overlay dreht mit; weiße Handles am inneren Bild; Box bleibt fix; Edge-Handles da; nativer
  Handle weg im Crop; width-Resize erhält Crop; Pinch-Sensitivität; Auto-Persist beim Menü-
  Verlassen, kein Haken/kein Cancel; cmd-z = EIN Schritt für die Session; kein Jump beim
  Enter/Exit; beide Views; Clone-Overlay ist weg).
- nach Landung: Bug 32 + DEFER "Crop-in-place" → SOLVED (Cause+Fix); F12/D8/F14/AD8/D6/AB12/§Crop
  auf IST (Frame im Crop fix; Box-Sizing via Resize/Menü; Auto-Persist statt Accept).
```
