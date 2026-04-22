#!/usr/bin/env node
// Extracts the TRANSLATIONS object from src/lib/i18n.ts and emits
// messages/{locale}.json for every locale. Run once per release or after
// editing TRANSLATIONS. The object is pure JSON-shaped (string keys, string
// values), so we strip the TS type annotation and evaluate it as a JS
// expression in a VM sandbox — no transpiler dependency needed.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const I18N_PATH = path.join(WEB_ROOT, "src/lib/i18n.ts");
const MESSAGES_DIR = path.join(WEB_ROOT, "messages");
const LOCALES = [
  "ps", "bn", "pt", "zh", "cs", "fr", "de", "el", "hu", "hi",
  "id", "fa", "he", "it", "ja", "sw", "ms", "nl", "ur", "tl",
  "pl", "ro", "ru", "ar", "ko", "es", "th", "tr", "uk", "en", "vi"
];

const src = fs.readFileSync(I18N_PATH, "utf8");
const startMarker = "const TRANSLATIONS: TranslationCatalog = {";
const startIdx = src.indexOf(startMarker);
if (startIdx < 0) {
  throw new Error("TRANSLATIONS literal not found in i18n.ts");
}

// Walk from the opening brace to the matching close, respecting string literals.
let i = startIdx + startMarker.length - 1; // on the opening `{`
let depth = 0;
let inString = false;
let stringChar = "";
for (; i < src.length; i++) {
  const ch = src[i];
  const prev = i > 0 ? src[i - 1] : "";
  if (inString) {
    if (ch === stringChar && prev !== "\\") inString = false;
    continue;
  }
  if (ch === '"' || ch === "'" || ch === "`") {
    inString = true;
    stringChar = ch;
    continue;
  }
  if (ch === "{") depth++;
  else if (ch === "}") {
    depth--;
    if (depth === 0) { i++; break; }
  }
}
const literal = src.slice(startIdx + startMarker.length - 1, i);

const sandbox = { out: null };
vm.createContext(sandbox);
vm.runInContext(`out = ${literal};`, sandbox);
const TRANSLATIONS = sandbox.out;

fs.mkdirSync(MESSAGES_DIR, { recursive: true });

// Build the canonical English key set from any non-English locale — every key
// in TRANSLATIONS is an English source string, so unioning all locales' keys
// gives us the full source catalog.
const englishKeys = new Set();
for (const locale of LOCALES) {
  const dict = TRANSLATIONS[locale];
  if (!dict) continue;
  for (const key of Object.keys(dict)) englishKeys.add(key);
}

let written = 0;
for (const locale of LOCALES) {
  const dict = TRANSLATIONS[locale] ?? {};
  const out = {};
  for (const key of englishKeys) {
    out[key] = locale === "en" ? key : (dict[key] ?? key);
  }
  const file = path.join(MESSAGES_DIR, `${locale}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n", "utf8");
  written++;
  const translated = locale === "en" ? out : Object.entries(out).filter(([k, v]) => v !== k).length;
  console.log(`  ${locale}: ${Object.keys(out).length} keys${locale === "en" ? "" : ` (${translated} translated)`}`);
}
console.log(`\nWrote ${written} locale files to ${path.relative(WEB_ROOT, MESSAGES_DIR)}/`);
