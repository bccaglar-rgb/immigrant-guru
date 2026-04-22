#!/usr/bin/env node
// next-intl treats "." in message keys as a path separator. Our keys are
// English source strings that often contain periods. Transform each flat
// messages file so dotted keys become nested objects — `"foo."` becomes
// `{ foo: { "": "..." } }`. Lookups via `t("foo.")` then resolve correctly.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = path.resolve(__dirname, "../messages");

function nestKey(target, segments, value) {
  let node = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (typeof node[seg] === "string") {
      // Existing string value at this segment — promote to object with "" slot.
      node[seg] = { "": node[seg] };
    } else if (node[seg] == null) {
      node[seg] = {};
    }
    node = node[seg];
  }
  const last = segments[segments.length - 1];
  if (typeof node[last] === "object" && node[last] !== null) {
    node[last][""] = value;
  } else {
    node[last] = value;
  }
}

let totalKeys = 0;
let totalDotted = 0;
for (const file of fs.readdirSync(MESSAGES_DIR)) {
  if (!file.endsWith(".json")) continue;
  const filePath = path.join(MESSAGES_DIR, file);
  const flat = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const nested = {};
  let dotted = 0;
  for (const [key, value] of Object.entries(flat)) {
    if (key.includes(".")) {
      nestKey(nested, key.split("."), value);
      dotted++;
    } else {
      if (typeof nested[key] === "object" && nested[key] !== null) {
        nested[key][""] = value;
      } else {
        nested[key] = value;
      }
    }
  }
  totalKeys += Object.keys(flat).length;
  totalDotted += dotted;
  fs.writeFileSync(filePath, JSON.stringify(nested, null, 2) + "\n", "utf8");
  console.log(`${file}: ${Object.keys(flat).length} keys, ${dotted} nested`);
}
console.log(`Total: ${totalKeys} keys across all locales, ${totalDotted} dotted-key entries converted.`);
