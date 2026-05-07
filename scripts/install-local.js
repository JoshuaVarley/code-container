#!/usr/bin/env node
/**
 * Cross-platform installer: removes any globally installed copy of this package,
 * builds the local fork, links it as the global `container` command, and seeds
 * the persistent toolchain-home mounts in MOUNTS.txt (zvm, cargo, rustup).
 *
 * Runs on Linux, macOS, and Windows (PowerShell or cmd) — uses Node APIs only,
 * no shell required.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const PROJECT_DIR = path.resolve(__dirname, "..");
const PKG = require(path.join(PROJECT_DIR, "package.json"));
const PKG_NAME = PKG.name;

// On Windows, npm is a .cmd shim; spawnSync needs `shell: true` to find it via PATH
const NPM_OPTS = { stdio: "inherit", cwd: PROJECT_DIR, shell: process.platform === "win32" };

function step(msg) {
  console.log(`\n==> ${msg}`);
}

function run(cmd, args, opts = NPM_OPTS) {
  const result = spawnSync(cmd, args, opts);
  if (result.status !== 0) {
    console.error(`\nCommand failed: ${cmd} ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
  return result;
}

function isPackageGloballyInstalled(name) {
  const result = spawnSync("npm", ["ls", "-g", "--depth=0", name], {
    stdio: "pipe",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

function getGlobalRoot() {
  const result = spawnSync("npm", ["root", "-g"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return result.stdout.trim();
}

function findOnPath(binName) {
  // Cross-platform `which`: walk PATH, check for executable extensions on Windows.
  const exts = process.platform === "win32"
    ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";")
    : [""];
  const dirs = (process.env.PATH || "").split(path.delimiter);
  for (const dir of dirs) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, binName + ext);
      try {
        const st = fs.statSync(candidate);
        if (st.isFile()) return candidate;
      } catch { /* not found, keep searching */ }
    }
  }
  return null;
}

console.log(`Installing local copy of ${PKG_NAME} from ${PROJECT_DIR}`);

if (isPackageGloballyInstalled(PKG_NAME)) {
  step(`Removing globally installed ${PKG_NAME}`);
  run("npm", ["uninstall", "-g", PKG_NAME]);
} else {
  step(`No global ${PKG_NAME} install detected, skipping uninstall`);
}

step("Installing dependencies");
run("npm", ["install"]);

step("Building");
run("npm", ["run", "build"]);

step("Linking local copy as global `container`");
run("npm", ["link"]);

step("Configuring persistent toolchain-home mounts");
const APPDATA_DIR = path.join(os.homedir(), ".code-container");
const MOUNTS_FILE = path.join(APPDATA_DIR, "MOUNTS.txt");

// Mount lines in MOUNTS.txt use forward slashes — that's what Docker's mount
// parser expects, and the runtime mounts.ts produces the same form via
// dockerHostPath(). On Windows this becomes e.g. "C:/Users/foo/...".
const toForwardSlashes = p => p.replace(/\\/g, "/");

// Each entry binds an entire toolchain "home" directory from the host into the
// container. The image's entrypoint re-seeds these from /opt/<tool>-template/
// when the host mount is empty (first run or wiped), so the bind isn't shadowing
// a useful default — it becomes one. Add a new tool by adding a new entry.
const PERSISTENT_MOUNTS = [
  {
    hostSubdir: "zvm-home",
    containerPath: "/root/.zvm",
    comment: "zvm: persist Zig versions and the zvm binary itself across containers (whole $ZVM_PATH)",
  },
  {
    hostSubdir: "cargo-home",
    containerPath: "/root/.cargo",
    comment: "cargo: persist registry cache, `cargo install` binaries, and credentials ($CARGO_HOME)",
  },
  {
    hostSubdir: "rustup-home",
    containerPath: "/root/.rustup",
    comment: "rustup: persist installed Rust toolchains and components like rust-analyzer ($RUSTUP_HOME)",
  },
];

// Stale lines from earlier (broken) layouts that should be scrubbed. Keep in
// sync as the schema evolves so existing users don't end up with dead mounts.
const STALE_LINES = new Set([
  // The original zvm mount targeted /root/.zvm/versions, but zvm installs
  // versions at $ZVM_PATH/<version>/ directly — so the bind never captured
  // anything. The companion comment is also dropped.
  `${toForwardSlashes(path.join(APPDATA_DIR, "zvm-versions"))}:/root/.zvm/versions`,
  "# zvm: persist installed Zig versions across containers",
]);

if (!fs.existsSync(MOUNTS_FILE)) {
  fs.writeFileSync(MOUNTS_FILE, "");
}

const originalLines = fs.readFileSync(MOUNTS_FILE, "utf8").split(/\r?\n/);
const cleanedLines = [];
const removedStale = [];
for (const line of originalLines) {
  const trimmed = line.trim();
  if (STALE_LINES.has(trimmed)) {
    removedStale.push(trimmed);
    continue;
  }
  cleanedLines.push(line);
}

let body = cleanedLines.join("\n").replace(/\n+$/, "");
let bodyChanged = removedStale.length > 0;

for (const entry of PERSISTENT_MOUNTS) {
  const hostDir = path.join(APPDATA_DIR, entry.hostSubdir);
  const mountLine = `${toForwardSlashes(hostDir)}:${entry.containerPath}`;
  fs.mkdirSync(hostDir, { recursive: true });

  const alreadyPresent = cleanedLines.some(line => line.trim() === mountLine);
  if (alreadyPresent) {
    console.log(`    ${entry.hostSubdir} mount already present`);
    continue;
  }

  if (body.length > 0 && !body.endsWith("\n")) body += "\n";
  body += `\n# ${entry.comment}\n${mountLine}\n`;
  bodyChanged = true;
  console.log(`    Added ${entry.hostSubdir} mount: ${mountLine}`);
  console.log(`    Host dir: ${hostDir}`);
}

if (removedStale.length > 0) {
  console.log("    Scrubbed stale mount line(s) from previous layouts:");
  for (const line of removedStale) console.log(`      ${line}`);
  const orphan = path.join(APPDATA_DIR, "zvm-versions");
  if (fs.existsSync(orphan)) {
    console.log(`    (host dir ${orphan} can be deleted — it was always empty)`);
  }
}

if (bodyChanged) {
  fs.writeFileSync(MOUNTS_FILE, body);
  console.log("    Note: existing containers must be `container remove`d for changes to take effect.");
}

console.log();
const resolved = findOnPath("container");
if (resolved) {
  console.log(`Done. \`container\` resolves to: ${resolved}`);
  console.log(`Linked package: ${path.join(getGlobalRoot(), PKG_NAME)} -> ${PROJECT_DIR}`);
} else {
  console.error("Warning: `container` not found on PATH.");
  console.error(`Make sure your global npm bin directory (\`npm bin -g\`) is in PATH. On Windows this is usually %APPDATA%\\npm.`);
  process.exit(1);
}
