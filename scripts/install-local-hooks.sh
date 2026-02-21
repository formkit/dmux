#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK_DIR="$ROOT_DIR/.dmux-hooks"
EXAMPLES_DIR="$HOOK_DIR/examples"

FORCE=0
if [[ "${1:-}" == "--force" ]]; then
  FORCE=1
elif [[ -n "${1:-}" ]]; then
  echo "Unknown argument: $1"
  echo "Usage: $0 [--force]"
  exit 1
fi

HOOKS=(
  "worktree_created"
  "pre_merge"
)

echo "Installing dmux local development hooks..."
echo "Hooks directory: $HOOK_DIR"

mkdir -p "$HOOK_DIR"

if [[ ! -d "$EXAMPLES_DIR" ]]; then
  echo "Missing hook examples directory: $EXAMPLES_DIR"
  exit 1
fi

for hook in "${HOOKS[@]}"; do
  src="$EXAMPLES_DIR/${hook}.example"
  dst="$HOOK_DIR/$hook"

  if [[ ! -f "$src" ]]; then
    echo "Skipping $hook: missing example at $src"
    continue
  fi

  if [[ -f "$dst" && "$FORCE" -ne 1 ]]; then
    echo "Skipping $hook: $dst already exists (use --force to overwrite)"
    continue
  fi

  cp "$src" "$dst"
  chmod +x "$dst"
  echo "Installed $hook"
done

echo "Done."
