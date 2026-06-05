# Fix prompt — Toolbar ↔ Sub-Panel / Submenu Sichtbarkeits-Kopplung + Klick-weg schließt (crop ausgenommen)

> Follow-up zu Commit `0ef4053` *„feat(submenu): restore accept/cancel icons + toolbar↔panel as one
> active region"* (auf `main`). Drei Bugs, die beim Real-Pointer-Test der neuen „eine aktive Region"
> aufgefallen sind. Sie betreffen GENAU die Sichtbarkeits-/Hover-/Klick-Logik, die der vorige Rework
> angefasst hat. Es ist KEIN Optik-Problem — am Code lesbar (Hover-/Active-State, das mouseover/click-
> Delegate, die CSS-Regeln). KISS: das jetzige Verhalten ist dem Nutzer zu komplex/seltsam.

```
AUFGABE: Drei Bugs an der Toolbar ↔ Sub-Panel ↔ Submenu Sichtbarkeit fixen. KEIN Commit ohne Freigabe.

LIES ZUERST:
- documentation/requirements.md: F14 (shared host, auto-persist, reset/cancel/accept), D6 (Bild +
  Toolbar + offenes Panel = EINE zusammenhängende aktive Region; Toolbar greyed während Panel offen),
  D2/D3 (group-folding / popups).
- documentation/architecture.md: AD8 + AB11 (shared host), AB10 (Toolbar).
- documentation/issues.md → SOLVED „Resolved by the submodal accept/cancel + active-region rework
  (2026-06-05)" — das ist der vorige Stand, auf dem diese drei aufsetzen.
- Code: src/anchored-submenu.ts (open/bindHover/updateVisibility/close — das Region-Modell mit
  `.lie-region-active`), src/toolbar.ts (ImageToolbar = floating bar; openGroupPopup = `.lie-group-
  popup`; das in-chrome `.lie-toolbar-in-image`), src/main.ts (registerImageSelectionHandler →
  document click + mouseover Delegate; dismissToolbar; addClass → `.lie-class-dropdown`;
  crop()/customSize()/toggleFilters() Toggle-Pfade), src/live-preview.ts (in-chrome Toolbar +
  `.lie-wrapper:hover`), styles.css (`.lie-toolbar-in-image` / `.lie-toolbar-inactive` /
  `.lie-region-active` / `.lie-wrapper:hover` / `.lie-toolbar-floating` / `.lie-group-popup` /
  `.lie-class-dropdown`).
- CLAUDE.md (Build/Test/CDP). Methodik: think-first, DRY/KISS, pure `*-logic.ts` Units, T-L6 (DOM/
  interaktiv → CDP-Script statt vitest).

GRUNDPRINZIP (alle drei laufen darauf hinaus):
Während die Toolbar etwas „geöffnet" hat (ein Sub-Panel ODER ein Group-Popup/Class-Dropdown), bilden
Toolbar + das Geöffnete EINE Sichtbarkeits-Einheit. Sichtbarkeit des Geöffneten ist FEST an die
Sichtbarkeit der Toolbar gekoppelt — beide gehen GEMEINSAM auf/zu, getrieben von EINEM Hover-Signal,
ohne Zwischenzustände. Heute konkurrieren ZWEI Signale: das reine CSS `.lie-wrapper:hover` (in-chrome
Bar) und der JS-`hoverShown`/`.lie-region-active`-State (Panel). Die beiden können desynchronisieren —
daraus entsteht das „seltsame" Verhalten. Ziel: EIN Signal treibt beides; keine Konkurrenz.

——— BUG 1 — Aktiver Klick woanders schließt das Sub-Panel (crop AUSGENOMMEN) ———
- IST/SOLL: Ist ein Sub-Panel offen (Toolbar ausgegraut), soll ein AKTIVER KLICK irgendwo anders
  (nicht Hover-Verlassen!) das Panel schließen — und zwar als normaler Verlassen-Pfad, d.h. PERSIST
  (Auto-Persist, F14/AD8, ein Source-Write). Gilt für FILTER und SIZE.
- AUSNAHME crop: ein Klick woanders darf den Crop-Editor NICHT schließen. Crop wird NUR über seine
  eigenen Wege beendet (Crop-Button-Toggle, ✓ accept, ✗ cancel, Esc). Begründung: beim In-Place-Crop
  sind Klicks/Drags auf Bild, Handles und den gedimmten Ghost (Pan-Fläche) Teil des Editierens — ein
  Streuklick darf die Session nicht zerstören. (Heute schließt der document-click-Delegate in
  registerImageSelectionHandler via dismissToolbar AUCH crop → das ist genau zu ändern.)
- Hover-Verlassen ≠ Klick-weg: Hover-out blendet nur AUS (Panel bleibt offen, siehe Bug 2); erst der
  aktive Klick-weg schließt (persistiert). Diese Unterscheidung sauber halten.
- DIAGNOSE-Hinweis: main.ts registerImageSelectionHandler() document-`click` → dismissToolbar(), und
  dessen Guard-Selektorliste (`.lie-toolbar, .lie-filter-panel, .lie-submenu, .lie-group-popup,
  .lie-cropping, .lie-wrapper`). dismissToolbar() ruft closeFilterPanel+closeSubmenu+closeCrop+hide.
  Crop muss aus dem Klick-weg-Schließen herausgenommen werden (z.B. wenn cropEditor aktiv → nicht
  schließen); Filter/Size müssen beim Klick-weg verlässlich schließen.

——— BUG 2 — Panel-Sichtbarkeit FEST an Toolbar-Sichtbarkeit koppeln (kein Zwischenzustand) ———
- IST (zu komplex): Panel öffnen (Toolbar ausgegraut) → Maus verlässt die Region → Panel
  verschwindet UND die Toolbar ist nicht mehr ausgegraut (obwohl das Panel noch offen/aktiv ist) →
  wieder über die Toolbar fahren → Toolbar wird wieder ausgegraut + Panel wieder sichtbar. Dieses
  Auf/Ab mit „ausgegraut/nicht-ausgegraut" während offen ist das Problem.
- SOLL: Solange ein Panel offen ist, ist die Toolbar DURCHGEHEND ausgegraut (nie un-greyed). Panel
  und Toolbar teilen sich EINE Sichtbarkeit: beide sichtbar, wenn die Region gehovert ist; beide
  verborgen, wenn nicht — synchron, simpel, ohne Flacker/Zwischenzustand. Kein Zustand „Toolbar
  sichtbar & nicht-ausgegraut, während das Panel offen-aber-verborgen lauert".
- DIAGNOSE/ROOT CAUSE: die in-chrome Bar-Sichtbarkeit ist reines CSS `.lie-wrapper:hover` (volle
  Opazität, NICHT greyed), die Panel-Sichtbarkeit + `.lie-region-active` ist JS. Beim Verlassen feuert
  der 160ms-Grace asynchron; wenn man langsam zurück aufs Bild fährt, kann ein Frame entstehen, in dem
  `:hover` true ist, aber `.lie-region-active` (noch) nicht → die Bar zeigt sich kurz UN-greyed.
  Lösung (KISS): während ein Panel offen ist, die Toolbar-Sichtbarkeit NICHT mehr über `:hover`
  konkurrieren lassen — EIN Signal (der Region-Hover-State des Hosts) treibt Toolbar-Sichtbarkeit,
  Greyed-Bleiben UND Panel-Sichtbarkeit gemeinsam. D.h. `.lie-toolbar-inactive` bleibt die ganze
  Offen-Dauer (greyed), und show/hide von Toolbar+Panel hängen an genau einem Wert.

——— BUG 3 — Group-Submenus (`.lie-group-popup`) verhalten sich wie Bug 2 (ohne Greying) ———
- IST: geht man mit der Maus auf ein aufgeklapptes Group-Popup (Edit/Layout, openGroupPopup in
  toolbar.ts), ist die Toolbar weg — weil das Popup auf document.body sitzt (außerhalb `.lie-wrapper`),
  also `.lie-wrapper:hover` false wird und die in-chrome Bar ausblendet.
- SOLL: Group-Popups (und analog das Class-Dropdown `.lie-class-dropdown` aus addClass) triggern KEIN
  Ausgrauen der Toolbar (sie sind leichte Button-Paletten, bewusst KEIN modaler Host — siehe
  toolbar.ts Kommentar). Aber ihre SICHTBARKEIT soll genauso fest an die Toolbar gekoppelt sein: auf
  das Popup fahren hält die Toolbar sichtbar; Popup und Toolbar blenden gemeinsam aus; Region =
  Bild + Toolbar + Popup. NUR ohne `.lie-toolbar-inactive` (Toolbar bleibt aktiv/anklickbar).
- DIAGNOSE: das gemeinsame Region-Hover-Konzept aus dem vorigen Rework (bindHover-Member +
  `.lie-region-active`) auf die body-Popups übertragen — aber als „aktiv, nicht greyed". Prüfen, ob
  das sauber wiederverwendbar ist (DRY) statt parallel nachzubauen. Klären, ob das Class-Dropdown
  dieselbe Behandlung bekommt (vermutlich ja — selbe Klasse Problem).

CROSS-CUTTING / KISS:
- Eine kohärente „ist die kombinierte Region gehovert"-Quelle treibt: (a) Toolbar sichtbar?, (b)
  Toolbar greyed? (nur bei modalem Panel), (c) das Geöffnete (Panel/Popup) sichtbar?. Keine zwei
  konkurrierenden Signale. Reading-View-Fall (kein hoverRegion → immer sichtbar) nicht brechen.
- D6/AD8/AB11/F14 ggf. auf IST nachziehen, falls sich das Modell ändert (z.B. „Sichtbarkeit fest
  gekoppelt; Klick-weg schließt; crop ausgenommen; Group-Popups gekoppelt aber nicht greyed").
- Auto-Persist NICHT verändern: Klick-weg/Verlassen-zu-Schließen persistiert weiterhin EINEN
  Source-Write; ✗/Esc verwirft. (Bug 1 ist ein SCHLIESS-Trigger, kein Persist-Modell-Wechsel.)

VERIFY (strukturell zuerst, dann Real-Pointer-Ergänzung):
- Bestehende Suite grün halten: npm run build + lint + test. Pro Bug eine Regression.
- Pure Units wo extrahierbar (AD7): z.B. die „welche Geöffneten koppeln/greyen"-Entscheidung.
- CDP (T-L6, am laufenden Obsidian) — erweitere/ergänze scripts/verify-submodal-region.mjs bzw. neue
  Scripts:
  · Bug 1: bei offenem FILTER/SIZE ein synthetischer Klick auf eine Editor-Stelle außerhalb →
    Panel zu + Source EINMAL geschrieben (read-source-back); bei offenem CROP derselbe Außenklick →
    crop bleibt offen (`.lie-cropping` noch da, controls noch offen), kein Write.
  · Bug 2: Toolbar bleibt `.lie-toolbar-inactive` die GANZE Offen-Dauer; Panel-`display` und
    Toolbar-Sichtbarkeit kippen im Gleichschritt; KEIN Zustand „sichtbar & nicht inactive während
    offen". (Synthetische enter/leave; plus computed-style-Assertion.)
  · Bug 3: bei offenem `.lie-group-popup` synthetischer enter/leave auf das Popup → Toolbar bleibt
    sichtbar (aber NICHT `.lie-toolbar-inactive`); Verlassen der ganzen Region → beide gemeinsam weg.
- ACHTUNG Real-Pointer: synthetische dispatchEvent ignorieren `pointer-events` und triggern kein CSS
  `:hover` — der echte Maus-Pfad (v.a. Floating-Bar, die außerhalb des Bild-Rechtecks liegt) ist eine
  MANUELLE Focused-Window-Prüfung. In issues.md unter „Verifications" festhalten.

VAULT/BUILD-GOTCHA (sonst „klappt nach wie vor nicht"): `npm run build` schreibt nur ins Repo-Root;
der Vault wird NICHT automatisch aktualisiert, und `npm run dev:vault` kopiert styles.css NUR beim
START (nicht pro Save). Nach CSS/JS-Änderung in den Test-Vault installieren UND Obsidian neuladen:
  bash scripts/dev-install.sh examples --dev      # baut dev + kopiert main.js/manifest.json/styles.css
  # oder direkt: npm run build:dev && cp main.js manifest.json styles.css examples/.obsidian/plugins/live-image-editor/
  node scripts/obsidian-debug.mjs --eval 'location.reload(); "reload"'   # sauberer Reload (CDP)
Verifizieren, dass der neue Build live ist (Version wird evtl. nicht gebumpt → über eine neue CSS-
Regel / neues Verhalten prüfen, nicht über manifest.version).

LIEFERN: die drei Fixes + Regressionen; kurzer Befund (welches EINE Signal jetzt Toolbar+Geöffnetes
treibt; wie crop vom Klick-weg ausgenommen ist; wie Group-Popups gekoppelt aber nicht greyed sind);
D6/AD8/AB11/F14 auf IST nachgezogen. KEIN Commit ohne Freigabe.
```
