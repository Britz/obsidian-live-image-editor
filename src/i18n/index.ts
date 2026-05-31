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
  const obsidianLocale = window.localStorage.getItem("language");
  if (obsidianLocale && obsidianLocale !== "en") return obsidianLocale;
  return navigator.language || "en";
}
