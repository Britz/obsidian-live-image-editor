#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, realpath, rmdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectOptical } from "./_optical.mjs";

const PLUGIN_ID = "live-image-editor";
const FIXTURE = "_postprocessor-write-address-fixture.md";
const ASSET_DIR_A = "_postprocessor-write-address-a";
const ASSET_DIR_B = "_postprocessor-write-address-b";
const ASSET_NAME = "collision.png";
const ASSET_A = `${ASSET_DIR_A}/${ASSET_NAME}`;
const ASSET_B = `${ASSET_DIR_B}/${ASSET_NAME}`;
const KNOWN_FILES = [FIXTURE, ASSET_A, ASSET_B];
const KNOWN_DIRS = [ASSET_DIR_A, ASSET_DIR_B];
const KNOWN_PATHS = [...KNOWN_FILES, ...KNOWN_DIRS];
const ORPHAN_SELECTOR = ".lie-submenu,.lie-filter-panel,.lie-class-panel,.lie-group-popup,.lie-crop-portal,.lie-toolbar-floating";
const MARKER = "LIE_POSTPROCESSOR_WRITE_ADDRESS_CONTRACT=";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VAULT_DIR = path.join(ROOT, "vault-image-toolbar");
const INSTALLED_DIR = path.join(ROOT, "vault-image-toolbar/.obsidian/plugins", PLUGIN_ID);
const ARTIFACTS = ["main.js", "manifest.json", "styles.css"];
const HASH_KEYS = { "main.js": "main", "manifest.json": "manifest", "styles.css": "styles" };
const CAPTURE_ONLY = process.env.LIE_CAPTURE_ONLY === "1";

const ASSERTIONS_BY_JOURNEY = {
  "success:table-identical-second": [
    "cache-exact",
    "panel-open",
    "keyboard-preview-no-write",
    "source-stable-open",
    "accept-connected-hit",
    "single-tagged-write",
    "exact-transaction-change",
    "exact-target-source-only",
    "buffer-disk-settled",
    "target-rerendered",
    "undo-focus",
    "single-real-undo",
  ],
  "success:callout-path-collision-second": [
    "cache-exact",
    "panel-open",
    "keyboard-preview-no-write",
    "source-stable-open",
    "accept-connected-hit",
    "single-tagged-write",
    "exact-transaction-change",
    "exact-target-source-only",
    "buffer-disk-settled",
    "target-rerendered",
    "undo-focus",
    "single-real-undo",
  ],
  "fail-closed:missing-cache": [
    "cache-exact",
    "panel-open",
    "keyboard-preview-no-write",
    "source-stable-open",
    "fault-armed",
    "accept-connected-hit",
    "zero-tagged-write",
    "source-byte-identical",
    "fault-restored",
  ],
  "fail-closed:stale-different-basename": [
    "cache-exact",
    "panel-open",
    "keyboard-preview-no-write",
    "source-stable-open",
    "fault-armed",
    "accept-connected-hit",
    "zero-tagged-write",
    "source-byte-identical",
    "fault-restored",
  ],
  diagnostics: [
    "no-renderer-errors",
    "no-orphans-before-cleanup",
  ],
};
const JOURNEY_IDS = Object.keys(ASSERTIONS_BY_JOURNEY);
const ASSERTION_NAMES = JOURNEY_IDS.flatMap((id) =>
  ASSERTIONS_BY_JOURNEY[id].map((suffix) => `${id}.${suffix}`)
);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function canonicalJson(value) {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ":" + canonicalJson(value[key])
    ).join(",") + "}";
  }
  return JSON.stringify(value);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isContained(parent, target) {
  const relative = path.relative(parent, target);
  return relative !== "" && !path.isAbsolute(relative)
    && relative !== ".." && !relative.startsWith(".." + path.sep);
}

async function removeKnownEmptyDirectories() {
  const vault = path.resolve(VAULT_DIR);
  const vaultMetadata = await lstat(vault);
  if (vaultMetadata.isSymbolicLink() || !vaultMetadata.isDirectory()
    || await realpath(vault) !== vault) {
    throw new Error("vault root must be an exact non-symlink directory");
  }
  for (const name of [...KNOWN_DIRS].reverse()) {
    const directory = path.resolve(vault, name);
    if (!isContained(vault, directory)) throw new Error("test directory escapes vault: " + name);
    let metadata;
    try { metadata = await lstat(directory); }
    catch (error) { if (error?.code === "ENOENT") continue; throw error; }
    if (metadata.isSymbolicLink() || !metadata.isDirectory()
      || await realpath(directory) !== directory) {
      throw new Error("test path must be an exact non-symlink directory: " + name);
    }
    await rmdir(directory);
  }
}

async function installedIdentity() {
  const hashes = {};
  for (const name of ARTIFACTS) {
    hashes[HASH_KEYS[name]] = sha256(await readFile(path.join(INSTALLED_DIR, name)));
  }
  const manifest = JSON.parse(await readFile(path.join(INSTALLED_DIR, "manifest.json"), "utf8"));
  if (manifest.id !== PLUGIN_ID || typeof manifest.version !== "string") {
    throw new Error("installed manifest identity is invalid");
  }
  return { version: manifest.version, hashes };
}

function embed(pathValue, alt, width, useMarkdownLinks, inTable = false) {
  const block = `{width=${width}}`;
  if (useMarkdownLinks) return `![${alt}](${pathValue})${block}`;
  const alias = alt ? `${inTable ? "\\|" : "|"}${alt}` : "";
  return `![[${pathValue}${alias}]]${block}`;
}

function lineStartOffset(source, lineNumber) {
  const lines = source.split("\n");
  let offset = 0;
  for (let index = 0; index < lineNumber; index++) offset += lines[index].length + 1;
  return offset;
}

function sourceAddress(source, lineNumber, sourceEmbed) {
  const line = source.split("\n")[lineNumber];
  const start = line.indexOf(sourceEmbed);
  if (start < 0 || line.indexOf(sourceEmbed, start + 1) !== -1) {
    throw new Error(`embed address is not unique on fixture line ${lineNumber}`);
  }
  const headIndex = sourceEmbed.indexOf("{");
  if (headIndex < 0) throw new Error("fixture embed has no attribute block");
  const absoluteFrom = lineStartOffset(source, lineNumber) + start;
  return {
    line: lineNumber,
    start,
    headEnd: start + headIndex,
    end: start + sourceEmbed.length,
    absoluteFrom,
    absoluteTo: absoluteFrom + sourceEmbed.length,
  };
}

function buildFixture(useMarkdownLinks) {
  const staleEmbed = embed("images/sample-square.png", "stale-decoy", 300, useMarkdownLinks);
  const tableEmbed = embed(ASSET_A, "", 320, useMarkdownLinks, true);
  const calloutA = embed(ASSET_A, "callout-a", 340, useMarkdownLinks);
  const calloutB = embed(ASSET_B, "callout-b", 60, useMarkdownLinks);
  const lines = [
    "# Post-processor write-address guard",
    "",
    staleEmbed,
    "",
    "| Case | Image |",
    "| --- | --- |",
    `| table-first | ${tableEmbed} |`,
    `| table-second | ${tableEmbed} |`,
    "",
    "> [!note] Callout write-address guard",
    `> ${calloutA}`,
    `> ${calloutB}`,
    "",
    "Parking line.",
    "",
  ];
  const source = lines.join("\n");
  const table = {
    kind: "table",
    line: 7,
    embed: tableEmbed,
    path: ASSET_A,
    initialWidth: 320,
    writeWidth: 60,
    candidateFloating: true,
  };
  const callout = {
    kind: "callout",
    line: 11,
    embed: calloutB,
    path: ASSET_B,
    initialWidth: 60,
    writeWidth: 340,
    candidateFloating: false,
  };
  for (const target of [table, callout]) {
    Object.assign(target, sourceAddress(source, target.line, target.embed));
  }
  const staleLocation = {
    ...sourceAddress(source, 2, staleEmbed),
    filename: "images/sample-square.png",
    isWikiLink: !useMarkdownLinks,
    block: `{width=300}`,
    params: "width=300",
    alt: "stale-decoy",
    inTable: false,
  };
  return {
    source,
    table,
    callout,
    staleLocation,
    sameBasenameLines: [6, 7, 10, 11],
  };
}

function replacementFor(target, width) {
  return target.embed.replace(/\{width=\d+\}$/u, `{width=${width}}`);
}

function replaceExactTarget(source, target, replacement) {
  return source.slice(0, target.absoluteFrom) + replacement + source.slice(target.absoluteTo);
}

function errorShape(error) {
  return {
    name: String(error?.name || "Error"),
    message: String(error?.message || error).slice(0, 2000),
  };
}

class JourneyStop extends Error {
  constructor(message) {
    super(message);
    this.name = "JourneyStop";
  }
}

class Interrupted extends Error {
  constructor(signal) {
    super(`interrupted by ${signal}`);
    this.name = "Interrupted";
    this.signal = signal;
  }
}

async function main() {
  const contract = {
    schema: 1,
    captureOnly: CAPTURE_ONLY,
    expected: null,
    environment: null,
    gates: [],
    setupValid: false,
    cleanupValid: false,
    fatal: null,
    aborted: null,
    assertions: [],
    journeys: [],
    assertionContract: null,
    journeyContract: null,
    cleanup: null,
    cleanupError: null,
  };
  const cleanupErrors = [];
  let interruptedSignal = null;
  let blockedFatal = null;
  let cdp = null;
  let original = null;
  let fixture = null;
  let probeArmed = false;
  let focusArmed = false;
  let ownsKnownPaths = false;
  let ownsPanel = false;
  let ownsInteraction = false;

  const onSignal = (signal) => {
    if (!interruptedSignal) interruptedSignal = signal;
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const assertNotInterrupted = () => {
    if (interruptedSignal) throw new Interrupted(interruptedSignal);
  };
  const pause = async (ms) => {
    await wait(ms);
    assertNotInterrupted();
  };
  const evaluate = (expression, options) => {
    if (!cdp) throw new Error("CDP is not connected");
    return cdp.evaluate(expression, options);
  };
  const cleanupStep = async (name, callback) => {
    try {
      await callback();
    } catch (error) {
      cleanupErrors.push(new Error(name + ": " + String(error?.message || error), { cause: error }));
    }
  };
  const hardGate = (name, ok, actual) => {
    contract.gates.push({ name, ok: !!ok, actual: actual ?? null });
    console.log((ok ? "PASS" : "FAIL") + "  gate:" + name);
    if (!ok) throw new Error("hard gate failed: " + name);
  };

  let recoverJourney = async () => {};
  const runJourney = async (id, callback) => {
    const suffixes = ASSERTIONS_BY_JOURNEY[id];
    const journey = { id };
    let assertionIndex = 0;
    const record = (suffix, ok, actual = null, critical = false) => {
      const expectedSuffix = suffixes[assertionIndex];
      if (suffix !== expectedSuffix) {
        throw new Error("assertion order mismatch for " + id + ": expected "
          + expectedSuffix + ", got " + suffix);
      }
      const name = id + "." + suffix;
      const assertion = { name, ok: !!ok, actual: actual ?? null };
      contract.assertions.push(assertion);
      assertionIndex++;
      console.log((ok ? "PASS" : "FAIL") + "  " + name);
      if (critical && !ok) throw new JourneyStop(name);
    };

    try {
      if (blockedFatal) throw new Error("blocked by prior fatal: " + blockedFatal.message);
      assertNotInterrupted();
      await callback(record);
      if (assertionIndex !== suffixes.length) {
        throw new Error("journey returned before all fixed assertions");
      }
    } catch (error) {
      journey.error = String(error?.message || error).slice(0, 2000);
      if (error instanceof Interrupted) {
        contract.aborted = error.signal;
        blockedFatal = error;
      }
    } finally {
      while (assertionIndex < suffixes.length) {
        const name = id + "." + suffixes[assertionIndex++];
        contract.assertions.push({
          name,
          ok: false,
          actual: { error: journey.error || "assertion not reached" },
        });
        console.log("FAIL  " + name);
      }
      contract.journeys.push(journey);
      if (id !== "diagnostics") {
        try {
          await recoverJourney();
        } catch (error) {
          const wrapped = new Error("journey recovery failed: " + String(error?.message || error), { cause: error });
          blockedFatal = wrapped;
          if (!contract.fatal) contract.fatal = errorShape(wrapped);
        }
      }
    }
  };

  const imageLocatorDeclaration = (target) => target.kind === "table"
    ? `const resolveImage=()=>{
       const visible=(node)=>{const r=node.getBoundingClientRect();return node.isConnected&&r.width>0&&r.height>0;};
       const tables=[...document.querySelectorAll(".workspace-leaf.mod-active .cm-table-widget table")].filter(visible);
       if(tables.length!==1)return null;
       const rows=[...tables[0].querySelectorAll("tr")].filter((row)=>row.querySelector("td"));
       if(rows.length!==2)return null;
       const images=rows.map((row)=>{const cell=row.children[1];if(cell?.tagName!=="TD")return null;
         const found=[...cell.querySelectorAll("img")].filter((image)=>visible(image)&&!image.closest(".lie-caption"));
         return found.length===1?found[0]:null;});
       return images.every(Boolean)?images[1]:null;};`
    : `const resolveImage=()=>{const callouts=[...document.querySelectorAll(".markdown-source-view .callout")];
       const callout=callouts.find((node)=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0;});
       const images=callout?[...callout.querySelectorAll(".internal-embed.image-embed.lie-embed img")]
         .filter((image)=>image.isConnected&&!image.closest(".lie-caption")):[];
       return images[1]??null;};`;

  const selectorPoint = async (selector) => evaluate(`(() => {
    const visible=(element)=>{if(!element?.isConnected)return false;const rect=element.getBoundingClientRect();
      const style=getComputedStyle(element);if(rect.width<=0||rect.height<=0||rect.bottom<=0||rect.top>=innerHeight
        ||style.display==="none"||style.visibility==="hidden"||Number(style.opacity)===0)return false;
      const x=rect.left+rect.width/2,y=rect.top+rect.height/2,hit=document.elementFromPoint(x,y);
      return !!hit&&element.contains(hit);};
    const elements=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(visible);
    const element=elements[0]??null;if(!element)return null;const rect=element.getBoundingClientRect();
    return {x:rect.left+rect.width/2,y:rect.top+rect.height/2,count:elements.length};
  })()`);
  const waitSelectorPoint = async (selector, label) => {
    let point = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      point = await selectorPoint(selector);
      if (point) return point;
      await pause(120);
    }
    throw new JourneyStop(label + " is not visible/hit-testable");
  };
  const targetPoint = async (target) => evaluate(`(() => {
    ${imageLocatorDeclaration(target)}
    const image=resolveImage();if(!image?.isConnected)return null;const rect=image.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0||rect.bottom<=0||rect.top>=innerHeight)return null;
    const x=rect.left+rect.width/2,y=rect.top+rect.height/2,hit=document.elementFromPoint(x,y);
    return {x,y,hit:!!hit&&(hit===image||image.contains(hit)),connected:image.isConnected};
  })()`);
  const waitTargetPoint = async (target, label) => {
    let point = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      point = await targetPoint(target);
      if (point?.hit && point.connected) return point;
      await pause(120);
    }
    throw new JourneyStop(label + " image is not visible/hit-testable");
  };
  const scrollTarget = async (target) => {
    await evaluate(`(() => {
      const editor=app.workspace.activeEditor?.editor,cm=editor?.cm;if(!cm)return false;
      const parking=cm.state.doc.line(14);
      cm.dispatch({selection:{anchor:parking.from}});
      editor.scrollIntoView({from:{line:${target.line},ch:0},to:{line:${target.line},ch:0}},true);
      return true;
    })()`);
    await pause(400);
    await evaluate(`(() => {${imageLocatorDeclaration(target)}const image=resolveImage();
      image?.scrollIntoView({block:"center",inline:"nearest"});return !!image;})()`);
    await pause(300);
  };
  const sourceState = () => evaluate(`(async () => {
    const file=app.vault.getAbstractFileByPath(${JSON.stringify(FIXTURE)});
    const editor=app.workspace.activeEditor?.editor;
    return {file:app.workspace.getActiveFile()?.path??null,buffer:editor?.getValue()??null,
      disk:file?await app.vault.adapter.read(file.path):null,
      records:window.__liePpWriteAddressDiag?JSON.parse(JSON.stringify(window.__liePpWriteAddressDiag.records)):null};
  })()`);
  const settleSource = async (expected, label) => {
    let state = null;
    for (let attempt = 0; attempt < 48; attempt++) {
      state = await sourceState();
      if (state.file === FIXTURE && state.buffer === expected && state.disk === expected) return state;
      await pause(250);
    }
    throw new JourneyStop(label + " source did not settle: "
      + JSON.stringify({ file: state?.file, buffer: state?.buffer === expected, disk: state?.disk === expected }));
  };
  const resetProbe = () => evaluate(`(() => {
    const diag=window.__liePpWriteAddressDiag;if(!diag)return false;diag.records=[];diag.openedImage=null;return true;
  })()`);
  const cacheGate = async (target, source = fixture.source) => {
    const expected = sourceAddress(source, target.line, target.embed);
    return evaluate(`(() => {
      ${imageLocatorDeclaration(target)}
      const plugin=app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const editor=app.workspace.activeEditor?.editor,cm=editor?.cm,image=resolveImage();
      const cached=image?plugin?.postProcessorLocations?.get(image):null,location=cached?.location??null;
      const from=location&&editor?editor.posToOffset({line:location.line,ch:location.start}):null;
      const to=location&&editor?editor.posToOffset({line:location.line,ch:location.end}):null;
      return {imagePresent:!!image,imageConnected:!!image?.isConnected,docCurrent:!!cached&&cached.doc===cm?.state?.doc,
        line:location?.line??null,start:location?.start??null,headEnd:location?.headEnd??null,end:location?.end??null,
        filename:location?.filename??null,span:from!==null&&to!==null?cm.state.doc.sliceString(from,to):null,
        expected:${JSON.stringify({ ...expected, filename: target.path, span: target.embed })}};
    })()`);
  };
  const cacheGateOk = (gate) => !!gate?.imageConnected && gate.docCurrent
    && gate.line === gate.expected.line && gate.start === gate.expected.start
    && gate.headEnd === gate.expected.headEnd && gate.end === gate.expected.end
    && gate.filename === gate.expected.filename && gate.span === gate.expected.span;
  const waitCacheGate = async (target, source = fixture.source) => {
    await scrollTarget(target);
    let gate = null;
    for (let attempt = 0; attempt < 36; attempt++) {
      gate = await cacheGate(target, source);
      if (cacheGateOk(gate)) return gate;
      await pause(150);
    }
    return gate;
  };

  const armProbe = async () => evaluate(`(() => {
    const cm=app.workspace.activeEditor?.editor?.cm;
    if(!cm||typeof cm.dispatchTransactions!=="function"||window.__liePpWriteAddressDiag)return false;
    const diag={records:[],errors:[],consoleErrors:[],openedImage:null,fault:null,cm,
      dispatchDescriptor:Object.getOwnPropertyDescriptor(cm,"dispatchTransactions"),
      originalDispatch:cm.dispatchTransactions,originalConsoleError:console.error};
    Object.defineProperty(cm,"dispatchTransactions",{configurable:true,writable:true,
      value:function(transactions,view){for(const transaction of transactions){
        if(transaction.isUserEvent("lie.transform")){const changes=[];
          transaction.changes.iterChanges((fromA,toA,fromB,toB,inserted)=>{
            changes.push({fromA,toA,fromB,toB,insert:inserted.toString()});
          });
          diag.records.push({docChanged:transaction.docChanged,changes});
        }}
        return diag.originalDispatch.call(this,transactions,view);
      }});
    diag.onError=(event)=>diag.errors.push(String(event.message||event.error||event));
    diag.onReject=(event)=>diag.errors.push("unhandled:"+String(event.reason));
    addEventListener("error",diag.onError);addEventListener("unhandledrejection",diag.onReject);
    console.error=(...args)=>{try{diag.consoleErrors.push(args.map((value)=>String(value?.stack||value?.message||value)).join(" "));}catch{}
      return diag.originalConsoleError.apply(console,args);};
    window.__liePpWriteAddressDiag=diag;return true;
  })()`);

  const settleBufferDisk = async (label) => {
    let state = null;
    for (let attempt = 0; attempt < 48; attempt++) {
      state = await sourceState();
      if (state.file === FIXTURE && state.buffer !== null && state.buffer === state.disk) return state;
      await pause(250);
    }
    throw new JourneyStop(label + " buffer/disk did not settle");
  };
  const beginSizePanel = async (target, width, record) => {
    const gate = await waitCacheGate(target);
    record("cache-exact", cacheGateOk(gate), {
      imageConnected: gate?.imageConnected ?? false,
      docCurrent: gate?.docCurrent ?? false,
      line: gate?.line ?? null,
      start: gate?.start ?? null,
      end: gate?.end ?? null,
      filename: gate?.filename ?? null,
      spanMatches: gate?.span === gate?.expected?.span,
    }, true);
    if (await resetProbe() !== true) throw new Error("write probe reset failed");

    await cdp.hover(4, 4);
    await pause(150);
    const imagePoint = await waitTargetPoint(target, target.kind);
    ownsInteraction = true;
    await cdp.hover(imagePoint.x, imagePoint.y);
    await pause(300);
    const button = await waitSelectorPoint('[data-lie-id="custom-size"]', "custom-size button");
    await cdp.click(button.x, button.y);
    await pause(300);
    const panel = await evaluate(`(() => {
      ${imageLocatorDeclaration(target)}
      const plugin=app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}],image=resolveImage();
      const diag=window.__liePpWriteAddressDiag;if(diag)diag.openedImage=image;
      return {panel:!!document.querySelector(".lie-submenu"),ref:!!plugin?.submenu,
        activeImageSame:plugin?.activeImage===image,imageConnected:!!image?.isConnected,
        cachePresent:!!image&&plugin?.postProcessorLocations?.has(image)};
    })()`);
    ownsPanel = !!panel.panel;
    record("panel-open", panel.panel && panel.ref && panel.activeImageSame
      && panel.imageConnected && panel.cachePresent, panel, true);

    const inputPoint = await waitSelectorPoint(".lie-submenu .lie-size-input", "width input");
    await cdp.click(inputPoint.x, inputPoint.y);
    await cdp.replaceFocusedText(String(width),
      /Mac/u.test(original.platform) ? { meta: true } : { ctrl: true });
    await pause(180);
    const typed = await evaluate(`(() => {
      const input=document.querySelector(".lie-submenu .lie-size-input");
      return {value:input?.value??null,focused:document.activeElement===input,
        records:window.__liePpWriteAddressDiag?.records?.length??null};
    })()`);
    record("keyboard-preview-no-write", typed.value === String(width)
      && typed.focused && typed.records === 0, typed, true);
  };
  const acceptSizePanel = async (target, record) => {
    const point = await waitSelectorPoint(".lie-submenu-confirm", "accept control");
    const gate = await evaluate(`(() => {
      ${imageLocatorDeclaration(target)}
      const current=resolveImage(),opened=window.__liePpWriteAddressDiag?.openedImage;
      const button=document.querySelector(".lie-submenu-confirm");
      const rect=button?.getBoundingClientRect(),x=rect?rect.left+rect.width/2:0,y=rect?rect.top+rect.height/2:0;
      const hit=rect?document.elementFromPoint(x,y):null;
      return {openedConnected:!!opened?.isConnected,currentSame:opened===current,
        buttonConnected:!!button?.isConnected,hit:!!hit&&button.contains(hit)};
    })()`);
    record("accept-connected-hit", gate.openedConnected && gate.currentSame
      && gate.buttonConnected && gate.hit, gate, true);
    await cdp.click(point.x, point.y);
    for (let attempt = 0; attempt < 30; attempt++) {
      if (!(await evaluate('!!document.querySelector(".lie-submenu")'))) {
        ownsPanel = false;
        return;
      }
      await pause(100);
    }
    throw new JourneyStop("Size panel did not close after real accept");
  };
  const restoreFault = async () => evaluate(`(() => {
    const diag=window.__liePpWriteAddressDiag,fault=diag?.fault;
    if(!fault)return {restored:true,kind:null,cacheRestored:true,pairRestored:true};
    const plugin=app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    if(fault.kind==="stale"){
      if(fault.hadOwnPair)Object.defineProperty(plugin,"pairLivePreviewBlock",fault.pairDescriptor);
      else delete plugin.pairLivePreviewBlock;
    }
    if(fault.image&&fault.originalCache)plugin.postProcessorLocations.set(fault.image,fault.originalCache);
    const result={restored:true,kind:fault.kind,
      cacheRestored:!fault.image||!fault.originalCache||plugin.postProcessorLocations.get(fault.image)===fault.originalCache,
      pairRestored:fault.kind!=="stale"||plugin.pairLivePreviewBlock===fault.originalPair};
    diag.fault=null;return result;
  })()`);
  const injectMissingCache = async () => evaluate(`(() => {
    const diag=window.__liePpWriteAddressDiag,plugin=app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    const image=diag?.openedImage,entry=image?plugin.postProcessorLocations.get(image):null;
    if(!diag||!image||!entry||diag.fault)return {armed:false};
    diag.fault={kind:"missing",image,originalCache:entry};
    plugin.postProcessorLocations.delete(image);
    return {armed:!plugin.postProcessorLocations.has(image),imageConnected:image.isConnected,
      postProcessor:!!image.closest(".markdown-rendered"),sourceUnchanged:true};
  })()`);
  const injectStaleCache = async () => evaluate(`(() => {
    const diag=window.__liePpWriteAddressDiag,plugin=app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    const editor=app.workspace.activeEditor?.editor,cm=editor?.cm,image=diag?.openedImage;
    const originalCache=image?plugin.postProcessorLocations.get(image):null;
    if(!diag||!cm||!image||!originalCache||diag.fault)return {armed:false};
    const pairDescriptor=Object.getOwnPropertyDescriptor(plugin,"pairLivePreviewBlock");
    const hadOwnPair=Object.prototype.hasOwnProperty.call(plugin,"pairLivePreviewBlock");
    const originalPair=plugin.pairLivePreviewBlock;
    const staleLocation=${JSON.stringify(fixture.staleLocation)};
    plugin.postProcessorLocations.set(image,{doc:cm.state.doc,location:staleLocation});
    const blocked=function(){plugin.postProcessorLocations.delete(image);return null;};
    Object.defineProperty(blocked,"__liePpWriteAddressFault",{value:true});
    plugin.pairLivePreviewBlock=blocked;
    diag.fault={kind:"stale",image,originalCache,hadOwnPair,pairDescriptor,originalPair};
    const cached=plugin.postProcessorLocations.get(image);
    return {armed:plugin.pairLivePreviewBlock===blocked&&blocked.__liePpWriteAddressFault===true,
      imageConnected:image.isConnected,docCurrent:cached?.doc===cm.state.doc,
      staleFilename:cached?.location?.filename??null,
      differentBasename:(cached?.location?.filename||"").split("/").pop()!==image.src.split("/").pop()};
  })()`);

  const forceFixtureSource = async (expected) => {
    let state = await sourceState();
    if (state.file !== FIXTURE) return;
    if (state.buffer !== expected) {
      await evaluate(`(() => {const editor=app.workspace.activeEditor?.editor;
        if(!editor)return false;editor.setValue(${JSON.stringify(expected)});return true;})()`);
    }
    for (let attempt = 0; attempt < 48; attempt++) {
      state = await sourceState();
      if (state.file === FIXTURE && state.buffer === expected && state.disk === expected) return;
      await wait(250);
    }
    throw new Error("fixture recovery did not settle");
  };
  recoverJourney = async () => {
    if (!probeArmed) return;
    await restoreFault();
    if (ownsPanel) {
      try {
        await cdp.press("Escape");
        await wait(250);
      } catch { /* the owned fallback below remains */ }
      const stillOpen = await evaluate('!!document.querySelector(".lie-submenu")');
      if (stillOpen) {
        await evaluate(`(() => {const plugin=app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          plugin?.closeSubmenu?.(false);return true;})()`);
        await wait(200);
      }
      ownsPanel = false;
    }
    if (fixture) await forceFixtureSource(fixture.source);
    await resetProbe();
    if (ownsInteraction) {
      await cdp.hover(4, 4);
      await evaluate(`(() => {const plugin=app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        plugin?.dismissToolbar?.();if(plugin)plugin.activeImage=null;return true;})()`);
      await wait(200);
    }
    await evaluate(`(() => {const plugin=app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      plugin?.refreshLivePreviewDecorations?.();return true;})()`);
    await wait(450);
  };

  const focusEditorForUndo = async () => {
    await evaluate(`(() => {const cm=app.workspace.activeEditor?.editor?.cm;if(!cm)return false;
      const line=cm.state.doc.line(14);cm.dispatch({selection:{anchor:line.from},scrollIntoView:true});return true;})()`);
    await pause(300);
    const point = await evaluate(`(() => {
      const lines=[...document.querySelectorAll(".workspace-leaf.mod-active .markdown-source-view .cm-line")];
      const line=lines.find((node)=>(node.textContent||"").startsWith("Parking line."));
      if(!line)return null;const rect=line.getBoundingClientRect();
      if(rect.width<=0||rect.height<=0||rect.bottom<=0||rect.top>=innerHeight)return null;
      return {x:rect.left+Math.min(30,rect.width/2),y:rect.top+rect.height/2};
    })()`);
    if (!point) return { clicked: false, cmFocused: false, activeInCm: false };
    await cdp.click(point.x, point.y);
    await pause(180);
    return evaluate(`(() => {const cm=app.workspace.activeEditor?.editor?.cm;
      return {clicked:true,cmFocused:!!cm?.hasFocus,activeInCm:!!cm?.dom?.contains(document.activeElement)};})()`);
  };

  const runSuccess = async (target, record) => {
    const before = (await settleSource(fixture.source, target.kind + " before")).buffer;
    await beginSizePanel(target, target.writeWidth, record);
    const openState = await sourceState();
    record("source-stable-open", openState.buffer === before && openState.disk === before
      && openState.records.length === 0, {
      bufferSame: openState.buffer === before,
      diskSame: openState.disk === before,
      records: openState.records.length,
    }, true);
    await acceptSizePanel(target, record);

    const replacement = replacementFor(target, target.writeWidth);
    const expected = replaceExactTarget(before, target, replacement);
    const after = await settleBufferDisk(target.kind + " commit");
    const records = after.records ?? [];
    record("single-tagged-write", records.length === 1, { count: records.length });
    const change = records[0]?.changes?.[0] ?? null;
    record("exact-transaction-change", records.length === 1 && records[0].docChanged === true
      && records[0].changes.length === 1
      && change.fromA === target.absoluteFrom && change.toA === target.absoluteTo
      && change.insert === replacement, {
      count: records.length,
      docChanged: records[0]?.docChanged ?? null,
      changes: records[0]?.changes ?? null,
      expected: { fromA: target.absoluteFrom, toA: target.absoluteTo, insert: replacement },
    });
    const beforeLines = before.split("\n");
    const afterLines = String(after.buffer).split("\n");
    const peersSame = fixture.sameBasenameLines.filter((line) => line !== target.line)
      .every((line) => beforeLines[line] === afterLines[line]);
    const prefixSame = String(after.buffer).slice(0, target.absoluteFrom) === before.slice(0, target.absoluteFrom);
    const suffixSame = String(after.buffer).slice(target.absoluteFrom + replacement.length)
      === before.slice(target.absoluteTo);
    record("exact-target-source-only", after.buffer === expected && prefixSame && suffixSame && peersSame, {
      fullSourceExact: after.buffer === expected,
      prefixSame,
      suffixSame,
      peersSame,
      targetLine: afterLines[target.line] ?? null,
    });
    record("buffer-disk-settled", after.buffer === after.disk && after.buffer === expected, {
      bufferDiskSame: after.buffer === after.disk,
      expected: after.buffer === expected,
    });

    const updatedTarget = { ...target, embed: replacement, ...sourceAddress(expected, target.line, replacement) };
    const renderGate = await waitCacheGate(updatedTarget, expected);
    await cdp.hover(4, 4);
    const updatedPoint = await waitTargetPoint(updatedTarget, target.kind + " updated");
    await cdp.hover(updatedPoint.x, updatedPoint.y);
    await pause(300);
    const rendered = await evaluate(`(() => {
      ${imageLocatorDeclaration(updatedTarget)}
      const plugin=app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}],image=resolveImage();
      const area=image?.closest(".lie-image-area"),owner=image?.closest(".internal-embed.image-embed.lie-embed");
      const inset=owner?.querySelector(".lie-toolbar-postprocessor");
      const floating=document.querySelector(".lie-toolbar-floating");
      const visible=(element)=>{if(!element?.isConnected)return false;const r=element.getBoundingClientRect(),s=getComputedStyle(element);
        return r.width>0&&r.height>0&&s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity)>0;};
      return {connected:!!image?.isConnected,width:area?Math.round(area.getBoundingClientRect().width):null,
        activeSame:plugin?.activeImage===image,insetVisible:visible(inset),floatingVisible:visible(floating),
        floatingSame:plugin?.toolbar?.getActiveImage?.()===image};
    })()`);
    const expectFloating = contract.expected.pluginVersion === "0.6.16" || target.candidateFloating;
    const presentationCorrect = expectFloating
      ? rendered.floatingVisible && !rendered.insetVisible && rendered.activeSame && rendered.floatingSame
      : rendered.insetVisible && !rendered.floatingVisible && rendered.activeSame;
    record("target-rerendered", cacheGateOk(renderGate) && rendered.connected
      && Math.abs(rendered.width - target.writeWidth) <= 1 && presentationCorrect, {
      cacheExact: cacheGateOk(renderGate),
      connected: rendered.connected,
      width: rendered.width,
      expectedWidth: target.writeWidth,
      presentationCorrect,
    });

    const focus = await focusEditorForUndo();
    record("undo-focus", focus.clicked && focus.cmFocused && focus.activeInCm, focus, true);
    const mac = /Mac/u.test(original.platform);
    await cdp.keyChord("z", mac ? { meta: true } : { ctrl: true });
    const undone = await settleSource(before, target.kind + " undo");
    record("single-real-undo", undone.buffer === before && undone.disk === before
      && (undone.records?.length ?? 0) === 1, {
      exactSource: undone.buffer === before && undone.disk === before,
      taggedWritesRemain: undone.records?.length ?? null,
      chord: mac ? "Meta+Z" : "Ctrl+Z",
    });
  };

  const runNegative = async (target, width, kind, record) => {
    const before = (await settleSource(fixture.source, kind + " before")).buffer;
    await beginSizePanel(target, width, record);
    const openState = await sourceState();
    record("source-stable-open", openState.buffer === before && openState.disk === before
      && openState.records.length === 0, {
      bufferSame: openState.buffer === before,
      diskSame: openState.disk === before,
      records: openState.records.length,
    }, true);
    const fault = kind === "missing" ? await injectMissingCache() : await injectStaleCache();
    record("fault-armed", fault.armed && fault.imageConnected
      && (kind === "missing" ? fault.postProcessor : fault.docCurrent && fault.differentBasename), fault, true);
    await acceptSizePanel(target, record);
    const after = await settleBufferDisk(kind + " attempted commit");
    record("zero-tagged-write", (after.records?.length ?? -1) === 0, {
      count: after.records?.length ?? null,
    });
    record("source-byte-identical", after.buffer === before && after.disk === before, {
      bufferSame: after.buffer === before,
      diskSame: after.disk === before,
    });
    const restored = await restoreFault();
    record("fault-restored", restored.restored && restored.cacheRestored && restored.pairRestored, restored);
  };

  try {
    assertNotInterrupted();
    const identity = await installedIdentity();
    cdp = await connectOptical();
    const runtime = await evaluate(`(() => {
      const plugin=app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const userAgentVersion=navigator.userAgent.match(/obsidian\\/([0-9.]+)/i)?.[1]??null;
      return {vault:app.vault.getName(),pluginVersion:plugin?.manifest?.version??null,
        obsidianVersion:app.version??userAgentVersion,platform:navigator.platform??"",
        targetTitle:document.title};
    })()`);
    const expectedVersion = CAPTURE_ONLY ? process.env.LIE_EXPECTED_VERSION : identity.version;
    const expectedObsidian = CAPTURE_ONLY
      ? process.env.LIE_EXPECTED_OBSIDIAN_VERSION
      : runtime.obsidianVersion;
    const expectedHashes = CAPTURE_ONLY ? {
      main: process.env.LIE_EXPECTED_MAIN_SHA256,
      manifest: process.env.LIE_EXPECTED_MANIFEST_SHA256,
      styles: process.env.LIE_EXPECTED_STYLES_SHA256,
    } : identity.hashes;
    if (!expectedVersion || !expectedObsidian
      || Object.values(expectedHashes).some((value) => !/^[a-f0-9]{64}$/u.test(value || ""))) {
      throw new Error("capture identity environment is missing or invalid");
    }
    contract.expected = {
      pluginVersion: expectedVersion,
      obsidianVersion: expectedObsidian,
      hashes: expectedHashes,
    };
    contract.environment = {
      pluginVersion: runtime.pluginVersion,
      obsidianVersion: runtime.obsidianVersion,
      hashes: identity.hashes,
      target: cdp.targetInfo,
      vault: runtime.vault,
      platform: runtime.platform,
    };
    hardGate("target", cdp.targetInfo.matchingPageCount === 1
      && runtime.vault === "vault-image-toolbar", {
      matchingPageCount: cdp.targetInfo.matchingPageCount,
      vault: runtime.vault,
    });
    hardGate("plugin-version", runtime.pluginVersion === expectedVersion
      && identity.version === expectedVersion, runtime.pluginVersion);
    hardGate("obsidian-version", runtime.obsidianVersion === expectedObsidian, runtime.obsidianVersion);
    hardGate("build-hashes", canonicalJson(identity.hashes) === canonicalJson(expectedHashes), identity.hashes);

    original = await evaluate(`(() => {
      const leaf=app.workspace.activeLeaf,editor=leaf?.view?.editor??null,root=leaf?.view?.containerEl??null;
      const scroller=root?.querySelector(".markdown-source-view .cm-scroller,.markdown-reading-view .markdown-preview-view")??null;
      const plugin=app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      return {file:app.workspace.getActiveFile()?.path??null,mode:leaf?.view?.getMode?.()??null,
        viewState:leaf?.getViewState()??null,
        selection:editor?{anchor:editor.getCursor("anchor"),head:editor.getCursor("head")}:null,
        cursor:editor?.getCursor()??null,scrollTop:scroller?.scrollTop??null,scrollLeft:scroller?.scrollLeft??null,
        useMarkdownLinks:!!app.vault.getConfig("useMarkdownLinks"),documentFocus:document.hasFocus(),
        viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
        settings:plugin?JSON.parse(JSON.stringify(plugin.settings)):null,
        pluginLoaded:!!plugin,activeImage:!!plugin?.activeImage,
        refs:{submenu:!!plugin?.submenu,filterPanel:!!plugin?.filterPanel,
          classPanel:!!plugin?.classPanel,cropEditor:!!plugin?.cropEditor},
        orphans:document.querySelectorAll(${JSON.stringify(ORPHAN_SELECTOR)}).length,
        hook:!!window.__liePpWriteAddressDiag,
        paths:${JSON.stringify(KNOWN_PATHS)}.filter((value)=>!!app.vault.getAbstractFileByPath(value)),
        platform:navigator.platform??""};
    })()`);
    hardGate("preflight-clean", original.pluginLoaded && !original.activeImage
      && !Object.values(original.refs).some(Boolean) && original.orphans === 0
      && !original.hook && original.paths.length === 0, {
      pluginLoaded: original.pluginLoaded,
      activeImage: original.activeImage,
      refs: original.refs,
      orphans: original.orphans,
      hook: original.hook,
      paths: original.paths,
    });

    fixture = buildFixture(original.useMarkdownLinks);
    ownsKnownPaths = true;
    await cdp.focusEmulation(true);
    focusArmed = true;
    await evaluate(`(async () => {
      const vault=app.vault;
      const sampleA=vault.getAbstractFileByPath("images/sample-landscape.png");
      const sampleB=vault.getAbstractFileByPath("images/sample-square.png");
      if(!sampleA||!sampleB)throw new Error("sample assets are missing");
      await vault.createFolder(${JSON.stringify(ASSET_DIR_A)});
      await vault.createFolder(${JSON.stringify(ASSET_DIR_B)});
      await vault.createBinary(${JSON.stringify(ASSET_A)},await vault.readBinary(sampleA));
      await vault.createBinary(${JSON.stringify(ASSET_B)},await vault.readBinary(sampleB));
      const note=await vault.create(${JSON.stringify(FIXTURE)},${JSON.stringify(fixture.source)});
      const leaf=app.workspace.activeLeaf;await leaf.openFile(note,{active:true});
      const state=leaf.getViewState();
      await leaf.setViewState({...state,state:{...state.state,file:note.path,mode:"source",source:false}});
      return true;
    })()`);
    await pause(900);
    await settleSource(fixture.source, "fixture setup");
    const fixtureGate = await evaluate(`(async () => {
      const vault=app.vault,a=vault.getAbstractFileByPath(${JSON.stringify(ASSET_A)}),
        b=vault.getAbstractFileByPath(${JSON.stringify(ASSET_B)});
      const bytesA=a?new Uint8Array(await vault.readBinary(a)):null;
      const bytesB=b?new Uint8Array(await vault.readBinary(b)):null;
      return {a:!!a,b:!!b,sameBasename:a?.name===b?.name,distinctPaths:a?.path!==b?.path,
        distinctBytes:!!bytesA&&!!bytesB&&(bytesA.length!==bytesB.length
          ||bytesA.some((value,index)=>value!==bytesB[index])),
        linkFormat:!!app.vault.getConfig("useMarkdownLinks")};
    })()`);
    const fixtureLines = fixture.source.split("\n");
    hardGate("fixture-assets", fixtureGate.a && fixtureGate.b && fixtureGate.sameBasename
      && fixtureGate.distinctPaths && fixtureGate.distinctBytes
      && fixtureGate.linkFormat === original.useMarkdownLinks
      && fixtureLines[6].slice(fixtureLines[6].indexOf(fixture.table.embed),
        fixtureLines[6].indexOf(fixture.table.embed) + fixture.table.embed.length) === fixture.table.embed
      && fixtureLines[7].slice(fixtureLines[7].indexOf(fixture.table.embed),
        fixtureLines[7].indexOf(fixture.table.embed) + fixture.table.embed.length) === fixture.table.embed,
    {
      assets: fixtureGate,
      tableEmbedsByteIdentical: fixtureLines[6].includes(fixture.table.embed)
        && fixtureLines[7].includes(fixture.table.embed),
    });
    const fingerprint = await evaluate(`(() => {
      const plugin=app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      return {cache:!!plugin?.postProcessorLocations,
        pairing:typeof plugin?.pairLivePreviewBlock==="function",
        location:typeof plugin?.locateImage==="function",
        taggedWriter:typeof plugin?.writeToSource==="function"};
    })()`);
    hardGate("runtime-fingerprint", Object.values(fingerprint).every(Boolean), fingerprint);
    probeArmed = await armProbe();
    hardGate("instrumentation", probeArmed === true, { armed: probeArmed });
    contract.setupValid = true;

    await runJourney("success:table-identical-second",
      (record) => runSuccess(fixture.table, record));
    await runJourney("success:callout-path-collision-second",
      (record) => runSuccess(fixture.callout, record));
    await runJourney("fail-closed:missing-cache",
      (record) => runNegative(fixture.table, 257, "missing", record));
    await runJourney("fail-closed:stale-different-basename",
      (record) => runNegative(fixture.callout, 267, "stale", record));
    await runJourney("diagnostics", async (record) => {
      await cdp.hover(4, 4);
      await pause(350);
      const diagnostics = await evaluate(`(() => {
        const diag=window.__liePpWriteAddressDiag,plugin=app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        return {errors:[...(diag?.errors??[])],consoleErrors:[...(diag?.consoleErrors??[])],
          refs:{submenu:!!plugin?.submenu,filterPanel:!!plugin?.filterPanel,
            classPanel:!!plugin?.classPanel,cropEditor:!!plugin?.cropEditor},
          orphans:document.querySelectorAll(${JSON.stringify(ORPHAN_SELECTOR)}).length};
      })()`);
      record("no-renderer-errors", diagnostics.errors.length === 0
        && diagnostics.consoleErrors.length === 0, {
        errors: diagnostics.errors.slice(0, 5),
        consoleErrors: diagnostics.consoleErrors.slice(0, 5),
      });
      record("no-orphans-before-cleanup", !Object.values(diagnostics.refs).some(Boolean)
        && diagnostics.orphans === 0, { refs: diagnostics.refs, orphans: diagnostics.orphans });
    });
  } catch (error) {
    if (error instanceof Interrupted) {
      contract.aborted = error.signal;
    } else if (!contract.fatal) {
      contract.fatal = errorShape(error);
    }
  } finally {
    if (cdp) {
      await cleanupStep("fault restore", async () => {
        if (probeArmed) await restoreFault();
      });
      await cleanupStep("owned panel close", async () => {
        if (!ownsPanel) return;
        try {
          await cdp.press("Escape");
          await wait(250);
        } catch { /* owned silent fallback below */ }
        const stillOpen = await evaluate('!!document.querySelector(".lie-submenu")');
        if (stillOpen) {
          await evaluate(`(() => {const plugin=app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
            plugin?.closeSubmenu?.(false);return true;})()`);
        }
        ownsPanel = false;
      });
      await cleanupStep("owned interaction dismiss", async () => {
        if (!ownsInteraction) return;
        await evaluate(`(() => {const plugin=app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          plugin?.dismissToolbar?.();if(plugin)plugin.activeImage=null;return true;})()`);
      });
      await cleanupStep("probe disarm", async () => {
        if (!probeArmed) return;
        const report = await evaluate(`(() => {
          const diag=window.__liePpWriteAddressDiag;if(!diag)throw new Error("owned diagnostic hook missing");
          removeEventListener("error",diag.onError);removeEventListener("unhandledrejection",diag.onReject);
          console.error=diag.originalConsoleError;
          if(diag.dispatchDescriptor)Object.defineProperty(diag.cm,"dispatchTransactions",diag.dispatchDescriptor);
          else delete diag.cm.dispatchTransactions;
          const result={errors:[...diag.errors],consoleErrors:[...diag.consoleErrors],fault:!!diag.fault};
          delete window.__liePpWriteAddressDiag;return result;
        })()`);
        probeArmed = false;
        if (report.fault || report.errors.length || report.consoleErrors.length) {
          throw new Error("renderer diagnostics during cleanup: " + JSON.stringify(report));
        }
      });
      await cleanupStep("view restore", async () => {
        if (!original?.viewState) return;
        await evaluate(`(async () => {await app.workspace.activeLeaf.setViewState(
          ${JSON.stringify(original.viewState)});return true;})()`, { timeoutMs: 20000 });
        await wait(650);
      });
      await cleanupStep("selection and scroll restore", async () => {
        if (!original) return;
        await evaluate(`(() => {
          const leaf=app.workspace.activeLeaf,editor=leaf?.view?.editor??null;
          const selection=${JSON.stringify(original.selection)};
          if(selection&&!editor)throw new Error("original editor missing");
          if(selection)editor.setSelection(selection.anchor,selection.head);
          const root=leaf?.view?.containerEl??null;
          const scroller=root?.querySelector(".markdown-source-view .cm-scroller,.markdown-reading-view .markdown-preview-view")??null;
          const top=${JSON.stringify(original.scrollTop)},left=${JSON.stringify(original.scrollLeft)};
          if((top!==null||left!==null)&&!scroller)throw new Error("original scroller missing");
          if(scroller&&top!==null)scroller.scrollTop=top;if(scroller&&left!==null)scroller.scrollLeft=left;
          return true;
        })()`);
      });
      await cleanupStep("known files and empty directories", async () => {
        if (!ownsKnownPaths) return;
        await evaluate(`(async () => {
          const vault=app.vault;
          for(const path of ${JSON.stringify(KNOWN_FILES)}){
            const item=vault.getAbstractFileByPath(path);
            if(item){if(Array.isArray(item.children))throw new Error("expected test file at "+path);await vault.delete(item);}
          }
          for(const path of ${JSON.stringify([...KNOWN_DIRS].reverse())}){
            const item=vault.getAbstractFileByPath(path);
            if(!item)continue;
            if(!Array.isArray(item.children))throw new Error("expected test directory at "+path);
            if(item.children.length!==0)throw new Error("test directory is not empty: "+path);
          }
          return true;
        })()`);
        await removeKnownEmptyDirectories();
        let remaining = [];
        for (let attempt = 0; attempt < 40; attempt++) {
          remaining = await evaluate(`(() => ${JSON.stringify(KNOWN_DIRS)}
            .filter((value)=>!!app.vault.getAbstractFileByPath(value)))()`);
          if (remaining.length === 0) break;
          await wait(100);
        }
        if (remaining.length) throw new Error("vault index retained test directories: " + remaining.join(","));
      });
      await cleanupStep("focus emulation restore", async () => {
        if (!focusArmed) return;
        await cdp.focusEmulation(false);
        focusArmed = false;
      });
      await cleanupStep("final settle", () => wait(500));
      await cleanupStep("cleanup snapshot", async () => {
        contract.cleanup = await evaluate(`(() => {
          const leaf=app.workspace.activeLeaf,editor=leaf?.view?.editor??null,root=leaf?.view?.containerEl??null;
          const scroller=root?.querySelector(".markdown-source-view .cm-scroller,.markdown-reading-view .markdown-preview-view")??null;
          const plugin=app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          return {file:app.workspace.getActiveFile()?.path??null,mode:leaf?.view?.getMode?.()??null,
            viewState:leaf?.getViewState()??null,
            selection:editor?{anchor:editor.getCursor("anchor"),head:editor.getCursor("head")}:null,
            cursor:editor?.getCursor()??null,scrollTop:scroller?.scrollTop??null,scrollLeft:scroller?.scrollLeft??null,
            useMarkdownLinks:!!app.vault.getConfig("useMarkdownLinks"),documentFocus:document.hasFocus(),
            viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
            settings:plugin?JSON.parse(JSON.stringify(plugin.settings)):null,
            fixtureExists:!!app.vault.getAbstractFileByPath(${JSON.stringify(FIXTURE)}),
            assetPaths:${JSON.stringify([...KNOWN_FILES.slice(1), ...KNOWN_DIRS])}
              .filter((value)=>!!app.vault.getAbstractFileByPath(value)),
            hook:!!window.__liePpWriteAddressDiag,fault:!!window.__liePpWriteAddressDiag?.fault,
            activeImage:!!plugin?.activeImage,
            refs:{submenu:!!plugin?.submenu,filterPanel:!!plugin?.filterPanel,
              classPanel:!!plugin?.classPanel,cropEditor:!!plugin?.cropEditor},
            orphans:document.querySelectorAll(${JSON.stringify(ORPHAN_SELECTOR)}).length};
        })()`);
      });
      await cleanupStep("cleanup validation", async () => {
        if (!original || !contract.cleanup) throw new Error("cleanup snapshot prerequisites missing");
        const restored = contract.cleanup;
        const valid = restored.file === original.file && restored.mode === original.mode
          && canonicalJson(restored.viewState) === canonicalJson(original.viewState)
          && canonicalJson(restored.selection) === canonicalJson(original.selection)
          && canonicalJson(restored.cursor) === canonicalJson(original.cursor)
          && (restored.scrollTop === original.scrollTop
            || (Number.isFinite(restored.scrollTop) && Number.isFinite(original.scrollTop)
              && Math.abs(restored.scrollTop - original.scrollTop) <= 1))
          && (restored.scrollLeft === original.scrollLeft
            || (Number.isFinite(restored.scrollLeft) && Number.isFinite(original.scrollLeft)
              && Math.abs(restored.scrollLeft - original.scrollLeft) <= 1))
          && restored.useMarkdownLinks === original.useMarkdownLinks
          && restored.documentFocus === original.documentFocus
          && canonicalJson(restored.viewport) === canonicalJson(original.viewport)
          && canonicalJson(restored.settings) === canonicalJson(original.settings)
          && !restored.fixtureExists && restored.assetPaths.length === 0
          && !restored.hook && !restored.fault && !restored.activeImage
          && !Object.values(restored.refs).some(Boolean) && restored.orphans === 0;
        if (!valid) throw new Error("cleanup state differs: " + JSON.stringify(restored));
      });
    }
    if (cleanupErrors.length) {
      contract.cleanupError = cleanupErrors.map(errorShape);
      if (!contract.fatal) contract.fatal = {
        name: "AggregateError",
        message: "guard cleanup failed: " + cleanupErrors.map((error) => error.message).join(" | ").slice(0, 1800),
      };
    }
    contract.cleanupValid = cleanupErrors.length === 0 && !!contract.cleanup;
    if (interruptedSignal && !contract.aborted) contract.aborted = interruptedSignal;

    const existingJourneys = new Set(contract.journeys.map((journey) => journey.id));
    for (const id of JOURNEY_IDS) {
      if (existingJourneys.has(id)) continue;
      const message = contract.fatal?.message || (contract.aborted ? "aborted by " + contract.aborted : "not run");
      contract.journeys.push({ id, error: message });
      for (const suffix of ASSERTIONS_BY_JOURNEY[id]) {
        contract.assertions.push({ name: id + "." + suffix, ok: false, actual: { error: message } });
      }
    }
    contract.journeys.sort((a, b) => JOURNEY_IDS.indexOf(a.id) - JOURNEY_IDS.indexOf(b.id));
    const assertionByName = new Map(contract.assertions.map((assertion) => [assertion.name, assertion]));
    contract.assertions = ASSERTION_NAMES.map((name) => assertionByName.get(name)
      ?? { name, ok: false, actual: { error: "missing fixed assertion" } });
    const actualJourneyIds = contract.journeys.map((journey) => journey.id);
    const actualAssertionNames = contract.assertions.map((assertion) => assertion.name);
    contract.journeyContract = {
      expectedCount: JOURNEY_IDS.length,
      expectedIds: JOURNEY_IDS,
      actualCount: actualJourneyIds.length,
      actualIds: actualJourneyIds,
      missingIds: JOURNEY_IDS.filter((id) => !actualJourneyIds.includes(id)),
      unexpectedIds: actualJourneyIds.filter((id) => !JOURNEY_IDS.includes(id)),
      duplicateIds: actualJourneyIds.filter((id, index) => actualJourneyIds.indexOf(id) !== index),
      orderMatches: canonicalJson(actualJourneyIds) === canonicalJson(JOURNEY_IDS),
      complete: canonicalJson(actualJourneyIds) === canonicalJson(JOURNEY_IDS),
    };
    contract.assertionContract = {
      expectedCount: ASSERTION_NAMES.length,
      expectedNames: ASSERTION_NAMES,
      actualCount: actualAssertionNames.length,
      actualNames: actualAssertionNames,
      missingNames: ASSERTION_NAMES.filter((name) => !actualAssertionNames.includes(name)),
      unexpectedNames: actualAssertionNames.filter((name) => !ASSERTION_NAMES.includes(name)),
      duplicateNames: actualAssertionNames.filter((name, index) => actualAssertionNames.indexOf(name) !== index),
      orderMatches: canonicalJson(actualAssertionNames) === canonicalJson(ASSERTION_NAMES),
      complete: canonicalJson(actualAssertionNames) === canonicalJson(ASSERTION_NAMES),
    };

    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    try { cdp?.close(); } catch { /* best effort after cleanup */ }

    const encoded = canonicalJson(contract);
    console.log(MARKER + encoded);
    const productFailures = contract.assertions.filter((assertion) => !assertion.ok).length
      + contract.journeys.filter((journey) => Object.hasOwn(journey, "error")).length;
    const infrastructureFailure = !!contract.fatal || !!contract.aborted
      || !contract.setupValid || !contract.cleanupValid
      || !contract.journeyContract.complete || !contract.assertionContract.complete;
    const passed = contract.assertions.filter((assertion) => assertion.ok).length;
    console.log("\n" + passed + "/" + contract.assertions.length + " passed");
    if (infrastructureFailure) {
      console.log("post-processor write-address guard INFRASTRUCTURE_RED");
      process.exitCode = 2;
    } else if (productFailures) {
      console.log("post-processor write-address guard PRODUCT_RED");
      process.exitCode = CAPTURE_ONLY ? 0 : 1;
    } else {
      console.log("post-processor write-address guard OK");
      process.exitCode = 0;
    }
  }
}

main().catch((error) => {
  console.error("FATAL: guard escaped its result contract: " + String(error?.stack || error));
  process.exitCode = 2;
});
