/**
 * sync-i18n.ts
 *
 * Pre-build script that checks i18n locale files against the en/ source of truth.
 *
 * - Compares every other locale against en/
 * - If any key present in en/ is missing from any other locale file, the build
 *   fails (exit code 1) and all missing keys are printed with locale, file, and key.
 * - Also checks that values are actually translated:
 *   - Empty string values → error
 *   - Values with "[TRANSLATE]" prefix → error
 *   - Values identical to the English text → error
 * - Exit code 0: all locales are complete and translated.
 * - Exit code 1: missing keys or untranslated values detected.
 *
 * Usage:
 *   npx tsx scripts/sync-i18n.ts
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const LOCALES_DIR = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  "../src/lib/i18n/locales",
);

const SOURCE_LOCALE = "en";

// ---------------------------------------------------------------------------
// Allowed-identical values (technical terms, cognates, placeholders)
// ---------------------------------------------------------------------------

/**
 * Values that are legitimately identical across all locales.
 * Includes protocol names, technical abbreviations, and unavoidable cognates
 * (words that are spelled identically in English and the target language
 * with no viable alternative).
 */
const ALLOWED_IDENTICAL_VALUES = new Set([
  // Protocol / standard names & technical abbreviations
  "OAuth",
  "OAuth 2.0",
  "HTTP",
  "HTTPS",
  "STDIO",
  "URL",
  "API",
  "JSON",
  "SSO",
  "MCP",
  // Unavoidable cognates (identical in EN + FR/ES/PT with no natural alternative)
  "No",
  "Tokens",
  "Total",
  "Error",
  "Pagination",
  "Description",
  "Budget",
  "Type",
  "Date",
  "Image",
  "Pause",
  "Notifications",
  "Maintenance",
  // Brand / example values that are intentionally identical across locales
  "Let's Encrypt",
  "chat.example.com",
  // Unavoidable cognate: "Architecture" is identical in EN + FR.
  "Architecture",
]);

/** Check whether a value is expected to be identical across all locales. */
function isAllowedIdentical(value: string): boolean {
  if (ALLOWED_IDENTICAL_VALUES.has(value)) return true;
  // URL-like placeholders
  if (/^https?:\/\//.test(value)) return true;
  // Email-like placeholders
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return true;
  // JSON-like config examples
  if (/^\{.*\}$/.test(value)) return true;
  // OAuth scope / code-like examples (e.g. "read:jira-work, write:jira-work, ...")
  if (/^(read|write)[:\-]/.test(value)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JsonObject = { [key: string]: JsonValue };
type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect all dot-separated key paths from a JSON object. */
function collectKeys(obj: JsonObject, prefix = ""): Set<string> {
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      for (const nested of collectKeys(v as JsonObject, fullKey)) {
        keys.add(nested);
      }
    } else {
      keys.add(fullKey);
    }
  }
  return keys;
}

/** Get a nested value by dot path. */
function getByPath(obj: JsonObject, dotPath: string): JsonValue | undefined {
  const parts = dotPath.split(".");
  let current: JsonValue = obj;
  for (const part of parts) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as JsonObject)[part];
  }
  return current;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log(`\n🌐 i18n Locale Check — source of truth: ${SOURCE_LOCALE}/\n`);

  // Discover locales
  const allLocales = fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const targetLocales = allLocales.filter((l) => l !== SOURCE_LOCALE).sort();

  if (targetLocales.length === 0) {
    console.log("   No target locales found. Nothing to check.");
    process.exit(0);
  }

  console.log(`   Target locales: ${targetLocales.join(", ")}\n`);

  // Discover source namespace files
  const sourceDir = path.join(LOCALES_DIR, SOURCE_LOCALE);
  const namespaceFiles = fs
    .readdirSync(sourceDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  const missingErrors: { locale: string; file: string; key: string }[] = [];
  const untranslatedErrors: { locale: string; file: string; key: string; reason: string }[] = [];

  for (const nsFile of namespaceFiles) {
    const sourcePath = path.join(sourceDir, nsFile);
    let sourceJson: JsonObject;
    try {
      sourceJson = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));
    } catch (err) {
      console.error(`   ❌ Failed to parse ${SOURCE_LOCALE}/${nsFile}: ${err}`);
      process.exit(1);
    }

    const sourceKeys = collectKeys(sourceJson);

    for (const locale of targetLocales) {
      const targetPath = path.join(LOCALES_DIR, locale, nsFile);

      if (!fs.existsSync(targetPath)) {
        // Entire file missing — every source key is missing
        for (const key of sourceKeys) {
          missingErrors.push({ locale, file: nsFile, key });
        }
        continue;
      }

      let targetJson: JsonObject;
      try {
        targetJson = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
      } catch (err) {
        console.error(`   ❌ Failed to parse ${locale}/${nsFile}: ${err}`);
        process.exit(1);
      }

      const targetKeys = collectKeys(targetJson);

      for (const key of sourceKeys) {
        if (!targetKeys.has(key)) {
          missingErrors.push({ locale, file: nsFile, key });
        } else {
          // Key exists — check the value is actually translated
          const enVal = getByPath(sourceJson, key);
          const targetVal = getByPath(targetJson, key);

          if (typeof targetVal === "string") {
            if (targetVal.trim() === "") {
              untranslatedErrors.push({ locale, file: nsFile, key, reason: "empty value" });
            } else if (targetVal.startsWith("[TRANSLATE]")) {
              untranslatedErrors.push({ locale, file: nsFile, key, reason: "has [TRANSLATE] placeholder" });
            } else if (typeof enVal === "string" && targetVal === enVal && !isAllowedIdentical(targetVal)) {
              untranslatedErrors.push({ locale, file: nsFile, key, reason: `same as en: "${enVal.length > 40 ? enVal.slice(0, 37) + "..." : enVal}"` });
            }
          }
        }
      }
    }
  }

  // Report
  const totalErrors = missingErrors.length + untranslatedErrors.length;

  if (totalErrors === 0) {
    console.log("   ✅ All locales are complete and correctly translated.\n");
    process.exit(0);
  }

  // --- Missing keys ---
  if (missingErrors.length > 0) {
    console.error(`   ❌ Found ${missingErrors.length} missing key(s):\n`);

    const grouped = new Map<string, Map<string, string[]>>();
    for (const { locale, file, key } of missingErrors) {
      if (!grouped.has(locale)) grouped.set(locale, new Map());
      const fileMap = grouped.get(locale)!;
      if (!fileMap.has(file)) fileMap.set(file, []);
      fileMap.get(file)!.push(key);
    }

    for (const [locale, fileMap] of grouped) {
      console.error(`   📁 ${locale}/`);
      for (const [file, keys] of fileMap) {
        console.error(`      📄 ${file}`);
        for (const key of keys) {
          console.error(`         - ${key}`);
        }
      }
      console.error("");
    }
  }

  // --- Untranslated values ---
  if (untranslatedErrors.length > 0) {
    console.error(`   ❌ Found ${untranslatedErrors.length} untranslated value(s):\n`);

    const grouped = new Map<string, Map<string, { key: string; reason: string }[]>>();
    for (const { locale, file, key, reason } of untranslatedErrors) {
      if (!grouped.has(locale)) grouped.set(locale, new Map());
      const fileMap = grouped.get(locale)!;
      if (!fileMap.has(file)) fileMap.set(file, []);
      fileMap.get(file)!.push({ key, reason });
    }

    for (const [locale, fileMap] of grouped) {
      console.error(`   📁 ${locale}/`);
      for (const [file, entries] of fileMap) {
        console.error(`      📄 ${file}`);
        for (const { key, reason } of entries) {
          console.error(`         - ${key}  (${reason})`);
        }
      }
      console.error("");
    }
  }

  console.error("   Build failed. Fix the missing/untranslated keys listed above.\n");
  process.exit(1);
}

main();
