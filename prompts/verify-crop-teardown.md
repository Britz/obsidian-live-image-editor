# Verify prompt — crop teardown restores ALL transient overrides (esp. host `contain`)

> Transient handoff artifact. Append to the Bug-32 run. Structural CDP verification — no
> screenshots/live needed.

```
AUFGABE: Verifiziere strukturell, dass der Crop-Editor seine TRANSIENTEN Overrides bei JEDEM
Ausstieg VOLLSTÄNDIG zurücksetzt — nichts darf permanent leaken, vor allem nicht das auf dem Host
ausgehebelte `contain`. Falls ein Pfad nicht restauriert → am Ursprung fixen (idealerweise EIN
gemeinsamer teardown, den alle Exits rufen). Rein strukturell/autonom (DOM/computed-style/source
zurücklesen, NIE annehmen) — kein Screenshot, kein Live-Test nötig.

KONTEXT: In-place-Crop hebt für die Crop-Dauer das Host-`contain:paint` aus
(`host.style.setProperty("contain","none","important")` + `.lie-cropping` auf area+host +
overflow:visible, crop-editor.ts ~151-159) und stellt es im teardown wieder her (~214-216). RISIKO:
es gibt ZWEI Ausstiegspfade (Bestätigen vs. Abbrechen/Esc/close — die DRY-Audit vermerkt doppelten
teardown). Restauriert nur EINER das `contain`, bleibt nach einem bestätigten Crop `contain:none`
PERMANENT → die LP-Block-Widget-Paint-Containment ist danach kaputt.

CHECKS (in der examples-Vault, per CDP, pro Exit-Pfad):
1. Crop öffnen auf einem Crop-Fixture → Override AKTIV asserten: `.lie-cropping` auf area UND host;
   `getComputedStyle(host).contain === "none"`; area overflow sichtbar; ghost/handles im DOM.
2. Exit per BESTÄTIGEN (Auto-Persist beim Menü-Verlassen) → VOLLE Restauration asserten:
   `.lie-cropping` weg (area+host); Host-Inline-`contain` entfernt → `getComputedStyle(host).contain`
   ist wieder `paint` (der app.css-Default greift); area overflow zurück; ghost/handles/chrome aus
   dem DOM entfernt; KEINE verwaisten `.lie-crop-*`-Knoten. + der Crop ist im Source-`{…}`
   persistiert (zurücklesen).
3. Erneut öffnen → Exit per ABBRECHEN/Esc → dieselbe volle Restauration; der Crop unverändert/
   verworfen wie vom Design vorgesehen.
4. Falls weitere Exits existieren (wegklicken / scroll-out / Panel-Dismiss) → ebenfalls volle
   Restauration prüfen.
5. Nach JEDEM Exit: keine Konsolen-Exceptions; das Bild rendert wieder normal (Containment intakt).
6. Beide Views, falls der Crop-Pfad sich unterscheidet (Handoff verlangt LP + Reading).

GRENZE: rein strukturell (DOM/computed-style/source read-back). Ein Befund "restauriert" gilt nur,
wenn `getComputedStyle(host).contain` nach dem Exit nachweislich NICHT `none` ist. Fix am Ursprung,
kein Band-Aid. Regression in tests/regressions.test.ts (CDP, oder — falls extrahierbar — eine Unit
auf den teardown-Effekt). npm run build + lint + test grün; KEIN Commit ohne Freigabe.

LIEFERN: Befund je Exit-Pfad (restauriert ja/nein + der gemessene `contain`-Wert); Fix falls ein
Pfad leakt; die Regression. Nach Landung: als Verify-Item / im Bug-32-SOLVED-Eintrag vermerken.
```
