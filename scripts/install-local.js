#!/usr/bin/env node
/**
 * Cross-platform installer: removes any globally installed copy of this package,
 * builds the local fork, links it as the global `container` command, and seeds
 * the persistent zvm-versions mount in MOUNTS.txt.
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

step("Configuring persistent zvm versions mount");
const APPDATA_DIR = path.join(os.homedir(), ".code-container");
const ZVM_HOST_DIR = path.join(APPDATA_DIR, "zvm-versions");
const MOUNTS_FILE = path.join(APPDATA_DIR, "MOUNTS.txt");

// The mount line written into MOUNTS.txt uses forward slashes — that's what the
// Docker mount parser expects, and the runtime mounts.ts produces the same form
// via dockerHostPath(). On Windows this becomes e.g. "C:/Users/foo/...".
const ZVM_HOST_DIR_FOR_MOUNT = ZVM_HOST_DIR.replace(/\\/g, "/");
const MOUNT_LINE = `${ZVM_HOST_DIR_FOR_MOUNT}:/root/.zvm/versions`;

fs.mkdirSync(ZVM_HOST_DIR, { recursive: true });
if (!fs.existsSync(MOUNTS_FILE)) {
  fs.writeFileSync(MOUNTS_FILE, "");
}

const existingLines = fs.readFileSync(MOUNTS_FILE, "utf8").split(/\r?\n/);
if (existingLines.some(line => line.trim() === MOUNT_LINE)) {
  console.log(`    zvm versions mount already present in ${MOUNTS_FILE}`);
} else {
  fs.appendFileSync(
    MOUNTS_FILE,
    `\n# zvm: persist installed Zig versions across containers\n${MOUNT_LINE}\n`
  );
  console.log(`    Added zvm versions mount: ${MOUNT_LINE}`);
  console.log(`    Host dir: ${ZVM_HOST_DIR}`);
  console.log("    Note: existing containers must be `container remove`d for the mount to take effect.");
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
