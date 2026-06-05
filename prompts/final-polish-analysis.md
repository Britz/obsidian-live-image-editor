# Big finalization prompt — fix everything, straighten the docs, clean demo vault, user docs + screenshots

> Transient handoff artifact. A large, comprehensive finishing pass. Run LAST (after the open
> crop/reveal/cleanup prompts have landed), on a settled tree.

```
AUFGABE: Eine große, allumfassende Analyse + Finalisierung in vier Phasen: (1) finde und FIXE
alles, was noch kaputt/lückenhaft ist; (2) räume die Doku auf — vor allem implementation-plan
und issues — zieh sie gerade, vereinheitliche, kürze; (3) baue ein schönes, kohärentes Test-/
Demo-Vault und räume das jetzige auf; (4) schreibe eine User-Doku und füge ein paar schöne
Screenshots ein, die die Features zeigen. KEIN Commit ohne Freigabe (der User committet).

OBERSTE REGEL — VERIFIKATION (die hart erkämpfte Lehre, sonst wird wieder über-behauptet):
- STRUKTURELL ZUERST: das meiste ist Code-/DOM-/Source-Fakt, kein Optik-Problem. Asserte per
  Code-Lesen + Unit + CDP-DOM/computed-style + Source-ZURÜCKLESEN (nie annehmen, dass „der DOM
  sich geändert hat" oder „der Render stimmt").
- Eine „fertig"-Meldung ist NUR gültig, wenn die belegenden Checks gezeigt sind. Ein Test, der
  nicht fehlschlagen kann, wenn die Sache kaputt ist, ist keine Verifikation (test-plan §1-Regel).
- CDP kann Screenshots (`Page.captureScreenshot`) + synthetische Events (`Input.dispatchMouseEvent`)
  — nutze das fürs VISUELLE/Interaktive; aber nur als Ergänzung, nicht als Ersatz fürs Strukturelle.
- Build/lint/test (`npm run build`, `npm run lint`, `npm test`) müssen grün sein; pro Fix eine
  Regression. Dev-Build + CDP nach CLAUDE.md.

LIES ZUERST: documentation/methodology.md + agent_methodology.md (Altitude-Disziplin),
requirements/architecture/implementation-plan/test-plan/issues, CLAUDE.md (Build/CDP/Dev-Bridge),
die Clean-room-Befunde (in issues.md / den Memories), die offenen prompts/-Einträge.

PHASE 1 — ALLES FIXEN, was die Analyse findet:
- Die offenen Clean-room-Gaps: F2 (Reading-View-Render bei Duplikaten — Positions-/zeilengenau
  statt erster Basename-Treffer), F24 (icon→inline), Filter (`[filter]` in CLAIM_SELECTOR + Doc),
  F11-Temperatur STREICHEN (Doku F11/AB13 + toter `temperatureAdjust`/i18n/Kommentare), Dead-Code
  (`lie-img`-Marker-Setzpfad — Parser-Skip behalten; `getPreset`/`setPresetWidth`;
  `parseLocationTransform`), die zwei Reading-View-Pfade (T6) erwägen.
- Die DRY/KISS-Audit-Punkte in issues.md (Panel-Lookups bündeln über `resolveLocation`, etc.) —
  jeder als funktionserhaltender Refactor, mit Begründung warum Verhalten erhalten bleibt.
- Jeder noch offene Bug (issues.md „Known open bugs") + alles, was die Analyse sonst findet —
  am URSPRUNG fixen (Bug-Protokoll: diagnostizieren → top-down → Fix), kein Band-Aid.
- Pro Fix: Regression (Unit wo extrahierbar, sonst CDP read-back). Persistenz-Edits via die
  §3-AD1-Write-Path-Matrix gegenprüfen (echten Source zurücklesen).

PHASE 2 — DOKU AUFRÄUMEN (gerade ziehen, vereinheitlichen, KÜRZEN; Altitude-Disziplin wahren):
- issues.md: ALLES Gelöste in die SOLVED/DONE-Registry mit Cause+Fix; die OPEN-Liste straff und
  aktuell; redundante/überlappende Einträge zusammenführen; die „resolved cluster"-Klammer-Notizen
  konsolidieren; die DRY/KISS-Audit gegen HEAD neu erden (erledigte raus). Deutlich kürzen.
- implementation-plan.md: auf den ECHTEN IST-Code-Stand bringen (Modul-Map exakt, keine veralteten
  Referenzen/Funktionsnamen), widerspruchsfrei zu Architektur, kürzen.
- requirements/architecture/test-plan: die getroffenen Entscheidungen einarbeiten + Widersprüche
  glätten (AD2/T3/F25 ↔ T2.3 Filter = bare key runtime-only + style-Escape; F8 Default = auto;
  F11 ohne Temperatur; Auto-Persist beim Menü-Verlassen statt accept, F14/AD8/D6; F12/D8 Crop-Frame
  im Crop fix; D1.1 Mechanik = der reale Code; crop-in-place SOLVED; ggf. rotate-gesture). Jede
  Aussage auf ihrer Altitude, nichts kollabieren, kein Code in den Requirements.
- Verwaiste/Scratch-Doku entfernen; Doc-Map/Querverweise (CLAUDE.md, methodology) konsistent.

PHASE 3 — TEST-/DEMO-VAULT (schön + kohärent; aktuelles aufräumen):
- Baue im examples-Vault EIN kohärentes Demo-Set, das JEDES Feature an echten Bildern zeigt:
  rotate (90°/frei), flip, crop, resize + Presets, Filter, align/Float + Wrap, inline-Icon,
  Klassen/Snippets, Captions, Export. Klar benannte Seiten, sinnvoll gegliedert.
- Räume das jetzige Durcheinander auf (Scratch-Seiten wie `lie-ov.md`, `lie-verify.md`,
  `Crop editor (Bug 32).md`, verstreute Fixtures): konsolidieren oder löschen — behalte nur die
  permanenten Fixtures, die Tests/Regressionen brauchen, sauber benannt. Keine verwaisten Bilder.

PHASE 4 — USER-DOKU + SCREENSHOTS:
- Schreibe eine User-Doku (z.B. `docs/user-guide.md` + README-Verweis): was das Plugin kann und wie
  man es bedient — Hover/Selektion-Toolbar, Transforms, Crop (in-place, Auto-Persist, cmd-z/Reset),
  Resize/Presets, Filter, align/Float, inline, Klassen + Snippets, Captions, Export, Settings,
  Commands. Knapp, nutzerfreundlich, kein Architektur-Jargon.
- Mache ein paar SCHÖNE Screenshots im Demo-Vault per CDP (`Page.captureScreenshot`), die die
  Features zeigen (Toolbar überm Bild, Crop-Editor in-place, Filter-Panel, Float-Wrap, Caption),
  speichere sie als PNG (z.B. `docs/img/`) und binde sie an den passenden Stellen in die User-Doku
  ein. Achte auf saubere, repräsentative Frames (richtiges Beispielbild, Chrome sichtbar).

LIEFERN: ein kurzer Bericht je Phase (was gefixt + wie verifiziert; was an der Doku gekürzt/
vereinheitigt; das Demo-Vault-Inhaltsverzeichnis; die User-Doku + Screenshot-Liste). issues.md am
Ende: nur noch echt Offenes. KEIN Commit ohne Freigabe.
```
