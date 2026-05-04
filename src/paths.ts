/**
 * Convert a host filesystem path into the form Docker's bind-mount syntax expects.
 *
 * On POSIX hosts the path is used verbatim. On Windows, Node's `path` APIs return
 * backslash-separated paths (e.g. `C:\Users\foo\project`). Docker Desktop's mount
 * parser accepts forward-slash form with the drive-letter colon left intact
 * (`C:/Users/foo/project`), so we normalize backslashes here. The drive-letter
 * colon is fine because Docker's mount syntax parses `<drive>:<path>:<dest>` as a
 * single source token when the leading component is a single letter followed by
 * a colon.
 */
export function dockerHostPath(p: string): string {
  if (process.platform !== "win32") {
    return p;
  }
  return p.replace(/\\/g, "/");
}

/**
 * Build a Docker `-v` bind-mount value from a host path, container path, and
 * optional flags (e.g. `"ro"`). Wraps `dockerHostPath` so callers don't need to
 * remember to normalize.
 */
export function bindMount(hostPath: string, containerPath: string, flags?: string): string {
  const normalized = dockerHostPath(hostPath);
  return flags ? `${normalized}:${containerPath}:${flags}` : `${normalized}:${containerPath}`;
}
