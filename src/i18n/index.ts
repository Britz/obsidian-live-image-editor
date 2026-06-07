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
  // `getLanguage()` is Obsidian's sanctioned accessor for the key it stores under
  // localStorage["language"] ("en" for the default); fall back to the browser locale.
  const obsidianLocale = getLanguage();
  if (obsidianLocale && obsidianLocale !== "en") return obsidianLocale;
  return navigator.language || "en";
}
