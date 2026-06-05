# Handoff prompt — Bug 29–31: LP reveal / source-rendering cluster (+ F8 default = auto)

> Transient handoff artifact (not a canonical doc). Hand to a fresh implement session.
> Runtime-confirmed broken (link-hide re-tested). Touches `live-preview.ts` → run AFTER the
> Bug-32 crop session (overlap risk).

```
AUFGABE: Den LP-Reveal/Source-Rendering-Cluster reparieren (Bug 29–31), diagnose-first — und den
F8-Default in den Docs auf "auto" angleichen (die Req "shown" ist veraltet; der Code macht schon
auto, also nur Doku). Runtime-bestätigt. Bis manuell-testbar; visuelle Bestätigung durch den User.

LIES ZUERST:
- requirements.md → F8 (Reveal — Default auf "auto" angleichen), F3 (Block nie als Text gezeigt),
  F9 (roher Link editierbar), D5 (Reveal-Darstellung), F20 (Setting "default reveal state").
- architecture.md → AD5 (LP-Widget + native Embed embraced + CSS-suppress + Reveal).
- issues.md → Bug 29 / 30 / 31 (dieser Cluster, runtime-bestätigt).
- src/live-preview.ts (makeRevealButton ~:197, Icon ~:204; FakeLinkWidget ~:72; DISMISSED_LINE
  ~:24; das native `{…}` als `lie-attr lie-rev-<mode>` ~:289; StateField nextState/auto-clear),
  src/live-preview-logic.ts, styles.css (Reveal-Regeln: `.lie-dismissed`, `.lie-fake-link`,
  `.lie-attr`, `.lie-rev-auto/always`, `.cm-active`, `.cm-line:hover`). CLAUDE.md (Build/CDP).

REVEAL-MODELL (so ist es gebaut — zur Orientierung):
- Der native Embed bleibt; Obsidian lädt das Bild + zeigt bei Cursor die native Quelle. Das Plugin
  zeichnet sein eigenes transformiertes Bild (native Bild per CSS suppressed).
- Vor dem `{…}` steht ein DISPLAY-ONLY `FakeLinkWidget` = syntaxgehighlightete, uneditierbare
  Kopie des verschluckten `![](…)`-Quelltexts. Das `{…}` selbst bleibt NATIVER editierbarer Text
  (`lie-attr`).
- Sichtbarkeit rein per CSS: Modus `auto` (cm-line-Hover / `.cm-active`) vs `always`
  (`alwaysShowLink`-Setting). Das `<>` ist ein transienter Per-Line-`dismiss` (`.lie-dismissed`
  Line-Klasse, auto-clear in auto-Modus).

SYMPTOME (= Bug 29–31, runtime-bestätigt):
  Bug 29 — der Reveal/Dismiss-Toggle rendert `eye`/`eye-off` (live-preview.ts ~:204); MUSS das
    `<>`-Icon sein (Lucide "code", wie früher). Kleiner Icon-Revert.
  Bug 30 — ein `<>`-Dismiss blendet den `![](…)`-Teil NICHT aus; nur das `{…}` verschwindet. Beim
    Dismiss muss der GANZE rohe Embed verborgen werden (F8/F3) — also auch der `FakeLinkWidget`.
    Verdacht: `.lie-dismissed` deckt `.lie-fake-link` nicht ab (nur `.lie-attr`), oder der Fake-Link
    ist nicht an den Dismiss-State gekoppelt. Diagnose-first.
  Bug 31 — das `{…}` (Attribut-Liste) hat kein Syntax-Highlight mehr. Verdacht: durch das
    Inline-Widget-Nesting / die bare-key-Migration ging die CM-Tokenisierung des `{…}`-Texts (bzw.
    eine frühere Highlight-Decoration) verloren. Diagnose-first — Ursache finden, am Ursprung fixen.

F8-DEFAULT (nur Doku, Code macht's schon): requirements.md F8 + F20 auf "Default = auto"
angleichen — das allgemeine Setting `alwaysShowLink` ist standardmäßig AUS = auto (Reveal nur bei
Hover / aktiver Zeile); kein "shown"-Default. Der Per-Line-`<>`-Dismiss bleibt unverändert.

URSPRUNG (Bug-Protokoll für 30/31): erst diagnostizieren (welche CSS-/Decoration-Kopplung fehlt),
dann am Ursprung fixen — kein Band-Aid. Bug 29 ist ein simpler Icon-Revert.

SCOPE / GRENZE:
- AUTONOM (CDP, nicht-interaktiv) prüfbar: das Icon ist `<>` (nicht eye); im Dismiss-State ist der
  GANZE rohe Embed (Fake-Link + `{…}`) verborgen (DOM/CSS-Check); das revealte `{…}` trägt wieder
  Highlight-Tokens; auto-Default (kein Reveal ohne Hover/aktive Zeile).
- STRUKTURELL verifizieren (Hauptverifikation, autonom — meist Code-/DOM-Fakten, keine Optik):
  Icon-Name = `<>` (Code-Fakt, Bug 29); im Dismiss-State sind Fake-Link UND `{…}` per CSS
  verborgen — DOM/CSS-Inspektion, dass `.lie-dismissed` `.lie-fake-link` + `.lie-attr` abdeckt
  (Bug 30); das revealte `{…}` trägt wieder Highlight-Tokens — DOM-Knoten/Klassen (Bug 31);
  auto-Default (kein Reveal-State ohne Hover/aktive Zeile). Eine "fertig"-Meldung nur gültig, wenn
  diese Checks belegt sind.
- VISUELL nur als Ergänzung: ein Screenshot revealt/dismissed bestätigt die Optik; Hover/Cursor
  per `Input.dispatchMouseEvent` simulieren. User: finaler Sanity-Check.
- Tests: pro Fix eine Regression (CDP-Checks lesen den realen DOM/State, nicht annehmen —
  test-plan §1-Regel). Bug 29–31 sind in test-plan §5.1 als offen gelistet → auf grün ziehen.
- npm run build + lint + test grün; ein History-Schritt pro Edit; KEIN Commit ohne Freigabe.

LIEFERN:
- die Fixes + eine Test-Checkliste für den User: Icon = `<>`; `<>`-Dismiss verbirgt den GANZEN
  rohen Link (`![](…)` UND `{…}`); das `{…}` ist wieder syntaxgehighlightet; Default = auto
  (sauber ohne Hover); F9 (Cursor in der Zeile editiert nativ) unverändert.
- nach Landung: Bug 29–31 → SOLVED (Cause+Fix); F8/F20 auf "auto" nachgezogen; test-plan §5.1
  Zeilen auf grün.
```
