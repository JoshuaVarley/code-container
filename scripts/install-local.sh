#!/bin/bash

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PKG_NAME="$(node -p "require('$PROJECT_DIR/package.json').name")"

cd "$PROJECT_DIR"

echo "Installing local copy of $PKG_NAME from $PROJECT_DIR"
echo ""

if npm ls -g --depth=0 "$PKG_NAME" >/dev/null 2>&1; then
  echo "==> Removing globally installed $PKG_NAME"
  npm uninstall -g "$PKG_NAME"
else
  echo "==> No global $PKG_NAME install detected, skipping uninstall"
fi

echo ""
echo "==> Installing dependencies"
npm install

echo ""
echo "==> Building"
npm run build

echo ""
echo "==> Linking local copy as global \`container\`"
npm link

echo ""
echo "==> Configuring persistent zvm versions mount"
APPDATA_DIR="$HOME/.code-container"
ZVM_HOST_DIR="$APPDATA_DIR/zvm-versions"
MOUNTS_FILE="$APPDATA_DIR/MOUNTS.txt"
MOUNT_LINE="$ZVM_HOST_DIR:/root/.zvm/versions"

mkdir -p "$ZVM_HOST_DIR"
touch "$MOUNTS_FILE"

if grep -Fxq "$MOUNT_LINE" "$MOUNTS_FILE"; then
  echo "    zvm versions mount already present in $MOUNTS_FILE"
else
  printf '\n# zvm: persist installed Zig versions across containers\n%s\n' "$MOUNT_LINE" >> "$MOUNTS_FILE"
  echo "    Added zvm versions mount: $MOUNT_LINE"
  echo "    Host dir: $ZVM_HOST_DIR"
  echo "    Note: existing containers must be \`container remove\`d for the mount to take effect."
fi

echo ""
RESOLVED="$(command -v container || true)"
if [ -n "$RESOLVED" ]; then
  echo "Done. \`container\` resolves to: $RESOLVED"
  echo "Linked package: $(npm root -g)/$PKG_NAME -> $PROJECT_DIR"
else
  echo "Warning: \`container\` not found on PATH. Check that $(npm bin -g 2>/dev/null) is on your PATH."
  exit 1
fi
