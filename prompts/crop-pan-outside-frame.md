# Fix prompt — crop pan must grab the WHOLE image (inside AND outside the frame)

> Transient handoff artifact. Append to the Bug-32 run. Structural fix (pointer-events / hit area),
> structurally verifiable — no screenshots/live needed.

```
AUFGABE: Im Crop-Mode muss das Pan-Greifen (Drag zum Verschieben des Originals) das GANZE sichtbare
Bild treffen — INNERHALB UND AUSSERHALB des Rahmens — nicht nur innen. Strukturell fixen (es ist
ein pointer-events/Hit-Flächen-Problem, kein Optik-Problem).

BEFUND / URSACHE: In-place-Crop zeigt das volle Bild über den Rahmen hinaus (außen abgedunkelt). Der
Überlauf ist der Ghost: `.lie-crop-ghost { z-index:1; pointer-events:none }` + `.lie-crop-ghost-img
{ opacity:0.4 }` (styles.css ~360-361). Weil der Ghost `pointer-events:none` ist, fängt der Pan-Drag
nur die Fläche INNERHALB des Rahmens; außerhalb ist das Bild nicht greifbar.

FIX (strukturell): die Pan-Drag-Hitfläche = die VOLLE Bild-Ausdehnung. Der Ghost / das Quell-Bild
muss pointerdown/move für Pan über seine GANZE Ausdehnung fangen (also pointer-events aktiv auf der
Bild-/Pan-Ebene, nicht none). Dabei sauber schichten:
- Bild-/Pan-Ebene (volle Ausdehnung) → fängt Pan (pointerdown→move→up) überall.
- Dim-/Abdunkel-Ebene außen → rein VISUELL, `pointer-events:none`, damit das Bild darunter den Pan
  fängt (die Abdunklung darf den Griff nicht blocken).
- Handles + Rotate-Knob → darüber (höheres z-index), fangen ihre EIGENEN Events (resize/rotate) —
  kein Konflikt / keine Doppelerfassung mit dem Pan.
Achte darauf, dass der Pan-Listener-Target und die CSS-`pointer-events` konsistent sind (heute
greift der eine, das andere blockt).

VERIFY (strukturell, autonom — kein Screenshot/Live): per CDP synthetic input + pointer-events-
Inspektion:
- `getComputedStyle(<pan-layer>).pointerEvents` ist NICHT `none`; die Dim-Ebene IST `none`.
- `Input.dispatchMouseEvent` mousedown AUSSERHALB des Rahmens auf dem Überlauf-Bild → move → der
  Inner-`transform` translatet (Pan greift) — Quelle/State zurücklesen, nicht annehmen.
- mousedown INNERHALB → Pan greift ebenso.
- Handles + Rotate-Knob bleiben getrennt greifbar (elementFromPoint auf einem Handle = das Handle,
  nicht die Pan-Ebene).
- keine Konsolen-Exceptions; teardown restauriert weiterhin alles (siehe verify-crop-teardown).

GRENZE: rein strukturell. Regression in tests/regressions.test.ts (CDP). npm run build + lint +
test grün; ein History-Schritt pro Editing-Session (Auto-Persist beim Menü-Verlassen unverändert);
KEIN Commit ohne Freigabe.

LIEFERN: der Fix + die Regression; kurzer Befund (welcher Layer den Griff blockte, wie geschichtet).
```
