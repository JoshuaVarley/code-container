import { spawnSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import { printInfo, printError } from "./utils";
import { APPDATA_DIR, USER_DOCKERFILE_PATH } from "./config";
import { loadMounts } from "./mounts";
import { loadFlags, loadRunFlags } from "./flags";
import { bindMount } from "./paths";

export const IMAGE_NAME = "code-container";
export const IMAGE_TAG = "latest";
const PACKAGED_DOCKERFILE = path.resolve(__dirname, "..", "Dockerfile");
const PACKAGED_USER_DOCKERFILE = path.resolve(__dirname, "..", "Dockerfile.User");
const CONTAINER_PREFIX = "container";
const CLI = "podman";

export function checkPodman(): void {
  const result = spawnSync(CLI, ["info"], { stdio: "pipe" });
  if (result.status === null && (result.error as NodeJS.ErrnoException)?.code === "ENOENT") {
    printError(
      "Podman CLI not found on PATH. Install Podman: https://podman.io/docs/installation"
    );
    process.exit(1);
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.toString().trim();
    const stdout = result.stdout?.toString().trim();
    printError("`podman info` failed — Podman cannot reach a running machine/daemon.");
    if (stderr) console.error(stderr);
    else if (stdout) console.error(stdout);
    console.error(
      "\nThings to try:\n" +
        "  - macOS/Windows: start the Podman machine: `podman machine start`\n" +
        "  - Linux:         ensure rootless Podman is set up (`podman info` from your shell).\n" +
        "  - Wrong context: `podman system connection list` to verify the active connection.\n" +
        "Then re-run the command."
    );
    process.exit(1);
  }
}

export function getMounts(projectPath: string, projectName: string): string[] {
  const mounts: string[] = [];
  mounts.push(bindMount(projectPath, `/root/${projectName}`));
  const fileMounts = loadMounts();
  mounts.push(...fileMounts);
  return mounts;
}

export function generateContainerName(projectPath: string): string {
  // Strip a trailing native separator (forward slash on POSIX, either on Windows)
  const normalizedPath = projectPath.replace(/[\\/]$/, "");
  const projectName = path.basename(normalizedPath);
  const pathHash = crypto
    .createHash("sha1")
    .update(normalizedPath)
    .digest("hex")
    .substring(0, 8);
  return `${CONTAINER_PREFIX}-${projectName}-${pathHash}`;
}

export function imageExists(): boolean {
  const result = spawnSync(
    CLI,
    ["image", "inspect", `${IMAGE_NAME}:${IMAGE_TAG}`],
    { stdio: "pipe" }
  );
  return result.status === 0;
}

export function ensureDockerfile(): void {
  if (!fs.existsSync(USER_DOCKERFILE_PATH)) {
    if (fs.existsSync(PACKAGED_USER_DOCKERFILE)) {
      printInfo(
        `Dockerfile.User not found at ${USER_DOCKERFILE_PATH}, copying from package...`
      );
      fs.copyFileSync(PACKAGED_USER_DOCKERFILE, USER_DOCKERFILE_PATH);
    } else {
      throw new Error(
        `Dockerfile.User not found at ${USER_DOCKERFILE_PATH} and no packaged Dockerfile.User available`
      );
    }
  }
}

export type BuildResult = { ok: true } | { ok: false };

// Inlines the user's Dockerfile.User on top of the base Dockerfile, stripping
// the user's `FROM code-container-base[:tag]` line. We build a single combined
// Dockerfile rather than two separate images so we don't have to share an
// intermediate base image between build invocations.
export function combineDockerfiles(baseContent: string, userContent: string): string {
  const strippedUser = userContent
    .split(/\r?\n/)
    .filter((line) => !/^\s*FROM\s+code-container-base(\s|:|$)/i.test(line))
    .join("\n");
  return (
    baseContent.replace(/\s+$/, "") +
    "\n\n# === User customizations (~/.code-container/Dockerfile.User) ===\n" +
    strippedUser
  );
}

export function buildImageRaw(): BuildResult {
  ensureDockerfile();
  const baseContent = fs.readFileSync(PACKAGED_DOCKERFILE, "utf-8");
  const userContent = fs.readFileSync(USER_DOCKERFILE_PATH, "utf-8");
  const combined = combineDockerfiles(baseContent, userContent);

  // Write the combined Dockerfile to a real file inside the build context
  // rather than piping via `-f -`. Stdin-Dockerfile doesn't work reliably on
  // Windows-hosted Podman (WSL2-backed machine): the stdin pipe isn't always
  // passed through to the engine, which then falls back to looking for a
  // literal `Dockerfile` in the context dir and errors out.
  const combinedPath = path.join(APPDATA_DIR, `.code-container-build-${process.pid}.Dockerfile`);
  fs.writeFileSync(combinedPath, combined);
  try {
    const result = spawnSync(
      CLI,
      ["build", "--no-cache", "-f", combinedPath, "-t", `${IMAGE_NAME}:${IMAGE_TAG}`, APPDATA_DIR],
      { stdio: "inherit" }
    );
    return result.status === 0 ? { ok: true } : { ok: false };
  } finally {
    try { fs.unlinkSync(combinedPath); } catch { /* best-effort cleanup */ }
  }
}

export function containerExists(containerName: string): boolean {
  const result = spawnSync(CLI, ["container", "inspect", containerName], {
    stdio: "pipe",
  });
  return result.status === 0;
}

export function containerRunning(containerName: string): boolean {
  const result = spawnSync(
    CLI,
    ["container", "inspect", "-f", "{{.State.Running}}", containerName],
    { stdio: "pipe" }
  );
  return result.status === 0 && result.stdout.toString().trim() === "true";
}

export function stopContainer(containerName: string): void {
  spawnSync(CLI, ["stop", "-t", "3", containerName], { stdio: "inherit" });
}

export function startContainer(containerName: string): void {
  spawnSync(CLI, ["start", containerName], { stdio: "inherit" });
}

export function removeContainer(containerName: string): void {
  spawnSync(CLI, ["rm", containerName], { stdio: "inherit" });
}

export function createNewContainer(
  containerName: string,
  projectName: string,
  projectPath: string,
  cliFlags: string[] = []
): boolean {
  const mounts = getMounts(projectPath, projectName);
  const args = ["run", "-d", "--name", containerName];

  args.push("-e", "TERM=xterm-256color");
  args.push("-e", "COLORTERM=truecolor");
  args.push("-w", `/root/${projectName}`);

  for (const mount of mounts) {
    args.push("-v", mount);
  }

  const flags = loadFlags();
  const runFlags = loadRunFlags();
  args.push(...flags);
  args.push(...runFlags);
  args.push(...cliFlags);

  args.push(`${IMAGE_NAME}:${IMAGE_TAG}`, "sleep", "infinity");

  const result = spawnSync(CLI, args, { stdio: "inherit" });
  return result.status === 0;
}

export function execInteractive(
  containerName: string,
  projectName: string
): void {
  const flags = loadFlags();
  spawnSync(
    CLI,
    [
      "exec",
      "-it",
      "-e",
      "TERM=xterm-256color",
      "-e",
      "COLORTERM=truecolor",
      "-w",
      `/root/${projectName}`,
      ...flags,
      containerName,
      "/bin/bash",
    ],
    { stdio: "inherit" }
  );
}

export function getOtherSessionCount(
  containerName: string,
  _projectName: string
): number {
  // Count bash processes still running inside the container. PID 1 is `sleep
  // infinity`; each `podman exec -it ... /bin/bash` adds another bash. By the
  // time this runs, our own session's bash has already exited, so any bash
  // still present is another attached terminal.
  //
  // Uses `podman top` (POSIX `ps` invoked through the engine) so it works on
  // Linux, macOS, and Windows hosts — the host's process table is irrelevant.
  // `podman top` requires a PID column in the ps output, so we ask for `pid,comm`
  // and read the second column.
  const result = spawnSync(
    CLI,
    ["top", containerName, "-eo", "pid,comm"],
    { encoding: "utf-8" }
  );
  if (result.status !== 0) return 0;

  const lines = result.stdout.split("\n");
  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].trim().split(/\s+/);
    if (cols.length < 2) continue;
    const comm = cols[1];
    if (comm === "bash" || comm === "/bin/bash") count++;
  }
  return count;
}

export function stopContainerIfLastSession(
  containerName: string,
  projectName: string
): void {
  const otherSessions = getOtherSessionCount(containerName, projectName);
  if (otherSessions === 0) {
    stopContainer(containerName);
  } else {
    printInfo(
      `Skipping stop; ${otherSessions} other terminal(s) still attached`
    );
  }
}

export function listContainersRaw(): void {
  spawnSync(
    CLI,
    [
      "ps",
      "-a",
      "--filter",
      `name=${CONTAINER_PREFIX}-`,
      "--format",
      "table {{.Names}}\t{{.Status}}\t{{.CreatedAt}}",
    ],
    { stdio: "inherit" }
  );
}

export function getStoppedContainerIds(): string[] {
  const result = spawnSync(
    CLI,
    [
      "ps",
      "-a",
      "--filter",
      `name=${CONTAINER_PREFIX}-`,
      "--filter",
      "status=exited",
      "--quiet",
    ],
    { encoding: "utf8" }
  );

  const containerIds = result.stdout.trim();
  if (!containerIds) return [];

  return containerIds.split("\n");
}

export function removeContainersById(ids: string[]): void {
  spawnSync(CLI, ["rm", ...ids], { stdio: "inherit" });
}
