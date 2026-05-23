#!/usr/bin/env bash
#
# Pinpoint uninstaller — removes the shim, the slash command, runtime state,
# and (if present) the managed clone created by the web installer.
#
#   curl -fsSL https://raw.githubusercontent.com/vinitkumargoel/pinpoint/main/scripts/uninstall.sh | bash
#   # or, from a local clone:  bash scripts/uninstall.sh
set -euo pipefail

INSTALL_DIR="${PINPOINT_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/pinpoint}"
say() { printf '%s\n' "$*" >&2; }

rm -f  "${HOME}/.local/bin/pinpoint"          && say "✓ removed CLI shim"
rm -f  "${HOME}/.claude/commands/pinpoint.md" && say "✓ removed /pinpoint command"
rm -rf "${HOME}/.claude/skills/pinpoint"      && say "✓ removed pinpoint skill"
rm -rf "${HOME}/.pinpoint"                    && say "✓ removed runtime state (~/.pinpoint)"

if [ -d "$INSTALL_DIR/.git" ]; then
  rm -rf "$INSTALL_DIR" && say "✓ removed managed clone ($INSTALL_DIR)"
fi

say ""
say "Pinpoint uninstalled. (A clone you made yourself is left untouched.)"
