#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import dns from "node:dns/promises";
import { copyFile, lstat, mkdtemp, readFile, realpath, rm, rmdir, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ID = "live-image-editor";
const GUARD_FIXTURE = "_toolbar-hosts-fixture.md";
const SOURCE_ADDRESS_FIXTURE = "_postprocessor-write-address-fixture.md";
const SOURCE_ADDRESS_DIRS = ["_postprocessor-write-address-a", "_postprocessor-write-address-b"];
const SOURCE_ADDRESS_FILES = [
  SOURCE_ADDRESS_FIXTURE,
  "_postprocessor-write-address-a/collision.png",
  "_postprocessor-write-address-b/collision.png",
];
const SOURCE_ADDRESS_HOOK = "__liePpWriteAddressDiag";
const SOURCE_ADDRESS_MARKER = "LIE_POSTPROCESSOR_WRITE_ADDRESS_CONTRACT=";
const OPTICAL_LOCK_ID = "__lie-toolbar-host-optical-lock";
const ARTIFACTS = ["main.js", "manifest.json", "styles.css"];
const SETTINGS_FILE = "data.json";
const APPEARANCE_FILE = "appearance.json";
const APPEARANCE_SNAPSHOT_FILE = "vault-appearance.json";
const APPEARANCE_SNAPSHOT_STATE_FILE = "vault-appearance-state.json";
const HASH_KEYS = { "main.js": "main", "manifest.json": "manifest", "styles.css": "styles" };
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
const EXPECTED_ASSERTION_NAMES = EXPECTED_JOURNEY_IDS.flatMap((id) => {
  const [kind, host, variant] = id.split(":");
  if (kind === "placement") {
    return [
      host + ".toolbar-hit",
      host + "." + (variant === "floating-above" ? "float-only-above" : "inset-only"),
      host + ".placement-no-write",
      host + ".placement-cleanup",
    ];
  }
  if (kind === "panel") {
    const prefix = host + "." + variant + ".";
    return [
      prefix + "button",
      prefix + "panel-painted",
      prefix + "connected-owner",
      prefix + "panel-travel",
      prefix + "escape-no-write",
      prefix + "cleanup",
    ];
  }
  if (kind === "reading-negative") {
    return [
      "reading." + host + ".no-ui",
      "reading." + host + ".no-write",
      "reading." + host + ".cleanup",
    ];
  }
  throw new Error("unknown expected journey ID " + id);
}).concat(["diagnostics.no-errors", "diagnostics.no-orphans"]);
const EXPECTED_ASSERTION_COUNT = EXPECTED_ASSERTION_NAMES.length;
const SOURCE_ADDRESS_ASSERTIONS_BY_JOURNEY = {
  "success:table-identical-second": [
    "cache-exact", "panel-open", "keyboard-preview-no-write", "source-stable-open",
    "accept-connected-hit", "single-tagged-write", "exact-transaction-change",
    "exact-target-source-only", "buffer-disk-settled", "target-rerendered",
    "undo-focus", "single-real-undo",
  ],
  "success:callout-path-collision-second": [
    "cache-exact", "panel-open", "keyboard-preview-no-write", "source-stable-open",
    "accept-connected-hit", "single-tagged-write", "exact-transaction-change",
    "exact-target-source-only", "buffer-disk-settled", "target-rerendered",
    "undo-focus", "single-real-undo",
  ],
  "fail-closed:missing-cache": [
    "cache-exact", "panel-open", "keyboard-preview-no-write", "source-stable-open",
    "fault-armed", "accept-connected-hit", "zero-tagged-write",
    "source-byte-identical", "fault-restored",
  ],
  "fail-closed:stale-different-basename": [
    "cache-exact", "panel-open", "keyboard-preview-no-write", "source-stable-open",
    "fault-armed", "accept-connected-hit", "zero-tagged-write",
    "source-byte-identical", "fault-restored",
  ],
  diagnostics: ["no-renderer-errors", "no-orphans-before-cleanup"],
};
const SOURCE_ADDRESS_JOURNEY_IDS = Object.keys(SOURCE_ADDRESS_ASSERTIONS_BY_JOURNEY);
const SOURCE_ADDRESS_ASSERTION_NAMES = SOURCE_ADDRESS_JOURNEY_IDS.flatMap((id) =>
  SOURCE_ADDRESS_ASSERTIONS_BY_JOURNEY[id].map((suffix) => id + "." + suffix)
);
const JOURNEY_CONTRACT_KEYS = [
  "actualCount", "actualIds", "complete", "duplicateIds",
  "expectedCount", "expectedIds", "missingIds", "orderMatches", "unexpectedIds",
];
const CLEANUP_KEYS = [
  "cursor", "file", "fixtureExists", "instrumentationExists", "mode", "orphans",
  "opticalStyleExists", "refs", "scrollTop", "selection", "settings", "themeConfig",
  "themeLockExists", "viewState", "viewport",
];
const CLEANUP_REF_KEYS = ["classPanel", "cropEditor", "filterPanel", "submenu"];
const SOURCE_ADDRESS_ASSERTION_CONTRACT_KEYS = [
  "actualCount", "actualNames", "complete", "duplicateNames",
  "expectedCount", "expectedNames", "missingNames", "orderMatches", "unexpectedNames",
];
const SOURCE_ADDRESS_CLEANUP_KEYS = [
  "activeImage", "assetPaths", "cursor", "documentFocus", "fault", "file",
  "fixtureExists", "hook", "mode", "orphans", "refs", "scrollLeft", "scrollTop",
  "selection", "settings", "useMarkdownLinks", "viewState", "viewport",
];
const MARKER = "LIE_TOOLBAR_HOST_CONTRACT=";
const CDP_PORT = 9223;
const CHILD_ABORT_GRACE_MS = 45000;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VAULT_DIR = path.join(ROOT, "vault-image-toolbar");
const APPEARANCE_DIR = path.join(VAULT_DIR, ".obsidian");
const INSTALLED_DIR = path.join(VAULT_DIR, ".obsidian/plugins", PLUGIN_ID);
const GUARD = path.join(ROOT, "tests/cdp/verify-toolbar-hosts.mjs");
const SOURCE_ADDRESS_GUARD = path.join(ROOT, "tests/cdp/verify-postprocessor-write-address.mjs");
const VAULT_NAME = path.basename(VAULT_DIR);
const CDP_HOST = process.env.CDP_HOST || "host.containers.internal";
const CDP_TARGET = process.env.CDP_TARGET || VAULT_NAME;
const ABSENT = Symbol("absent");
const ABSENT_JSON = { $absent: true };
const AUTHORIZED_ID_PATTERN = /^(Bug|Feature|Change|Decision) [1-9]\d*$/u;
let cdpEvaluationSlot = 0;

const HELP = [
  "Usage:",
  "  node tests/cdp/verify-release-differential.mjs \\",
  "    --baseline-dir <dir> --candidate-dir <dir> \\",
  "    --baseline-version <version> --candidate-version <version> \\",
  "    --expected-obsidian-version <version> \\",
  "    --baseline-main-sha256 <hash> --baseline-manifest-sha256 <hash> \\",
  "    --baseline-styles-sha256 <hash> \\",
  "    --candidate-main-sha256 <hash> --candidate-manifest-sha256 <hash> \\",
  "    --candidate-styles-sha256 <hash> \\",
  "    [--allow-envelope <json> --authorized-id <id> ...] [--report-only]",
  "",
  "SHA-256 values are 64 hexadecimal characters.",
  "Every authorized ID must be used by the envelope and every envelope ID must be authorized.",
  "",
  "Allow-envelope schema:",
  "  {\"entries\":[{\"id\":\"Bug 123\",\"path\":\"/journeys/0/result\",",
  "    \"baseline\":<exact JSON>,\"candidate\":<exact JSON>}]}",
  "  Missing values use {\"$absent\":true}. Paths are exact JSON Pointers; wildcards are invalid.",
  "",
  "--report-only permits unallowed deltas only when no allow-envelope is supplied.",
  "",
  "  node tests/cdp/verify-release-differential.mjs --self-test",
].join("\n");

class CliError extends Error {}

function parseSha256(values, flag) {
  const value = values.get(flag);
  if (!/^[0-9a-f]{64}$/iu.test(value)) {
    throw new CliError(flag + " must be a 64-character SHA-256");
  }
  return value.toLowerCase();
}

function parseSemver(value, flag) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(value);
  if (!match) throw new CliError(flag + " must be a release SemVer x.y.z");
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) {
    throw new CliError(flag + " exceeds safe SemVer integer range");
  }
  return parts;
}

function isDirectPatchSuccessor(baseline, candidate) {
  const [baseMajor, baseMinor, basePatch] = baseline;
  const [nextMajor, nextMinor, nextPatch] = candidate;
  return nextMajor === baseMajor && nextMinor === baseMinor && nextPatch === basePatch + 1;
}

function parseArgs(argv) {
  if (argv.includes("--self-test")) {
    if (argv.length !== 1) throw new CliError("--self-test cannot be combined with other options");
    return { help: false, selfTest: true };
  }
  const valueFlags = new Set([
    "--baseline-dir",
    "--candidate-dir",
    "--baseline-version",
    "--candidate-version",
    "--expected-obsidian-version",
    "--baseline-main-sha256",
    "--baseline-manifest-sha256",
    "--baseline-styles-sha256",
    "--candidate-main-sha256",
    "--candidate-manifest-sha256",
    "--candidate-styles-sha256",
    "--allow-envelope",
  ]);
  const values = new Map();
  const authorizedIds = [];
  let reportOnly = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--report-only") {
      if (reportOnly) throw new CliError("duplicate option --report-only");
      reportOnly = true;
      continue;
    }
    if (arg === "--authorized-id") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new CliError(arg + " requires a value");
      if (!AUTHORIZED_ID_PATTERN.test(value)) {
        throw new CliError("--authorized-id must be Bug|Feature|Change|Decision followed by a number");
      }
      if (authorizedIds.includes(value)) throw new CliError("duplicate --authorized-id " + value);
      authorizedIds.push(value);
      continue;
    }
    if (!valueFlags.has(arg)) throw new CliError("unknown option " + arg);
    if (values.has(arg)) throw new CliError("duplicate option " + arg);
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw new CliError(arg + " requires a value");
    values.set(arg, value);
  }

  if (help) return { help: true };
  const required = [
    "--baseline-dir",
    "--candidate-dir",
    "--baseline-version",
    "--candidate-version",
    "--expected-obsidian-version",
    "--baseline-main-sha256",
    "--baseline-manifest-sha256",
    "--baseline-styles-sha256",
    "--candidate-main-sha256",
    "--candidate-manifest-sha256",
    "--candidate-styles-sha256",
  ];
  const missing = required.filter((flag) => !values.has(flag));
  if (missing.length) throw new CliError("missing required option(s): " + missing.join(", "));

  const baselineVersion = values.get("--baseline-version");
  const candidateVersion = values.get("--candidate-version");
  const baselineSemver = parseSemver(baselineVersion, "--baseline-version");
  const candidateSemver = parseSemver(candidateVersion, "--candidate-version");
  if (!isDirectPatchSuccessor(baselineSemver, candidateSemver)) {
    throw new CliError(
      "candidate-version must increment baseline-version by exactly one patch",
    );
  }
  const baselineHashes = {
    "main.js": parseSha256(values, "--baseline-main-sha256"),
    "manifest.json": parseSha256(values, "--baseline-manifest-sha256"),
    "styles.css": parseSha256(values, "--baseline-styles-sha256"),
  };
  const candidateHashes = {
    "main.js": parseSha256(values, "--candidate-main-sha256"),
    "manifest.json": parseSha256(values, "--candidate-manifest-sha256"),
    "styles.css": parseSha256(values, "--candidate-styles-sha256"),
  };
  if (canonicalJson(baselineHashes) === canonicalJson(candidateHashes)) {
    throw new CliError("baseline and candidate expected artifact fingerprints must differ");
  }
  const allowEnvelope = values.has("--allow-envelope")
    ? path.resolve(values.get("--allow-envelope"))
    : null;
  if (!!allowEnvelope !== (authorizedIds.length > 0)) {
    throw new CliError("--allow-envelope and at least one --authorized-id must be supplied together");
  }

  return {
    help: false,
    baselineDir: path.resolve(values.get("--baseline-dir")),
    candidateDir: path.resolve(values.get("--candidate-dir")),
    baselineVersion,
    candidateVersion,
    expectedObsidianVersion: values.get("--expected-obsidian-version"),
    baselineHashes,
    candidateHashes,
    allowEnvelope,
    authorizedIds,
    reportOnly,
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function boundedText(value, limit = 4000) {
  const text = String(value);
  return text.length <= limit ? text : text.slice(0, limit) + "…[truncated]";
}

function boundedJson(value, limit = 8000) {
  return boundedText(canonicalJson(value), limit);
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

async function sha256File(file) {
  return sha256(await readFile(file));
}

function isContained(parent, target) {
  const relative = path.relative(parent, target);
  return relative !== ""
    && !path.isAbsolute(relative)
    && relative !== ".."
    && !relative.startsWith(".." + path.sep);
}

function pathsOverlap(first, second) {
  return first === second || isContained(first, second) || isContained(second, first);
}

async function safeDirectory(directory, label) {
  const absolute = path.resolve(directory);
  const metadata = await lstat(absolute);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(label + " must be a non-symlink directory: " + absolute);
  }
  const resolved = await realpath(absolute);
  if (resolved !== absolute) {
    throw new Error(label + " path contains a symlink: " + absolute);
  }
  return resolved;
}

async function removeKnownSourceAddressDirectories() {
  const vault = await safeDirectory(VAULT_DIR, "source-address vault root");
  for (const name of [...SOURCE_ADDRESS_DIRS].reverse()) {
    const directory = path.resolve(vault, name);
    if (!isContained(vault, directory)) {
      throw new Error("source-address directory escapes vault: " + name);
    }
    let metadata;
    try { metadata = await lstat(directory); }
    catch (error) { if (error?.code === "ENOENT") continue; throw error; }
    if (metadata.isSymbolicLink() || !metadata.isDirectory()
      || await realpath(directory) !== directory) {
      throw new Error("source-address path must be an exact non-symlink directory: " + name);
    }
    await rmdir(directory);
  }
}

async function safeFile(file, directory, label, allowMissing = false) {
  const absolute = path.resolve(file);
  if (!isContained(directory, absolute)) {
    throw new Error(label + " escapes directory " + directory);
  }
  let metadata;
  try {
    metadata = await lstat(absolute);
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") return { path: absolute, exists: false };
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(label + " must be a non-symlink file: " + absolute);
  }
  if (metadata.nlink > 1) {
    throw new Error(label + " must not be hard-linked: " + absolute);
  }
  const resolved = await realpath(absolute);
  if (resolved !== absolute || !isContained(directory, resolved)) {
    throw new Error(label + " real path escapes directory " + directory);
  }
  return { path: absolute, exists: true, dev: metadata.dev, ino: metadata.ino };
}

function aggregateArtifactHash(hashes) {
  return sha256(ARTIFACTS.map((name) => name + "\0" + hashes[name]).join("\0"));
}

async function inspectArtifacts(directory, expectedVersion, label) {
  const resolved = await safeDirectory(directory, label);

  const hashes = {};
  const targets = {};
  for (const name of ARTIFACTS) {
    const target = await safeFile(
      path.join(resolved, name),
      resolved,
      label + " " + name,
    );
    hashes[name] = await sha256File(target.path);
    targets[name] = { dev: target.dev, ino: target.ino };
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(resolved, "manifest.json"), "utf8"));
  } catch (error) {
    throw new Error(label + " manifest.json is invalid: " + error.message);
  }
  if (manifest.id !== PLUGIN_ID) {
    throw new Error(label + " manifest id " + JSON.stringify(manifest.id) + " is not " + PLUGIN_ID);
  }
  if (expectedVersion && manifest.version !== expectedVersion) {
    throw new Error(label + " manifest version " + JSON.stringify(manifest.version)
      + " does not match " + JSON.stringify(expectedVersion));
  }

  const aggregateHash = aggregateArtifactHash(hashes);
  return { directory: resolved, version: manifest.version, hashes, aggregateHash, targets };
}

function assertNoArtifactAliases(identities) {
  const seen = new Map();
  for (const [label, identity] of identities) {
    for (const name of ARTIFACTS) {
      const target = identity.targets[name];
      const key = target.dev + ":" + target.ino;
      const previous = seen.get(key);
      if (previous) {
        throw new CliError(
          label + "/" + name + " aliases " + previous + " by device/inode",
        );
      }
      seen.set(key, label + "/" + name);
    }
  }
}

function assertExpectedHashes(identity, expectedHashes, label) {
  if (canonicalJson(identity.hashes) !== canonicalJson(expectedHashes)) {
    throw new Error(label + " artifact hashes do not match caller-supplied SHA-256 values");
  }
}

function assertIdentity(actual, expected, label) {
  if (actual.version !== expected.version || canonicalJson(actual.hashes) !== canonicalJson(expected.hashes)) {
    throw new Error(label + " artifact identity changed: expected "
      + expected.version + "/" + expected.aggregateHash + ", got "
      + actual.version + "/" + actual.aggregateHash);
  }
}

async function copyArtifacts(source, destination, allowMissingDestination = false) {
  const sourceDirectory = await safeDirectory(source, "artifact copy source");
  const destinationDirectory = await safeDirectory(destination, "artifact copy destination");
  if (pathsOverlap(sourceDirectory, destinationDirectory)) {
    throw new Error("artifact copy source and destination overlap");
  }
  for (const name of ARTIFACTS) {
    const sourceFile = await safeFile(
      path.join(sourceDirectory, name),
      sourceDirectory,
      "artifact copy source " + name,
    );
    const destinationFile = await safeFile(
      path.join(destinationDirectory, name),
      destinationDirectory,
      "artifact copy destination " + name,
      allowMissingDestination,
    );
    await copyFile(sourceFile.path, destinationFile.path);
    const copiedFile = await safeFile(
      destinationFile.path,
      destinationDirectory,
      "copied artifact " + name,
    );
    if (await sha256File(copiedFile.path) !== await sha256File(sourceFile.path)) {
      throw new Error("copied artifact bytes differ for " + name);
    }
  }
}

async function inspectSettingsState(directory, label) {
  const resolved = await safeDirectory(directory, label + " directory");
  const file = await safeFile(
    path.join(resolved, SETTINGS_FILE),
    resolved,
    label + " " + SETTINGS_FILE,
    true,
  );
  if (!file.exists) return { exists: false, bytes: null, hash: null };
  const bytes = await readFile(file.path);
  return { exists: true, bytes, hash: sha256(bytes) };
}

function assertSettingsState(actual, expected, label) {
  if (actual.exists !== expected.exists
    || (expected.exists && !actual.bytes.equals(expected.bytes))) {
    throw new Error(label + " persisted settings bytes differ");
  }
}

async function restoreSettingsState(source, expected, destination, label) {
  const sourceDirectory = await safeDirectory(source, label + " source");
  const destinationDirectory = await safeDirectory(destination, label + " destination");
  if (pathsOverlap(sourceDirectory, destinationDirectory)) {
    throw new Error(label + " source and destination overlap");
  }
  const sourceState = await inspectSettingsState(sourceDirectory, label + " source");
  assertSettingsState(sourceState, expected, label + " source");
  const destinationFile = await safeFile(
    path.join(destinationDirectory, SETTINGS_FILE),
    destinationDirectory,
    label + " destination " + SETTINGS_FILE,
    true,
  );
  if (expected.exists) {
    await copyFile(path.join(sourceDirectory, SETTINGS_FILE), destinationFile.path);
  } else if (destinationFile.exists) {
    await rm(destinationFile.path, { force: true });
  }
  const restored = await inspectSettingsState(destinationDirectory, label + " restored");
  assertSettingsState(restored, expected, label + " restored");
}

function effectiveThemeConfig(value) {
  return value ?? null;
}

function shouldSetThemeConfig(current, expected) {
  return effectiveThemeConfig(current) !== effectiveThemeConfig(expected);
}

function appearanceStateIdentity(state) {
  return {
    exists: state.exists,
    hash: state.exists ? state.hash : null,
    size: state.exists ? state.bytes.length : 0,
  };
}

function appearanceStatesEqual(actual, expected) {
  return actual.exists === expected.exists
    && (!expected.exists || actual.bytes.equals(expected.bytes));
}

function assertAppearanceState(actual, expected, label) {
  if (!appearanceStatesEqual(actual, expected)) {
    throw new Error(label + " appearance presence/bytes differ");
  }
}

async function inspectAppearanceState(directory, fileName, label) {
  const resolved = await safeDirectory(directory, label + " directory");
  const file = await safeFile(path.join(resolved, fileName), resolved, label, true);
  if (!file.exists) return { exists: false, bytes: null, hash: null };
  const bytes = await readFile(file.path);
  return { exists: true, bytes, hash: sha256(bytes) };
}

function appearanceSnapshotMetadata(state) {
  return Buffer.from(canonicalJson(appearanceStateIdentity(state)) + "\n", "utf8");
}

async function assertAppearanceSnapshot(snapshotDirectory, expected, label) {
  const snapshotState = await inspectAppearanceState(
    snapshotDirectory,
    APPEARANCE_SNAPSHOT_FILE,
    label + " bytes",
  );
  assertAppearanceState(snapshotState, expected, label + " bytes");
  const resolved = await safeDirectory(snapshotDirectory, label + " directory");
  const metadataFile = await safeFile(
    path.join(resolved, APPEARANCE_SNAPSHOT_STATE_FILE),
    resolved,
    label + " metadata",
  );
  const metadata = await readFile(metadataFile.path);
  if (!metadata.equals(appearanceSnapshotMetadata(expected))) {
    throw new Error(label + " metadata differs");
  }
}

async function snapshotAppearanceState(source, expected, destination, label) {
  const sourceDirectory = await safeDirectory(source, label + " source");
  const destinationDirectory = await safeDirectory(destination, label + " destination");
  if (pathsOverlap(sourceDirectory, destinationDirectory)) {
    throw new Error(label + " source and destination overlap");
  }
  const sourceState = await inspectAppearanceState(
    sourceDirectory,
    APPEARANCE_FILE,
    label + " source",
  );
  assertAppearanceState(sourceState, expected, label + " source");
  const snapshotFile = await safeFile(
    path.join(destinationDirectory, APPEARANCE_SNAPSHOT_FILE),
    destinationDirectory,
    label + " bytes destination",
    true,
  );
  const metadataFile = await safeFile(
    path.join(destinationDirectory, APPEARANCE_SNAPSHOT_STATE_FILE),
    destinationDirectory,
    label + " metadata destination",
    true,
  );
  if (snapshotFile.exists || metadataFile.exists) {
    throw new Error(label + " destination is not empty");
  }
  if (expected.exists) {
    await writeFile(snapshotFile.path, expected.bytes, { flag: "wx" });
  }
  await writeFile(metadataFile.path, appearanceSnapshotMetadata(expected), { flag: "wx" });
  await assertAppearanceSnapshot(destinationDirectory, expected, label + " verified");
}

async function restoreAppearanceState(source, expected, destination, label) {
  const sourceDirectory = await safeDirectory(source, label + " source");
  const destinationDirectory = await safeDirectory(destination, label + " destination");
  if (pathsOverlap(sourceDirectory, destinationDirectory)) {
    throw new Error(label + " source and destination overlap");
  }
  await assertAppearanceSnapshot(sourceDirectory, expected, label + " source");
  const destinationFile = await safeFile(
    path.join(destinationDirectory, APPEARANCE_FILE),
    destinationDirectory,
    label + " destination " + APPEARANCE_FILE,
    true,
  );
  if (expected.exists) {
    await copyFile(path.join(sourceDirectory, APPEARANCE_SNAPSHOT_FILE), destinationFile.path);
  } else if (destinationFile.exists) {
    await rm(destinationFile.path, { force: true });
  }
  const restored = await inspectAppearanceState(
    destinationDirectory,
    APPEARANCE_FILE,
    label + " restored",
  );
  assertAppearanceState(restored, expected, label + " restored");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label + " timed out after " + timeoutMs + "ms")), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

async function cdpIp() {
  try {
    return (await dns.lookup(CDP_HOST)).address;
  } catch {
    return CDP_HOST;
  }
}

function httpJson(ip, requestPath) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        host: ip,
        port: CDP_PORT,
        path: requestPath,
        headers: { Host: ip + ":" + CDP_PORT },
        timeout: 4000,
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => {
          if (response.statusCode !== 200) {
            reject(new Error("CDP HTTP " + response.statusCode + " for " + requestPath));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error("invalid CDP JSON for " + requestPath + ": " + error.message));
          }
        });
      },
    );
    request.on("timeout", () => request.destroy(new Error("CDP HTTP timeout")));
    request.on("error", reject);
  });
}

async function oneCdpTarget() {
  const ip = await cdpIp();
  await httpJson(ip, "/json/version");
  const targets = await httpJson(ip, "/json");
  const pages = targets.filter((target) => target.type === "page");
  const matching = pages.filter((target) => {
    const text = ((target.title || "") + " " + (target.url || "")).toLowerCase();
    return text.includes(CDP_TARGET.toLowerCase());
  });
  if (matching.length !== 1) {
    throw new Error("expected exactly one CDP page matching "
      + JSON.stringify(CDP_TARGET) + ", found " + matching.length);
  }
  const target = matching[0];
  const wsUrl = target.webSocketDebuggerUrl.replace(/^ws:\/\/[^/]+/, "ws://" + ip + ":" + CDP_PORT);
  return { target, wsUrl };
}

async function cdpCommand(method, params = {}) {
  const { wsUrl } = await oneCdpTarget();
  const socket = new WebSocket(wsUrl);
  await withTimeout(new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("CDP websocket connection failed")), { once: true });
  }), 6000, "CDP websocket open");

  try {
    const id = 1;
    const response = withTimeout(new Promise((resolve, reject) => {
      const onMessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== id) return;
        socket.removeEventListener("message", onMessage);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      };
      socket.addEventListener("message", onMessage);
      socket.addEventListener("close", () => reject(new Error("CDP websocket closed before evaluation")), { once: true });
    }), 10000, "CDP evaluation");
    socket.send(JSON.stringify({
      id,
      method,
      params,
    }));
    return await response;
  } finally {
    try { socket.close(); } catch {}
  }
}

async function evaluateCdp(expression) {
  const result = await cdpCommand("Runtime.evaluate", {
    expression,
    returnByValue: true,
    replMode: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function evaluateCdpAwait(expression, timeoutMs = 30000) {
  const slot = "__lieReleaseDifferentialEval" + ++cdpEvaluationSlot;
  const quotedSlot = JSON.stringify(slot);
  await evaluateCdp("(() => { window[" + quotedSlot + "] = '__pending__';"
    + "Promise.resolve().then(() => (async () => (" + expression + "))())"
    + ".then((value) => { window[" + quotedSlot + "] = JSON.stringify({ok:true,value:value===undefined?null:value}); })"
    + ".catch((error) => { window[" + quotedSlot + "] = JSON.stringify({ok:false,error:String(error?.stack||error)}); });"
    + "return true; })()");
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      await delay(250);
      const encoded = await evaluateCdp("window[" + quotedSlot + "] || ''");
      if (!encoded || encoded === "__pending__") continue;
      const result = JSON.parse(encoded);
      if (!result.ok) throw new Error(result.error);
      return result.value;
    }
    throw new Error("CDP async evaluation timed out after " + timeoutMs + "ms");
  } finally {
    try { await evaluateCdp("delete window[" + quotedSlot + "]"); } catch {}
  }
}

async function runtimeSnapshot(label) {
  const encoded = await evaluateCdp("JSON.stringify((() => {"
    + "const p=app.plugins.plugins[" + JSON.stringify(PLUGIN_ID) + "];"
    + "const leaf=app.workspace.activeLeaf;const editor=leaf?.view?.editor??null;"
    + "const root=leaf?.view?.containerEl??null;const scroller=root?.querySelector('.markdown-source-view .cm-scroller,.markdown-reading-view .markdown-preview-view')??null;"
    + "return {pluginLoaded:!!p,pluginVersion:p?.manifest?.version??null,file:app.workspace.getActiveFile()?.path??null,"
    + "mode:leaf?.view?.getMode?.()??null,viewState:leaf?.getViewState()??null,"
    + "selection:editor?{anchor:editor.getCursor('anchor'),head:editor.getCursor('head')}:null,"
    + "cursor:editor?.getCursor()??null,scrollTop:scroller?.scrollTop??null,scrollLeft:scroller?.scrollLeft??null,"
    + "themeConfig:app.vault.getConfig('theme')??null,"
    + "themeClasses:[...document.body.classList].filter((name)=>name.startsWith('theme-')).sort(),"
    + "viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},"
    + "settings:p?JSON.parse(JSON.stringify(p.settings)):null,"
    + "fixtureExists:!!app.vault.getAbstractFileByPath(" + JSON.stringify(GUARD_FIXTURE) + "),"
    + "sourceFixtureExists:!!app.vault.getAbstractFileByPath(" + JSON.stringify(SOURCE_ADDRESS_FIXTURE) + "),"
    + "sourceAssetPaths:" + JSON.stringify([...SOURCE_ADDRESS_FILES.slice(1), ...SOURCE_ADDRESS_DIRS])
    + ".filter((value)=>!!app.vault.getAbstractFileByPath(value)),"
    + "sourceInstrumentationExists:!!window[" + JSON.stringify(SOURCE_ADDRESS_HOOK) + "],"
    + "sourceFaultExists:!!window[" + JSON.stringify(SOURCE_ADDRESS_HOOK) + "]?.fault,"
    + "instrumentationExists:!!window.__lieToolbarHostDiag,"
    + "themeLockExists:!!window.__lieToolbarHostThemeLock,"
    + "opticalStyleExists:!!document.getElementById(" + JSON.stringify(OPTICAL_LOCK_ID) + "),"
    + "refs:{submenu:!!p?.submenu,filterPanel:!!p?.filterPanel,classPanel:!!p?.classPanel,cropEditor:!!p?.cropEditor},"
    + "orphans:document.querySelectorAll('.lie-submenu,.lie-filter-panel,.lie-class-panel,.lie-group-popup,.lie-crop-portal,.lie-toolbar-floating').length};"
    + "})())");
  try {
    return JSON.parse(encoded);
  } catch (error) {
    throw new Error(label + " runtime snapshot is invalid: " + error.message);
  }
}

function assertCleanRuntime(state, label) {
  if (!state.pluginLoaded || state.fixtureExists || state.sourceFixtureExists
    || state.sourceAssetPaths.length !== 0 || state.sourceInstrumentationExists || state.sourceFaultExists
    || state.instrumentationExists
    || state.themeLockExists || state.opticalStyleExists
    || Object.values(state.refs).some(Boolean) || state.orphans !== 0) {
    throw new Error(label + " is not clean: " + boundedJson({
      pluginLoaded: state.pluginLoaded,
      fixtureExists: state.fixtureExists,
      sourceFixtureExists: state.sourceFixtureExists,
      sourceAssetPaths: state.sourceAssetPaths,
      sourceInstrumentationExists: state.sourceInstrumentationExists,
      sourceFaultExists: state.sourceFaultExists,
      instrumentationExists: state.instrumentationExists,
      themeLockExists: state.themeLockExists,
      opticalStyleExists: state.opticalStyleExists,
      refs: state.refs,
      orphans: state.orphans,
    }));
  }
}

function assertRestoredRuntime(actual, expected, label) {
  const exactKeys = [
    "pluginVersion", "file", "mode", "viewState", "selection", "cursor",
    "themeConfig", "themeClasses", "viewport", "settings",
  ];
  const mismatched = exactKeys.filter((key) => canonicalJson(actual[key]) !== canonicalJson(expected[key]));
  if (actual.scrollTop === null || expected.scrollTop === null) {
    if (actual.scrollTop !== expected.scrollTop) mismatched.push("scrollTop");
  } else if (Math.abs(actual.scrollTop - expected.scrollTop) > 1) {
    mismatched.push("scrollTop");
  }
  if (actual.scrollLeft === null || expected.scrollLeft === null) {
    if (actual.scrollLeft !== expected.scrollLeft) mismatched.push("scrollLeft");
  } else if (Math.abs(actual.scrollLeft - expected.scrollLeft) > 1) {
    mismatched.push("scrollLeft");
  }
  if (actual.fixtureExists || actual.sourceFixtureExists || actual.sourceAssetPaths.length !== 0
    || actual.sourceInstrumentationExists || actual.sourceFaultExists
    || actual.instrumentationExists || actual.themeLockExists
    || actual.opticalStyleExists || Object.values(actual.refs).some(Boolean) || actual.orphans !== 0) {
    mismatched.push("test-cleanliness");
  }
  if (mismatched.length) {
    throw new Error(label + " runtime differs at " + mismatched.join(", "));
  }
}

async function restoreRuntime(original) {
  const errors = [];
  const step = async (name, callback) => {
    try { await callback(); } catch (error) {
      errors.push(new Error(name + ": " + boundedText(error?.message || error), { cause: error }));
    }
  };
  await step("instrumentation restore", () => evaluateCdp("(() => {"
    + "const d=window.__lieToolbarHostDiag;if(!d)return true;app.workspace.offref(d.editorRef);"
    + "removeEventListener('error',d.onError);removeEventListener('unhandledrejection',d.onReject);"
    + "console.error=d.originalConsoleError;if(d.dispatchDescriptor)Object.defineProperty(d.cm,'dispatchTransactions',d.dispatchDescriptor);"
    + "else delete d.cm.dispatchTransactions;delete window.__lieToolbarHostDiag;return true;})()"));
  await step("source-address instrumentation restore", () => evaluateCdp("(() => {"
    + "const d=window[" + JSON.stringify(SOURCE_ADDRESS_HOOK) + "];if(!d)return true;"
    + "const p=app.plugins.plugins[" + JSON.stringify(PLUGIN_ID) + "];const f=d.fault;"
    + "if(f?.kind==='stale'){if(f.hadOwnPair)Object.defineProperty(p,'pairLivePreviewBlock',f.pairDescriptor);"
    + "else delete p.pairLivePreviewBlock;}if(f?.image&&f.originalCache)p.postProcessorLocations.set(f.image,f.originalCache);"
    + "removeEventListener('error',d.onError);removeEventListener('unhandledrejection',d.onReject);"
    + "console.error=d.originalConsoleError;if(d.dispatchDescriptor)Object.defineProperty(d.cm,'dispatchTransactions',d.dispatchDescriptor);"
    + "else delete d.cm.dispatchTransactions;delete window[" + JSON.stringify(SOURCE_ADDRESS_HOOK) + "];return true;})()"));
  await step("theme observer restore", () => evaluateCdp("(() => {"
    + "window.__lieToolbarHostThemeLock?.observer?.disconnect();return true;})()"));
  await step("optical style restore", () => evaluateCdp("(() => {"
    + "window.__lieToolbarHostThemeLock?.style?.remove();document.getElementById("
    + JSON.stringify(OPTICAL_LOCK_ID) + ")?.remove();delete window.__lieToolbarHostThemeLock;return true;})()"));
  await step("plugin surface restore", () => evaluateCdp("(() => {"
    + "app.plugins.plugins[" + JSON.stringify(PLUGIN_ID) + "]?.dismissToolbar?.();return true;})()"));
  await step("runtime settings restore", () => evaluateCdp("(() => {"
    + "const p=app.plugins.plugins[" + JSON.stringify(PLUGIN_ID) + "];if(!p)throw new Error('plugin missing');"
    + "for(const key of Object.keys(p.settings))delete p.settings[key];Object.assign(p.settings,"
    + JSON.stringify(original.settings) + ");return true;})()"));
  await step("decoration refresh", () => evaluateCdp("(() => {"
    + "const p=app.plugins.plugins[" + JSON.stringify(PLUGIN_ID) + "];if(!p)throw new Error('plugin missing');"
    + "p.refreshLivePreviewDecorations();return true;})()"));
  await step("view-state restore", () => evaluateCdpAwait("(async () => {"
    + "const state=" + JSON.stringify(original.viewState) + ";if(state)await app.workspace.activeLeaf.setViewState(state);"
    + "return true;})()", 15000));
  await delay(600);
  await step("selection restore", () => evaluateCdp("(() => {"
    + "const editor=app.workspace.activeLeaf?.view?.editor??null;const selection=" + JSON.stringify(original.selection) + ";"
    + "if(selection&&!editor)throw new Error('active editor missing');if(selection)editor.setSelection(selection.anchor,selection.head);return true;})()"));
  await step("scroll restore", () => evaluateCdp("(() => {"
    + "const leaf=app.workspace.activeLeaf;const root=leaf?.view?.containerEl??null;"
    + "const scroller=root?.querySelector('.markdown-source-view .cm-scroller,.markdown-reading-view .markdown-preview-view')??null;"
    + "const scrollTop=" + JSON.stringify(original.scrollTop) + ",scrollLeft=" + JSON.stringify(original.scrollLeft) + ";"
    + "if((scrollTop!==null||scrollLeft!==null)&&!scroller)throw new Error('active scroller missing');"
    + "if(scroller&&scrollTop!==null)scroller.scrollTop=scrollTop;if(scroller&&scrollLeft!==null)scroller.scrollLeft=scrollLeft;return true;})()"));
  await step("fixture restore", () => evaluateCdpAwait("(async () => {"
    + "const fixture=app.vault.getAbstractFileByPath(" + JSON.stringify(GUARD_FIXTURE) + ");"
    + "if(fixture)await app.vault.delete(fixture);return true;})()", 15000));
  await step("source-address fixture restore", async () => {
    await evaluateCdpAwait("(async () => {"
      + "const v=app.vault;for(const path of " + JSON.stringify(SOURCE_ADDRESS_FILES) + "){"
      + "const item=v.getAbstractFileByPath(path);if(item){if(Array.isArray(item.children))throw new Error('expected file at '+path);"
      + "await v.delete(item);}}for(const path of " + JSON.stringify([...SOURCE_ADDRESS_DIRS].reverse()) + "){"
      + "const item=v.getAbstractFileByPath(path);if(!item)continue;if(!Array.isArray(item.children))throw new Error('expected directory at '+path);"
      + "if(item.children.length!==0)throw new Error('source-address directory is not empty: '+path);}"
      + "return true;})()", 15000);
    await removeKnownSourceAddressDirectories();
    let remaining = [];
    for (let attempt = 0; attempt < 40; attempt++) {
      remaining = await evaluateCdp("(() => " + JSON.stringify(SOURCE_ADDRESS_DIRS)
        + ".filter((value)=>!!app.vault.getAbstractFileByPath(value)))()");
      if (remaining.length === 0) break;
      await delay(100);
    }
    if (remaining.length) {
      throw new Error("vault index retained source-address directories: " + remaining.join(","));
    }
  });
  await step("theme config restore", () => evaluateCdp("(() => {"
    + "const expected=" + JSON.stringify(effectiveThemeConfig(original.themeConfig)) + ";"
    + "const current=app.vault.getConfig('theme')??null;"
    + "if(current!==expected)app.vault.setConfig('theme',expected);return current!==expected;})()"));
  await step("theme apply", () => evaluateCdp("(() => {app.setTheme();return true;})()"));
  await delay(350);
  await step("viewport restore", () => cdpCommand("Emulation.clearDeviceMetricsOverride"));
  await step("focus restore", () => cdpCommand("Emulation.setFocusEmulationEnabled", { enabled: false }));
  await delay(300);
  await step("runtime validation", async () => {
    const restored = await runtimeSnapshot("restored");
    assertRestoredRuntime(restored, original, "restored");
  });
  if (errors.length) throw new AggregateError(errors, "runtime restore failed");
}

async function runtimeState() {
  const raw = await evaluateCdp("JSON.stringify((() => {"
    + "const p=app.plugins.plugins[" + JSON.stringify(PLUGIN_ID) + "];"
    + "const m=app.plugins.manifests[" + JSON.stringify(PLUGIN_ID) + "];"
    + "return {loaded:!!p,pluginVersion:p?.manifest?.version??null,"
    + "manifestVersion:m?.version??null,vaultName:app.vault.getName(),"
    + "timeOrigin:performance.timeOrigin};})())");
  return JSON.parse(raw);
}

async function waitForRuntime(identity, timeoutMs, ignoreInterrupt = false, previousTimeOrigin = null) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    if (!ignoreInterrupt) assertNotInterrupted();
    try {
      last = await runtimeState();
      if (last.loaded
        && last.pluginVersion === identity.version
        && last.manifestVersion === identity.version
        && last.vaultName === VAULT_NAME
        && (previousTimeOrigin === null
          || (Number.isFinite(last.timeOrigin) && last.timeOrigin !== previousTimeOrigin))) return last;
    } catch (error) {
      last = { error: error.message };
    }
    await delay(1000);
  }
  throw new Error("runtime did not load " + identity.version + ": " + JSON.stringify(last));
}

async function reloadAndVerify(identity, label, ignoreInterrupt = false) {
  const installedBefore = await inspectArtifacts(INSTALLED_DIR, identity.version, label + " installed");
  assertIdentity(installedBefore, identity, label + " installed");
  const beforeTimeOrigin = await evaluateCdp(
    "(() => { const value=performance.timeOrigin;"
    + "setTimeout(() => location.reload(),50);return value; })()",
  );
  if (!Number.isFinite(beforeTimeOrigin)) throw new Error(label + " document time origin is invalid");
  await waitForRuntime(identity, 60000, ignoreInterrupt, beforeTimeOrigin);
  const installedAfter = await inspectArtifacts(INSTALLED_DIR, identity.version, label + " reloaded");
  assertIdentity(installedAfter, identity, label + " reloaded");
}

let activeChild = null;
let requestActiveChildStop = null;
let interruptedSignal = null;

function onSignal(signal) {
  if (interruptedSignal) return;
  interruptedSignal = signal;
  requestActiveChildStop?.("interrupt");
}

function assertNotInterrupted() {
  if (interruptedSignal) throw new Error("interrupted by " + interruptedSignal);
}

function runChild(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    activeChild = child;
    let stopReason = null;
    let stdout = "";
    let stderr = "";
    let forceTimer = null;
    const requestStop = (reason) => {
      if (stopReason || child.exitCode !== null || child.signalCode !== null) return;
      stopReason = reason;
      child.kill("SIGTERM");
      forceTimer = setTimeout(() => child.kill("SIGKILL"), options.abortGraceMs);
    };
    requestActiveChildStop = requestStop;
    const timeoutTimer = setTimeout(() => requestStop("timeout"), options.timeoutMs);
    const clearChildState = () => {
      clearTimeout(timeoutTimer);
      if (forceTimer) clearTimeout(forceTimer);
      if (activeChild === child) activeChild = null;
      if (requestActiveChildStop === requestStop) requestActiveChildStop = null;
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => {
      clearChildState();
      reject(error);
    });
    child.once("close", (status, signal) => {
      clearChildState();
      resolve({ status, signal, stdout, stderr, stopReason });
    });
  });
}

function parseContract(stdout, label, marker = MARKER) {
  const markers = stdout.split(/\r?\n/).filter((line) => line.startsWith(marker));
  if (markers.length !== 1) {
    throw new Error(label + " emitted " + markers.length + " contract markers; expected exactly one");
  }
  const encoded = markers[0].slice(marker.length);
  let contract;
  try {
    contract = JSON.parse(encoded);
  } catch (error) {
    throw new Error(label + " emitted invalid contract JSON: " + error.message);
  }
  if (canonicalJson(contract) !== encoded) {
    throw new Error(label + " contract marker is not canonical JSON");
  }
  return contract;
}

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  return isRecord(value)
    && canonicalJson(Object.keys(value).sort()) === canonicalJson([...expectedKeys].sort());
}

function validateCleanupContract(contract, label) {
  if (contract.cleanupValid !== true) {
    throw new Error(label + " cleanup gate failed");
  }
  const cleanup = contract.cleanup;
  if (!hasExactKeys(cleanup, CLEANUP_KEYS)) {
    throw new Error(label + " cleanup contract is incomplete");
  }
  if (cleanup.fixtureExists !== false || cleanup.instrumentationExists !== false) {
    throw new Error(label + " cleanup left fixture or instrumentation behind");
  }
  if (cleanup.themeLockExists !== false
    || cleanup.opticalStyleExists !== false
    || (cleanup.themeConfig !== null && typeof cleanup.themeConfig !== "string")) {
    throw new Error(label + " cleanup left an invalid theme lock or config");
  }
  if (cleanup.file !== null && typeof cleanup.file !== "string") {
    throw new Error(label + " cleanup file is invalid");
  }
  if (cleanup.mode !== null && typeof cleanup.mode !== "string") {
    throw new Error(label + " cleanup mode is invalid");
  }
  if ((cleanup.viewState !== null && !isRecord(cleanup.viewState))
    || !isRecord(cleanup.settings)) {
    throw new Error(label + " cleanup view state or settings are invalid");
  }
  if (cleanup.selection !== null && !isRecord(cleanup.selection)) {
    throw new Error(label + " cleanup selection is invalid");
  }
  if ((cleanup.cursor !== null && !isRecord(cleanup.cursor))
    || !Number.isFinite(cleanup.scrollTop)) {
    throw new Error(label + " cleanup scroll position is invalid");
  }
  if (!hasExactKeys(cleanup.viewport, ["dpr", "height", "width"])
    || !Number.isFinite(cleanup.viewport.width)
    || !Number.isFinite(cleanup.viewport.height)
    || !Number.isFinite(cleanup.viewport.dpr)) {
    throw new Error(label + " cleanup viewport is invalid");
  }
  if (!hasExactKeys(cleanup.refs, CLEANUP_REF_KEYS)
    || Object.values(cleanup.refs).some((value) => value !== false)
    || cleanup.orphans !== 0) {
    throw new Error(label + " cleanup left plugin UI behind");
  }
}

function validateAssertionsContract(contract, label) {
  if (!Array.isArray(contract.assertions)
    || contract.assertions.length !== EXPECTED_ASSERTION_COUNT) {
    throw new Error(label + " assertion contract is truncated");
  }
  for (const [index, assertion] of contract.assertions.entries()) {
    if (!isRecord(assertion)
      || typeof assertion.name !== "string"
      || assertion.name.trim() === ""
      || typeof assertion.ok !== "boolean"
      || !Object.hasOwn(assertion, "actual")) {
      throw new Error(label + " assertion " + index + " is structurally invalid");
    }
  }
  const names = contract.assertions.map((assertion) => assertion.name);
  if (new Set(names).size !== EXPECTED_ASSERTION_COUNT
    || canonicalJson(names) !== canonicalJson(EXPECTED_ASSERTION_NAMES)) {
    throw new Error(label + " assertion names are missing, duplicated, reordered, or unexpected");
  }
}

function validateJourneyContract(contract, label) {
  if (!Array.isArray(contract.journeys) || contract.journeys.length !== EXPECTED_JOURNEY_IDS.length) {
    throw new Error(label + " journey count is incomplete");
  }
  if (contract.journeys.some((journey) => !isRecord(journey)
    || (Object.hasOwn(journey, "error")
      && (typeof journey.error !== "string" || journey.error.trim() === "")))) {
    throw new Error(label + " journey contract contains an invalid error");
  }
  const journeyIds = contract.journeys.map((journey) => journey?.id);
  if (canonicalJson(journeyIds) !== canonicalJson(EXPECTED_JOURNEY_IDS)) {
    throw new Error(label + " journey IDs are missing, duplicated, reordered, or unexpected");
  }
  const matrix = contract.journeyContract;
  if (!hasExactKeys(matrix, JOURNEY_CONTRACT_KEYS)
    || matrix.expectedCount !== EXPECTED_JOURNEY_IDS.length
    || matrix.actualCount !== EXPECTED_JOURNEY_IDS.length
    || canonicalJson(matrix.expectedIds) !== canonicalJson(EXPECTED_JOURNEY_IDS)
    || canonicalJson(matrix.actualIds) !== canonicalJson(journeyIds)
    || canonicalJson(matrix.missingIds) !== "[]"
    || canonicalJson(matrix.unexpectedIds) !== "[]"
    || canonicalJson(matrix.duplicateIds) !== "[]"
    || matrix.orderMatches !== true
    || matrix.complete !== true) {
    throw new Error(label + " journey contract is incomplete");
  }
}

function collectProductFailures(contract) {
  const failuresFor = (current, prefix = "") => {
    const assertionFailures = current.assertions
    .filter((assertion) => !assertion.ok)
    .map((assertion) => ({
      kind: "assertion",
      id: prefix + assertion.name,
      detail: assertion.actual,
    }));
    const journeyFailures = current.journeys
    .filter((journey) => Object.hasOwn(journey, "error"))
    .map((journey) => ({
      kind: "journey",
      id: prefix + journey.id,
      detail: journey.error,
    }));
    return [...assertionFailures, ...journeyFailures];
  };
  return [
    ...failuresFor(contract),
    ...(contract.sourceAddress ? failuresFor(contract.sourceAddress, "source-address:") : []),
  ];
}

function validateIdentityGate(contract, name, expected, label) {
  const matches = contract.gates.filter((gate) => gate?.name === name);
  if (matches.length !== 1
    || matches[0].ok !== true
    || canonicalJson(matches[0].actual) !== canonicalJson(expected)) {
    throw new Error(label + " contract gate " + name + " does not match caller expectation");
  }
}

function validateCaptureContract(contract, identity, expectedObsidianVersion, label) {
  if (!isRecord(contract)) {
    throw new Error(label + " contract is not an object");
  }
  if (contract.schema !== 1) {
    throw new Error(label + " contract schema is not 1");
  }
  validateCleanupContract(contract, label);
  if (contract.captureOnly !== true || contract.setupValid !== true) {
    throw new Error(label + " capture setup gate failed");
  }
  if (contract.fatal !== null || contract.aborted !== null) {
    throw new Error(label + " capture was fatal or aborted");
  }
  const expectedHashes = Object.fromEntries(
    ARTIFACTS.map((name) => [HASH_KEYS[name], identity.hashes[name]]),
  );
  if (contract.expected?.pluginVersion !== identity.version
    || contract.environment?.pluginVersion !== identity.version
    || contract.expected?.obsidianVersion !== expectedObsidianVersion
    || contract.environment?.obsidianVersion !== expectedObsidianVersion
    || canonicalJson(contract.expected?.hashes) !== canonicalJson(expectedHashes)
    || canonicalJson(contract.environment?.hashes) !== canonicalJson(expectedHashes)) {
    throw new Error(label + " contract build or Obsidian identity does not match caller expectation");
  }
  if (contract.environment?.target?.matchingPageCount !== 1) {
    throw new Error(label + " contract did not gate exactly one matching page");
  }
  if (!Array.isArray(contract.gates) || contract.gates.some((gate) => gate?.ok !== true)) {
    throw new Error(label + " contains a failed runtime gate");
  }
  validateIdentityGate(contract, "plugin-version", identity.version, label);
  validateIdentityGate(contract, "obsidian-version", expectedObsidianVersion, label);
  validateIdentityGate(contract, "build-hashes", expectedHashes, label);
  validateAssertionsContract(contract, label);
  validateJourneyContract(contract, label);
}

function validateSourceAddressCleanup(contract, label) {
  if (contract.cleanupValid !== true || !hasExactKeys(contract.cleanup, SOURCE_ADDRESS_CLEANUP_KEYS)) {
    throw new Error(label + " source-address cleanup contract is incomplete");
  }
  const cleanup = contract.cleanup;
  if (cleanup.fixtureExists !== false || canonicalJson(cleanup.assetPaths) !== "[]"
    || cleanup.hook !== false || cleanup.fault !== false || cleanup.activeImage !== false
    || !hasExactKeys(cleanup.refs, CLEANUP_REF_KEYS)
    || Object.values(cleanup.refs).some((value) => value !== false) || cleanup.orphans !== 0) {
    throw new Error(label + " source-address cleanup left test/plugin state behind");
  }
  if ((cleanup.file !== null && typeof cleanup.file !== "string")
    || (cleanup.mode !== null && typeof cleanup.mode !== "string")
    || (cleanup.viewState !== null && !isRecord(cleanup.viewState))
    || (cleanup.selection !== null && !isRecord(cleanup.selection))
    || (cleanup.cursor !== null && !isRecord(cleanup.cursor))
    || (cleanup.scrollTop !== null && !Number.isFinite(cleanup.scrollTop))
    || (cleanup.scrollLeft !== null && !Number.isFinite(cleanup.scrollLeft))
    || typeof cleanup.useMarkdownLinks !== "boolean"
    || typeof cleanup.documentFocus !== "boolean" || !isRecord(cleanup.settings)
    || !hasExactKeys(cleanup.viewport, ["dpr", "height", "width"])
    || Object.values(cleanup.viewport).some((value) => !Number.isFinite(value))) {
    throw new Error(label + " source-address cleanup state has invalid types");
  }
}

function validateSourceAddressContract(contract, identity, expectedObsidianVersion, label) {
  const topLevelKeys = [
    "aborted", "assertionContract", "assertions", "captureOnly", "cleanup",
    "cleanupError", "cleanupValid", "environment", "expected", "fatal", "gates",
    "journeyContract", "journeys", "schema", "setupValid",
  ];
  if (!hasExactKeys(contract, topLevelKeys) || contract.schema !== 1
    || contract.captureOnly !== true || contract.setupValid !== true
    || contract.fatal !== null || contract.aborted !== null || contract.cleanupError !== null) {
    throw new Error(label + " source-address setup/fatal contract is invalid");
  }
  validateSourceAddressCleanup(contract, label);
  const expectedHashes = Object.fromEntries(
    ARTIFACTS.map((name) => [HASH_KEYS[name], identity.hashes[name]]),
  );
  if (contract.expected?.pluginVersion !== identity.version
    || contract.environment?.pluginVersion !== identity.version
    || contract.expected?.obsidianVersion !== expectedObsidianVersion
    || contract.environment?.obsidianVersion !== expectedObsidianVersion
    || canonicalJson(contract.expected?.hashes) !== canonicalJson(expectedHashes)
    || canonicalJson(contract.environment?.hashes) !== canonicalJson(expectedHashes)
    || contract.environment?.target?.matchingPageCount !== 1) {
    throw new Error(label + " source-address build/Obsidian identity is invalid");
  }
  const expectedGateNames = [
    "target", "plugin-version", "obsidian-version", "build-hashes",
    "preflight-clean", "fixture-assets", "runtime-fingerprint", "instrumentation",
  ];
  if (!Array.isArray(contract.gates)
    || canonicalJson(contract.gates.map((gate) => gate?.name)) !== canonicalJson(expectedGateNames)
    || contract.gates.some((gate) => gate?.ok !== true)) {
    throw new Error(label + " source-address runtime gates are incomplete");
  }
  validateIdentityGate(contract, "plugin-version", identity.version, label + " source-address");
  validateIdentityGate(contract, "obsidian-version", expectedObsidianVersion, label + " source-address");
  validateIdentityGate(contract, "build-hashes", expectedHashes, label + " source-address");

  if (!Array.isArray(contract.assertions)
    || contract.assertions.length !== SOURCE_ADDRESS_ASSERTION_NAMES.length
    || contract.assertions.some((assertion) => !isRecord(assertion)
      || typeof assertion.name !== "string" || typeof assertion.ok !== "boolean"
      || !Object.hasOwn(assertion, "actual"))
    || canonicalJson(contract.assertions.map((assertion) => assertion.name))
      !== canonicalJson(SOURCE_ADDRESS_ASSERTION_NAMES)) {
    throw new Error(label + " source-address assertions are incomplete/reordered");
  }
  const assertionMatrix = contract.assertionContract;
  if (!hasExactKeys(assertionMatrix, SOURCE_ADDRESS_ASSERTION_CONTRACT_KEYS)
    || assertionMatrix.expectedCount !== SOURCE_ADDRESS_ASSERTION_NAMES.length
    || assertionMatrix.actualCount !== SOURCE_ADDRESS_ASSERTION_NAMES.length
    || canonicalJson(assertionMatrix.expectedNames) !== canonicalJson(SOURCE_ADDRESS_ASSERTION_NAMES)
    || canonicalJson(assertionMatrix.actualNames) !== canonicalJson(SOURCE_ADDRESS_ASSERTION_NAMES)
    || canonicalJson(assertionMatrix.missingNames) !== "[]"
    || canonicalJson(assertionMatrix.unexpectedNames) !== "[]"
    || canonicalJson(assertionMatrix.duplicateNames) !== "[]"
    || assertionMatrix.orderMatches !== true || assertionMatrix.complete !== true) {
    throw new Error(label + " source-address assertion matrix is incomplete");
  }
  if (!Array.isArray(contract.journeys)
    || canonicalJson(contract.journeys.map((journey) => journey?.id))
      !== canonicalJson(SOURCE_ADDRESS_JOURNEY_IDS)
    || contract.journeys.some((journey) => !isRecord(journey)
      || (Object.hasOwn(journey, "error")
        && (typeof journey.error !== "string" || journey.error.trim() === "")))) {
    throw new Error(label + " source-address journeys are incomplete/reordered");
  }
  const journeyMatrix = contract.journeyContract;
  if (!hasExactKeys(journeyMatrix, JOURNEY_CONTRACT_KEYS)
    || journeyMatrix.expectedCount !== SOURCE_ADDRESS_JOURNEY_IDS.length
    || journeyMatrix.actualCount !== SOURCE_ADDRESS_JOURNEY_IDS.length
    || canonicalJson(journeyMatrix.expectedIds) !== canonicalJson(SOURCE_ADDRESS_JOURNEY_IDS)
    || canonicalJson(journeyMatrix.actualIds) !== canonicalJson(SOURCE_ADDRESS_JOURNEY_IDS)
    || canonicalJson(journeyMatrix.missingIds) !== "[]"
    || canonicalJson(journeyMatrix.unexpectedIds) !== "[]"
    || canonicalJson(journeyMatrix.duplicateIds) !== "[]"
    || journeyMatrix.orderMatches !== true || journeyMatrix.complete !== true) {
    throw new Error(label + " source-address journey matrix is incomplete");
  }
}

function technicalEnvironment(contract) {
  const expected = structuredClone(contract.expected);
  const environment = structuredClone(contract.environment);
  delete expected.pluginVersion;
  delete expected.hashes;
  delete environment.pluginVersion;
  delete environment.hashes;
  if (environment.target) delete environment.target.id;
  let sourceAddress = null;
  if (contract.sourceAddress) {
    const sourceExpected = structuredClone(contract.sourceAddress.expected);
    const sourceEnvironment = structuredClone(contract.sourceAddress.environment);
    delete sourceExpected.pluginVersion;
    delete sourceExpected.hashes;
    delete sourceEnvironment.pluginVersion;
    delete sourceEnvironment.hashes;
    if (sourceEnvironment.target) delete sourceEnvironment.target.id;
    sourceAddress = { expected: sourceExpected, environment: sourceEnvironment };
  }
  return { expected, environment, sourceAddress };
}

function comparableContract(contract) {
  const copy = structuredClone(contract);
  if (copy.sourceAddress) {
    for (const key of [
      "schema", "captureOnly", "expected", "gates", "environment", "setupValid", "cleanupValid",
    ]) delete copy.sourceAddress[key];
  }
  for (const key of [
    "schema",
    "captureOnly",
    "expected",
    "gates",
    "environment",
    "setupValid",
    "cleanupValid",
  ]) delete copy[key];
  return copy;
}

function captureFailureDiagnostics(child, contract) {
  const compactShape = (shape) => shape ? {
    actualCount: shape.actualCount ?? null,
    complete: shape.complete ?? null,
    missing: shape.missingIds ?? shape.missingAssertionNames ?? null,
    orderMatches: shape.orderMatches ?? null,
    unexpected: shape.unexpectedIds ?? shape.unexpectedAssertionNames ?? null,
  } : null;
  return {
    child: {
      status: child.status,
      signal: child.signal,
      stopReason: child.stopReason,
      stdoutTail: child.stdout.slice(-4000),
      stderrTail: child.stderr.slice(-4000),
    },
    contract: contract ? {
      fatal: contract.fatal ?? null,
      aborted: contract.aborted ?? null,
      setupValid: contract.setupValid ?? null,
      cleanupValid: contract.cleanupValid ?? null,
      cleanupError: contract.cleanupError ?? null,
      journeyContract: compactShape(contract.journeyContract),
      assertionContract: compactShape(contract.assertionContract),
    } : null,
  };
}

function captureContractDiagnostic(label, contract) {
  if (!contract) return label + " contract diagnostics: unavailable";
  return label + " contract diagnostics: setupValid=" + String(contract.setupValid)
    + " cleanupValid=" + String(contract.cleanupValid)
    + " cleanupError=" + boundedText(contract.cleanupError ?? "null", 1000)
    + " fatal=" + boundedText(canonicalJson(contract.fatal ?? null), 1000)
    + " journeys=" + String(contract.journeyContract?.actualCount ?? "?")
    + "/" + String(contract.journeyContract?.expectedCount ?? "?")
    + " assertions=" + String(contract.assertionContract?.actualCount ?? "?")
    + "/" + String(contract.assertionContract?.expectedCount ?? "?");
}

function walkErrorTree(error, visit, depth = 0, edge = "ROOT", seen = new Set()) {
  if (depth > 8) { visit(null, depth, edge, "[error depth truncated]"); return; }
  if (!error || typeof error !== "object") { visit(null, depth, edge, String(error)); return; }
  if (seen.has(error)) { visit(null, depth, edge, "[circular error]"); return; }
  seen.add(error);
  visit(error, depth, edge, null);
  if (error.cause) walkErrorTree(error.cause, visit, depth + 1, "CAUSE", seen);
  if (error instanceof AggregateError) {
    for (let index = 0; index < Math.min(error.errors.length, 16); index++) {
      walkErrorTree(error.errors[index], visit, depth + 1, "ERROR[" + index + "]", seen);
    }
    if (error.errors.length > 16) {
      visit(null, depth + 1, "ERRORS", "[" + (error.errors.length - 16) + " aggregate errors truncated]");
    }
  }
}

function formatErrorTree(error) {
  const outline = [];
  let outlineNodes = 0;
  walkErrorTree(error, (node, depth, edge, literal) => {
    if (outlineNodes++ >= 64) return;
    const indent = "  ".repeat(depth);
    const label = literal ?? ((node.name || "Error") + ": " + boundedText(node.message || node, 500));
    outline.push(indent + edge + " " + label);
  });
  if (outlineNodes > 64) outline.push("[error outline truncated after 64 nodes]");

  const details = [];
  let detailNodes = 0;
  walkErrorTree(error, (node, depth, edge) => {
    if (!node || detailNodes++ >= 16) return;
    details.push("  ".repeat(depth) + edge + "\n"
      + boundedText(node.stack || node, 1500).split("\n").map((line) => "  ".repeat(depth + 1) + line).join("\n"));
  });
  return "ERROR OUTLINE\n" + boundedText(outline.join("\n"), 10000)
    + "\nERROR DETAILS\n" + boundedText(details.join("\n"), 14000);
}

async function capture(identity, sourceDirectory, expectedObsidianVersion, settingsSeed, label) {
  assertNotInterrupted();
  const sourceNow = await inspectArtifacts(sourceDirectory, identity.version, label + " source");
  assertIdentity(sourceNow, identity, label + " source");
  await copyArtifacts(identity.directory, INSTALLED_DIR);
  await reloadAndVerify(identity, label);
  const settingsBefore = await inspectSettingsState(
    INSTALLED_DIR,
    label + " settings before child",
  );
  assertSettingsState(settingsBefore, settingsSeed, label + " settings before child");

  const env = {
    ...process.env,
    CDP_PORT: String(CDP_PORT),
    CDP_TARGET,
    LIE_CAPTURE_ONLY: "1",
    LIE_EXPECTED_VERSION: identity.version,
    LIE_EXPECTED_OBSIDIAN_VERSION: expectedObsidianVersion,
    LIE_EXPECTED_MAIN_SHA256: identity.hashes["main.js"],
    LIE_EXPECTED_MANIFEST_SHA256: identity.hashes["manifest.json"],
    LIE_EXPECTED_STYLES_SHA256: identity.hashes["styles.css"],
  };
  const child = await runChild(process.execPath, [GUARD], {
    cwd: ROOT,
    env,
    timeoutMs: 300000,
    abortGraceMs: CHILD_ABORT_GRACE_MS,
  });
  const errors = [];
  let contract = null;
  try {
    contract = parseContract(child.stdout, label);
    validateCaptureContract(contract, identity, expectedObsidianVersion, label);
  } catch (error) {
    errors.push(error);
  }
  if (child.stopReason === "timeout") {
    errors.push(new Error(label + " toolbar-host capture timed out"));
  }
  if (child.status !== 0) {
    errors.push(new Error(label + " toolbar-host capture failed with exit "
      + child.status + (child.signal ? "/" + child.signal : "")
      + "\n" + (child.stderr || child.stdout).slice(-4000)));
  }
  let sourceAddressChild = null;
  let sourceAddressContract = null;
  if (errors.length === 0) {
    try {
      assertNotInterrupted();
      sourceAddressChild = await runChild(process.execPath, [SOURCE_ADDRESS_GUARD], {
        cwd: ROOT,
        env,
        timeoutMs: 300000,
        abortGraceMs: CHILD_ABORT_GRACE_MS,
      });
      sourceAddressContract = parseContract(
        sourceAddressChild.stdout,
        label + " source-address",
        SOURCE_ADDRESS_MARKER,
      );
      contract.sourceAddress = sourceAddressContract;
      validateSourceAddressContract(
        sourceAddressContract,
        identity,
        expectedObsidianVersion,
        label,
      );
      if (sourceAddressChild.stopReason === "timeout") {
        errors.push(new Error(label + " source-address capture timed out"));
      }
      if (sourceAddressChild.status !== 0) {
        errors.push(new Error(label + " source-address capture failed with exit "
          + sourceAddressChild.status + (sourceAddressChild.signal ? "/" + sourceAddressChild.signal : "")
          + "\n" + (sourceAddressChild.stderr || sourceAddressChild.stdout).slice(-4000)));
      }
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    const sourceAfter = await inspectArtifacts(sourceDirectory, identity.version, label + " source");
    assertIdentity(sourceAfter, identity, label + " immutable source");
    const installedAfter = await inspectArtifacts(INSTALLED_DIR, identity.version, label + " installed");
    assertIdentity(installedAfter, identity, label + " installed");
    const settingsAfter = await inspectSettingsState(
      INSTALLED_DIR,
      label + " settings after child",
    );
    assertSettingsState(settingsAfter, settingsSeed, label + " settings after child");
  } catch (error) {
    errors.push(error);
  }
  try {
    assertNotInterrupted();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length) {
    errors.push(new Error(captureContractDiagnostic(label, contract)));
    errors.push(new Error(label + " child diagnostics: "
      + boundedJson(captureFailureDiagnostics(child, null), 10000)));
    if (sourceAddressChild) {
      errors.push(new Error(label + " source-address diagnostics: "
        + boundedJson(captureFailureDiagnostics(sourceAddressChild, sourceAddressContract), 10000)));
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, label + " capture failed");
  return contract;
}

function decodePointer(pathValue) {
  if (typeof pathValue !== "string" || !pathValue.startsWith("/") || pathValue.includes("*")) {
    throw new CliError("allow-envelope path must be a non-root exact JSON Pointer without wildcards");
  }
  for (const token of pathValue.slice(1).split("/")) {
    if (/~(?![01])/u.test(token)) throw new CliError("invalid JSON Pointer escape in " + pathValue);
  }
  return pathValue;
}

function isProtectedSourceAddressPath(pointer) {
  return pointer === "/sourceAddress" || pointer.startsWith("/sourceAddress/");
}

async function readAllowEnvelope(file, authorizedIds) {
  if (!file) return null;
  let parsed;
  let bytes;
  try {
    bytes = await readFile(file);
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new CliError("invalid allow-envelope: " + error.message);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || canonicalJson(Object.keys(parsed)) !== canonicalJson(["entries"])
    || !Array.isArray(parsed.entries)) {
    throw new CliError("allow-envelope must be an object containing only an entries array");
  }
  const seen = new Set();
  const entries = parsed.entries.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new CliError("allow-envelope entry " + index + " is not an object");
    }
    const keys = Object.keys(entry).sort();
    if (canonicalJson(keys) !== canonicalJson(["baseline", "candidate", "id", "path"])) {
      throw new CliError("allow-envelope entry " + index + " must contain only id/path/baseline/candidate");
    }
    if (!AUTHORIZED_ID_PATTERN.test(entry.id)) {
      throw new CliError("allow-envelope entry " + index + " has no user-authorized change ID");
    }
    const pointer = decodePointer(entry.path);
    if (isProtectedSourceAddressPath(pointer)) {
      throw new CliError("source-address differential paths cannot be allow-enveloped");
    }
    if (seen.has(pointer)) throw new CliError("duplicate allow-envelope path " + pointer);
    seen.add(pointer);
    return { ...entry, path: pointer };
  });
  const envelopeIds = [...new Set(entries.map((entry) => entry.id))].sort();
  const suppliedIds = [...authorizedIds].sort();
  if (canonicalJson(envelopeIds) !== canonicalJson(suppliedIds)) {
    throw new CliError(
      "allow-envelope IDs and caller-supplied --authorized-id values must match exactly",
    );
  }
  return { file, hash: sha256(bytes), entries };
}

function pointerToken(key) {
  return String(key).replace(/~/gu, "~0").replace(/\//gu, "~1");
}

function valueKind(value) {
  if (value === ABSENT) return "absent";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value === "object" ? "object" : typeof value;
}

function collectDiffs(baseline, candidate, pointer = "") {
  const baselineKind = valueKind(baseline);
  const candidateKind = valueKind(candidate);
  if (baselineKind !== candidateKind) return [{ path: pointer, baseline, candidate }];

  if (baselineKind === "array") {
    const diffs = [];
    const length = Math.max(baseline.length, candidate.length);
    for (let index = 0; index < length; index++) {
      const left = index < baseline.length ? baseline[index] : ABSENT;
      const right = index < candidate.length ? candidate[index] : ABSENT;
      diffs.push(...collectDiffs(left, right, pointer + "/" + index));
    }
    return diffs;
  }
  if (baselineKind === "object") {
    const diffs = [];
    const keys = [...new Set([...Object.keys(baseline), ...Object.keys(candidate)])].sort();
    for (const key of keys) {
      const left = Object.hasOwn(baseline, key) ? baseline[key] : ABSENT;
      const right = Object.hasOwn(candidate, key) ? candidate[key] : ABSENT;
      diffs.push(...collectDiffs(left, right, pointer + "/" + pointerToken(key)));
    }
    return diffs;
  }
  return Object.is(baseline, candidate) ? [] : [{ path: pointer, baseline, candidate }];
}

function printableValue(value) {
  return value === ABSENT ? ABSENT_JSON : value;
}

function allowValueMatches(actual, expected) {
  return canonicalJson(printableValue(actual)) === canonicalJson(expected);
}

function assessDiffs(diffs, envelope, reportOnly) {
  if (!envelope) {
    const protectedDiffs = diffs.filter((diff) => isProtectedSourceAddressPath(diff.path));
    return {
      passed: protectedDiffs.length === 0 && (diffs.length === 0 || reportOnly),
      accepted: [],
      unallowed: reportOnly ? protectedDiffs : diffs,
      mismatched: [],
      unused: [],
    };
  }

  const byPath = new Map(envelope.entries.map((entry) => [entry.path, entry]));
  const accepted = [];
  const unallowed = [];
  const mismatched = [];
  const used = new Set();
  for (const diff of diffs) {
    const entry = byPath.get(diff.path);
    if (!entry) {
      unallowed.push(diff);
      continue;
    }
    used.add(entry.path);
    if (allowValueMatches(diff.baseline, entry.baseline)
      && allowValueMatches(diff.candidate, entry.candidate)) {
      accepted.push({ diff, entry });
    } else {
      mismatched.push({ diff, entry });
    }
  }
  const unused = envelope.entries.filter((entry) => !used.has(entry.path));
  return {
    passed: unallowed.length === 0 && mismatched.length === 0 && unused.length === 0,
    accepted,
    unallowed,
    mismatched,
    unused,
  };
}

function shortValue(value) {
  const text = canonicalJson(printableValue(value));
  return text.length <= 360 ? text : text.slice(0, 357) + "...";
}

function resultStatus(assessment, candidateProductFailures) {
  if (candidateProductFailures.length) return "DIAGNOSTIC_RED";
  return assessment.passed ? "GREEN" : "DIFFERENTIAL_RED";
}

function printProductFailures(build, failures) {
  console.log("PRODUCT-FAILURES " + build + " " + failures.length);
  for (const failure of failures) {
    console.log("PRODUCT-FAILURE " + build + " " + failure.kind + " "
      + failure.id + " " + shortValue(failure.detail));
  }
}

function printReport(result, options) {
  const {
    assessment, baselineContract, baselineIdentity, baselineProductFailures,
    candidateContract, candidateIdentity, candidateProductFailures, diffs, envelope, status,
  } = result;
  console.log("OBSIDIAN EXPECTED  " + options.expectedObsidianVersion);
  console.log("OBSIDIAN BASELINE  " + baselineContract.environment.obsidianVersion);
  console.log("OBSIDIAN CANDIDATE " + candidateContract.environment.obsidianVersion);
  console.log("BASELINE EXPECTED  " + options.baselineVersion + "  "
    + aggregateArtifactHash(options.baselineHashes) + "  " + canonicalJson(options.baselineHashes));
  console.log("BASELINE MEASURED  " + baselineIdentity.version + "  "
    + baselineIdentity.aggregateHash + "  " + canonicalJson(baselineIdentity.hashes));
  console.log("CANDIDATE EXPECTED " + options.candidateVersion + "  "
    + aggregateArtifactHash(options.candidateHashes) + "  " + canonicalJson(options.candidateHashes));
  console.log("CANDIDATE MEASURED " + candidateIdentity.version + "  "
    + candidateIdentity.aggregateHash + "  " + canonicalJson(candidateIdentity.hashes));
  if (envelope) console.log("ALLOW-ENVELOPE SHA256 " + envelope.hash);
  printProductFailures("BASELINE", baselineProductFailures);
  printProductFailures("CANDIDATE", candidateProductFailures);
  console.log("DIFFS     " + diffs.length);
  for (const diff of diffs) {
    console.log("DELTA " + (diff.path || "<root>"));
    console.log("  baseline:  " + shortValue(diff.baseline));
    console.log("  candidate: " + shortValue(diff.candidate));
  }
  for (const item of assessment.accepted) {
    console.log("ALLOW " + item.entry.id + " " + item.entry.path);
  }
  for (const diff of assessment.unallowed) console.error("UNALLOWED " + (diff.path || "<root>"));
  for (const item of assessment.mismatched) {
    console.error("ALLOW-MISMATCH " + item.entry.id + " " + item.entry.path);
  }
  for (const entry of assessment.unused) console.error("ALLOW-UNUSED " + entry.id + " " + entry.path);
  if (options.reportOnly && !options.allowEnvelope && diffs.length) {
    console.log("REPORT-ONLY: deltas reported without gating");
  }
  console.log("STATUS " + status);
}

async function execute(options) {
  const envelope = await readAllowEnvelope(options.allowEnvelope, options.authorizedIds);
  const baselineIdentity = await inspectArtifacts(
    options.baselineDir,
    options.baselineVersion,
    "baseline",
  );
  const candidateIdentity = await inspectArtifacts(
    options.candidateDir,
    options.candidateVersion,
    "candidate",
  );
  assertExpectedHashes(baselineIdentity, options.baselineHashes, "baseline");
  assertExpectedHashes(candidateIdentity, options.candidateHashes, "candidate");
  if (baselineIdentity.version === candidateIdentity.version
    || canonicalJson(baselineIdentity.hashes) === canonicalJson(candidateIdentity.hashes)) {
    throw new CliError("baseline and candidate build identities must differ");
  }
  const originalIdentity = await inspectArtifacts(INSTALLED_DIR, null, "installed original");
  assertNoArtifactAliases([
    ["baseline", baselineIdentity],
    ["candidate", candidateIdentity],
    ["installed", originalIdentity],
  ]);
  if (pathsOverlap(baselineIdentity.directory, candidateIdentity.directory)
    || pathsOverlap(baselineIdentity.directory, originalIdentity.directory)
    || pathsOverlap(candidateIdentity.directory, originalIdentity.directory)) {
    throw new CliError("baseline, candidate, and installed plugin directories must not overlap");
  }
  const originalSettings = await inspectSettingsState(INSTALLED_DIR, "installed original settings");
  const originalAppearance = await inspectAppearanceState(
    APPEARANCE_DIR,
    APPEARANCE_FILE,
    "installed original appearance",
  );
  const snapshotDir = await mkdtemp(path.join(os.tmpdir(), "lie-release-differential-"));
  let snapshotReady = false;
  let restored = false;
  let result = null;
  let failure = null;
  let originalRuntime = null;

  try {
    await copyArtifacts(INSTALLED_DIR, snapshotDir, true);
    const snapshotIdentity = await inspectArtifacts(snapshotDir, originalIdentity.version, "original snapshot");
    assertIdentity(snapshotIdentity, originalIdentity, "original snapshot");
    await restoreSettingsState(
      INSTALLED_DIR,
      originalSettings,
      snapshotDir,
      "original settings snapshot",
    );
    await snapshotAppearanceState(
      APPEARANCE_DIR,
      originalAppearance,
      snapshotDir,
      "original appearance snapshot",
    );
    await waitForRuntime(originalIdentity, 15000);
    const preflightRuntime = await runtimeSnapshot("installed original preflight");
    assertCleanRuntime(preflightRuntime, "installed original preflight");
    await cdpCommand("Emulation.clearDeviceMetricsOverride");
    await cdpCommand("Emulation.setFocusEmulationEnabled", { enabled: false });
    await delay(300);
    originalRuntime = await runtimeSnapshot("installed original");
    assertCleanRuntime(originalRuntime, "installed original");
    if (originalRuntime.pluginVersion !== originalIdentity.version) {
      throw new Error("installed runtime version does not match installed artifact version");
    }
    snapshotReady = true;

    await restoreSettingsState(snapshotDir, originalSettings, INSTALLED_DIR, "baseline settings seed");
    const baselineContract = await capture(
      baselineIdentity,
      baselineIdentity.directory,
      options.expectedObsidianVersion,
      originalSettings,
      "baseline",
    );
    await restoreSettingsState(snapshotDir, originalSettings, INSTALLED_DIR, "candidate settings seed");
    const candidateContract = await capture(
      candidateIdentity,
      candidateIdentity.directory,
      options.expectedObsidianVersion,
      originalSettings,
      "candidate",
    );
    const baselineAfterCandidate = await inspectArtifacts(
      baselineIdentity.directory, baselineIdentity.version, "baseline after candidate",
    );
    assertIdentity(baselineAfterCandidate, baselineIdentity, "baseline after candidate");
    const candidateAfterCandidate = await inspectArtifacts(
      candidateIdentity.directory, candidateIdentity.version, "candidate after candidate",
    );
    assertIdentity(candidateAfterCandidate, candidateIdentity, "candidate after candidate");

    const baselineEnvironment = technicalEnvironment(baselineContract);
    const candidateEnvironment = technicalEnvironment(candidateContract);
    if (canonicalJson(baselineEnvironment) !== canonicalJson(candidateEnvironment)) {
      throw new Error("baseline and candidate capture environments differ");
    }

    const baselineComparable = comparableContract(baselineContract);
    const candidateComparable = comparableContract(candidateContract);
    const diffs = collectDiffs(baselineComparable, candidateComparable);
    const assessment = assessDiffs(diffs, envelope, options.reportOnly);
    const baselineProductFailures = collectProductFailures(baselineContract);
    const candidateProductFailures = collectProductFailures(candidateContract);
    const status = resultStatus(assessment, candidateProductFailures);
    result = {
      assessment, baselineContract, baselineIdentity, baselineProductFailures,
      candidateContract, candidateIdentity, candidateProductFailures,
      diffs, envelope, status,
    };
  } catch (error) {
    failure = error;
  } finally {
    if (snapshotReady) {
      const restoreErrors = [];
      const restoreStep = async (name, callback) => {
        try { await callback(); } catch (error) {
          restoreErrors.push(new Error(name + ": " + boundedText(error?.message || error), { cause: error }));
        }
      };
      let artifactsRestored = false;
      let settingsRestored = false;
      let runtimeReloaded = false;
      await restoreStep("original artifact restore", async () => {
        await copyArtifacts(snapshotDir, INSTALLED_DIR);
        artifactsRestored = true;
      });
      await restoreStep("original settings restore", async () => {
        await restoreSettingsState(
          snapshotDir,
          originalSettings,
          INSTALLED_DIR,
          "restored original settings",
        );
        settingsRestored = true;
      });
      await restoreStep("restored artifact identity", async () => {
        if (!artifactsRestored) throw new Error("skipped: artifact restore failed");
        const restoredIdentity = await inspectArtifacts(
          INSTALLED_DIR,
          originalIdentity.version,
          "restored original",
        );
        assertIdentity(restoredIdentity, originalIdentity, "restored original");
      });
      await restoreStep("original runtime reload", async () => {
        if (!artifactsRestored || !settingsRestored) {
          throw new Error("skipped: artifact/settings restore prerequisite failed");
        }
        await reloadAndVerify(originalIdentity, "restored original", true);
        runtimeReloaded = true;
      });
      await restoreStep("restored settings verification", async () => {
        if (!runtimeReloaded) throw new Error("skipped: original runtime reload failed");
        const restoredSettings = await inspectSettingsState(
          INSTALLED_DIR,
          "restored original settings after reload",
        );
        assertSettingsState(
          restoredSettings,
          originalSettings,
          "restored original settings after reload",
        );
      });
      await restoreStep("original runtime restore", async () => {
        if (!originalRuntime) throw new Error("original runtime snapshot missing");
        await restoreRuntime(originalRuntime);
      });
      await restoreStep("original appearance restore", async () => {
        await restoreAppearanceState(
          snapshotDir,
          originalAppearance,
          APPEARANCE_DIR,
          "restored original appearance",
        );
      });
      await restoreStep("restored appearance verification", async () => {
        const restoredAppearance = await inspectAppearanceState(
          APPEARANCE_DIR,
          APPEARANCE_FILE,
          "restored original appearance final",
        );
        assertAppearanceState(
          restoredAppearance,
          originalAppearance,
          "restored original appearance final",
        );
      });
      await restoreStep("immutable baseline final", async () => {
        const baselineFinal = await inspectArtifacts(
          baselineIdentity.directory, baselineIdentity.version, "baseline final",
        );
        assertIdentity(baselineFinal, baselineIdentity, "baseline final");
      });
      await restoreStep("immutable candidate final", async () => {
        const candidateFinal = await inspectArtifacts(
          candidateIdentity.directory, candidateIdentity.version, "candidate final",
        );
        assertIdentity(candidateFinal, candidateIdentity, "candidate final");
      });
      restored = restoreErrors.length === 0;
      if (restoreErrors.length) {
        const restoreFailure = restoreErrors.length === 1
          ? restoreErrors[0]
          : new AggregateError(restoreErrors, "original state restore failed");
        failure = failure
          ? new AggregateError([failure, restoreFailure], "run failed and original state restore failed")
          : restoreFailure;
      }
    }
    if (restored || !snapshotReady) {
      try {
        await rm(snapshotDir, { recursive: true, force: true });
      } catch (error) {
        const cleanupFailure = new Error("recovery snapshot cleanup failed: "
          + boundedText(error?.message || error), { cause: error });
        failure = failure
          ? new AggregateError([failure, cleanupFailure], "run failed and snapshot cleanup failed")
          : cleanupFailure;
        console.error("RECOVERY SNAPSHOT PRESERVED: " + snapshotDir);
      }
    } else {
      console.error("RECOVERY SNAPSHOT PRESERVED: " + snapshotDir);
    }
  }

  if (failure) throw failure;
  printReport(result, options);
  return result.status === "GREEN" ? 0 : 1;
}

function syntheticContract(identity, expectedObsidianVersion) {
  const hashes = Object.fromEntries(
    ARTIFACTS.map((name) => [HASH_KEYS[name], identity.hashes[name]]),
  );
  const assertions = EXPECTED_ASSERTION_NAMES.map((name, index) => ({
    name,
    ok: index !== 0,
    actual: index === 0 ? { failure: true } : null,
  }));
  const journeys = EXPECTED_JOURNEY_IDS.map((id) => ({ id }));
  journeys[0].error = "synthetic journey failure";
  const contract = {
    schema: 1,
    captureOnly: true,
    setupValid: true,
    cleanupValid: true,
    fatal: null,
    aborted: null,
    expected: {
      pluginVersion: identity.version,
      obsidianVersion: expectedObsidianVersion,
      hashes,
    },
    environment: {
      pluginVersion: identity.version,
      obsidianVersion: expectedObsidianVersion,
      hashes,
      target: { matchingPageCount: 1 },
    },
    gates: [
      { name: "plugin-version", ok: true, actual: identity.version },
      { name: "obsidian-version", ok: true, actual: expectedObsidianVersion },
      { name: "build-hashes", ok: true, actual: hashes },
    ],
    assertions,
    journeys,
    journeyContract: {
      expectedCount: EXPECTED_JOURNEY_IDS.length,
      expectedIds: [...EXPECTED_JOURNEY_IDS],
      actualCount: EXPECTED_JOURNEY_IDS.length,
      actualIds: [...EXPECTED_JOURNEY_IDS],
      missingIds: [],
      unexpectedIds: [],
      duplicateIds: [],
      orderMatches: true,
      complete: true,
    },
    cleanup: {
      file: null,
      mode: null,
      viewState: null,
      fixtureExists: false,
      instrumentationExists: false,
      opticalStyleExists: false,
      themeConfig: "system",
      themeLockExists: false,
      viewport: { width: 1280, height: 900, dpr: 1 },
      settings: {},
      selection: null,
      cursor: null,
      scrollTop: 0,
      refs: { submenu: false, filterPanel: false, classPanel: false, cropEditor: false },
      orphans: 0,
    },
  };
  contract.sourceAddress = syntheticSourceAddressContract(identity, expectedObsidianVersion);
  return contract;
}

function syntheticSourceAddressContract(identity, expectedObsidianVersion) {
  const hashes = Object.fromEntries(
    ARTIFACTS.map((name) => [HASH_KEYS[name], identity.hashes[name]]),
  );
  const assertions = SOURCE_ADDRESS_ASSERTION_NAMES.map((name) => ({ name, ok: true, actual: null }));
  const journeys = SOURCE_ADDRESS_JOURNEY_IDS.map((id) => ({ id }));
  return {
    schema: 1,
    captureOnly: true,
    setupValid: true,
    cleanupValid: true,
    fatal: null,
    aborted: null,
    cleanupError: null,
    expected: { pluginVersion: identity.version, obsidianVersion: expectedObsidianVersion, hashes },
    environment: {
      pluginVersion: identity.version,
      obsidianVersion: expectedObsidianVersion,
      hashes,
      target: { matchingPageCount: 1 },
      vault: "vault-image-toolbar",
      platform: "Linux x86_64",
    },
    gates: [
      { name: "target", ok: true, actual: { matchingPageCount: 1, vault: "vault-image-toolbar" } },
      { name: "plugin-version", ok: true, actual: identity.version },
      { name: "obsidian-version", ok: true, actual: expectedObsidianVersion },
      { name: "build-hashes", ok: true, actual: hashes },
      { name: "preflight-clean", ok: true, actual: {} },
      { name: "fixture-assets", ok: true, actual: {} },
      { name: "runtime-fingerprint", ok: true, actual: {} },
      { name: "instrumentation", ok: true, actual: { armed: true } },
    ],
    assertions,
    journeys,
    journeyContract: {
      expectedCount: SOURCE_ADDRESS_JOURNEY_IDS.length,
      expectedIds: [...SOURCE_ADDRESS_JOURNEY_IDS],
      actualCount: SOURCE_ADDRESS_JOURNEY_IDS.length,
      actualIds: [...SOURCE_ADDRESS_JOURNEY_IDS],
      missingIds: [],
      unexpectedIds: [],
      duplicateIds: [],
      orderMatches: true,
      complete: true,
    },
    assertionContract: {
      expectedCount: SOURCE_ADDRESS_ASSERTION_NAMES.length,
      expectedNames: [...SOURCE_ADDRESS_ASSERTION_NAMES],
      actualCount: SOURCE_ADDRESS_ASSERTION_NAMES.length,
      actualNames: [...SOURCE_ADDRESS_ASSERTION_NAMES],
      missingNames: [],
      unexpectedNames: [],
      duplicateNames: [],
      orderMatches: true,
      complete: true,
    },
    cleanup: {
      file: null,
      mode: null,
      viewState: null,
      selection: null,
      cursor: null,
      scrollTop: 0,
      scrollLeft: 0,
      useMarkdownLinks: true,
      documentFocus: false,
      viewport: { width: 1280, height: 900, dpr: 1 },
      settings: {},
      fixtureExists: false,
      assetPaths: [],
      hook: false,
      fault: false,
      activeImage: false,
      refs: { submenu: false, filterPanel: false, classPanel: false, cropEditor: false },
      orphans: 0,
    },
  };
}

function runSyntheticContractChecks() {
  const identity = {
    version: "0.0.2",
    hashes: {
      "main.js": "1".repeat(64),
      "manifest.json": "2".repeat(64),
      "styles.css": "3".repeat(64),
    },
  };
  const expectedObsidianVersion = "1.9.14";
  const red = syntheticContract(identity, expectedObsidianVersion);
  let passed = 0;
  const check = (condition, label) => {
    if (!condition) throw new Error("self-test failed: " + label);
    passed++;
  };
  const rejects = (mutate, label) => {
    const contract = structuredClone(red);
    mutate(contract);
    let rejected = false;
    try {
      validateCaptureContract(contract, identity, expectedObsidianVersion, "synthetic");
    } catch {
      rejected = true;
    }
    check(rejected, label);
  };
  const rejectsSource = (mutate, label) => {
    const contract = structuredClone(red.sourceAddress);
    mutate(contract);
    let rejected = false;
    try {
      validateSourceAddressContract(contract, identity, expectedObsidianVersion, "synthetic");
    } catch {
      rejected = true;
    }
    check(rejected, label);
  };

  check(isDirectPatchSuccessor([0, 6, 14], [0, 6, 15]),
    "direct patch successor accepted");
  check(!isDirectPatchSuccessor([0, 6, 14], [0, 6, 16]),
    "skipped patch rejected");
  check(!isDirectPatchSuccessor([0, 6, 14], [0, 7, 0]),
    "minor successor rejected");
  check(!isDirectPatchSuccessor([0, 6, 14], [1, 0, 0]),
    "major successor rejected");
  check(!shouldSetThemeConfig("system", "system"),
    "matching effective theme config avoids persistence write");
  check(!shouldSetThemeConfig(undefined, null),
    "missing and null theme config are the same effective value");
  check(shouldSetThemeConfig("moonstone", "system"),
    "different effective theme config requires persistence write");
  const absentAppearance = { exists: false, bytes: null, hash: null };
  const firstAppearanceBytes = Buffer.from('{"theme":"system"}\n');
  const firstAppearance = {
    exists: true,
    bytes: firstAppearanceBytes,
    hash: sha256(firstAppearanceBytes),
  };
  const sameAppearance = {
    exists: true,
    bytes: Buffer.from(firstAppearance.bytes),
    hash: firstAppearance.hash,
  };
  const changedAppearanceBytes = Buffer.from('{"theme":"moonstone"}\n');
  const changedAppearance = {
    exists: true,
    bytes: changedAppearanceBytes,
    hash: sha256(changedAppearanceBytes),
  };
  check(appearanceStatesEqual(absentAppearance, { exists: false, bytes: null, hash: null }),
    "absent appearance state equality");
  check(appearanceStatesEqual(firstAppearance, sameAppearance),
    "exact appearance bytes equality");
  check(!appearanceStatesEqual(firstAppearance, changedAppearance),
    "changed appearance bytes inequality");
  validateCaptureContract(red, identity, expectedObsidianVersion, "synthetic");
  validateSourceAddressContract(red.sourceAddress, identity, expectedObsidianVersion, "synthetic");
  check(true, "structurally valid RED capture");
  check(SOURCE_ADDRESS_ASSERTION_NAMES.length === 44, "fixed 44-slot source-address contract");
  check(!isProtectedSourceAddressPath("/journeys/0")
    && isProtectedSourceAddressPath("/sourceAddress")
    && isProtectedSourceAddressPath("/sourceAddress/assertions/0"),
  "source-address allow-envelope paths are protected");
  const failures = collectProductFailures(red);
  check(failures.length === 2, "complete product failure collection");
  const identicalDiffs = collectDiffs(comparableContract(red), comparableContract(structuredClone(red)));
  check(identicalDiffs.length === 0, "identical RED comparison");
  check(resultStatus(assessDiffs(identicalDiffs, null, false), failures) === "DIAGNOSTIC_RED",
    "normal identical RED status");
  check(resultStatus(assessDiffs(identicalDiffs, null, true), failures) === "DIAGNOSTIC_RED",
    "report-only identical RED status");
  const green = structuredClone(red);
  green.assertions[0].ok = true;
  green.assertions[0].actual = null;
  delete green.journeys[0].error;
  validateCaptureContract(green, identity, expectedObsidianVersion, "synthetic");
  validateSourceAddressContract(green.sourceAddress, identity, expectedObsidianVersion, "synthetic");
  check(resultStatus(assessDiffs([], null, false), collectProductFailures(green)) === "GREEN",
    "green candidate status");
  rejects((contract) => { contract.assertions.pop(); }, "assertion truncation");
  rejects((contract) => { delete contract.assertions[0].actual; }, "assertion actual key");
  rejects((contract) => { contract.assertions[0].name = "unexpected"; },
    "unexpected assertion name");
  rejects((contract) => { contract.journeyContract.orderMatches = false; }, "journey order");
  rejects((contract) => { contract.fatal = { kind: "error", message: "synthetic" }; }, "fatal capture");
  rejects((contract) => { delete contract.schema; }, "missing schema");
  rejects((contract) => { contract.schema = 2; }, "wrong schema");
  rejectsSource((contract) => { contract.assertions.pop(); }, "source-address assertion truncation");
  rejectsSource((contract) => { contract.journeyContract.orderMatches = false; },
    "source-address journey order");
  const sourceRed = structuredClone(green);
  sourceRed.sourceAddress.assertions[0].ok = false;
  sourceRed.sourceAddress.assertions[0].actual = { failure: true };
  check(collectProductFailures(sourceRed).some((failure) =>
    failure.id === "source-address:" + SOURCE_ADDRESS_ASSERTION_NAMES[0]),
  "source-address product failures are collected");
  const protectedDiffs = collectDiffs(comparableContract(green), comparableContract(sourceRed));
  const protectedAssessment = assessDiffs(protectedDiffs, null, true);
  check(!protectedAssessment.passed && protectedAssessment.unallowed.length > 0
    && protectedAssessment.unallowed.every((diff) => isProtectedSourceAddressPath(diff.path)),
  "report-only cannot permit source-address deltas");
  const nestedError = new AggregateError(
    [new Error("x".repeat(20000)), new Error("second restore diagnostic")],
    "outer diagnostic",
  );
  const wrappedError = new Error("restore wrapper", { cause: nestedError });
  check(formatErrorTree(wrappedError).includes("second restore diagnostic"),
    "later nested error diagnostics survive bounded output");
  console.log("SELF-TEST " + passed + "/" + passed + " passed");
  return 0;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    console.error("CLI ERROR: " + error.message);
    console.error(HELP);
    return 2;
  }
  if (options.help) {
    console.log(HELP);
    return 0;
  }
  if (options.selfTest) return runSyntheticContractChecks();

  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  try {
    return await execute(options);
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}

main().then(
  (code) => { process.exitCode = code; },
  (error) => {
    console.error("FATAL:\n" + formatErrorTree(error));
    process.exitCode = 2;
  },
);
