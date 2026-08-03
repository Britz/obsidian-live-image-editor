#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { connectOptical, pixel } from "./_optical.mjs";

let abortSignal = null;
const abortWaiters = new Set();
function requestAbort(signal) {
  if (abortSignal) return;
  abortSignal = signal;
  for (const resolve of abortWaiters) resolve();
  abortWaiters.clear();
}
const handleSigint = () => requestAbort("SIGINT");
const handleSigterm = () => requestAbort("SIGTERM");
process.on("SIGINT", handleSigint);
process.on("SIGTERM", handleSigterm);

const PLUGIN_ID = "live-image-editor";
const FIXTURE = "_toolbar-hosts-fixture.md";
const VIEWPORT = { width: 1280, height: 900, deviceScaleFactor: 1 };
const HOST_LINES = {
  "normal-host": 2,
  "tiny-host": 6,
  "table-host": 10,
  "callout-host": 15,
  "footnote-host": 18,
};
const CAPTURE_ONLY = process.env.LIE_CAPTURE_ONLY === "1";
const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const EXPECTED_VERSION = process.env.LIE_EXPECTED_VERSION || packageJson.version;
const EXPECTED_OBSIDIAN_VERSION = process.env.LIE_EXPECTED_OBSIDIAN_VERSION || null;
const workspaceHash = (name) => createHash("sha256")
  .update(readFileSync(new URL(`../../${name}`, import.meta.url))).digest("hex");
const EXPECTED_HASHES = {
  main: process.env.LIE_EXPECTED_MAIN_SHA256 || workspaceHash("main.js"),
  manifest: process.env.LIE_EXPECTED_MANIFEST_SHA256 || workspaceHash("manifest.json"),
  styles: process.env.LIE_EXPECTED_STYLES_SHA256 || workspaceHash("styles.css"),
};
const CONTENT = [
  "# Toolbar host guard",
  "",
  "## Normal CM6 widget",
  "",
  "![normal-host](images/sample-landscape.png){width=300}",
  "",
  "## Tiny inline widget",
  "",
  "before ![tiny-host](images/sample-square.png){width=24 .lie} after",
  "",
  "## Table post-processor host",
  "",
  "| Case | Image |",
  "| --- | --- |",
  "| table | ![table-host](images/sample-landscape.png){width=300} |",
  "",
  "> [!note] Callout post-processor host",
  "> ![callout-host](images/sample-landscape.png){width=300}",
  "",
  "Footnote post-processor host.[^toolbar-host]",
  "",
  "[^toolbar-host]: ![footnote-host](images/sample-landscape.png){width=300}",
  "",
  "Parking line.",
  "",
].join("\n");

const EXPECTED_JOURNEY_IDS = [
  "placement:normal-host:inset",
  "placement:tiny-host:floating-above",
  "panel:normal-host:custom-size",
  "panel:normal-host:filters",
  "panel:normal-host:crop",
  "panel:tiny-host:custom-size",
  "panel:tiny-host:filters",
  "panel:tiny-host:crop",
  "placement:table-host:inset",
  "panel:table-host:custom-size",
  "panel:table-host:filters",
  "panel:table-host:crop",
  "placement:callout-host:inset",
  "panel:callout-host:custom-size",
  "panel:callout-host:filters",
  "panel:callout-host:crop",
  "placement:footnote-host:inset",
  "panel:footnote-host:custom-size",
  "panel:footnote-host:filters",
  "panel:footnote-host:crop",
  "reading-negative:normal-host",
  "reading-negative:table-host",
  "reading-negative:callout-host",
  "reading-negative:footnote-host",
];

function assertionNamesForJourney(id) {
  const [kind, host, variant] = id.split(":");
  if (kind === "placement") {
    return [
      `${host}.toolbar-hit`,
      `${host}.${variant === "inset" ? "inset-only" : "float-only-above"}`,
      `${host}.placement-no-write`,
      `${host}.placement-cleanup`,
    ];
  }
  if (kind === "panel") {
    return ["button", "panel-painted", "connected-owner", "panel-travel", "escape-no-write", "cleanup"]
      .map((slot) => `${host}.${variant}.${slot}`);
  }
  if (kind === "reading-negative") {
    return ["no-ui", "no-write", "cleanup"].map((slot) => `reading.${host}.${slot}`);
  }
  throw new Error(`unknown journey id: ${id}`);
}

const EXPECTED_ASSERTION_NAMES = [
  ...EXPECTED_JOURNEY_IDS.flatMap(assertionNamesForJourney),
  "diagnostics.no-errors",
  "diagnostics.no-orphans",
];

const wait = (ms) => new Promise((resolve) => {
  if (abortSignal) { resolve(); return; }
  let settled = false;
  let timer;
  const done = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    abortWaiters.delete(done);
    resolve();
  };
  timer = setTimeout(done, ms);
  abortWaiters.add(done);
});
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalized = (value) => {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalized(value[key])]));
  }
  return value;
};
const canonicalJson = (value) => JSON.stringify(normalized(value));
const rgbaHash = (image) => createHash("sha256").update(image.rgba).digest("hex");

const contract = {
  schema: 1,
  captureOnly: CAPTURE_ONLY,
  fatal: null,
  aborted: null,
  expected: {
    pluginVersion: EXPECTED_VERSION,
    obsidianVersion: EXPECTED_OBSIDIAN_VERSION,
    hashes: { ...EXPECTED_HASHES },
    viewport: VIEWPORT,
  },
  gates: [],
  environment: null,
  fixture: { path: FIXTURE, footnote: "included" },
  journeys: [],
  journeyContract: {
    expectedCount: EXPECTED_JOURNEY_IDS.length,
    expectedIds: [...EXPECTED_JOURNEY_IDS],
    actualCount: 0,
    actualIds: [],
    missingIds: [...EXPECTED_JOURNEY_IDS],
    unexpectedIds: [],
    duplicateIds: [],
    orderMatches: false,
    complete: false,
  },
  assertionContract: {
    expectedCount: EXPECTED_ASSERTION_NAMES.length,
    expectedAssertionNames: [...EXPECTED_ASSERTION_NAMES],
    actualCount: 0,
    actualAssertionNames: [],
    missingAssertionNames: [...EXPECTED_ASSERTION_NAMES],
    unexpectedAssertionNames: [],
    duplicateAssertionNames: [],
    orderMatches: false,
    complete: false,
  },
  assertions: [],
  diagnostics: null,
  cleanup: null,
};

const checks = [];
function check(name, ok, actual = null) {
  const result = { name, ok: !!ok, actual };
  checks.push(result);
  contract.assertions.push(result);
}

function hardGate(name, ok, actual = null) {
  const gate = { name, ok: !!ok, actual };
  contract.gates.push(gate);
  if (!gate.ok) throw new Error(`gate ${name}: ${JSON.stringify(actual)}`);
}

function throwIfAborted() {
  if (abortSignal) throw new Error(`abort requested: ${abortSignal}`);
}

function replaceAssertions(start, results) {
  checks.splice(start, checks.length - start, ...results);
  contract.assertions.splice(start, contract.assertions.length - start, ...results);
}

async function runJourney(id, callback) {
  throwIfAborted();
  const assertionStart = contract.assertions.length;
  const journeyStart = contract.journeys.length;
  let thrownMessage = null;
  try {
    await callback();
    throwIfAborted();
  } catch (error) {
    thrownMessage = String(error?.stack || error);
  }

  let record = contract.journeys.slice(journeyStart).find((journey) => journey.id === id) ?? null;
  if (!record) {
    record = { id, error: thrownMessage ?? "journey record not emitted" };
    contract.journeys.push(record);
  } else if (thrownMessage && !record.error) {
    record.error = thrownMessage;
  }

  const expectedNames = assertionNamesForJourney(id);
  const expected = new Set(expectedNames);
  const emitted = contract.assertions.slice(assertionStart);
  const firstByName = new Map();
  const extras = [];
  for (const result of emitted) {
    if (!expected.has(result.name) || firstByName.has(result.name)) extras.push(result);
    else firstByName.set(result.name, result);
  }
  const journeyError = record.error ?? thrownMessage;
  const normalizedResults = expectedNames.map((name) => {
    if (journeyError) return { name, ok: false, actual: { error: journeyError } };
    return firstByName.get(name) ?? { name, ok: false, actual: { error: "assertion not emitted" } };
  });
  replaceAssertions(assertionStart, [...normalizedResults, ...extras]);

  if (abortSignal) throw new Error(`abort requested: ${abortSignal}`);
}

function finalizeJourneyContract() {
  const actualIds = contract.journeys.map((journey) => journey.id);
  const expected = new Set(EXPECTED_JOURNEY_IDS);
  const counts = new Map();
  for (const id of actualIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const missingIds = EXPECTED_JOURNEY_IDS.filter((id) => !counts.has(id));
  const unexpectedIds = actualIds.filter((id) => !expected.has(id));
  const duplicateIds = [...counts].filter(([, count]) => count > 1).map(([id]) => id);
  const orderMatches = actualIds.length === EXPECTED_JOURNEY_IDS.length
    && actualIds.every((id, index) => id === EXPECTED_JOURNEY_IDS[index]);
  Object.assign(contract.journeyContract, {
    actualCount: actualIds.length,
    actualIds,
    missingIds,
    unexpectedIds,
    duplicateIds,
    orderMatches,
    complete: orderMatches && !missingIds.length && !unexpectedIds.length && !duplicateIds.length,
  });
}

function finalizeAssertionContract() {
  const expected = new Set(EXPECTED_ASSERTION_NAMES);
  const firstByName = new Map();
  const extras = [];
  for (const result of contract.assertions) {
    if (!expected.has(result.name) || firstByName.has(result.name)) extras.push(result);
    else firstByName.set(result.name, result);
  }
  const normalizedResults = EXPECTED_ASSERTION_NAMES.map((name) => firstByName.get(name)
    ?? { name, ok: false, actual: { error: "assertion not emitted" } });
  replaceAssertions(0, [...normalizedResults, ...extras]);

  const actualAssertionNames = contract.assertions.map((result) => result.name);
  const counts = new Map();
  for (const name of actualAssertionNames) counts.set(name, (counts.get(name) ?? 0) + 1);
  const missingAssertionNames = EXPECTED_ASSERTION_NAMES.filter((name) => !counts.has(name));
  const unexpectedAssertionNames = actualAssertionNames.filter((name) => !expected.has(name));
  const duplicateAssertionNames = [...counts]
    .filter(([, count]) => count > 1).map(([name]) => name);
  const orderMatches = actualAssertionNames.length === EXPECTED_ASSERTION_NAMES.length
    && actualAssertionNames.every((name, index) => name === EXPECTED_ASSERTION_NAMES[index]);
  Object.assign(contract.assertionContract, {
    actualCount: actualAssertionNames.length,
    actualAssertionNames,
    missingAssertionNames,
    unexpectedAssertionNames,
    duplicateAssertionNames,
    orderMatches,
    complete: orderMatches && !missingAssertionNames.length
      && !unexpectedAssertionNames.length && !duplicateAssertionNames.length,
  });
}

function rectUnion(rects, viewport) {
  const usable = rects.filter((rect) => rect && rect.w > 0 && rect.h > 0);
  if (!usable.length) return null;
  const left = Math.max(0, Math.min(...usable.map((rect) => rect.x)) - 6);
  const top = Math.max(0, Math.min(...usable.map((rect) => rect.y)) - 6);
  const right = Math.min(viewport.width, Math.max(...usable.map((rect) => rect.x + rect.w)) + 6);
  const bottom = Math.min(viewport.height, Math.max(...usable.map((rect) => rect.y + rect.h)) + 6);
  return {
    x: Math.floor(left),
    y: Math.floor(top),
    width: Math.max(1, Math.ceil(right - left)),
    height: Math.max(1, Math.ceil(bottom - top)),
  };
}

async function main() {
  const cdp = await connectOptical();
  let original = null;
  let fixtureCreated = false;
  let instrumentationArmed = false;
  let setupValid = false;
  let cleanupValid = false;

  const evaluate = (expression, options) => cdp.evaluate(expression, options);
  const imageExpression = (id) => {
    const alt = `[alt=${JSON.stringify(id)}]`;
    const struct = `[data-lie-struct^=${JSON.stringify("![" + id + "]")}]`;
    let source;
    if (id === "footnote-host") {
      source = `.popover.hover-popover .internal-embed.image-embed.lie-embed img${alt}`;
    } else if (id === "table-host") {
      source = `.markdown-source-view table .internal-embed.image-embed.lie-embed img${alt}`;
    } else if (id === "callout-host") {
      source = `.markdown-source-view .callout .internal-embed.image-embed.lie-embed img${alt}`;
    } else {
      source = `.workspace-leaf.mod-active .cm-content .lie-wrapper${struct} img`;
    }
    const preview = id === "footnote-host" ? `.popover.hover-popover .internal-embed.image-embed.lie-embed img${alt}`
      : `.markdown-reading-view .internal-embed.image-embed.lie-embed img${alt}`;
    return `(app.workspace.activeLeaf?.view?.getMode?.() === "source"
      ? document.querySelector(${JSON.stringify(source)})
      : document.querySelector(${JSON.stringify(preview)}))`;
  };

  async function evidence(rects) {
    const clip = rectUnion(rects, VIEWPORT);
    if (!clip) return null;
    const shot = await cdp.screenshot(clip);
    return {
      clip,
      width: shot.width,
      height: shot.height,
      sha256: rgbaHash(shot),
      pixels: {
        topLeft: pixel(shot, 1, 1),
        center: pixel(shot, shot.width / 2, shot.height / 2),
        bottomRight: pixel(shot, shot.width - 2, shot.height - 2),
      },
    };
  }

  async function setMode(mode) {
    await evaluate(`(async () => {
      const leaf = app.workspace.activeLeaf;
      const state = leaf.getViewState();
      await leaf.setViewState({ ...state, state: { ...state.state, file: ${JSON.stringify(FIXTURE)}, mode: ${JSON.stringify(mode)}, source: false } });
      if (${JSON.stringify(mode)} === "source") {
        const editor = app.workspace.activeEditor?.editor;
        if (editor) editor.setCursor({ line: editor.lineCount() - 1, ch: 0 });
      }
      return true;
    })()`);
    await wait(900);
    const state = await evaluate(`(() => ({
      file: app.workspace.getActiveFile()?.path ?? null,
      mode: app.workspace.activeLeaf?.view?.getMode?.() ?? null,
      source: app.workspace.activeLeaf?.getViewState()?.state?.source,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    }))()`);
    hardGate(`mode:${mode}:file`, state.file === FIXTURE, state);
    hardGate(`mode:${mode}:mode`, state.mode === mode && state.source === false, state);
    hardGate(`mode:${mode}:viewport`, state.viewport.width === VIEWPORT.width
      && state.viewport.height === VIEWPORT.height
      && state.viewport.dpr === VIEWPORT.deviceScaleFactor, state.viewport);
  }

  async function sourceState() {
    return evaluate(`(async () => {
      const file = app.workspace.getActiveFile();
      const editor = app.workspace.activeEditor?.editor;
      const diag = window.__lieToolbarHostDiag;
      return {
        buffer: editor?.getValue() ?? null,
        disk: file ? await app.vault.adapter.read(file.path) : null,
        editorChanges: diag?.editorChanges ?? null,
        transformWrites: diag?.transformWrites ?? null,
      };
    })()`);
  }

  async function locate(id) {
    await evaluate(`(() => {
      if (app.workspace.activeLeaf?.view?.getMode?.() !== "source") return true;
      const line = ${HOST_LINES[id]};
      const editor = app.workspace.activeEditor?.editor;
      if (!editor || !Number.isInteger(line)) return false;
      editor.setCursor({ line, ch: 0 });
      editor.scrollIntoView({
        from: { line, ch: 0 }, to: { line, ch: 0 },
      }, true);
      return true;
    })()`);
    await wait(500);
    if (id === "footnote-host") {
      const reference = await evaluate(`(() => {
        const visible = (element) => {
          if (!element?.isConnected) return false;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight
            && style.display !== "none" && style.visibility !== "hidden";
        };
        const ref = [...document.querySelectorAll(".workspace-leaf.mod-active a.footnote-link,.workspace-leaf.mod-active .cm-hmd-footnote")].find(visible) ?? null;
        if (!ref) return null;
        const rect = ref.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        const owner = ref.closest("a,sup,.cm-hmd-footnote") ?? ref;
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          visible: rect.top >= 0 && rect.bottom <= innerHeight,
          hit: !!hit && (owner === hit || owner.contains(hit) || hit.contains(owner)),
        };
      })()`);
      hardGate("target:footnote-host:reference", !!reference?.visible && !!reference?.hit, reference);
      await cdp.hover(reference.x, reference.y);
      await wait(800);
    }
    await evaluate(`(() => {
      const image = ${imageExpression(id)};
      if (!image) throw new Error("missing image ${id}");
      image.scrollIntoView({ block: "center", inline: "nearest" });
      return true;
    })()`);
    await wait(220);
    const point = await evaluate(`(() => {
      const image = ${imageExpression(id)};
      if (!image) return null;
      const rect = image.getBoundingClientRect();
      const owner = image.closest(".lie-wrapper,.internal-embed.image-embed.lie-embed") ?? image;
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(rect.height / 2, 80));
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + Math.min(rect.height / 2, 80),
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        visible: rect.top >= 0 && rect.bottom <= innerHeight,
        hit: !!hit && (owner === hit || owner.contains(hit)),
      };
    })()`);
    hardGate(`target:${id}:visible`, !!point?.visible && !!point?.hit, point);
    return point;
  }

  async function state(id) {
    return evaluate(`(() => {
      const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const image = ${imageExpression(id)};
      const visible = (element) => {
        if (!element?.isConnected) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight
          && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
      };
      const rect = (element) => {
        if (!element || typeof element.getBoundingClientRect !== "function") return null;
        const value = element.getBoundingClientRect();
        return { x: value.x, y: value.y, w: value.width, h: value.height, connected: element.isConnected, classes: element.className };
      };
      const wrapper = image?.closest(".lie-wrapper") ?? null;
      const postHost = image?.closest(".internal-embed.image-embed.lie-embed") ?? null;
      const inImage = (wrapper ?? postHost)?.querySelector(".lie-toolbar-in-image") ?? null;
      const floating = [...document.querySelectorAll(".lie-toolbar-floating")].find(visible) ?? null;
      const toolbar = visible(inImage) ? inImage : visible(floating) ? floating : null;
      const panel = [...document.querySelectorAll(".lie-submenu,.lie-filter-panel,.lie-class-panel,.lie-group-popup,.lie-crop-portal")].find(visible) ?? null;
      const crop = plugin?.cropEditor ?? null;
      const surface = plugin?.submenu ?? plugin?.filterPanel?.submenu ?? plugin?.filterPanel
        ?? plugin?.classPanel?.submenu ?? plugin?.classPanel ?? crop?.controls ?? null;
      const opts = surface?.opts ?? {};
      const anchor = opts.anchor ?? surface?.anchor ?? null;
      const surfaceToolbar = opts.toolbar ?? surface?.toolbar ?? null;
      const hoverRegion = opts.hoverRegion ?? surface?.hoverRegion ?? null;
      const imageRect = image?.getBoundingClientRect();
      const toolbarRect = toolbar?.getBoundingClientRect();
      const panelRect = panel?.getBoundingClientRect();
      const toolbarHit = toolbarRect ? document.elementFromPoint(toolbarRect.left + toolbarRect.width / 2, toolbarRect.top + toolbarRect.height / 2) : null;
      const panelHit = panelRect ? document.elementFromPoint(panelRect.left + panelRect.width / 2, panelRect.top + panelRect.height / 2) : null;
      return {
        image: rect(image),
        wrapper: rect(wrapper),
        postHost: rect(postHost),
        inImage: rect(inImage),
        floating: rect(floating),
        toolbar: rect(toolbar),
        panel: rect(panel),
        cropPortal: rect(document.querySelector(".lie-crop-portal")),
        presentation: {
          inImageVisible: visible(inImage),
          floatingVisible: visible(floating),
          inset: !!(imageRect && toolbarRect && toolbarRect.top >= imageRect.top && toolbarRect.bottom <= imageRect.bottom),
          above: !!(imageRect && toolbarRect && toolbarRect.bottom <= imageRect.top),
          gap: imageRect && toolbarRect ? imageRect.top - toolbarRect.bottom : null,
          toolbarHit: !!(toolbar && toolbarHit && toolbar.contains(toolbarHit)),
          panelVisible: visible(panel),
          panelHit: !!(panel && panelHit && panel.contains(panelHit)),
        },
        identity: {
          activeImageSame: plugin?.activeImage === image,
          activeImageConnected: !!plugin?.activeImage?.isConnected,
          anchorConnected: !!anchor?.isConnected,
          toolbarConnected: !!surfaceToolbar?.isConnected,
          hoverRegionConnected: !!hoverRegion?.isConnected,
          hoverRegionOwnsImage: !!(hoverRegion && image && hoverRegion.contains(image)),
          anchor: rect(anchor),
          surfaceToolbar: rect(surfaceToolbar),
          hoverRegion: rect(hoverRegion),
        },
        refs: {
          submenu: !!plugin?.submenu,
          filterPanel: !!plugin?.filterPanel,
          classPanel: !!plugin?.classPanel,
          cropEditor: !!plugin?.cropEditor,
        },
        visibleSurfaceCount: [...document.querySelectorAll(".lie-submenu,.lie-filter-panel,.lie-class-panel,.lie-group-popup,.lie-crop-portal")].filter(visible).length,
      };
    })()`);
  }

  async function hoverImage(id) {
    await cdp.hover(4, 4);
    await wait(280);
    const point = await locate(id);
    await cdp.hover(point.x, point.y);
    await wait(260);
    return { point, current: await state(id) };
  }

  async function travelTo(rect) {
    if (!rect) return false;
    await cdp.hover(rect.x + rect.w / 2, rect.y + rect.h / 2);
    await wait(260);
    return true;
  }

  async function visibleButton(id) {
    const selector = `[data-lie-id="${id}"]`;
    return evaluate(`(() => {
      const visible = (element) => {
        if (!element?.isConnected) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight
          && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
      };
      const buttons = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(visible);
      const button = buttons.find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return candidate.closest(".lie-toolbar") && !!hit && candidate.contains(hit);
      }) ?? null;
      if (!button) return null;
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height }, hit: !!hit && button.contains(hit) };
    })()`);
  }

  async function finalizeJourneyEvidence(journey, hostId, before) {
    if (!journey.source) {
      let after;
      try { after = await sourceState(); } catch (error) { after = { error: String(error?.stack || error) }; }
      journey.source = { before, after };
    }
    const beforeWrites = journey.source.before?.transformWrites ?? null;
    const afterWrites = journey.source.after?.transformWrites ?? null;
    journey.writeCount = {
      before: beforeWrites,
      after: afterWrites,
      delta: typeof beforeWrites === "number" && typeof afterWrites === "number" ? afterWrites - beforeWrites : null,
    };
    if (!journey.cleanup) {
      await cdp.press("Escape").catch(() => {});
      await cdp.hover(4, 4).catch(() => {});
      await wait(300);
      try { journey.cleanup = await state(hostId); }
      catch (error) { journey.cleanup = { error: String(error?.stack || error) }; }
    }
  }

  async function panelJourney(hostId, actionId) {
    const journey = { id: `panel:${hostId}:${actionId}`, kind: "panel", host: hostId, action: actionId };
    let before = null;
    try {
      before = await sourceState();
      const hovered = await hoverImage(hostId);
      journey.hover = hovered.current;
      journey.hoverEvidence = await evidence([hovered.current.image, hovered.current.toolbar]);
      await travelTo(hovered.current.toolbar);
      journey.toolbarTravel = await state(hostId);
      const button = await visibleButton(actionId);
      journey.button = button;
      check(`${hostId}.${actionId}.button`, !!button?.hit, button);
      if (!button) throw new Error(`missing visible ${actionId} button`);
      await cdp.click(button.x, button.y);
      await wait(320);
      journey.open = await state(hostId);
      journey.openEvidence = await evidence([journey.open.image, journey.open.toolbar, journey.open.panel]);
      check(`${hostId}.${actionId}.panel-painted`, journey.open.presentation.panelVisible && journey.open.presentation.panelHit, journey.open.presentation);
      check(`${hostId}.${actionId}.connected-owner`, journey.open.identity.activeImageSame
        && journey.open.identity.activeImageConnected
        && journey.open.identity.anchorConnected
        && journey.open.identity.toolbarConnected
        && journey.open.identity.hoverRegionConnected
        && journey.open.identity.hoverRegionOwnsImage, journey.open.identity);
      await travelTo(journey.open.panel);
      journey.panelTravel = await state(hostId);
      check(`${hostId}.${actionId}.panel-travel`, journey.panelTravel.presentation.panelVisible
        && journey.panelTravel.presentation.panelHit, journey.panelTravel.presentation);
      await cdp.press("Escape");
      await wait(380);
      journey.afterEscape = await state(hostId);
      const after = await sourceState();
      journey.source = { before, after };
      check(`${hostId}.${actionId}.escape-no-write`, before.buffer === after.buffer
        && before.disk === after.disk
        && before.transformWrites === after.transformWrites, journey.source);
      await cdp.hover(4, 4);
      await wait(360);
      journey.cleanup = await state(hostId);
      check(`${hostId}.${actionId}.cleanup`, !Object.values(journey.cleanup.refs).some(Boolean)
        && journey.cleanup.visibleSurfaceCount === 0, journey.cleanup);
    } catch (error) {
      journey.error = String(error?.stack || error);
      await cdp.press("Escape").catch(() => {});
      await cdp.hover(4, 4).catch(() => {});
      await wait(300);
    }
    await finalizeJourneyEvidence(journey, hostId, before);
    contract.journeys.push(journey);
  }

  async function placementJourney(id, expected) {
    const journey = { id: `placement:${id}:${expected}`, kind: "placement", host: id, expected };
    let before = null;
    try {
      before = await sourceState();
      const hovered = await hoverImage(id);
      journey.hover = hovered.current;
      journey.evidence = await evidence([hovered.current.image, hovered.current.toolbar]);
      check(`${id}.toolbar-hit`, hovered.current.presentation.toolbarHit, hovered.current.presentation);
      if (expected === "inset") {
        check(`${id}.inset-only`, hovered.current.presentation.inImageVisible
          && !hovered.current.presentation.floatingVisible
          && hovered.current.presentation.inset, hovered.current.presentation);
      } else {
        check(`${id}.float-only-above`, !hovered.current.presentation.inImageVisible
          && hovered.current.presentation.floatingVisible
          && hovered.current.presentation.above, hovered.current.presentation);
      }
      await cdp.hover(4, 4);
      await wait(320);
    } catch (error) {
      journey.error = String(error?.stack || error);
    }
    await finalizeJourneyEvidence(journey, id, before);
    const after = journey.source.after;
    check(`${id}.placement-no-write`, before?.buffer === after?.buffer && before?.disk === after?.disk
      && before?.transformWrites === after?.transformWrites, journey.source);
    check(`${id}.placement-cleanup`, !!journey.cleanup?.refs
      && !Object.values(journey.cleanup.refs).some(Boolean)
      && journey.cleanup.visibleSurfaceCount === 0, journey.cleanup);
    contract.journeys.push(journey);
  }

  async function readingNegative(id) {
    const journey = { id: `reading-negative:${id}`, kind: "reading-negative", host: id };
    let before = null;
    try {
      before = await sourceState();
      const hovered = await hoverImage(id);
      journey.afterHover = hovered.current;
      journey.hoverEvidence = await evidence([hovered.current.image, hovered.current.toolbar]);
      await cdp.click(hovered.point.x, hovered.point.y);
      await wait(320);
      journey.afterClick = await state(id);
      await cdp.longPress(hovered.point.x, hovered.point.y);
      await wait(320);
      journey.afterLongPress = await state(id);
      const after = await sourceState();
      journey.source = { before, after };
      const clean = (value) => !value.presentation.inImageVisible && !value.presentation.floatingVisible
        && !Object.values(value.refs).some(Boolean) && value.visibleSurfaceCount === 0;
      check(`reading.${id}.no-ui`, clean(journey.afterHover) && clean(journey.afterClick)
        && clean(journey.afterLongPress), journey);
      check(`reading.${id}.no-write`, before.buffer === after.buffer && before.disk === after.disk
        && before.transformWrites === after.transformWrites, { before, after });
      await cdp.press("Escape");
      await cdp.hover(4, 4);
      await wait(300);
    } catch (error) {
      journey.error = String(error?.stack || error);
    }
    await finalizeJourneyEvidence(journey, id, before);
    check(`reading.${id}.cleanup`, !!journey.cleanup?.refs
      && !Object.values(journey.cleanup.refs).some(Boolean)
      && journey.cleanup.visibleSurfaceCount === 0, journey.cleanup);
    contract.journeys.push(journey);
  }

  try {
    throwIfAborted();
    original = await evaluate(`(() => {
      const leaf = app.workspace.activeLeaf;
      const editor = app.workspace.activeEditor?.editor;
      const scroller = document.querySelector(".markdown-source-view .cm-scroller,.markdown-reading-view .markdown-preview-view");
      const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      return {
        viewState: leaf?.getViewState() ?? null,
        file: app.workspace.getActiveFile()?.path ?? null,
        mode: leaf?.view?.getMode?.() ?? null,
        selection: editor ? { anchor: editor.getCursor("anchor"), head: editor.getCursor("head") } : null,
        cursor: editor?.getCursor() ?? null,
        scrollTop: scroller?.scrollTop ?? 0,
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        settings: plugin ? JSON.parse(JSON.stringify(plugin.settings)) : null,
      };
    })()`);
    hardGate("target-count", cdp.targetInfo.matchingPageCount === 1, cdp.targetInfo);
    await cdp.setViewport(VIEWPORT.width, VIEWPORT.height, VIEWPORT.deviceScaleFactor);
    await cdp.focusEmulation(true);
    await wait(250);

    contract.environment = await evaluate(`(async () => {
      const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const manifest = app.plugins.manifests[${JSON.stringify(PLUGIN_ID)}];
      const leaf = app.workspace.activeLeaf;
      const editor = app.workspace.activeEditor?.editor;
      const scroller = document.querySelector(".markdown-source-view .cm-scroller,.markdown-reading-view .markdown-preview-view");
      const hash = async (path) => {
        try {
          const text = await app.vault.adapter.read(path);
          const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
          return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
        } catch { return null; }
      };
      const userAgentVersion = navigator.userAgent.match(/obsidian\\/([0-9.]+)/i)?.[1] ?? null;
      return {
        pluginLoaded: !!plugin,
        pluginVersion: manifest?.version ?? null,
        settings: plugin ? JSON.parse(JSON.stringify(plugin.settings)) : null,
        active: {
          file: app.workspace.getActiveFile()?.path ?? null,
          mode: leaf?.view?.getMode?.() ?? null,
          viewState: leaf?.getViewState() ?? null,
          selection: editor ? { anchor: editor.getCursor("anchor"), head: editor.getCursor("head") } : null,
          cursor: editor?.getCursor() ?? null,
          scrollTop: scroller?.scrollTop ?? 0,
        },
        obsidianVersion: app.version ?? userAgentVersion,
        userAgent: navigator.userAgent,
        locale: document.documentElement.lang || navigator.language,
        theme: [...document.body.classList].filter((name) => name.startsWith("theme-")).sort(),
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        hashes: {
          main: await hash(".obsidian/plugins/live-image-editor/main.js"),
          manifest: await hash(".obsidian/plugins/live-image-editor/manifest.json"),
          styles: await hash(".obsidian/plugins/live-image-editor/styles.css"),
        },
        target: ${JSON.stringify(cdp.targetInfo)},
      };
    })()`);
    hardGate("plugin-loaded", contract.environment.pluginLoaded, contract.environment);
    hardGate("plugin-version", contract.environment.pluginVersion === EXPECTED_VERSION, contract.environment.pluginVersion);
    hardGate("environment-settings", JSON.stringify(contract.environment.settings) === JSON.stringify(original.settings), contract.environment.settings);
    hardGate("environment-active-state",
      contract.environment.active.file === original.file
        && contract.environment.active.mode === original.mode
        && JSON.stringify(contract.environment.active.viewState) === JSON.stringify(original.viewState)
        && JSON.stringify(contract.environment.active.selection) === JSON.stringify(original.selection)
        && JSON.stringify(contract.environment.active.cursor) === JSON.stringify(original.cursor)
        && Math.abs(contract.environment.active.scrollTop - original.scrollTop) <= 1,
      contract.environment.active);
    hardGate("obsidian-version", !EXPECTED_OBSIDIAN_VERSION
      || contract.environment.obsidianVersion === EXPECTED_OBSIDIAN_VERSION, contract.environment.obsidianVersion);
    hardGate("build-hashes", Object.entries(EXPECTED_HASHES)
      .every(([name, expected]) => contract.environment.hashes[name] === expected), contract.environment.hashes);

    hardGate("fixture-absent", !(await evaluate(`!!app.vault.getAbstractFileByPath(${JSON.stringify(FIXTURE)})`)), FIXTURE);
    await evaluate(`(async () => {
      const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      plugin.settings.showToolbar = true;
      plugin.settings.showCaptions = false;
      plugin.settings.defaultRevealState = "native";
      const file = await app.vault.create(${JSON.stringify(FIXTURE)}, ${JSON.stringify(CONTENT)});
      await app.workspace.activeLeaf.openFile(file, { active: true });
      plugin.refreshLivePreviewDecorations();
      return true;
    })()`);
    fixtureCreated = true;
    await setMode("source");
    await wait(650);
    const fixtureGate = await evaluate(`(async () => {
      const file = app.workspace.getActiveFile();
      const editor = app.workspace.activeEditor?.editor;
      return {
        file: file?.path ?? null,
        buffer: editor?.getValue() ?? null,
        disk: file ? await app.vault.adapter.read(file.path) : null,
      };
    })()`);
    hardGate("fixture-bytes", fixtureGate.buffer === CONTENT && fixtureGate.disk === CONTENT, fixtureGate);

    await evaluate(`(() => {
      const editor = app.workspace.activeEditor.editor;
      const cm = editor.cm;
      const diag = { editorChanges: 0, transformWrites: 0, errors: [], consoleErrors: [], cm };
      diag.dispatchDescriptor = Object.getOwnPropertyDescriptor(cm, "dispatchTransactions");
      diag.originalDispatch = cm.dispatchTransactions;
      Object.defineProperty(cm, "dispatchTransactions", {
        configurable: true,
        writable: true,
        value(transactions, view) {
          for (const transaction of transactions) if (transaction.isUserEvent?.("lie.transform")) diag.transformWrites++;
          return diag.originalDispatch.call(cm, transactions, view);
        },
      });
      diag.editorRef = app.workspace.on("editor-change", () => diag.editorChanges++);
      diag.onError = (event) => diag.errors.push(String(event.message || event.error || event));
      diag.onReject = (event) => diag.errors.push("unhandled:" + String(event.reason));
      addEventListener("error", diag.onError);
      addEventListener("unhandledrejection", diag.onReject);
      diag.originalConsoleError = console.error;
      console.error = (...args) => {
        try { diag.consoleErrors.push(args.map((value) => String(value?.stack || value?.message || value)).join(" ")); } catch {}
        return diag.originalConsoleError.apply(console, args);
      };
      window.__lieToolbarHostDiag = diag;
      return true;
    })()`);
    instrumentationArmed = true;
    setupValid = true;

    await runJourney("placement:normal-host:inset", () => placementJourney("normal-host", "inset"));
    await runJourney("placement:tiny-host:floating-above", () => placementJourney("tiny-host", "floating-above"));
    for (const host of ["normal-host", "tiny-host"]) {
      for (const action of ["custom-size", "filters", "crop"]) {
        await runJourney(`panel:${host}:${action}`, () => panelJourney(host, action));
      }
    }
    for (const host of ["table-host", "callout-host", "footnote-host"]) {
      await runJourney(`placement:${host}:inset`, () => placementJourney(host, "inset"));
      for (const action of ["custom-size", "filters", "crop"]) {
        await runJourney(`panel:${host}:${action}`, () => panelJourney(host, action));
      }
    }

    throwIfAborted();
    await setMode("preview");
    throwIfAborted();
    for (const id of ["normal-host", "table-host", "callout-host", "footnote-host"]) {
      await runJourney(`reading-negative:${id}`, () => readingNegative(id));
    }
    throwIfAborted();
    contract.diagnostics = await evaluate(`(() => {
      const diag = window.__lieToolbarHostDiag;
      const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      return {
        editorChanges: diag.editorChanges,
        transformWrites: diag.transformWrites,
        errors: [...diag.errors],
        consoleErrors: [...diag.consoleErrors],
        refs: { submenu: !!plugin.submenu, filterPanel: !!plugin.filterPanel, classPanel: !!plugin.classPanel, cropEditor: !!plugin.cropEditor },
        orphans: document.querySelectorAll(".lie-submenu,.lie-filter-panel,.lie-class-panel,.lie-group-popup,.lie-crop-portal,.lie-toolbar-floating").length,
      };
    })()`);
    check("diagnostics.no-errors", !contract.diagnostics.errors.length && !contract.diagnostics.consoleErrors.length, contract.diagnostics);
    check("diagnostics.no-orphans", !Object.values(contract.diagnostics.refs).some(Boolean) && contract.diagnostics.orphans === 0, contract.diagnostics);
  } catch (error) {
    contract.fatal = {
      kind: abortSignal ? "abort" : "error",
      message: String(error?.stack || error),
    };
  } finally {
    try {
      await cdp.press("Escape");
      await cdp.hover(4, 4);
      await settle(220);
    } catch {}
    try {
      if (instrumentationArmed) {
        await evaluate(`(() => {
          const diag = window.__lieToolbarHostDiag;
          if (!diag) return true;
          app.workspace.offref(diag.editorRef);
          removeEventListener("error", diag.onError);
          removeEventListener("unhandledrejection", diag.onReject);
          console.error = diag.originalConsoleError;
          if (diag.dispatchDescriptor) Object.defineProperty(diag.cm, "dispatchTransactions", diag.dispatchDescriptor);
          else delete diag.cm.dispatchTransactions;
          delete window.__lieToolbarHostDiag;
          return true;
        })()`);
      }
      if (original?.settings) {
        await evaluate(`(() => {
          const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          Object.assign(plugin.settings, ${JSON.stringify(original.settings)});
          plugin.refreshLivePreviewDecorations();
          return true;
        })()`);
      }
      if (original?.viewState) {
        await evaluate(`(async () => { await app.workspace.activeLeaf.setViewState(${JSON.stringify(original.viewState)}); return true; })()`);
        await settle(600);
      }
      if (original) {
        await evaluate(`(() => {
          const editor = app.workspace.activeEditor?.editor;
          const selection = ${JSON.stringify(original.selection)};
          if (selection && editor) editor.setSelection(selection.anchor, selection.head);
          const scroller = document.querySelector(".markdown-source-view .cm-scroller,.markdown-reading-view .markdown-preview-view");
          if (scroller) scroller.scrollTop = ${Number(original.scrollTop || 0)};
          return true;
        })()`);
      }
      if (fixtureCreated) {
        await evaluate(`(async () => {
          const file = app.vault.getAbstractFileByPath(${JSON.stringify(FIXTURE)});
          if (file) await app.vault.delete(file);
          return true;
        })()`);
      }
      await cdp.clearViewport();
      await cdp.focusEmulation(false);
      await settle(300);
      contract.cleanup = await evaluate(`(() => {
        const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        const leaf = app.workspace.activeLeaf;
        const editor = app.workspace.activeEditor?.editor;
        const scroller = document.querySelector(".markdown-source-view .cm-scroller,.markdown-reading-view .markdown-preview-view");
        return {
          file: app.workspace.getActiveFile()?.path ?? null,
          mode: leaf?.view?.getMode?.() ?? null,
          viewState: leaf?.getViewState() ?? null,
          selection: editor ? { anchor: editor.getCursor("anchor"), head: editor.getCursor("head") } : null,
          cursor: editor?.getCursor() ?? null,
          scrollTop: scroller?.scrollTop ?? 0,
          fixtureExists: !!app.vault.getAbstractFileByPath(${JSON.stringify(FIXTURE)}),
          instrumentationExists: !!window.__lieToolbarHostDiag,
          viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
          settings: JSON.parse(JSON.stringify(plugin.settings)),
          refs: { submenu: !!plugin.submenu, filterPanel: !!plugin.filterPanel, classPanel: !!plugin.classPanel, cropEditor: !!plugin.cropEditor },
          orphans: document.querySelectorAll(".lie-submenu,.lie-filter-panel,.lie-class-panel,.lie-group-popup,.lie-crop-portal,.lie-toolbar-floating").length,
        };
      })()`);
      cleanupValid = !!original
        && contract.cleanup.file === original.file
        && contract.cleanup.mode === original.mode
        && JSON.stringify(contract.cleanup.viewState) === JSON.stringify(original.viewState)
        && JSON.stringify(contract.cleanup.selection) === JSON.stringify(original.selection)
        && JSON.stringify(contract.cleanup.cursor) === JSON.stringify(original.cursor)
        && Math.abs(contract.cleanup.scrollTop - original.scrollTop) <= 1
        && !contract.cleanup.fixtureExists
        && !contract.cleanup.instrumentationExists
        && JSON.stringify(contract.cleanup.settings) === JSON.stringify(original.settings)
        && !Object.values(contract.cleanup.refs).some(Boolean)
        && contract.cleanup.orphans === 0
        && contract.cleanup.viewport.width === original.viewport.width
        && contract.cleanup.viewport.height === original.viewport.height
        && contract.cleanup.viewport.dpr === original.viewport.dpr;
    } catch (error) {
      contract.cleanupError = String(error?.stack || error);
      cleanupValid = false;
    }
    contract.setupValid = setupValid;
    contract.cleanupValid = cleanupValid;
    cdp.close();
  }

  finalizeJourneyContract();
  finalizeAssertionContract();
  contract.aborted = abortSignal ? { signal: abortSignal } : null;
  if (contract.aborted && !contract.fatal) {
    contract.fatal = { kind: "abort", message: `abort requested: ${abortSignal}` };
  }
  const contractValid = setupValid && cleanupValid && !contract.fatal && !contract.aborted
    && contract.journeyContract.complete && contract.assertionContract.complete;

  if (CAPTURE_ONLY) {
    console.log(`LIE_TOOLBAR_HOST_CONTRACT=${canonicalJson(contract)}`);
    process.exitCode = contractValid ? 0 : 2;
    return;
  }

  for (const result of checks) console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name}`);
  const failures = checks.filter((result) => !result.ok);
  console.log(`\n${checks.length - failures.length}/${checks.length} passed`);
  console.log(`LIE_TOOLBAR_HOST_CONTRACT=${canonicalJson(contract)}`);
  if (!contractValid) process.exitCode = 2;
  else if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  contract.fatal = contract.fatal ?? {
    kind: abortSignal ? "abort" : "error",
    message: String(error?.stack || error),
  };
  contract.aborted = abortSignal ? { signal: abortSignal } : null;
  finalizeJourneyContract();
  finalizeAssertionContract();
  contract.setupValid ??= false;
  contract.cleanupValid ??= false;
  if (CAPTURE_ONLY) {
    console.log(`LIE_TOOLBAR_HOST_CONTRACT=${canonicalJson(contract)}`);
  } else {
    console.error("FATAL:", error?.stack || error);
    console.log(`LIE_TOOLBAR_HOST_CONTRACT=${canonicalJson(contract)}`);
  }
  process.exitCode = 2;
});
