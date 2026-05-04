import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { CONFIGS_DIR, MOUNTS_PATH, ensureAppdataDir } from "./config";
import { printInfo, promptYesNo } from "./utils";
import { bindMount } from "./paths";

function getCoreMounts(): string[] {
  const home = os.homedir();
  return [
    bindMount(path.join(CONFIGS_DIR, ".claude"), "/root/.claude"),
    bindMount(path.join(CONFIGS_DIR, ".claude.json"), "/root/.claude.json"),
    bindMount(path.join(CONFIGS_DIR, ".codex"), "/root/.codex"),
    bindMount(path.join(CONFIGS_DIR, ".copilot"), "/root/.copilot"),
    bindMount(path.join(CONFIGS_DIR, ".opencode"), "/root/.config/opencode"),
    bindMount(path.join(CONFIGS_DIR, ".gemini"), "/root/.gemini"),
    bindMount(path.join(CONFIGS_DIR, ".local", "share"), "/root/.local/share"),
    bindMount(path.join(CONFIGS_DIR, ".local", "state"), "/root/.local/state"),
    bindMount(path.join(home, ".gitconfig"), "/root/.gitconfig", "ro"),
  ];
}

export async function ensureMountsFile(): Promise<void> {
  if (fs.existsSync(MOUNTS_PATH)) {
    return;
  }

  ensureAppdataDir();
  const home = os.homedir();
  const mounts: string[] = [];

  printInfo("");
  printInfo("MOUNTS.txt not found. Creating....");
  printInfo("");
  printInfo("Would you like to mount ~/.ssh (read-only)?");
  printInfo(
    "  Pros: Enables SSH-based git operations and remote server access inside the container. (E.g.: git push, git pull)"
  );
  printInfo(
    "  Risks: Exposes your SSH private keys. Only enable if you trust the code running in your containers."
  );
  printInfo(
    "  Note: This configuration is global. You may modify your mounts at any time by editing ~/.code-container/MOUNTS.txt."
  );

  const mountSsh = await promptYesNo("Mount ~/.ssh?");
  if (mountSsh) {
    mounts.push(bindMount(path.join(home, ".ssh"), "/root/.ssh", "ro"));
  }

  fs.writeFileSync(MOUNTS_PATH, mounts.join("\n") + "\n", { mode: 0o600 });
  printInfo("");
  printInfo(`Created ${MOUNTS_PATH}`);
  printInfo("Core mounts are always applied. Modify this file to store additional mount points.");
}

export function loadMounts(): string[] {
  const coreMounts = getCoreMounts();
  const mountSet = new Set(coreMounts);

  if (fs.existsSync(MOUNTS_PATH)) {
    const content = fs.readFileSync(MOUNTS_PATH, "utf-8");
    const extraMounts = content
      .split("\n")
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"))
      // On Windows, defensively rewrite backslashes to forward slashes so a
      // user-edited line like `C:\Users\foo:/dest` still works. On POSIX this
      // is a no-op because mount lines don't legitimately contain backslashes.
      .map(line => process.platform === "win32" ? line.replace(/\\/g, "/") : line);
    for (const mount of extraMounts) {
      mountSet.add(mount);
    }
  }

  return Array.from(mountSet);
}
