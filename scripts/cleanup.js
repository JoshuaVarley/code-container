#!/usr/bin/env node
/**
 * Cross-platform cleanup of legacy in-repo config files. Removes leftover .claude/
 * .codex/ etc. directories from the project root, but only if a copy already
 * exists at the new location under ~/.code-container/configs (run migrate.js first
 * if not).
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PROJECT_DIR = path.resolve(__dirname, "..");
const APPDATA_DIR = path.join(os.homedir(), ".code-container");
const CONFIGS_DIR = path.join(APPDATA_DIR, "configs");

console.log("Cleaning up old configuration files...\n");
console.log(`Checking for old config files in ${PROJECT_DIR}...\n`);

function cleanup(src, newLocation, name, isDir) {
  let exists;
  try {
    const st = fs.statSync(src);
    exists = isDir ? st.isDirectory() : st.isFile();
  } catch { exists = false; }

  if (!exists) {
    console.log(`  - ${name} not found in project root, skipping`);
    return;
  }

  let migrated;
  try {
    const st = fs.statSync(newLocation);
    migrated = isDir ? st.isDirectory() : st.isFile();
  } catch { migrated = false; }

  if (!migrated) {
    console.log(`  x ${name} exists in project root but not found in ${CONFIGS_DIR}`);
    console.log(`    Run scripts/migrate.js first to avoid data loss`);
    return;
  }

  fs.rmSync(src, { recursive: true, force: true });
  console.log(`  - Removed ${name}`);
}

cleanup(path.join(PROJECT_DIR, ".claude"),   path.join(CONFIGS_DIR, ".claude"),       ".claude/",   true);
cleanup(path.join(PROJECT_DIR, ".codex"),    path.join(CONFIGS_DIR, ".codex"),        ".codex/",    true);
cleanup(path.join(PROJECT_DIR, ".gemini"),   path.join(CONFIGS_DIR, ".gemini"),       ".gemini/",   true);
cleanup(path.join(PROJECT_DIR, ".opencode"), path.join(CONFIGS_DIR, ".opencode"),     ".opencode/", true);
cleanup(path.join(PROJECT_DIR, ".local"),    path.join(CONFIGS_DIR, ".local"),        ".local/",    true);
cleanup(
  path.join(PROJECT_DIR, "container.claude.json"),
  path.join(CONFIGS_DIR, ".claude.json"),
  "container.claude.json",
  false
);

console.log("\nCleanup complete!");
