#!/usr/bin/env node
/**
 * Post-build step: stamp the executable bit on dist/main.js so the bin entry
 * works when the package is installed on POSIX. On Windows, npm creates a
 * .cmd shim regardless of file mode, so this is a no-op.
 */

"use strict";

const fs = require("fs");
const path = require("path");

if (process.platform === "win32") {
  process.exit(0);
}

const target = path.resolve(__dirname, "..", "dist", "main.js");
fs.chmodSync(target, 0o755);
