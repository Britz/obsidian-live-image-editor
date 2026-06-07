import { getLanguage } from "obsidian";
import en from "./en";
import de from "./de";

type Translations = typeof en;
export type TranslationKey = keyof Translations;

const locales: Record<string, Translations> = { en, de };

let currentLocale = "en";

export function setLocale(locale: string): void {
  const lang = locale.split("-")[0]?.toLowerCase() ?? "en";
  currentLocale = lang in locales ? lang : "en";
}

export function t(key: keyof Translations): string {
  const current = locales[currentLocale];
  const fallback = locales["en"];
  return current?.[key] ?? fallback?.[key] ?? key;
}

export function detectLocale(): string {
  // Obsidian's own UI language (F21 — follow Obsidian's locale, no language setting of our own).
  // `getLanguage()` is Obsidian's sanctioned accessor; it returns the ISO code Obsidian is
  // actually displaying in and *defaults to "en"*, so we mirror it verbatim. We must NOT prefer
  // navigator.language over Obsidian's "en" — that made a German OS override an English Obsidian.
  // The browser locale stays only as a last-ditch guard for an (per the API, impossible) empty return.
  return getLanguage() || navigator.language || "en";
}
