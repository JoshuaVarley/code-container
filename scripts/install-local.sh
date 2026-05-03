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
RESOLVED="$(command -v container || true)"
if [ -n "$RESOLVED" ]; then
  echo "Done. \`container\` resolves to: $RESOLVED"
  echo "Linked package: $(npm root -g)/$PKG_NAME -> $PROJECT_DIR"
else
  echo "Warning: \`container\` not found on PATH. Check that $(npm bin -g 2>/dev/null) is on your PATH."
  exit 1
fi
