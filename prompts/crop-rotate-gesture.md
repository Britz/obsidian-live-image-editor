# Feature prompt — trackpad two-finger rotate in the crop editor (Electron rotate-gesture)

> Transient handoff artifact. Append to / run after the Bug-32 crop work. Feasibility-gated:
> build only if the Electron event is reachable.

```
AUFGABE: Echte Zwei-Finger-Trackpad-Rotation im Crop-Mode ergänzen — über Electrons natives
`rotate-gesture`-Event (macOS), erreichbar via `@electron/remote` (derselbe Pfad, den der Export
schon nutzt). FEASIBILITY-CHECK zuerst; nur bei Erfolg implementieren. Der Rotate-Handle bleibt
unangetastet (Fallback / andere Plattformen).

RESEARCH-KONTEXT (verifiziert, NICHT neu erarbeiten):
- Electron `BrowserWindow` feuert auf macOS ein `rotate-gesture`-Event (seit 2019,
  electron/electron#19294): kontinuierlich während der Geste, Argument = Winkel-Delta in GRAD seit
  der letzten Emission (gegen Uhrzeigersinn positiv, im Uhrzeigersinn negativ, letztes Event = 0).
- Erreichbar aus dem Renderer via `require("@electron/remote").getCurrentWindow().on("rotate-gesture",
  (e, rotation) => …)`. Das Plugin nutzt `@electron/remote` bereits (export.ts:172-176, Save-Dialog).
- Web-Content hat KEIN zuverlässiges Rotations-Event (Chromium: „rotate defaults to nothing");
  deshalb ist das Electron-Window-Event der Weg, NICHT das DOM. (Pinch→`wheel`+`ctrlKey` ist nur
  Zoom.)

PHASE 0 — FEASIBILITY-CHECK (CDP, VOR jeder Implementierung, autonom):
Im laufenden Obsidian-Renderer prüfen, dass der Zugriff steht:
- `require("@electron/remote")?.getCurrentWindow?.()` existiert und liefert ein Window-Objekt mit
  `.on`/`.removeListener`.
- Ein Test-Listener `win.on("rotate-gesture", …)` lässt sich abonnieren UND wieder lösen, ohne
  Fehler.
- (Das tatsächliche FEUERN braucht eine echte Trackpad-Rotation → der User; der API-Zugriff selbst
  ist autonom belegbar.)
Falls `@electron/remote`/`getCurrentWindow` NICHT erreichbar ist → STOPP, melden „nicht baubar",
KEIN Band-Aid; der Handle bleibt die Rotation.

PHASE 1 — IMPLEMENTIEREN (nur bei Phase-0-Erfolg):
- Im Crop-Editor (crop-editor.ts) beim ÖFFNEN das `rotate-gesture`-Event abonnieren, beim
  Teardown wieder LÖSEN — scoped wie der `contain`-Override, und auf BEIDEN Exit-Pfaden
  (Bestätigen + Abbrechen/Esc/close), kein Listener-Leak.
- Die `rotation`-Delta auf `imgRotation` anwenden (`snapAngle`, wie der Handle), dann
  `updateImageTransform`; Pivot = Bild-/Frame-Zentrum (konsistent mit Handle/Center-Origin).
  Vorzeichen so wählen, dass die Drehrichtung sich natürlich anfühlt (CCW positiv → ggf. negieren).
- macOS-ONLY-Guard: nur aktivieren, wenn das Event/Plattform verfügbar ist; andere Plattformen →
  kein Gesten-Code aktiv, Handle bleibt. Pan/Zoom/Handle/Auto-Persist unverändert.

VERIFY:
- STRUKTURELL autonom: Phase-0-Zugriff belegt; subscribe beim Open, unsubscribe beim Teardown
  (beide Pfade) — nach Crop-Ende KEIN `rotate-gesture`-Listener mehr am Window (Leak-Check).
  build/lint/test grün.
- NICHT autonom (User): die echte Trackpad-Rotation im Crop (zwei Finger drehen) → dreht den
  Inhalt flüssig, gequantelt, um die Mitte, persistiert beim Menü-Verlassen. (Native Geste lässt
  sich NICHT per `Input.dispatchMouseEvent` simulieren.)
- Regression: der Subscribe/Unsubscribe-Scope (Leak-Check) als CDP-Regression; die Gest-Mathe
  (Delta→snapAngle→imgRotation) als Unit, falls extrahierbar.

GRENZE: macOS-only; `@electron/remote`-Abhängigkeit (vorhanden). Bei Phase-0-Fehlschlag NICHT
bauen. ein History-Schritt pro Editing-Session (Auto-Persist unverändert); KEIN Commit ohne Freigabe.

LIEFERN: Phase-0-Befund; bei Baubarkeit der Fix + scoped subscribe/unsubscribe + Leak-Regression;
eine kurze Doku-Notiz (macOS-Trackpad-Rotation im Crop, Electron-Event, Handle-Fallback) in
implementation-plan/architecture; eine 1-Satz-User-Testanleitung.
```
