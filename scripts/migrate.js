#!/usr/bin/env node
/**
 * Cross-platform migration of legacy in-repo config files to ~/.code-container/configs.
 * Mirrors the behaviour of the original migrate.sh — copies dirs/files if they
 * exist in the project root, prints a status line per item.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PROJECT_DIR = path.resolve(__dirname, "..");
const APPDATA_DIR = path.join(os.homedir(), ".code-container");
const CONFIGS_DIR = path.join(APPDATA_DIR, "configs");

console.log("Migrating configuration files to ~/.code-container...\n");

fs.mkdirSync(CONFIGS_DIR, { recursive: true });
// chmod is a no-op on Windows but harmless
try { fs.chmodSync(APPDATA_DIR, 0o700); } catch { /* ignore on Windows */ }
try { fs.chmodSync(CONFIGS_DIR, 0o700); } catch { /* ignore on Windows */ }

console.log(`Checking for config files in ${PROJECT_DIR}...\n`);

function migrateDir(src, destParent, name) {
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) {
    console.log(`  - ${name} not found, skipping`);
    return;
  }
  const dest = path.join(destParent, path.basename(src));
  fs.cpSync(src, dest, { recursive: true });
  try { fs.chmodSync(dest, 0o700); } catch { /* ignore on Windows */ }
  console.log(`  - ${name} -> ${dest}`);
}

function migrateFile(src, dest, name) {
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
    console.log(`  - ${name} not found, skipping`);
    return;
  }
  fs.copyFileSync(src, dest);
  try { fs.chmodSync(dest, 0o600); } catch { /* ignore on Windows */ }
  console.log(`  - ${name} -> ${dest}`);
}

migrateDir(path.join(PROJECT_DIR, ".claude"),   CONFIGS_DIR, ".claude/");
migrateDir(path.join(PROJECT_DIR, ".codex"),    CONFIGS_DIR, ".codex/");
migrateDir(path.join(PROJECT_DIR, ".gemini"),   CONFIGS_DIR, ".gemini/");
migrateDir(path.join(PROJECT_DIR, ".opencode"), CONFIGS_DIR, ".opencode/");
migrateDir(path.join(PROJECT_DIR, ".local"),    CONFIGS_DIR, ".local/");
migrateFile(
  path.join(PROJECT_DIR, "container.claude.json"),
  path.join(CONFIGS_DIR, ".claude.json"),
  "container.claude.json"
);

console.log("\nMigration complete!");
console.log(`Config files are now stored in: ${CONFIGS_DIR}`);
